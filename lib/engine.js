/** Core engine: folder scanning, Python extraction/apply, and LLM translation. */
import fsp from 'node:fs/promises'
import path from 'node:path'
import { runPython, resolvePython } from './python.js'
import { OUTPUT_DIR_NAME, existsSync, isTranslatable, writeJsonFile, readJsonFile } from './util.js'

const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', OUTPUT_DIR_NAME, '__pycache__', 'dsh-drawing-translator'])
const MAX_SCAN_ENTRIES = 8000

/** Recursively list translatable files below one folder. */
export async function scanDirectory(dir, kinds) {
  const wanted = new Set(kinds.map((kind) => kind.toLowerCase()))
  const found = []
  const queue = [dir]
  while (queue.length > 0 && found.length < MAX_SCAN_ENTRIES) {
    const current = queue.shift()
    let entries
    try {
      entries = await fsp.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue
      if (entry.name.startsWith('~$')) continue
      const abs = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        queue.push(abs)
        continue
      }
      if (!entry.isFile()) continue
      // Skip this plugin's own outputs and other tools' translated copies.
      if (/\.zh\.(pdf|dxf|docx|csv)$/i.test(entry.name) || /_中文译文\.(pdf|docx)$/i.test(entry.name)) continue
      if (/^翻译.*_/.test(entry.name)) continue
      const lower = entry.name.toLowerCase()
      let kind = null
      if (lower.endsWith('.pdf')) kind = 'pdf'
      else if (lower.endsWith('.dwg')) kind = 'dwg'
      else if (lower.endsWith('.docx')) kind = 'docx'
      if (!kind || !wanted.has(kind)) continue
      found.push({ path: abs, name: entry.name, relPath: path.relative(dir, abs), kind, size: 0 })
      if (found.length >= MAX_SCAN_ENTRIES) break
    }
  }
  const CONCURRENCY = 48
  for (let start = 0; start < found.length; start += CONCURRENCY) {
    const batch = found.slice(start, start + CONCURRENCY)
    await Promise.all(batch.map(async (file) => {
      try { file.size = (await fsp.stat(file.path)).size } catch { file.size = 0 }
    }))
  }
  found.sort((a, b) => a.relPath.localeCompare(b.relPath))
  return found
}

const TARGET_NAMES = { 'zh-CN': '简体中文', 'zh-TW': '繁體中文', en: 'English' }

const SYSTEM_PROMPT = [
  '你是工程图纸专业翻译。输入是可编辑工程图纸（PDF/DWG）或 Word 文档中提取出的文字片段，多为塞尔维亚语（拉丁字母或西里尔字母）、克罗地亚语或英语，也可能是缩写、图层名、材料牌号、设备和构件名称。',
  '把每条片段翻译成目标语言。要求：',
  '1. 只做忠实翻译，不解释、不扩写、不合并句子；保持片段之间的独立与顺序。',
  '2. 数字、单位、编号、图号、规格（如 DN100、PE100、SDR11、PVC、PP-R、mbar、kW、m³/h、Φ、%）、标准代号原样保留。',
  '3. 图纸用语使用工程/建筑行业惯例译法（如 PRORAČUN=计算、NAGIB=坡度、CEV=管、TRAFO=变电站、SAOBRAĆAJ=交通、HIDRAULIKA=液压/水力）。',
  '4. 专有名词首次出现可保留原文括号注释，但不要冗长。',
  '5. 输出必须是严格 JSON 对象，键为输入序号字符串，值为译文；每个输入序号都必须出现且只出现一次。不要输出 Markdown 代码块、前后缀或任何解释。',
].join('\n')

/** Parse a model reply into JSON, repairing a reply cut off by the token limit. */
function parseJsonObject(text) {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    /* repair below */
  }
  const first = trimmed.indexOf('{')
  if (first < 0) return null
  const body = trimmed.slice(first)
  const last = body.lastIndexOf('}')
  if (last > 0) {
    try { return JSON.parse(body.slice(0, last + 1)) } catch { /* repair below */ }
  }
  let working = body
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const lastQuote = working.lastIndexOf('"')
    if (lastQuote < 0) return null
    const candidate = working.slice(0, lastQuote + 1)
    const lastComma = candidate.lastIndexOf(',')
    if (lastComma < 0) return null
    working = candidate.slice(0, lastComma)
    try {
      const parsed = JSON.parse(working + '}')
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) return parsed
    } catch {
      /* trim one more pair */
    }
  }
  return null
}

