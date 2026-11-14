/** Job manager: owns one translation run, its progress, and its outputs. */
import fsp from 'node:fs/promises'
import path from 'node:path'
import {
  OUTPUT_DIR_NAME, clampInt, logStamp, makeTempDir, normalizeDir, removeDirQuiet,
} from './util.js'

const BATCH_SIZE = 16
const BATCH_MAX_CHARS = 2400
// Per-file cap on distinct strings sent to the model. Drawings routinely hold
// thousands of labels (a site plan can exceed 10k segments); the old cap of 400
// silently left most of the drawing untranslated.
const MAX_UNIQUE_PER_FILE = { pdf: 20000, dwg: 20000, docx: 20000 }
const MAX_LOG_LINES = 300
const KIND_BY_EXT = { '.pdf': 'pdf', '.dwg': 'dwg', '.docx': 'docx' }

/** Make one string safe to use inside a Windows file name. */
function sanitizeFileName(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '')
    .trim()
}

/**
 * Build the translated file's path in the source folder:
 * `翻译<中文名>_<原名>.<ext>`, or `翻译<原名>.<ext>` when the name already
 * contains Chinese.
 */
function outputBaseFor(file, chineseName) {
  const extension = path.extname(file.path)
  const originalStem = path.basename(file.path, extension)
  const folder = path.dirname(file.path)
  let chinese = sanitizeFileName(chineseName).slice(0, 60).trim()
  let base = chinese
    ? path.join(folder, `翻译${chinese}_${originalStem}`)
    : path.join(folder, `翻译${originalStem}`)
  if (base.length > 230) {
    const overflow = base.length - 230
    chinese = chinese.slice(0, Math.max(1, chinese.length - overflow - 1))
    base = path.join(folder, `翻译${chinese}_${originalStem}`)
  }
  return base
}

/** Longest common directory of a set of absolute file paths. */
function commonAncestor(paths) {
  const split = paths.map((item) => path.dirname(item).split(path.sep).filter((part) => part.length > 0))
  let common = split[0].slice()
  for (const parts of split.slice(1)) {
    let index = 0
    while (index < common.length && index < parts.length && common[index].toLowerCase() === parts[index].toLowerCase()) index += 1
    common = common.slice(0, index)
  }
  if (common.length === 0) return path.parse(paths[0]).root
  const joined = common.join(path.sep)
  if (/^[A-Za-z]:$/.test(joined)) return joined + path.sep
  return joined
}

/** Fresh per-job token counters; filled from the model's usage reports. */
function emptyTokens() {
  return { input: 0, output: 0, total: 0, cacheRead: 0, reasoning: 0, requests: 0, model: null, provider: null }
}

/** Create a JSON-safe snapshot of one job. */
function snapshot(job) {
  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt ?? null,
    sourceDir: job.sourceDir,
    outputDir: job.outputDir,
    targetLang: job.targetLang,
    kinds: job.kinds,
    dryRun: job.dryRun === true,
    totals: { ...job.totals },
    tokens: { ...emptyTokens(), ...(job.tokens || {}) },
    current: job.current,
    files: job.files.map((file) => ({
      path: file.path,
      name: file.name,
      relPath: file.relPath,
      kind: file.kind,
      status: file.status,
      segments: file.segments ?? 0,
      translated: file.translated ?? 0,
      output: file.output ?? null,
      pdf: file.pdf ?? null,
      error: file.error ?? null,
      elapsedMs: file.elapsedMs ?? null,
      tokens: { ...emptyTokens(), ...(file.tokens || {}) },
    })),
    log: job.log.slice(-MAX_LOG_LINES),
    error: job.error ?? null,
    summary: null,
  }
}

/** Sequential job manager with cancellation. */
export class JobManager {
  constructor({ engine, pluginDir, defaultSourceDir }) {
    this.engine = engine
    this.pluginDir = pluginDir
    this.defaultSourceDir = defaultSourceDir ?? process.cwd()
    this.jobs = new Map()
    this.sequence = 0
    this.activeJobId = null
  }

  defaults() {
    return {
      dir: this.defaultSourceDir,
      outputDirName: OUTPUT_DIR_NAME,
      targetLang: 'zh-CN',
      kinds: ['pdf', 'dwg', 'docx'],
      maxFiles: 10,
    }
  }

