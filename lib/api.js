/** Host HTTP API consumed by the browser panel and by verification scripts. */
import { spawn } from 'node:child_process'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pickFiles } from './picker.js'
import { readJsonBody, sendJson, normalizeDir, existsSync } from './util.js'

const FILE_KINDS = { '.pdf': 'pdf', '.dwg': 'dwg', '.docx': 'docx' }

/** Convert query parameters into the same shape the POST bodies use. */
function queryObject(url) {
  const body = {}
  for (const [key, value] of url.searchParams.entries()) body[key] = value
  if (typeof body.kinds === 'string') body.kinds = body.kinds.split(',').map((item) => item.trim()).filter(Boolean)
  if (typeof body.limit === 'string') {
    const parsed = Number.parseInt(body.limit, 10)
    if (Number.isFinite(parsed)) body.limit = parsed
  }
  return body
}

/** List one directory for the in-panel file browser. */
async function listDirectory(target, fallbackDir) {
  const home = process.env.USERPROFILE || fallbackDir || 'C:\\'
  if (!target || !target.trim()) {
    const drives = []
    for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
      const root = `${letter}:\\`
      try {
        await fsp.access(root)
        drives.push({ path: root, name: root, kind: 'dir', size: 0, fileKind: null })
      } catch {
        /* drive not present */
      }
    }
    return { dir: '', parent: null, home, entries: drives }
  }
  const dir = path.resolve(target.trim())
  let dirents
  try {
    dirents = await fsp.readdir(dir, { withFileTypes: true })
  } catch (error) {
    throw new Error(`无法读取目录：${dir}（${error.code || error.message}）`)
  }
  const entries = []
  for (const entry of dirents) {
    if (entry.name.startsWith('.') || entry.name.startsWith('~$')) continue
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      entries.push({ path: abs, name: entry.name, kind: 'dir', size: 0, fileKind: null })
      continue
    }
    if (!entry.isFile()) continue
    const fileKind = FILE_KINDS[path.extname(entry.name).toLowerCase()]
    if (!fileKind) continue
    if (/\.zh\.(pdf|dxf|docx|csv)$/i.test(entry.name) || /_中文译文\.(pdf|docx)$/i.test(entry.name)) continue
    entries.push({ path: abs, name: entry.name, kind: 'file', size: 0, fileKind })
  }
  await Promise.all(entries.filter((entry) => entry.kind === 'file').map(async (entry) => {
    try { entry.size = (await fsp.stat(entry.path)).size } catch { entry.size = 0 }
  }))
  entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : (a.kind === 'dir' ? -1 : 1)))
  const parentDir = path.dirname(dir)
  return { dir, parent: parentDir === dir ? null : parentDir, home, entries }
}

/** Shape one finished scan for the panel. */
function presentScan(dir, files, truncated) {
  const pick = (kind) => files.filter((file) => file.kind === kind)
    .map((file) => ({ path: file.path, name: file.name, relPath: file.relPath, size: file.size }))
  return { ok: true, dir, pdf: pick('pdf'), dwg: pick('dwg'), docx: pick('docx'), total: files.length, truncated: truncated === true }
}

/** Public view of one running or finished scan. */
function scanView(state) {
  return {
    ok: true,
    scanId: state.id,
    dir: state.dir,
    running: state.running,
    dirs: state.dirs,
    files: state.files,
    elapsedMs: state.elapsedMs,
    truncated: state.truncated,
    error: state.error,
    result: state.result,
  }
}

