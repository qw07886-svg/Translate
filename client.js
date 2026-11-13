window.__ModuleLoader__.load({
  id: '@local/dsh-drawing-translator',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const PANEL_ID = 'drawing-translator'
    const NS = 'drawingTranslator'
    const API = '/dsh-drawing-translator/api'

    const zh = {
      panel: '图纸文档翻译',
      title: '图纸文档翻译',
      intro: '自动识别 PDF / DWG 图纸和 Word 文档中的文字，翻译成中文并保存在原文件夹，命名为「翻译+中文名+原名」。',
      folder: '目录',
      folderPlaceholder: '输入目录路径，或点「选择文件夹」',
      pick: '选择文件夹',
      pickFiles: '选择文件',
      selectedFiles: '已选文件',
      clearFiles: '清空',
      remove: '移除',
      fileModeHint: '文件模式：只翻译所选文件；译文保存在原文件夹（翻译+中文名+原名），不生成附属文件。点「清空」回到目录模式。',
      dirModeHint: '目录模式：扫描整个目录翻译，译文保存在各原文件旁边；也可点「选择文件」只翻译个别文件。',
      browseTitle: '浏览并选择文件',
      up: '上一级',
      home: '用户目录',
      loading: '正在读取目录…',
      emptyDir: '该目录下没有可翻译的文件或子目录。',
      folderOnly: '文件夹',
      selectedCount: '已选',
      confirm: '确定',
      cancelPick: '取消',
      options: '选项',
      scan: '扫描',
      scanning: '扫描中…',
      pdf: 'PDF',
      dwg: 'DWG',
      word: 'Word',
      language: '目标语言',
      langZh: '简体中文',
      langEn: 'English',
      limit: '本次最多文件数',
      start: '开始翻译',
      starting: '正在创建任务…',
      cancel: '取消任务',
      status: '运行状态',
      python: 'Python',
      converter: 'DWG 转换器',
      model: '翻译模型',
      noModel: '未找到默认模型',
      scanned: '已扫描',
      filesUnit: '个文件',
      progress: '翻译进度',
      phase: '阶段',
      current: '当前',
      file: '文件',
      kind: '类型',
      state: '状态',
      segs: '段落',
      translated: '译文',
      output: '输出',
      elapsed: '耗时',
      queued: '排队',
      running: '处理中',
      done: '完成',
      failed: '失败',
      skipped: '跳过',
      log: '日志',
      outputDir: '保存位置',
      openOutput: '打开所在文件夹',
      noJob: '尚未开始翻译。先扫描目录或选择文件，再点「开始翻译」。',
      empty: '目录下没有找到 PDF / DWG / Word 文件。',
      errorTitle: '出错了',
      dismiss: '关闭',
      scanHint: '译文直接保存在原文件夹，命名为「翻译+中文名+原名」，不生成任何附属文件。',
      refresh: '刷新',
    }

    const en = {
      panel: 'Drawing Translator',
      title: 'Drawing & Document Translator',
      intro: 'Extract text from PDF / DWG drawings and Word documents, translate it into Chinese, and save each translation next to its source file as “翻译+中文名+原名”.',
      folder: 'Folder',
      folderPlaceholder: 'Folder path, or use “Choose folder”',
      pick: 'Choose folder',
      pickFiles: 'Choose files',
      selectedFiles: 'Selected files',
      clearFiles: 'Clear',
      remove: 'Remove',
      fileModeHint: 'File mode: only the selected files are translated. Each translation is saved next to its source as “翻译+中文名+原名”, with no auxiliary files. Clear to return to folder mode.',
      dirModeHint: 'Folder mode: scan the whole folder; translations are saved next to each source file. Or use “Choose files” for a few documents.',
      browseTitle: 'Browse and select files',
      up: 'Up',
      home: 'Home',
      loading: 'Reading folder…',
      emptyDir: 'No translatable files or subfolders here.',
      folderOnly: 'Folder',
      selectedCount: 'Selected',
      confirm: 'OK',
      cancelPick: 'Cancel',
      options: 'Options',
      scan: 'Scan',
      scanning: 'Scanning…',
      pdf: 'PDF',
      dwg: 'DWG',
      word: 'Word',
      language: 'Target language',
      langZh: 'Simplified Chinese',
      langEn: 'English',
      limit: 'Max files this run',
      start: 'Start translation',
      starting: 'Creating job…',
      cancel: 'Cancel job',
      status: 'Status',
      python: 'Python',
      converter: 'DWG converter',
      model: 'Model',
      noModel: 'No default model',
      scanned: 'Scanned',
      filesUnit: 'files',
      progress: 'Progress',
      phase: 'Phase',
      current: 'Current',
      file: 'File',
      kind: 'Kind',
      state: 'State',
      segs: 'Segments',
      translated: 'Translated',
      output: 'Output',
      elapsed: 'Elapsed',
      queued: 'Queued',
      running: 'Running',
      done: 'Done',
      failed: 'Failed',
      skipped: 'Skipped',
      log: 'Log',
      outputDir: 'Saved in',
      openOutput: 'Open containing folder',
      noJob: 'No translation yet. Scan a folder or choose files, then press “Start translation”.',
      empty: 'No PDF / DWG / Word files found in this folder.',
      errorTitle: 'Something went wrong',
      dismiss: 'Dismiss',
      scanHint: 'Each translation is saved next to its source file as “翻译+中文名+原名”; no auxiliary files are created.',
      refresh: 'Refresh',
    }

    const STYLE = [
      '.dt-root { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: auto; padding: 20px 24px 32px; gap: 16px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); }',
      '.dt-head { display: flex; flex-direction: column; gap: 4px; }',
      '.dt-title { font-size: 18px; font-weight: 600; line-height: 26px; }',
      '.dt-intro { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }',
      '.dt-card { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }',
      '.dt-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }',
      '.dt-grow { flex: 1 1 240px; min-width: 0; }',
      '.dt-label { font-size: 12px; color: var(--dsw-alias-label-secondary); }',
      '.dt-input { flex: 1 1 260px; min-width: 0; height: 34px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); padding: 0 10px; font-size: 13px; outline: none; }',
      '.dt-input:focus { border-color: var(--dsw-alias-brand-primary); }',
      '.dt-btn { height: 34px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-size: 13px; cursor: pointer; white-space: nowrap; }',
      '.dt-btn:hover:not(:disabled) { border-color: var(--dsw-alias-brand-primary); }',
      '.dt-btn:disabled { opacity: .5; cursor: default; }',
      '.dt-btn-primary { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); font-weight: 600; }',
      '.dt-chip { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); font-size: 12px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); cursor: pointer; user-select: none; }',
      '.dt-chip-on { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary); }',
      '.dt-select { height: 34px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); padding: 0 8px; font-size: 13px; }',
      '.dt-num { width: 76px; height: 34px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); padding: 0 8px; font-size: 13px; }',
      '.dt-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary); }',
      '.dt-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }',
      '.dt-dot-ok { background: var(--dsw-alias-state-success-primary); }',
      '.dt-dot-bad { background: var(--dsw-alias-state-error-primary); }',
      '.dt-error { border: 1px solid var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-bg-layer-2); border-radius: 10px; padding: 10px 12px; font-size: 13px; display: flex; gap: 10px; align-items: flex-start; }',
      '.dt-error-text { flex: 1; word-break: break-all; }',
      '.dt-link { background: none; border: none; color: inherit; cursor: pointer; font-size: 12px; text-decoration: underline; padding: 0; }',
      '.dt-bar { height: 8px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }',
      '.dt-bar-fill { height: 100%; border-radius: 999px; background: var(--dsw-alias-brand-primary); transition: width .3s ease; }',
      '.dt-meta { display: flex; justify-content: space-between; font-size: 12px; color: var(--dsw-alias-label-secondary); gap: 12px; }',
      '.dt-table { width: 100%; border-collapse: collapse; font-size: 12px; }',
      '.dt-table th { text-align: left; font-weight: 500; color: var(--dsw-alias-label-secondary); padding: 6px 8px; border-bottom: 1px solid var(--dsw-alias-border-l1); white-space: nowrap; }',
      '.dt-table td { padding: 6px 8px; border-bottom: 1px solid var(--dsw-alias-border-l1); vertical-align: top; }',
      '.dt-table tr:last-child td { border-bottom: none; }',
      '.dt-name { word-break: break-all; }',
      '.dt-state { white-space: nowrap; }',
      '.dt-ok { color: var(--dsw-alias-state-success-primary); }',
      '.dt-bad { color: var(--dsw-alias-state-error-primary); }',
      '.dt-warn { color: var(--dsw-alias-state-warn-primary); }',
      '.dt-dim { color: var(--dsw-alias-label-secondary); }',
      '.dt-log { margin: 0; max-height: 180px; overflow: auto; font-family: ui-monospace, Consolas, monospace; font-size: 11.5px; line-height: 18px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 8px 10px; white-space: pre-wrap; word-break: break-all; }',
      '.dt-scroll { overflow: auto; max-height: 320px; }',
      '.dt-hint { font-size: 12px; color: var(--dsw-alias-label-secondary); line-height: 18px; overflow-wrap: anywhere; }',
      '.dt-foot { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: space-between; }',
      '.dt-dir { font-size: 13px; text-align: left; cursor: pointer; color: var(--dsw-alias-brand-primary); text-decoration: none; padding: 0; }',
      '.dt-row-on { background: var(--dsw-alias-bg-layer-2); }',
      '.dt-browser { border-color: var(--dsw-alias-brand-primary); }',
    ].join('\n')

    async function request(path, options) {
      const opts = options || {}
      const init = { method: opts.method || 'GET', headers: { 'content-type': 'application/json' } }
      if (opts.body !== undefined) init.body = JSON.stringify(opts.body)
      let response
      try {
        response = await fetch(`${API}${path}`, init)
      } catch (error) {
        throw new Error(`无法连接插件服务（${API}${path}）：${error && error.message ? error.message : error}`)
      }
      let payload = null
      try {
        payload = await response.json()
      } catch {
        throw new Error(`接口返回非 JSON（${path}，HTTP ${response.status}）`)
      }
      if (!response.ok || payload === null || payload.ok === false) {
        throw new Error((payload && payload.error) || `HTTP ${response.status}（${path}）`)
      }
      return payload
    }

    function formatSize(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
      if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    function formatMs(ms) {
      if (!Number.isFinite(ms) || ms < 0) return '—'
      if (ms < 1000) return `${Math.round(ms)} ms`
      if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`
      return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
    }

    function Badge(props) {
      return h('span', { className: 'dt-badge' },
        h('span', { className: `dt-dot ${props.ok ? 'dt-dot-ok' : 'dt-dot-bad'}` }),
        h('span', null, props.text))
    }

    function StatusBar(props) {
      const status = props.status
      const t = props.t
      const pythonOk = Boolean(status && status.python && status.python.ok)
      const pdfOk = Boolean(status && status.pdf && status.pdf.ok)
      const dwgOk = Boolean(status && status.dwg && status.dwg.ok)
      const docxOk = Boolean(status && status.docx && status.docx.ok)
      const converterOk = Boolean(status && status.dwg && status.dwg.converter)
      const translation = status && status.translation ? status.translation : null
      const modelText = translation && translation.provider ? `${translation.provider} / ${translation.model}` : t('noModel')
      return h('div', { className: 'dt-row' },
        h(Badge, { text: `${t('python')}${pdfOk ? ' · PDF' : ''}${dwgOk ? ' · DWG' : ''}`, ok: pythonOk && pdfOk }),
        h(Badge, { text: t('word'), ok: docxOk }),
        h(Badge, { text: t('converter'), ok: converterOk }),
        h(Badge, { text: `${t('model')}: ${modelText}`, ok: Boolean(translation && translation.available) }))
    }

    function fileState(file, t) {
      const labels = { queued: t('queued'), running: t('running'), done: t('done'), failed: t('failed'), skipped: t('skipped') }
      const cls = file.status === 'done' ? 'dt-ok' : file.status === 'failed' ? 'dt-bad' : file.status === 'skipped' ? 'dt-warn' : 'dt-dim'
      return h('span', { className: `dt-state ${cls}` }, labels[file.status] || file.status)
    }

    function kindLabelOf(kind, t) {
      return kind === 'pdf' ? t('pdf') : (kind === 'dwg' ? t('dwg') : (kind === 'docx' ? t('word') : kind))
    }

    function makePage(deps) {
      const t = deps.t
      const uiWorkspace = deps.uiWorkspace
      return function DrawingTranslatorPage() {
        const statusState = React.useState(null)
        const status = statusState[0]
        const setStatus = statusState[1]
        const dirState = React.useState('')
        const dir = dirState[0]
        const setDir = dirState[1]
        const kindsState = React.useState({ pdf: true, dwg: true, docx: true })
        const kinds = kindsState[0]
        const setKinds = kindsState[1]
        const langState = React.useState('zh-CN')
        const targetLang = langState[0]
        const setTargetLang = langState[1]
        const limitState = React.useState(10)
        const limit = limitState[0]
        const setLimit = limitState[1]
        const scanningState = React.useState(false)
        const scanning = scanningState[0]
        const setScanning = scanningState[1]
        const scanState = React.useState(null)
        const scanResult = scanState[0]
        const setScanResult = scanState[1]
        const filesState = React.useState([])
        const selectedFiles = filesState[0]
        const setSelectedFiles = filesState[1]
        const browserState = React.useState({ open: false, dir: '', parent: null, home: '', entries: [], loading: false, error: null })
        const browser = browserState[0]
        const setBrowser = browserState[1]
        const browserSelState = React.useState([])
        const browserSel = browserSelState[0]
        const setBrowserSel = browserSelState[1]
        const jobState = React.useState(null)
        const job = jobState[0]
        const setJob = jobState[1]
        const jobIdState = React.useState(null)
        const jobId = jobIdState[0]
        const setJobId = jobIdState[1]
        const startingState = React.useState(false)
        const starting = startingState[0]
        const setStarting = startingState[1]
        const errorState = React.useState(null)
        const error = errorState[0]
        const setError = errorState[1]
        const timerRef = React.useRef(null)

        function stopPolling() {
          if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
          }
        }

        function pollJob(id) {
          stopPolling()
          let failures = 0
          const tick = async function () {
            try {
              const payload = await request(`/job?id=${encodeURIComponent(id)}`)
              failures = 0
              setJob(payload.job)
              if (payload.job && payload.job.status === 'running') timerRef.current = setTimeout(tick, 1000)
            } catch (caught) {
              failures += 1
              if (failures <= 3) timerRef.current = setTimeout(tick, 1500)
              else setError(String(caught && caught.message ? caught.message : caught))
            }
          }
          timerRef.current = setTimeout(tick, 400)
        }

        React.useEffect(function () {
          let alive = true
          request('/status')
            .then(function (payload) {
              if (!alive) return
              setStatus(payload.status || null)
              const defaults = payload.defaults || {}
              if (typeof defaults.dir === 'string' && defaults.dir) setDir(function (current) { return current || defaults.dir })
              if (typeof defaults.targetLang === 'string') setTargetLang(defaults.targetLang)
              if (Number.isFinite(defaults.maxFiles)) setLimit(defaults.maxFiles)
              return request('/jobs').then(function (jobsPayload) {
                if (!alive) return
                const jobs = Array.isArray(jobsPayload.jobs) ? jobsPayload.jobs : []
                const running = jobs.find(function (item) { return item && item.status === 'running' })
                if (running) {
                  setJob(running)
                  setJobId(running.id)
                  if (typeof running.sourceDir === 'string' && running.sourceDir) setDir(running.sourceDir)
                  pollJob(running.id)
                }
              }).catch(function () { /* best effort */ })
            })
            .catch(function (caught) { if (alive) setError(String(caught && caught.message ? caught.message : caught)) })
          return function () {
            alive = false
            if (timerRef.current) clearTimeout(timerRef.current)
          }
        }, [])

        const selectedKinds = []
        if (kinds.pdf) selectedKinds.push('pdf')
        if (kinds.dwg) selectedKinds.push('dwg')
        if (kinds.docx) selectedKinds.push('docx')

        async function handlePick() {
          try {
            if (!uiWorkspace || typeof uiWorkspace.pickDirectory !== 'function') {
              setError('当前界面不支持系统目录选择，请直接输入目录路径')
              return
            }
            const picked = await uiWorkspace.pickDirectory()
            if (typeof picked === 'string' && picked) {
              setDir(picked)
              setScanResult(null)
              setSelectedFiles([])
            }
          } catch (caught) {
            setError(String(caught && caught.message ? caught.message : caught))
          }
        }

        async function loadBrowserList(target) {
          setBrowser(function (current) {
            return { open: true, dir: current.dir, parent: current.parent, home: current.home, entries: current.entries, loading: true, error: null }
          })
          try {
            const payload = await request('/list', { method: 'POST', body: { dir: target || '' } })
            setBrowser({
              open: true,
              dir: payload.dir || '',
              parent: payload.parent || null,
              home: payload.home || '',
              entries: Array.isArray(payload.entries) ? payload.entries : [],
              loading: false,
              error: null,
            })
          } catch (caught) {
            setBrowser(function (current) {
              return { ...current, loading: false, error: String(caught && caught.message ? caught.message : caught) }
            })
          }
        }

        function openBrowser() {
          setError(null)
          setBrowserSel(selectedFiles.slice())
          loadBrowserList(dir.trim() || '')
        }

        function closeBrowser() {
          setBrowser(function (current) { return { ...current, open: false } })
        }

        function toggleBrowserSelection(filePath) {
          setBrowserSel(function (current) {
            return current.indexOf(filePath) >= 0 ? current.filter(function (item) { return item !== filePath }) : current.concat([filePath])
          })
        }

        function confirmBrowser() {
          setSelectedFiles(browserSel.slice())
          setScanResult(null)
          setJob(null)
          setJobId(null)
          closeBrowser()
        }

        function removeSelectedFile(target) {
          setSelectedFiles(function (current) { return current.filter(function (item) { return item !== target }) })
        }

        async function handleScan() {
          if (!dir.trim()) { setError('请先选择目录'); return }
          setScanning(true)
          setError(null)
          setScanResult(null)
          setSelectedFiles([])
          try {
            const payload = await request('/scan', { method: 'POST', body: { dir: dir.trim(), kinds: selectedKinds } })
            setScanResult({ pdf: payload.pdf || [], dwg: payload.dwg || [], docx: payload.docx || [], total: payload.total || 0 })
          } catch (caught) {
            setError(String(caught && caught.message ? caught.message : caught))
          } finally {
            setScanning(false)
          }
        }

        async function handleStart() {
          const fileMode = selectedFiles.length > 0
          if (!fileMode && !dir.trim()) { setError('请先选择目录，或点「选择文件」指定文件'); return }
          if (selectedKinds.length === 0) { setError('请至少选择 PDF / DWG / Word 中的一种'); return }
          setStarting(true)
          setError(null)
          setJob(null)
          try {
            const body = fileMode
              ? { files: selectedFiles, kinds: selectedKinds, targetLang }
              : { dir: dir.trim(), kinds: selectedKinds, targetLang, limit: Number(limit) || 10 }
            const payload = await request('/translate', { method: 'POST', body })
            setJobId(payload.jobId)
            pollJob(payload.jobId)
          } catch (caught) {
            const message = String(caught && caught.message ? caught.message : caught)
            setError(message)
            if (message.indexOf('已有翻译任务在运行') >= 0) {
              try {
                const jobsPayload = await request('/jobs')
                const jobs = Array.isArray(jobsPayload.jobs) ? jobsPayload.jobs : []
                const running = jobs.find(function (item) { return item && item.status === 'running' })
                if (running) {
                  setJob(running)
                  setJobId(running.id)
                  setError(null)
                  pollJob(running.id)
                }
              } catch (adoptError) { /* keep original error */ }
            }
          } finally {
            setStarting(false)
          }
        }

        async function handleCancel() {
          if (!jobId) return
          try {
            await request('/cancel', { method: 'POST', body: { jobId } })
          } catch (caught) {
            setError(String(caught && caught.message ? caught.message : caught))
          }
        }

        async function handleReveal(target) {
          try {
            await request('/reveal', { method: 'POST', body: { path: target } })
          } catch (caught) {
            setError(String(caught && caught.message ? caught.message : caught))
          }
        }

        const running = Boolean(job && job.status === 'running')
        const finished = Boolean(job && job.status !== 'running')
        const progressFiles = job && job.totals ? job.totals.files : 0
        const completed = job && job.totals ? (job.totals.done || 0) + (job.totals.failed || 0) + (job.totals.skipped || 0) : 0
        const percent = progressFiles > 0 ? Math.min(100, Math.round((completed / progressFiles) * 100)) : 0
        const fileMode = selectedFiles.length > 0

        const errorBanner = error
          ? h('div', { className: 'dt-error' },
            h('span', { className: 'dt-error-text' }, `${t('errorTitle')}: ${error}`),
            h('button', { className: 'dt-link', onClick: function () { setError(null) } }, t('dismiss')))
          : null

        const statusCard = h('div', { className: 'dt-card' },
          h('div', { className: 'dt-row' },
            h('div', { className: 'dt-label dt-grow' }, t('status')),
            h('button', {
              className: 'dt-btn',
              title: t('refresh'),
              'aria-label': t('refresh'),
              onClick: function () {
                request('/status').then(function (payload) { setStatus(payload.status || null) }).catch(function (caught) {
                  setError(String(caught && caught.message ? caught.message : caught))
                })
              },
            }, '↻')),
          h(StatusBar, { status: status, t: t }))

        const folderCard = h('div', { className: 'dt-card' },
          h('div', { className: 'dt-row' },
            h('div', { className: 'dt-label dt-grow' }, t('folder')),
            h('button', { className: 'dt-btn', onClick: handleScan, disabled: scanning || running || !dir.trim() }, scanning ? t('scanning') : t('scan'))),
          h('div', { className: 'dt-row' },
            h('input', {
              className: 'dt-input',
              value: dir,
              placeholder: t('folderPlaceholder'),
              spellCheck: false,
              onChange: function (event) { setDir(event.target.value); setScanResult(null) },
            }),
            h('button', { className: 'dt-btn', onClick: handlePick, disabled: running }, t('pick')),
            h('button', { className: 'dt-btn', onClick: openBrowser, disabled: running }, t('pickFiles'))),
          h('div', { className: 'dt-hint' }, fileMode ? t('fileModeHint') : t('dirModeHint')),
          h('div', { className: 'dt-row' },
            h('span', { className: 'dt-label' }, t('options')),
            ['pdf', 'dwg', 'docx'].map(function (kind) {
              return h('button', {
                key: kind,
                className: `dt-chip ${kinds[kind] ? 'dt-chip-on' : ''}`,
                onClick: function () {
                  setKinds(function (current) {
                    const next = { pdf: current.pdf, dwg: current.dwg, docx: current.docx }
                    next[kind] = !current[kind]
                    return next
                  })
                  setScanResult(null)
                },
                disabled: running,
              }, kindLabelOf(kind, t))
            }),
            h('span', { className: 'dt-label' }, t('language')),
            h('select', {
              className: 'dt-select',
              value: targetLang,
              onChange: function (event) { setTargetLang(event.target.value) },
              disabled: running,
            },
              h('option', { value: 'zh-CN' }, t('langZh')),
              h('option', { value: 'en' }, t('langEn'))),
            h('span', { className: 'dt-label' }, t('limit')),
            h('input', {
              className: 'dt-num',
              type: 'number',
              min: 1,
              max: 500,
              value: limit,
              onChange: function (event) { setLimit(Number(event.target.value) || 1) },
              disabled: running || fileMode,
            })),
          h('div', { className: 'dt-row' },
            h('button', {
              className: 'dt-btn dt-btn-primary',
              onClick: handleStart,
              disabled: starting || running || (!fileMode && !dir.trim()) || selectedKinds.length === 0,
            }, starting ? t('starting') : t('start')),
            running ? h('button', { className: 'dt-btn', onClick: handleCancel }, t('cancel')) : null,
            h('span', { className: 'dt-hint dt-grow' }, t('scanHint'))))

        const browserCard = browser.open
          ? h('div', { className: 'dt-card dt-browser' },
            h('div', { className: 'dt-row' },
              h('div', { className: 'dt-label dt-grow' }, `${t('browseTitle')}${browser.dir ? ': ' + browser.dir : ''}`),
              h('button', { className: 'dt-btn', onClick: function () { loadBrowserList(browser.parent || '') }, disabled: browser.loading || !browser.parent }, t('up')),
              h('button', { className: 'dt-btn', onClick: function () { loadBrowserList(browser.home || '') }, disabled: browser.loading || !browser.home }, t('home')),
              h('button', { className: 'dt-btn', onClick: closeBrowser }, t('cancelPick'))),
            browser.error ? h('div', { className: 'dt-hint dt-bad' }, browser.error) : null,
            browser.loading
              ? h('div', { className: 'dt-hint' }, t('loading'))
              : (browser.entries.length === 0
                ? h('div', { className: 'dt-hint' }, t('emptyDir'))
                : h('div', { className: 'dt-scroll' },
                  h('table', { className: 'dt-table' },
                    h('thead', null, h('tr', null, h('th', { style: { width: '34px' } }, ''), h('th', null, t('file')), h('th', null, t('kind')), h('th', null, 'Size'))),
                    h('tbody', null, browser.entries.map(function (entry) {
                      if (entry.kind === 'dir') {
                        return h('tr', { key: entry.path },
                          h('td', null, ''),
                          h('td', { className: 'dt-name' }, h('button', { className: 'dt-link dt-dir', onClick: function () { loadBrowserList(entry.path) } }, `📁 ${entry.name}`)),
                          h('td', { className: 'dt-dim' }, t('folderOnly')),
                          h('td', { className: 'dt-dim' }, '—'))
                      }
                      const checked = browserSel.indexOf(entry.path) >= 0
                      return h('tr', { key: entry.path, className: checked ? 'dt-row-on' : '' },
                        h('td', null, h('input', { type: 'checkbox', checked: checked, onChange: function () { toggleBrowserSelection(entry.path) } })),
                        h('td', { className: 'dt-name' }, entry.name),
                        h('td', { className: 'dt-dim' }, kindLabelOf(entry.fileKind, t)),
                        h('td', { className: 'dt-dim' }, formatSize(entry.size)))
                    }))))),
            h('div', { className: 'dt-foot' },
              h('span', { className: 'dt-hint' }, `${t('selectedCount')}: ${browserSel.length}`),
              h('div', { className: 'dt-row' },
                h('button', { className: 'dt-btn', onClick: function () { setBrowserSel([]) }, disabled: browserSel.length === 0 }, t('clearFiles')),
                h('button', { className: 'dt-btn dt-btn-primary', onClick: confirmBrowser, disabled: browserSel.length === 0 }, `${t('confirm')} (${browserSel.length})`))))
          : null

        const filesCard = selectedFiles.length > 0
          ? h('div', { className: 'dt-card' },
            h('div', { className: 'dt-row' },
              h('div', { className: 'dt-label dt-grow' }, `${t('selectedFiles')}: ${selectedFiles.length}`),
              h('button', { className: 'dt-btn', onClick: function () { setSelectedFiles([]) }, disabled: running }, t('clearFiles'))),
            h('div', { className: 'dt-scroll' },
              h('table', { className: 'dt-table' },
                h('thead', null, h('tr', null, h('th', null, t('file')), h('th', null, ''))),
                h('tbody', null, selectedFiles.map(function (filePath) {
                  return h('tr', { key: filePath },
                    h('td', { className: 'dt-name' }, filePath),
                    h('td', null, h('button', { className: 'dt-link', onClick: function () { removeSelectedFile(filePath) }, disabled: running }, t('remove'))))
                })))))
          : null

        const scanContent = scanResult
          ? h('div', { className: 'dt-card' },
            h('div', { className: 'dt-meta' },
              h('span', null, `${t('scanned')}: ${scanResult.total} ${t('filesUnit')}`),
              h('span', null, `${t('pdf')} ${scanResult.pdf.length} · ${t('dwg')} ${scanResult.dwg.length} · ${t('word')} ${scanResult.docx.length}`)),
            scanResult.total > 0
              ? h('div', { className: 'dt-scroll' },
                h('table', { className: 'dt-table' },
                  h('thead', null, h('tr', null, h('th', null, t('file')), h('th', null, t('kind')), h('th', null, 'Size'))),
                  h('tbody', null, scanResult.pdf.map(function (file) { return h('tr', { key: file.path }, h('td', { className: 'dt-name' }, file.relPath || file.name), h('td', null, t('pdf')), h('td', { className: 'dt-dim' }, formatSize(file.size))) })
                    .concat(scanResult.dwg.map(function (file) { return h('tr', { key: file.path }, h('td', { className: 'dt-name' }, file.relPath || file.name), h('td', null, t('dwg')), h('td', { className: 'dt-dim' }, formatSize(file.size))) }))
                    .concat(scanResult.docx.map(function (file) { return h('tr', { key: file.path }, h('td', { className: 'dt-name' }, file.relPath || file.name), h('td', null, t('word')), h('td', { className: 'dt-dim' }, formatSize(file.size))) })))))
              : h('div', { className: 'dt-hint' }, t('empty')))
          : null

        const fileRows = job && job.files && job.files.length > 0
          ? h('div', { className: 'dt-scroll' },
            h('table', { className: 'dt-table' },
              h('thead', null, h('tr', null, h('th', null, t('file')), h('th', null, t('kind')), h('th', null, t('state')), h('th', null, t('segs')), h('th', null, t('translated')), h('th', null, t('elapsed')), h('th', null, t('output')))),
              h('tbody', null, job.files.map(function (file) {
                return h('tr', { key: file.path },
                  h('td', { className: 'dt-name' }, file.relPath || file.name),
                  h('td', { className: 'dt-dim' }, kindLabelOf(file.kind, t)),
                  h('td', null, fileState(file, t)),
                  h('td', { className: 'dt-dim' }, String(file.segments || 0)),
                  h('td', { className: 'dt-dim' }, String(file.translated || 0)),
                  h('td', { className: 'dt-dim' }, formatMs(file.elapsedMs)),
                  h('td', { className: 'dt-dim dt-name' }, file.error ? h('span', { className: 'dt-bad' }, file.error) : (file.output || '—')))
              }))))
          : null

        const jobCard = job
          ? h('div', { className: 'dt-card' },
            h('div', { className: 'dt-meta' },
              h('span', { className: 'dt-ok' }, `${t('progress')}: ${percent}%`),
              h('span', null, `${completed}/${progressFiles}`),
              h('span', null, `${t('phase')}: ${job.phase}`)),
            h('div', { className: 'dt-bar' }, h('div', { className: 'dt-bar-fill', style: { width: `${percent}%` } })),
            job.current ? h('div', { className: 'dt-hint' }, `${t('current')}: ${job.current}`) : null,
            job.error ? h('div', { className: 'dt-hint dt-bad' }, job.error) : null,
            fileRows,
            finished && job.outputDir && !job.dryRun
              ? h('div', { className: 'dt-foot' },
                h('span', { className: 'dt-hint' }, `${t('outputDir')}: ${job.outputDir}`),
                h('button', { className: 'dt-btn', onClick: function () { handleReveal(job.outputDir) } }, t('openOutput')))
              : null,
            job.log && job.log.length > 0
              ? h('div', null,
                h('div', { className: 'dt-label' }, t('log')),
                h('pre', { className: 'dt-log' }, job.log.slice(-40).join('\n')))
              : null)
          : h('div', { className: 'dt-card' }, h('div', { className: 'dt-hint' }, t('noJob')))

        return h('div', { className: 'dt-root' },
          h('style', null, STYLE),
          h('div', { className: 'dt-head' },
            h('div', { className: 'dt-title' }, t('title')),
            h('div', { className: 'dt-intro' }, t('intro'))),
          errorBanner,
          statusCard,
          folderCard,
          browserCard,
          filesCard,
          scanContent,
          jobCard)
      }
    }

    function makeIcon() {
      return function DrawingTranslatorIcon(props) {
        const size = props && Number.isFinite(props.size) ? props.size : 20
        const active = Boolean(props && props.active)
        return h('svg', {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          'aria-hidden': true,
          style: { display: 'block' },
        },
          h('rect', {
            x: 2.2, y: 2.2, width: 19.6, height: 19.6, rx: 5.2,
            fill: active ? 'var(--dsw-alias-brand-primary)' : 'transparent',
            stroke: active ? 'var(--dsw-alias-brand-primary)' : 'currentColor',
            strokeWidth: active ? 0 : 1.4,
            opacity: active ? 1 : 0.85,
          }),
          h('path', { d: 'M6.2 7.6h6.4v1.7h-2.3v1.1h-1.7V9.3H6.2z', fill: active ? '#fff' : 'currentColor' }),
          h('path', {
            d: 'M12.1 8.2h2.1l1.2 4.7 1.3-4.7h2l1.3 4.7 1.2-4.7h2.1L20.1 15h-2.1l-1.3-4.6-1.3 4.6h-2.1z',
            fill: active ? '#dbe9ff' : 'currentColor',
            opacity: active ? 1 : 0.75,
          }),
          h('path', {
            d: 'M6.4 17.7h11.2M15.4 15.8l2 1.9-2 1.9',
            stroke: active ? '#dbe9ff' : 'currentColor',
            strokeWidth: 1.5,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            opacity: active ? 1 : 0.75,
          }))
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const slots = ctx.get('slots')
        if (!slots) return
        let t = function (key) { return zh[key] || key }
        const localeService = ctx.get('locale')
        if (localeService && typeof localeService.register === 'function') {
          try {
            localeService.register(NS, { zh: zh, en: en })
            if (typeof localeService.bind === 'function') t = localeService.bind(NS)
          } catch (error) {
            t = function (key) { return zh[key] || key }
          }
        }
        const uiWorkspace = ctx.get('uiWorkspace')
        const Page = makePage({ t: t, uiWorkspace: uiWorkspace })
        const Icon = makeIcon()
        slots.inject('main', function () {
          return slots.register({ name: 'main', key: PANEL_ID, locale: NS }, Page)
        })
        slots.inject('sidebar.panellist', function () {
          return slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 20, label: function () { return t('panel') }, locale: NS }, Icon)
        })
      },
    }
  },
})