  start(request) {
    if (this.activeJobId) {
      const active = this.jobs.get(this.activeJobId)
      throw new Error(`已有翻译任务在运行（${this.activeJobId}，${active?.totals.done ?? 0}/${active?.totals.files ?? 0}），请等待完成或取消`)
    }
    const KINDS = ['pdf', 'dwg', 'docx']
    const kinds = Array.isArray(request.kinds) && request.kinds.length > 0
      ? request.kinds.filter((kind) => KINDS.includes(kind))
      : ['pdf', 'dwg', 'docx']
    if (kinds.length === 0) throw new Error('请至少选择一种文件类型（PDF / DWG / Word）')

    const requestedFiles = Array.isArray(request.files)
      ? request.files.filter((item) => typeof item === 'string' && item.trim().length > 0).map((item) => path.resolve(item.trim()))
      : []
    let fileEntries = null
    let sourceDir
    if (requestedFiles.length > 0) {
      const invalid = []
      const valid = []
      for (const filePath of requestedFiles) {
        const ext = path.extname(filePath).toLowerCase()
        const kind = KIND_BY_EXT[ext]
        if (!kind || !kinds.includes(kind)) {
          invalid.push(filePath)
          continue
        }
        valid.push({ path: filePath, name: path.basename(filePath), kind })
      }
      if (valid.length === 0) throw new Error(`所选文件不是可翻译的 PDF / DWG / Word 文件：${invalid.slice(0, 3).join('；')}`)
      sourceDir = commonAncestor(valid.map((item) => item.path))
      fileEntries = valid.map((item) => ({ ...item, relPath: path.relative(sourceDir, item.path), size: 0 }))
    } else {
      sourceDir = normalizeDir(request.dir)
      if (!sourceDir) throw new Error('请先选择要翻译的目录，或直接选择文件')
    }
    const targetLang = typeof request.targetLang === 'string' && request.targetLang ? request.targetLang : 'zh-CN'
    const limit = fileEntries ? Math.min(fileEntries.length, 500) : clampInt(request.limit, 1, 500, 10)
    const dryRun = request.dryRun === true
    this.sequence += 1
    const id = `job-${Date.now().toString(36)}-${this.sequence}`
    const job = {
      id,
      status: 'running',
      phase: 'scan',
      createdAt: Date.now(),
      sourceDir,
      outputDir: sourceDir,
      targetLang,
      kinds,
      limit,
      dryRun,
      fileEntries,
      current: null,
      files: [],
      log: [],
      totals: { files: 0, done: 0, failed: 0, skipped: 0, segments: 0, translated: 0 },
      tokens: emptyTokens(),
      currentFile: null,
      error: null,
      controller: new AbortController(),
      workDir: null,
    }
    this.jobs.set(id, job)
    this.activeJobId = id
    if (this.engine.translator && typeof this.engine.translator.setUsageSink === 'function') {
      this.engine.translator.setUsageSink((usage, meta) => this.addUsage(job, usage, meta))
    }
    this.appendLog(job, fileEntries
      ? `创建任务：直接选择 ${fileEntries.length} 个文件（目标语言 ${targetLang}），译文保存在原文件夹`
      : `创建任务：${sourceDir}（${kinds.join('+')}，最多 ${limit} 个文件，目标语言 ${targetLang}），译文保存在原文件夹`)
    void this.run(job).catch((error) => {
      job.status = 'failed'
      job.error = String(error?.message ?? error)
      this.appendLog(job, `任务失败：${job.error}`)
    }).finally(() => {
      if (this.activeJobId === id) this.activeJobId = null
    })
    return { ok: true, jobId: id }
  }

  get(id) {
    const job = this.jobs.get(id)
    return job ? snapshot(job) : null
  }

