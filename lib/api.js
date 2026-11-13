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

/** Build the request handler for the plugin's web route. */
export function createApiHandler({ engine, manager }) {
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
        const dir = normalizeDir(body.dir)
        if (!dir) throw new Error('请提供要扫描的目录')
        const kinds = Array.isArray(body.kinds) && body.kinds.length > 0
          ? body.kinds.filter((kind) => kind === 'pdf' || kind === 'dwg' || kind === 'docx')
          : ['pdf', 'dwg', 'docx']
        const files = await engine.scan(dir, kinds.length > 0 ? kinds : ['pdf', 'dwg', 'docx'])
        const pick = (kind) => files.filter((file) => file.kind === kind).map(file => ({ path: file.path, name: file.name, relPath: file.relPath, size: file.size }))
        sendJson(res, 200, { ok: true, dir, pdf: pick('pdf'), dwg: pick('dwg'), docx: pick('docx'), total: files.length })
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
      sendJson(res, 404, { ok: false, error: `未知接口：${method} ${route}` })
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
    }
  }
}
