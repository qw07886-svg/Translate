/** Python bridge: resolve the bundled interpreter and run the engine scripts. */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { existsSync } from './util.js'

/** Engine modules each interpreter must provide (directory names in site-packages). */
const REQUIRED_MODULES = [['pymupdf', 'fitz'], ['ezdxf'], ['docx']]

/** Candidate site-packages directories for one interpreter executable. */
function sitePackageDirs(pythonExe) {
  const root = path.dirname(pythonExe)
  const dirs = [
    path.join(root, 'Lib', 'site-packages'),
    path.join(root, 'Lib', 'dist-packages'),
    path.join(root, '..', 'Lib', 'site-packages'),
    path.join(root, '..', 'lib', 'site-packages'),
  ]
  const libDirs = [path.join(root, 'lib'), path.join(root, '..', 'lib')]
  for (const libDir of libDirs) {
    if (!existsSync(libDir)) continue
    try {
      for (const entry of fs.readdirSync(libDir)) {
        if (!entry.startsWith('python')) continue
        dirs.push(path.join(libDir, entry, 'site-packages'))
      }
    } catch { /* ignore */ }
  }
  return dirs.filter((dir) => existsSync(dir))
}

/** Count how many engine modules one interpreter can import. */
function moduleScore(pythonExe) {
  let score = 0
  const dirs = sitePackageDirs(pythonExe)
  for (const names of REQUIRED_MODULES) {
    outer: for (const dir of dirs) {
      for (const name of names) {
        if (existsSync(path.join(dir, name))) { score += 1; break outer }
      }
    }
  }
  return score
}

/** Resolve the Python interpreter used by the engines. */
export function resolvePython(configured, pluginDir) {
  const home = os.homedir()
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
  const explicit = [process.env.DSH_DRAWING_PYTHON, configured].filter((value) => typeof value === 'string' && value.length > 0)
  for (const candidate of explicit) {
    if (candidate === 'python' || candidate === 'python3') return candidate
    if (existsSync(candidate)) return candidate
  }
  const runtimePython = path.join(home, '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'python', 'python.exe')
  const candidates = [
    pluginDir ? path.join(pluginDir, 'data', 'pyenv', 'Scripts', 'python.exe') : null,
    pluginDir ? path.join(pluginDir, 'data', 'pyenv', 'python.exe') : null,
    pluginDir ? path.join(pluginDir, 'data', 'pyenv', 'bin', 'python') : null,
    process.env.DSH_PYTHON,
    path.join(localAppData, 'Programs', 'Python', 'Python313', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python312', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python311', 'python.exe'),
    'C:\\Python313\\python.exe',
    'C:\\Python312\\python.exe',
    'C:\\Python311\\python.exe',
    'C:\\Program Files\\Python312\\python.exe',
    'C:\\Program Files\\Python311\\python.exe',
    runtimePython,
  ].filter((value) => typeof value === 'string' && value.length > 0)
  let best = null
  let bestScore = -1
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    const score = moduleScore(candidate)
    if (score > bestScore) { best = candidate; bestScore = score }
    if (score >= REQUIRED_MODULES.length) return candidate
  }
  if (best) return best
  return 'python'
}

/** Run one Python engine command and parse its single JSON stdout object. */
export function runPython({ python, script, args, timeoutMs = 300_000, signal }) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script, ...args], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    })
    const out = []
    const err = []
    let outSize = 0
    let settled = false
    let timer = null

    const finish = (error, value) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve(value)
    }
    const onAbort = () => {
      try { child.kill() } catch { /* ignore */ }
      finish(new Error('任务已取消'))
    }
    if (signal) {
      if (signal.aborted) { onAbort(); return }
      signal.addEventListener('abort', onAbort, { once: true })
    }
    timer = setTimeout(() => {
      try { child.kill() } catch { /* ignore */ }
      finish(new Error(`Python 脚本超时（>${Math.round(timeoutMs / 1000)}s）: ${path.basename(script)}`))
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      if (outSize > 8 * 1024 * 1024) return
      outSize += chunk.length
      out.push(chunk)
    })
    child.stderr.on('data', (chunk) => {
      if (err.length < 200) err.push(chunk)
    })
    child.on('error', (error) => finish(new Error(`无法启动 Python（${python}）: ${error.message}`)))
    child.on('close', (code) => {
      const stdout = Buffer.concat(out).toString('utf8').replace(/^\uFEFF/, '').trim()
      const stderr = Buffer.concat(err).toString('utf8').trim()
      let data = null
      if (stdout) {
        try {
          data = JSON.parse(stdout.slice(stdout.indexOf('{')))
        } catch {
          const first = stdout.indexOf('{')
          const last = stdout.lastIndexOf('}')
          if (first >= 0 && last > first) {
            try { data = JSON.parse(stdout.slice(first, last + 1)) } catch { data = null }
          }
        }
      }
      if (code !== 0 || data === null || data.ok === false) {
        const stderrTail = stderr.split(/\r?\n/).filter(Boolean).slice(-4).join(' | ')
        const reason = data && typeof data.error === 'string'
          ? (stderrTail ? `${data.error} | ${stderrTail}` : data.error)
          : (stderrTail || stdout.slice(-400) || `退出码 ${code}`)
        finish(new Error(`${path.basename(script)}: ${reason}`))
        return
      }
      finish(null, { data, stderr })
    })
  })
}