  list(limit = 20) {
    return [...this.jobs.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((job) => snapshot(job))
  }

  cancel(id) {
    const job = this.jobs.get(id)
    if (!job) return false
    if (job.status !== 'running') return true
    job.controller.abort()
    this.appendLog(job, '收到取消请求')
    return true
  }

  appendLog(job, message) {
    job.log.push(`[${logStamp()}] ${message}`)
    if (job.log.length > MAX_LOG_LINES * 2) job.log = job.log.slice(-MAX_LOG_LINES)
  }

  /**
   * Add one usage report from the model to the job and to the file that is
   * being translated. Field names follow the Harness TokenUsage interface.
   */
  addUsage(job, usage, meta) {
    if (!job || !usage) return
    const tokens = job.tokens || (job.tokens = emptyTokens())
    const input = Number(usage.inputTokens) || 0
    const output = Number(usage.outputTokens) || 0
    const cacheRead = Number(usage.cacheReadTokens) || 0
    const reasoning = Number(usage.reasoningTokens) || 0
    const total = Number(usage.totalTokens) || input + output
    tokens.input += input
    tokens.output += output
    tokens.cacheRead += cacheRead
    tokens.reasoning += reasoning
    tokens.total += total
    tokens.requests += 1
    if (meta && meta.model) tokens.model = meta.model
    if (meta && meta.provider) tokens.provider = meta.provider
    if (job.currentFile) {
      const fileTokens = job.currentFile.tokens || (job.currentFile.tokens = emptyTokens())
      fileTokens.input += input
      fileTokens.output += output
      fileTokens.cacheRead += cacheRead
      fileTokens.reasoning += reasoning
      fileTokens.total += total
      fileTokens.requests += 1
      if (meta && meta.model) fileTokens.model = meta.model
    }
  }

  dispose() {
    for (const job of this.jobs.values()) {
      try { job.controller.abort() } catch { /* ignore */ }
    }
    this.jobs.clear()
  }

  async run(job) {
    const signal = job.controller.signal
    const engine = this.engine
    let workDir = null
    try {
      job.workDir = workDir = await makeTempDir(job.id)
      this.appendLog(job, `Python: ${engine.python}`)

      job.phase = 'scan'
      let scanned
      if (Array.isArray(job.fileEntries) && job.fileEntries.length > 0) {
        scanned = job.fileEntries
        this.appendLog(job, `按文件选择：${scanned.length} 个文件，跳过目录扫描`)
      } else {
        scanned = await engine.scan(job.sourceDir, job.kinds)
      }
      const selected = scanned.slice(0, job.limit)
      job.files = selected.map((file) => ({ ...file, status: 'queued' }))
      job.totals.files = selected.length
      this.appendLog(job, `扫描完成：共 ${scanned.length} 个文件（PDF/DWG/Word），本次处理 ${selected.length} 个`)
      if (selected.length === 0) {
        let directoryExists = true
        try {
          directoryExists = (await fsp.stat(job.sourceDir)).isDirectory()
        } catch {
          directoryExists = false
        }
        throw new Error(directoryExists
          ? '该目录下没有找到可翻译的 PDF / DWG / Word 文件'
          : `目录不存在或无法访问：${job.sourceDir}`)
      }
      let cache = {}
      if (!job.dryRun) {
        cache = await engine.loadCache()
        this.appendLog(job, `翻译缓存：${Object.keys(cache).length} 条`)
      }

      let sinceSave = 0
      for (const file of job.files) {
        if (signal.aborted) throw new Error('任务已取消')
        file.status = 'running'
        job.current = file.relPath
        job.currentFile = file
        const startedAt = Date.now()
        try {
          await this.processFile(job, file, cache, workDir, signal)
          if (file.status === 'skipped') {
            job.totals.skipped += 1
          } else if (file.error) {
            file.status = 'failed'
            job.totals.failed += 1
          } else {
            file.status = 'done'
            job.totals.done += 1
          }
        } catch (error) {
          if (signal.aborted) throw error
          file.status = 'failed'
          file.error = String(error?.message ?? error)
          job.totals.failed += 1
          this.appendLog(job, `失败：${file.relPath} — ${file.error}`)
        } finally {
          file.elapsedMs = Date.now() - startedAt
          job.current = null
          job.currentFile = null
          sinceSave += 1
          if (!job.dryRun && sinceSave >= 3) {
            sinceSave = 0
            await engine.saveCache(cache)
          }
        }
      }
      if (!job.dryRun) await engine.saveCache(cache)
      job.phase = 'finished'
      job.status = 'done'
      job.finishedAt = Date.now()
      if (job.dryRun) {
        this.appendLog(job, `只看文字完成：${job.files.length} 个文件，共 ${job.totals.segments} 段；未生成翻译文件`)
      } else {
        this.appendLog(job, `全部完成：成功 ${job.totals.done}，失败 ${job.totals.failed}，跳过 ${job.totals.skipped}；译文已保存在原文件夹（翻译<中文名>_<原名>）`)
      }
    } catch (error) {
      job.phase = 'finished'
      job.finishedAt = Date.now()
      if (signal.aborted) {
        job.status = 'cancelled'
        this.appendLog(job, '任务已取消')
      } else {
        job.status = 'failed'
        job.error = String(error?.message ?? error)
        this.appendLog(job, `任务失败：${job.error}`)
      }
    } finally {
      job.current = null
      job.currentFile = null
      if (this.engine.translator && typeof this.engine.translator.setUsageSink === 'function') {
        this.engine.translator.setUsageSink(null)
      }
      const tokens = job.tokens || emptyTokens()
      if (tokens.requests > 0) {
        const cached = tokens.cacheRead > 0 ? `，其中缓存命中 ${tokens.cacheRead}` : ''
        this.appendLog(job, `Token 消耗：输入 ${tokens.input}${cached}、输出 ${tokens.output}、合计 ${tokens.total}，共 ${tokens.requests} 次模型请求`)
      }
      await removeDirQuiet(workDir)
    }
  }

  async processFile(job, file, cache, workDir, signal) {
    const engine = this.engine
    job.phase = 'extract'
    this.appendLog(job, `提取文字：${file.relPath}`)
    const extraction = await engine.extract(file, workDir, signal)
    const converter = extraction.meta && extraction.meta.converter ? extraction.meta.converter : ''
    const variant = extraction.meta && extraction.meta.dxf_variant ? extraction.meta.dxf_variant : ''
    const segments = extraction.segments.filter((segment) => segment && typeof segment.id === 'string' && typeof segment.text === 'string')
    file.segments = segments.length
    job.totals.segments += segments.length
    if (converter) this.appendLog(job, `转换方式：${converter}${variant ? '（DXF ' + variant + '）' : ''}`)
    if (segments.length === 0) {
      const meta = extraction.meta || {}
      const ocrTried = Array.isArray(meta.ocrPages) && meta.ocrPages.length > 0
      let reason = '没有可提取的文字（可能是空图纸或图片中没有文字）'
      if (file.kind === 'pdf') {
        reason = ocrTried
          ? `扫描件做过了 OCR，但没有识别出文字（可能是扫描太模糊或空白页）`
          : '这个 PDF 没有文字层，本机也未安装 Tesseract OCR，无法识别扫描件中的文字'
      }
      file.status = 'skipped'
      file.error = `${reason}${extraction.warnings.length > 0 ? '；' + extraction.warnings.slice(0, 2).join('；') : ''}`
      this.appendLog(job, `跳过：${file.relPath}（${reason}） ${extraction.warnings.slice(0, 2).join('；')}`)
      return
    }
    if (extraction.meta && Array.isArray(extraction.meta.ocrPages) && extraction.meta.ocrPages.length > 0) {
      const langs = Array.isArray(extraction.meta.ocrLangs) ? extraction.meta.ocrLangs.join('、') : ''
      this.appendLog(job, `扫描件：${file.relPath} 有 ${extraction.meta.ocrPages.length} 页没有文字层，已按图片识别${langs ? '（OCR 语言 ' + langs + '）' : ''}`)
    }
    if (job.dryRun) {
      file.status = 'done'
      file.error = null
      const counts = extraction.meta && extraction.meta.counts ? JSON.stringify(extraction.meta.counts) : ''
      const sample = segments.slice(0, 6).map((segment) => String(segment.text).slice(0, 40)).join(' | ')
      const uniqueTexts = new Set(segments.filter((segment) => engine.isTranslatable(segment.text)).map((segment) => segment.text))
      this.appendLog(job, `只看文字：${file.relPath} 提取到 ${segments.length} 段，其中可翻译唯一文本 ${uniqueTexts.size} 条${counts ? '（' + counts + '）' : ''}${converter ? '；转换 ' + converter + (variant ? '/' + variant : '') : ''}；示例：${sample}${extraction.warnings.length > 0 ? '；提示：' + extraction.warnings.slice(0, 2).join('；') : ''}`)
      return
    }

    job.phase = 'translate'
    const pending = new Map()
    for (const segment of segments) {
      if (!engine.isTranslatable(segment.text)) continue
      const key = `${job.targetLang}\u0001${segment.text}`
      if (cache[key] === undefined) pending.set(key, segment.text)
    }
    const maxUnique = MAX_UNIQUE_PER_FILE[file.kind] || 500
    const pendingList = [...pending.entries()]
    const uniquePending = pendingList.slice(0, maxUnique)
    if (pendingList.length > maxUnique) {
      this.appendLog(job, `提示：${file.relPath} 唯一文本 ${pendingList.length} 条，本次只翻译前 ${maxUnique} 条`)
    }
    if (uniquePending.length > 0) {
      this.appendLog(job, `翻译 ${uniquePending.length} 条唯一文本（${file.relPath}）`)
      const batches = []
      let current = []
      let chars = 0
      for (const item of uniquePending) {
        const length = item[1].length
        if (current.length > 0 && (current.length >= BATCH_SIZE || chars + length > BATCH_MAX_CHARS)) {
          batches.push(current)
          current = []
          chars = 0
        }
        current.push(item)
        chars += length + 4
      }
      if (current.length > 0) batches.push(current)
      let done = 0
      for (const batch of batches) {
        if (signal.aborted) throw new Error('任务已取消')
        done += batch.length
        job.current = `${file.relPath}（${done}/${uniquePending.length}）`
        const translations = await engine.translator.translateBatch(batch.map(([, text]) => text), job.targetLang, signal)
        batch.forEach(([key], offset) => {
          const value = translations[offset]
          if (typeof value === 'string' && value.trim()) cache[key] = value.trim()
        })
        job.totals.translated += batch.length
        await engine.saveCache(cache)
      }
      // Second pass: model replies that got cut off leave some keys empty; retry
      // them in smaller chunks so drawings do not keep untranslated labels.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const stillMissing = uniquePending.filter(([key]) => typeof cache[key] !== 'string' || !cache[key].trim())
        if (stillMissing.length === 0) break
        this.appendLog(job, `重试 ${stillMissing.length} 条未返回译文的文本（第 ${attempt + 1} 次）`)
        const CHUNK = 8
        for (let start = 0; start < stillMissing.length; start += CHUNK) {
          if (signal.aborted) throw new Error('任务已取消')
          const slice = stillMissing.slice(start, start + CHUNK)
          job.current = `${file.relPath}（补译 ${Math.min(start + CHUNK, stillMissing.length)}/${stillMissing.length}）`
          const translations = await engine.translator.translateBatch(slice.map(([, text]) => text), job.targetLang, signal)
          slice.forEach(([key], offset) => {
            const value = translations[offset]
            if (typeof value === 'string' && value.trim()) cache[key] = value.trim()
          })
          await engine.saveCache(cache)
        }
      }
    }

    job.phase = 'apply'
    this.appendLog(job, `写回译文：${file.relPath}`)
    const mapping = {}
    let matched = 0
    for (const segment of segments) {
      if (!engine.isTranslatable(segment.text)) continue
      const value = cache[`${job.targetLang}\u0001${segment.text}`]
      if (typeof value === 'string' && value.trim()) {
        mapping[segment.id] = value
        matched += 1
      }
    }
    file.translated = matched
    if (matched === 0) {
      file.status = 'skipped'
      file.error = '没有可用译文'
      this.appendLog(job, `跳过：${file.relPath}（没有可用译文）`)
      return
    }
    const chineseName = await this.translateFileName(job, file, cache, signal)
    const outputBase = outputBaseFor(file, chineseName)
    const applied = await engine.apply(file, mapping, workDir, outputBase, signal)
    file.output = applied.output
    file.pdf = applied.pdf
    if (Array.isArray(extraction.warnings) && extraction.warnings.length > 0) {
      this.appendLog(job, `提示：${file.relPath} — ${extraction.warnings.slice(0, 2).join('；')}`)
    }
    this.appendLog(job, `完成：${file.relPath} → ${applied.output}（${matched} 段译文）`)
  }

  /** Translate a source file name; names already containing Chinese are kept as-is. */
  async translateFileName(job, file, cache, signal) {
    const extension = path.extname(file.path)
    const stem = path.basename(file.path, extension)
    if (/[\u3400-\u9fff\uf900-\ufaff]/.test(stem)) return ''
    const key = `name\u0001${job.targetLang}\u0001${stem}`
    if (typeof cache[key] === 'string' && cache[key].trim()) return cache[key].trim()
    try {
      const values = await this.engine.translator.translateBatch([stem], job.targetLang, signal)
      const value = typeof values[0] === 'string' ? values[0].trim() : ''
      if (value && value !== stem) {
        cache[key] = value
        return value
      }
    } catch (error) {
      this.appendLog(job, `文件名翻译失败，使用原名：${file.relPath}（${error && error.message ? error.message : error}）`)
    }
    return ''
  }
}
