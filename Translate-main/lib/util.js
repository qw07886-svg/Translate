/** Small dependency-free helpers shared by the drawing-translator host half. */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/** Legacy output folder name (older versions wrote here); kept only to skip it. */
export const OUTPUT_DIR_NAME = '_翻译结果'

/** Write one JSON response. */
export function sendJson(res, status, data) {
  let body
  try {
    body = Buffer.from(JSON.stringify(data), 'utf8')
  } catch (error) {
    body = Buffer.from(JSON.stringify({ ok: false, error: String(error) }), 'utf8')
    status = 500
  }
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Length', String(body.length))
  res.end(body)
}

/** Read and parse a JSON request body. */
export async function readJsonBody(req, limitBytes = 4 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limitBytes) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return {}
  const value = JSON.parse(text)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('请求体必须是 JSON 对象')
  return value
}

/** Clamp a numeric option. */
export function clampInt(value, min, max, fallback) {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

/** Whether a text span looks like translatable prose rather than a code or symbol. */
export function isTranslatable(text) {
  if (typeof text !== 'string') return false
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length < 2) return false
  const letters = t.match(/\p{L}/gu)
  if (!letters || letters.length < 2) return false
  if (/^[\d\s.,;:%°±×/\\()[\]{}<>_\-–—+#*'"|&@$!?=~^`]+$/u.test(t)) return false
  return true
}

/** Normalize a candidate source folder. */
export function normalizeDir(input) {
  if (typeof input !== 'string' || !input.trim()) return ''
  return path.resolve(input.trim())
}

/** Create a unique temporary directory for one job. */
export async function makeTempDir(tag) {
  const base = path.join(os.tmpdir(), 'dsh-drawing-translator')
  await fsp.mkdir(base, { recursive: true })
  return fsp.mkdtemp(path.join(base, `${tag}-`))
}

/** Remove a directory tree, ignoring failures. */
export async function removeDirQuiet(dir) {
  if (!dir) return
  try {
    await fsp.rm(dir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

/** Write a UTF-8 JSON file. */
export async function writeJsonFile(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(file, JSON.stringify(value, null, 2), 'utf8')
}

/** Read a JSON file, returning the fallback on any failure. */
export async function readJsonFile(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

/** Short human-readable timestamp for job logs. */
export function logStamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Whether the path exists. */
export function existsSync(file) {
  try {
    fs.accessSync(file)
    return true
  } catch {
    return false
  }
}
