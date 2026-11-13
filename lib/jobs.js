/** Job manager: owns one translation run, its progress, and its outputs. */
import fsp from 'node:fs/promises'
import path from 'node:path'
import {
  OUTPUT_DIR_NAME, clampInt, logStamp, makeTempDir, normalizeDir, removeDirQuiet,
} from './util.js'

const BATCH_SIZE = 24
const BATCH_MAX_CHARS = 4000
const MAX_UNIQUE_PER_FILE = { pdf: 400, dwg: 400, docx: 1500 }
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
      error: null,
      controller: new AbortController(),
      workDir: null,
    }
    this.jobs.set(id, job)
    this.activeJobId = id
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
      await removeDirQuiet(workDir)
    }
  }

  async processFile(job, file, cache, workDir, signal) {
    const engine = this.engine
    job.phase = 'extract'
    this.appendLog(job, `提取文字：${file.relPath}`)
    const extraction = await engine.extract(file, workDir, signal)
    const segments = extraction.segments.filter((segment) => segment && typeof segment.id === 'string' && typeof segment.text === 'string')
    file.segments = segments.length
    job.totals.segments += segments.length
    if (segments.length === 0) {
      file.status = 'skipped'
      file.error = `没有可提取的文字（可能是扫描件或空图纸）${extraction.warnings.length > 0 ? '；' + extraction.warnings.slice(0, 2).join('；') : ''}`
      this.appendLog(job, `跳过：${file.relPath}（无文字） ${extraction.warnings.slice(0, 2).join('；')}`)
      return
    }
    if (job.dryRun) {
      file.status = 'done'
      file.error = null
      const sample = segments.slice(0, 6).map((segment) => String(segment.text).slice(0, 40)).join(' | ')
      this.appendLog(job, `只看文字：${file.relPath} 提取到 ${segments.length} 段；示例：${sample}${extraction.warnings.length > 0 ? '；提示：' + extraction.warnings.slice(0, 2).join('；') : ''}`)
      return
    }

    job.phase = 'translate'
    const pending = new Map()
    for (const segment of segments) {
      if (!engine.isTranslatable(segment.text)) continue
      const key = `${job.targetLang}\u0001${segment.text}`
      if (cache[key] === undefined) pending.set(key, segment.text)
    }
    const maxUnique = MAX_UNIQUE_PER_FILE[file.kind] || 400
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