/** Build the translator bound to the live Harness services. */
export function createTranslator(ctx) {
  function selection() {
    try {
      const service = ctx.get('agentDefaultModel')
      const current = service && typeof service.currentSelection === 'function' ? service.currentSelection() : null
      if (current && typeof current.provider === 'string' && typeof current.model === 'string') {
        return { provider: current.provider, model: current.model }
      }
    } catch {
      /* ignore */
    }
    return null
  }

  function describe() {
    const route = selection()
    return {
      llm: Boolean(ctx.get('llm')),
      provider: route ? route.provider : null,
      model: route ? route.model : null,
      translator: Boolean(ctx.get('translator')),
      available: Boolean(ctx.get('llm') && route) || Boolean(ctx.get('translator')),
    }
  }

  function normalizeTranslations(parsed, count) {
    let table = parsed
    if (table && typeof table === 'object' && !Array.isArray(table)) {
      for (const key of ['translations', 'result', 'results', 'data', 'items']) {
        if (table[key] && typeof table[key] === 'object') { table = table[key]; break }
      }
    }
    const values = []
    for (let index = 0; index < count; index += 1) {
      let raw
      if (Array.isArray(table)) raw = table[index]
      else if (table && typeof table === 'object') raw = table[String(index)] ?? table[index]
      let value = ''
      if (typeof raw === 'string') value = raw
      else if (raw && typeof raw === 'object') {
        value = raw.translation ?? raw.translated ?? raw.text ?? raw.zh ?? raw.target ?? ''
      }
      values.push(typeof value === 'string' ? value.trim() : '')
    }
    return values
  }

  async function viaLlm(texts, targetLang, signal) {
    const route = selection()
    const llm = ctx.get('llm')
    if (!llm || !route) throw new Error('LLM 不可用（未找到默认模型或 llm 服务）')
    const target = TARGET_NAMES[targetLang] ?? '简体中文'
    const numbered = texts.map((text, index) => `${index}\t${text.replace(/\r?\n/g, ' ')}`).join('\n')
    const strictHint = '只输出一个 JSON 对象，形如 {"0":"译文","1":"译文"}，键必须覆盖 0 到 ' + (texts.length - 1) + '，不要输出任何其它文字。'
    let lastOutput = ''
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const prompt = `目标语言：${target}\n共 ${texts.length} 条，格式为「序号<TAB>原文」。\n${strictHint}\n\n${numbered}`
      const stream = llm.stream({
        provider: route.provider,
        model: route.model,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        temperature: 0,
        maxTokens: 8000,
        signal,
      })
      let output = ''
      for await (const chunk of stream) {
        if (!chunk || typeof chunk !== 'object') continue
        if (chunk.type === 'text-delta' && typeof chunk.text === 'string') output += chunk.text
        if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') {
          throw new Error(`模型调用失败: ${chunk.reason.failure?.message ?? '未知错误'}`)
        }
        if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'aborted') {
          throw new Error('模型调用已取消')
        }
      }
      lastOutput = output
      const parsed = parseJsonObject(output)
      if (parsed) {
        const values = normalizeTranslations(parsed, texts.length)
        const filled = values.filter(Boolean).length
        if (filled >= Math.max(1, Math.ceil(texts.length * 0.5))) {
          return values.map((value, index) => value || texts[index])
        }
      }
    }
    throw new Error(`chat 模型失败（模型返回无法解析为逐条译文；前 240 字：${lastOutput.slice(0, 240)}）`)
  }

  async function viaService(text, targetLang, signal) {
    const translator = ctx.get('translator')
    if (!translator) throw new Error('翻译服务不可用')
    const spec = translator.resolve({ text, targetLanguage: targetLang, sourceLanguage: undefined, provider: 'google' })
    const value = await translator.translate(spec, signal)
    return typeof value === 'string' && value.trim() ? value.trim() : text
  }

  async function translateBatch(texts, targetLang, signal, depth = 0) {
    if (texts.length === 0) return []
    if (signal?.aborted) throw new Error('任务已取消')
    try {
      return await viaLlm(texts, targetLang, signal)
    } catch (error) {
      if (signal?.aborted) throw error
      if (texts.length > 1 && depth < 3) {
        const middle = Math.ceil(texts.length / 2)
        const left = await translateBatch(texts.slice(0, middle), targetLang, signal, depth + 1)
        const right = await translateBatch(texts.slice(middle), targetLang, signal, depth + 1)
        return left.concat(right)
      }
      const wrapped = error instanceof Error ? error : new Error(String(error))
      try {
        const value = await viaService(texts[0], targetLang, signal)
        return [value]
      } catch {
        wrapped.message = `chat 模型失败（${wrapped.message}），翻译服务也不可用`
        throw wrapped
      }
    }
  }

  return { describe, selection, translateBatch }
}