/** Build the request handler for the plugin's web route. */
export function createApiHandler({ engine, manager }) {
  const scans = new Map()
  let scanSequence = 0

  /** Start one background scan and keep its progress addressable by id. */
  function startScan(dir, kinds) {
    const id = 'scan-' + Date.now().toString(36) + '-' + (scanSequence += 1)
    const startedAt = Date.now()
    const state = {
      id, dir, kinds, running: true, cancelled: false,
      dirs: 0, files: 0, elapsedMs: 0, truncated: false, result: null, error: null,
    }
    scans.set(id, state)
    // Keep the registry small: drop the oldest finished scans first.
    for (const [key, value] of scans) {
      if (scans.size <= 8) break
      if (!value.running && key !== id) scans.delete(key)
    }
    state.done = engine.scanDetailed(dir, kinds, {
      onProgress: (progress) => {
        state.dirs = progress.dirs
        state.files = progress.files
        state.elapsedMs = progress.elapsedMs
      },
      isCancelled: () => state.cancelled === true,
    }).then((scan) => {
      state.truncated = scan.truncated === true
      state.files = scan.files.length
      state.elapsedMs = Date.now() - startedAt
      state.result = presentScan(dir, scan.files, scan.truncated)
    }).catch((error) => {
      state.error = String(error?.message ?? error)
    }).finally(() => {
      state.running = false
    })
    return state
  }

  return async function drawingTranslatorApi(req, res) {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const prefix = '/dsh-drawing-translator/api'
    let route = url.pathname
    if (route.startsWith(prefix)) route = route.slice(prefix.length) || '/'
    if (route.length > 1 && route.endsWith('/')) route = route.replace(/\/+$/, '')
    const method = (req.method ?? 'GET').toUpperCase()
    try {
      if (method === 'GET' && (route === '/status' || route === '/')) {
        sendJson(res, 200, { ok: true, status: engine.status(), defaults: manager.defaults(), python: engine.python })
        return
      }
      if ((method === 'POST' || method === 'GET') && route === '/scan') {
        const body = method === 'POST' ? await readJsonBody(req) : queryObject(url)
        const wait = body.wait === true || body.wait === '1' || body.wait === 1
        const id = typeof body.id === 'string' ? body.id : ''
        if (id) {
          const track = scans.get(id)
          if (!track) throw new Error('扫描记录不存在：' + id)
          if (wait) await track.done
          sendJson(res, 200, scanView(track))
          return
        }
        const dir = normalizeDir(body.dir)
        if (!dir) throw new Error('请提供要扫描的目录')
        const kinds = Array.isArray(body.kinds) && body.kinds.length > 0
          ? body.kinds.filter((kind) => kind === 'pdf' || kind === 'dwg' || kind === 'docx')
          : ['pdf', 'dwg', 'docx']
        const track = startScan(dir, kinds.length > 0 ? kinds : ['pdf', 'dwg', 'docx'])
        if (wait) {
          await track.done
          if (track.error) throw new Error(track.error)
          sendJson(res, 200, track.result)
          return
        }
        sendJson(res, 200, scanView(track))
        return
      }
      if ((method === 'POST' || method === 'GET') && route === '/scan/cancel') {
        const body = method === 'POST' ? await readJsonBody(req) : queryObject(url)
        const id = typeof body.id === 'string' ? body.id : ''
        const track = id ? scans.get(id) : null
        if (track) track.cancelled = true
        sendJson(res, track ? 200 : 404, track ? { ok: true } : { ok: false, error: '扫描记录不存在：' + id })
        return
      }
      if ((method === 'POST' || method === 'GET') && route === '/list') {
        const body = method === 'POST' ? await readJsonBody(req) : queryObject(url)
        const listing = await listDirectory(typeof body.dir === 'string' ? body.dir : '', manager.defaults().dir)
        sendJson(res, 200, { ok: true, ...listing })
        return
      }
      if ((method === 'POST' || method === 'GET') && route === '/pick-files') {
        if (url.searchParams.get('probe') === '1') {
          sendJson(res, 200, {
            ok: true,
            probe: true,
            powershell: existsSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'),
            platform: process.platform,
          })
          return
        }
        const files = await pickFiles()
        sendJson(res, 200, { ok: true, files })
        return
      }
      if ((method === 'POST' || method === 'GET') && route === '/translate') {
        const body = method === 'POST' ? await readJsonBody(req) : queryObject(url)
        const started = manager.start(body)
        sendJson(res, 200, { ok: true, jobId: started.jobId })
        return
      }
      if (method === 'GET' && route === '/selftest-translate') {
        const text = url.searchParams.get('text') ?? 'PRORAČUN PROTOKA GASA'
        const lang = url.searchParams.get('lang') ?? 'zh-CN'
        const started = Date.now()
        try {
          const translated = await engine.translator.translateBatch([text], lang, new AbortController().signal)
          sendJson(res, 200, { ok: true, text, translated: translated[0], elapsedMs: Date.now() - started, route: engine.translator.describe() })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String(error?.message ?? error), route: engine.translator.describe() })
        }
        return
      }
      if (method === 'GET' && route === '/jobs') {
        sendJson(res, 200, { ok: true, jobs: manager.list() })
        return
      }
      if (method === 'GET' && route === '/job') {
        const id = url.searchParams.get('id') ?? ''
        const job = manager.get(id)
        if (!job) {
          sendJson(res, 404, { ok: false, error: `任务不存在：${id}` })
          return
        }
        sendJson(res, 200, { ok: true, job })
        return
      }
      if ((method === 'POST' || method === 'GET') && route === '/cancel') {
        const body = method === 'POST' ? await readJsonBody(req) : queryObject(url)
        const jobId = typeof body.jobId === 'string' ? body.jobId : ''
        const cancelled = manager.cancel(jobId)
        sendJson(res, cancelled ? 200 : 404, cancelled ? { ok: true } : { ok: false, error: '任务不存在' })
        return
      }
      if ((method === 'POST' || method === 'GET') && route === '/reveal') {
        const body = method === 'POST' ? await readJsonBody(req) : queryObject(url)
        const target = normalizeDir(body.path)
        if (!target) throw new Error('缺少目录路径')
        const child = spawn('explorer.exe', [target], { detached: true, stdio: 'ignore', windowsHide: false })
        child.on('error', () => { /* ignore */ })
        child.unref()
        sendJson(res, 200, { ok: true, path: target })
        return
      }
      if ((method === 'POST' || method === 'GET') && route === '/open') {
        const body = method === 'POST' ? await readJsonBody(req) : queryObject(url)
        const raw = typeof body.path === 'string' ? body.path : ''
        const target = raw ? path.resolve(raw) : ''
        if (!target) throw new Error('缺少文件路径')
        if (!existsSync(target)) throw new Error(`文件不存在：${raw}`)
        const select = body.select === true || body.select === '1' || body.select === 'true'
        // explorer.exe opens the file with its default app, or highlights it in its folder.
        const args = select ? ['/select,', target] : [target]
        const child = spawn('explorer.exe', args, { detached: true, stdio: 'ignore', windowsHide: false })
        child.on('error', () => { /* ignore */ })
        child.unref()
        sendJson(res, 200, { ok: true, path: target, select })
        return
      }
      sendJson(res, 404, { ok: false, error: `未知接口：${method} ${route}` })
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
    }
  }
}
