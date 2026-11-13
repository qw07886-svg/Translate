/** Python bridge: resolve the bundled interpreter and run the engine scripts. */
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { existsSync } from './util.js'

/** Resolve the Python interpreter used by the engines. */
export function resolvePython(configured) {
  const home = os.homedir()
  const candidates = [
    process.env.DSH_DRAWING_PYTHON,
    configured,
    process.env.DSH_PYTHON,
    path.join(home, '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'python', 'python.exe'),
    'C:\\Python312\\python.exe',
    'C:\\Python311\\python.exe',
  ].filter((value) => typeof value === 'string' && value.length > 0)
  for (const candidate of candidates) {
    if (candidate === 'python' || candidate === 'python3') return candidate
    if (existsSync(candidate)) return candidate
  }
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