/** Build the engine facade used by the job manager. */
export function createEngine({ ctx, pluginDir, configuredPython }) {
  const python = resolvePython(configuredPython)
  const pdfScript = path.join(pluginDir, 'python', 'pdf_engine.py')
  const dwgScript = path.join(pluginDir, 'python', 'dwg_engine.py')
  const docxScript = path.join(pluginDir, 'python', 'docx_engine.py')
  const translator = createTranslator(ctx)

  function status() {
    const pythonOk = python === 'python' || python === 'python3' || existsSync(python)
    return {
      python: { ok: pythonOk, path: python, error: pythonOk ? null : `未找到 Python 解释器：${python}` },
      pdf: { ok: pythonOk && existsSync(pdfScript), script: pdfScript },
      dwg: {
        ok: pythonOk && existsSync(dwgScript),
        script: dwgScript,
        converter: existsSync(path.join(pluginDir, 'bin', 'libredwg', 'dwg2dxf.exe'))
          || existsSync(path.join('C:\\Users\\Administrator\\dsh-dwg-tools\\libredwg', 'dwg2dxf.exe')),
      },
      docx: { ok: pythonOk && existsSync(docxScript), script: docxScript },
      translation: translator.describe(),
    }
  }

  async function extract(file, workDir, signal) {
    const script = file.kind === 'pdf' ? pdfScript : (file.kind === 'docx' ? docxScript : dwgScript)
    const outJson = path.join(workDir, `${path.basename(file.path)}.extract.json`)
    const { data, stderr } = await runPython({
      python,
      script,
      args: ['extract', file.path, outJson],
      timeoutMs: file.kind === 'dwg' ? 600_000 : 180_000,
      signal,
    })
    const payload = await readJsonFile(outJson, null)
    const segments = payload && Array.isArray(payload.segments)
      ? payload.segments
      : (Array.isArray(data.segments) ? data.segments : [])
    const warnings = []
    if (payload && Array.isArray(payload.warnings)) warnings.push(...payload.warnings.map(String))
    if (Array.isArray(data.warnings)) warnings.push(...data.warnings.map(String))
    if (stderr) warnings.push(stderr.split(/\r?\n/).filter(Boolean).slice(-2).join(' | '))
    if (segments.length === 0) warnings.push(`extract 返回 0 段（stdout: ${JSON.stringify(data).slice(0, 300)}）`)
    return { segments, warnings, meta: data }
  }

  async function apply(file, mapping, workDir, outputBase, signal) {
    const mapPath = path.join(workDir, `${path.basename(file.path)}.map.json`)
    await writeJsonFile(mapPath, mapping)
    if (file.kind === 'docx') {
      const output = `${outputBase}.docx`
      const { data } = await runPython({ python, script: docxScript, args: ['apply', file.path, mapPath, output], timeoutMs: 300_000, signal })
      return { output, pdf: null, applied: Number(data.applied) || 0 }
    }
    if (file.kind === 'pdf') {
      const output = `${outputBase}.pdf`
      const { data } = await runPython({ python, script: pdfScript, args: ['apply', file.path, mapPath, output], timeoutMs: 300_000, signal })
      return { output, pdf: null, applied: Number(data.applied) || 0 }
    }
    const output = `${outputBase}.dxf`
    const pdf = `${outputBase}.pdf`
    const { data } = await runPython({
      python,
      script: dwgScript,
      args: ['apply', file.path, mapPath, output, '--pdf', pdf],
      timeoutMs: 600_000,
      signal,
    })
    return {
      output: typeof data.output === 'string' && data.output ? data.output : output,
      pdf: data.pdf ? pdf : null,
      applied: Number(data.applied) || 0,
    }
  }

  function cacheFile() {
    return path.join(pluginDir, 'data', 'cache.json')
  }

  async function loadCache() {
    const value = await readJsonFile(cacheFile(), {})
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  }

  async function saveCache(cache) {
    await writeJsonFile(cacheFile(), cache)
  }

  return { python, status, scan: scanDirectory, extract, apply, translator, isTranslatable, loadCache, saveCache }
}
