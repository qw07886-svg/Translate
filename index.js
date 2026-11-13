/**
 * Drawing & Document Translator — Host half.
 *
 * Registers a same-origin HTTP API under `/dsh-drawing-translator/api` that the
 * left-sidebar panel calls, plus the `drawing_translate` agent tool.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiHandler } from './lib/api.js'
import { createEngine } from './lib/engine.js'
import { JobManager } from './lib/jobs.js'

const pluginDir = path.dirname(fileURLToPath(import.meta.url))

/** The web carrier is mandatory; the LLM/translation services are resolved lazily. */
export const inject = ['webServer']

export function apply(ctx) {
  const engine = createEngine({ ctx, pluginDir, configuredPython: process.env.DSH_DRAWING_PYTHON })
  const manager = new JobManager({
    engine,
    pluginDir,
    defaultSourceDir: process.env.DSH_DRAWING_DIR || path.dirname(pluginDir),
  })
  ctx.effect(() => () => manager.dispose(), 'drawing-translator: dispose jobs')
  const handler = createApiHandler({ engine, manager })
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: '/dsh-drawing-translator/api', handler }),
    'drawing-translator: api route',
  )
  registerAgentTool(ctx, manager)
  console.log('[drawing-translator] host ready: /dsh-drawing-translator/api')
}

/** Expose the same operation as an agent tool. */
function registerAgentTool(ctx, manager) {
  try {
    const tools = ctx.get('tools')
    if (!tools || typeof tools.register !== 'function') return
    ctx.effect(() => tools.register({
      name: 'drawing_translate',
      description: [
        '翻译 PDF / DWG 图纸和 Word 文档：提取文字（PDF 用 PyMuPDF，DWG 用 LibreDWG，Word 用 python-docx），',
        '调用当前默认模型翻译成中文，译文保存在原文件所在文件夹，命名为「翻译+中文名+原名」，不生成附属文件。',
        'dir 传目录，或 files 直接传文件绝对路径（优先于 dir）。limit 控制本次最多处理多少个文件（默认 5）。',
      ].join(''),
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: [],
        properties: {
          dir: { type: 'string', description: '要翻译的目录（绝对路径）；也可改用 files 直接指定文件' },
          files: { type: 'array', description: '直接指定要翻译的文件绝对路径（优先于 dir）', items: { type: 'string' } },
          kinds: { type: 'array', description: '文件类型，可选 pdf / dwg / docx，缺省全部处理', items: { type: 'string', enum: ['pdf', 'dwg', 'docx'] } },
          targetLang: { type: 'string', enum: ['zh-CN', 'en'], description: '目标语言，缺省 zh-CN' },
          limit: { type: 'integer', description: '本次最多处理文件数，缺省 5' },
          dryRun: { type: 'boolean', description: '只提取文字不翻译（用于确认有多少可翻译文字）' },
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['jobId', 'status', 'report'],
          properties: {
            jobId: { type: 'string' },
            status: { type: 'string' },
            report: { type: 'string' },
          },
        },
        render: (_args, value) => [{ type: 'text', text: value.report }],
      },
      async execute(args, exec) {
        const started = manager.start({
          dir: args?.dir,
          files: args?.files,
          kinds: args?.kinds,
          targetLang: args?.targetLang,
          limit: args?.limit ?? 5,
          dryRun: args?.dryRun === true,
        })
        const deadline = Date.now() + 15 * 60_000
        let job = manager.get(started.jobId)
        while (job && job.status === 'running' && Date.now() < deadline) {
          if (exec?.signal?.aborted) {
            manager.cancel(started.jobId)
            break
          }
          await new Promise((resolve) => setTimeout(resolve, 1000))
          job = manager.get(started.jobId)
        }
        if (job && job.status === 'running') {
          manager.cancel(started.jobId)
          job = manager.get(started.jobId)
        }
        const lines = [
          `任务 ${started.jobId}：${job?.status ?? 'unknown'}（阶段 ${job?.phase ?? '-'}）`,
          `源目录：${job?.sourceDir ?? args?.dir ?? '-'}`,
        ]
        if (job?.dryRun) lines.push('模式：只看文字（dryRun，未生成翻译文件）')
        lines.push(
          `文件：成功 ${job?.totals?.done ?? 0}，失败 ${job?.totals?.failed ?? 0}，跳过 ${job?.totals?.skipped ?? 0}`,
          `段落：${job?.totals?.segments ?? 0}，已翻译：${job?.totals?.translated ?? 0}`,
        )
        for (const file of job?.files ?? []) {
          lines.push(`- [${file.status}] ${file.relPath}${file.error ? ` — ${file.error}` : ''}${file.output ? ` → ${file.output}` : ''}`)
        }
        if (job?.log?.length) lines.push('', '日志（末 10 条）：', ...job.log.slice(-10))
        return { jobId: started.jobId, status: job?.status ?? 'unknown', report: lines.join('\n') }
      },
    }), 'drawing-translator: agent tool')
  } catch (error) {
    console.warn('[drawing-translator] agent tool registration skipped:', error?.message ?? error)
  }
}
