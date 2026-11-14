/**
 * Drawing & Document Translator — Client half.
 *
 * Left-sidebar entry plus the main panel: folder/file selection, scanning,
 * job progress and results. Talks to the host API under
 * `/dsh-drawing-translator/api`.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-drawing-translator',
  factory(require) {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')
    var h = React.createElement
    var useState = React.useState
    var useEffect = React.useEffect
    var useCallback = React.useCallback
    var useRef = React.useRef

    var API = '/dsh-drawing-translator/api'

    var DICT = {
      zh: {
        'panel.title': '图纸翻译',
        'panel.heading': '图纸与文档翻译',
        'panel.subtitle': '自动翻译 PDF / DWG 图纸与 Word 文档，译文保存在原文件夹。',
        'status.python': 'Python',
        'status.pdf': 'PDF',
        'status.dwg': 'DWG',
        'status.docx': 'Word',
        'status.model': '翻译模型',
        'status.ready': '就绪',
        'status.missing': '缺失',
        'status.refresh': '刷新状态',
        'source.title': '要翻译的内容',
        'source.dirLabel': '目录',
        'source.dirPlaceholder': '例如 E:\\玲珑项目\\图纸',
        'source.pickFolder': '选择文件夹',
        'source.pickFiles': '选择文件',
        'source.scan': '扫描目录',
        'source.scanning': '扫描中…',
        'source.selected': '已直接选择 {n} 个文件',
        'source.clear': '清空',
        'source.limit': '本次最多处理',
        'source.limitUnit': '个文件',
        'source.hint': '选择文件时只翻译这些文件；目录模式下会扫描子文件夹里的 PDF / DWG / Word。',
        'name.rule': '输出命名：翻译+中文名+原名，保存在原文件夹，不产生其它文件。',
        'browser.titleFiles': '选择要翻译的文件',
        'browser.titleDir': '选择要扫描的文件夹',
        'browser.up': '上一级',
        'browser.home': '用户目录',
        'browser.cancel': '取消',
        'browser.confirm': '确定',
        'browser.selectedCount': '已选 {n} 项',
        'browser.empty': '此文件夹内没有可翻译的文件',
        'browser.loading': '正在读取…',
        'browser.drives': '盘符',
        'browser.dirPickHint': '点击文件夹进入，选中当前文件夹后点“确定”。',
        'scan.title': '扫描结果',
        'scan.pdf': 'PDF',
        'scan.dwg': 'DWG',
        'scan.docx': 'Word',
        'scan.total': '共 {n} 个文件',
        'scan.empty': '还没有扫描结果',
        'scan.progress': '正在扫描：{dirs} 个文件夹、{files} 个文件，已用 {sec} 秒',
        'scan.cancel': '停止扫描',
        'scan.truncated': '已达到扫描上限，下面的列表只包含部分文件。请选择更具体的文件夹后重新扫描。',
        'run.translate': '开始翻译',
        'run.cancel': '取消任务',
        'run.running': '翻译中…',
        'run.phase.scan': '扫描文件',
        'run.phase.extract': '提取文字',
        'run.phase.translate': '翻译文字',
        'run.phase.apply': '写回译文',
        'job.progress': '{done} / {total}',
        'job.current': '当前：{name}',
        'job.output': '保存位置',
        'job.openFolder': '打开所在文件夹',
        'job.log': '运行日志',
        'job.none': '暂无任务',
        'job.files': '文件',
        'job.segments': '段落',
        'job.translated': '已翻译',
        'file.queued': '排队',
        'file.running': '处理中',
        'file.done': '完成',
        'file.failed': '失败',
        'file.skipped': '跳过',
        'result.summary': '成功 {done}，失败 {failed}，跳过 {skipped}',
        'result.savedNext': '译文已保存在原文件所在文件夹。',
        'error.prefix': '出错了',
        'loading': '加载中…',
      },
      en: {
        'panel.title': 'Translator',
        'panel.heading': 'Drawing & document translator',
        'panel.subtitle': 'Translate PDF / DWG drawings and Word documents automatically; translations are saved next to the source file.',
        'status.python': 'Python',
        'status.pdf': 'PDF',
        'status.dwg': 'DWG',
        'status.docx': 'Word',
        'status.model': 'Model',
        'status.ready': 'ready',
        'status.missing': 'missing',
        'status.refresh': 'Refresh',
        'source.title': 'What to translate',
        'source.dirLabel': 'Folder',
        'source.dirPlaceholder': 'e.g. E:\\projects\\drawings',
        'source.pickFolder': 'Pick folder',
        'source.pickFiles': 'Pick files',
        'source.scan': 'Scan folder',
        'source.scanning': 'Scanning…',
        'source.selected': '{n} file(s) selected',
        'source.clear': 'Clear',
        'source.limit': 'Process at most',
        'source.limitUnit': 'files',
        'source.hint': 'With picked files only those are translated; folder mode scans subfolders for PDF / DWG / Word.',
        'name.rule': 'Output name: 翻译+Chinese name+original name, saved in the source folder with no extra files.',
        'browser.titleFiles': 'Pick files to translate',
        'browser.titleDir': 'Pick a folder to scan',
        'browser.up': 'Up',
        'browser.home': 'Home',
        'browser.cancel': 'Cancel',
        'browser.confirm': 'OK',
        'browser.selectedCount': '{n} selected',
        'browser.empty': 'No translatable files in this folder',
        'browser.loading': 'Reading…',
        'browser.drives': 'Drives',
        'browser.dirPickHint': 'Click a folder to enter it, then press OK to use the current folder.',
        'scan.title': 'Scan result',
        'scan.pdf': 'PDF',
        'scan.dwg': 'DWG',
        'scan.docx': 'Word',
        'scan.total': '{n} file(s)',
        'scan.empty': 'Nothing scanned yet',
        'scan.progress': 'Scanning: {dirs} folder(s), {files} file(s), {sec}s elapsed',
        'scan.cancel': 'Stop scanning',
        'scan.truncated': 'The scan hit its limit, so this list is only partial. Pick a narrower folder and scan again.',
        'run.translate': 'Start translating',
        'run.cancel': 'Cancel job',
        'run.running': 'Translating…',
        'run.phase.scan': 'Scanning',
        'run.phase.extract': 'Extracting text',
        'run.phase.translate': 'Translating text',
        'run.phase.apply': 'Writing translation',
        'job.progress': '{done} / {total}',
        'job.current': 'Current: {name}',
        'job.output': 'Saved to',
        'job.openFolder': 'Open containing folder',
        'job.log': 'Log',
        'job.none': 'No job yet',
        'job.files': 'Files',
        'job.segments': 'Segments',
        'job.translated': 'Translated',
        'file.queued': 'queued',
        'file.running': 'running',
        'file.done': 'done',
        'file.failed': 'failed',
        'file.skipped': 'skipped',
        'result.summary': '{done} done, {failed} failed, {skipped} skipped',
        'result.savedNext': 'Translations are saved in each source file folder.',
        'error.prefix': 'Error',
        'loading': 'Loading…',
      },
    }

    // Theme tokens. The primary button needs a paired background/foreground:
    // --dsw-alias-brand-primary is near-black in the light theme and near-white
    // in the dark one, so white text on it vanished in dark mode. The button
    // fill and its inverted label come as a matched pair instead.
    var COLORS = {
      border: 'var(--dsw-alias-border-l2, rgba(127,127,127,.22))',
      surface: 'var(--dsw-alias-bg-layer-1, #fff)',
      surfaceAlt: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,.06))',
      text: 'var(--dsw-alias-label-primary, #1f1f1f)',
      textDim: 'var(--dsw-alias-label-secondary, #666)',
      textTertiary: 'var(--dsw-alias-label-tertiary, #999)',
      accent: 'var(--dsw-alias-state-business-primary, #4166e6)',
      primaryFill: 'var(--dsw-alias-button-primary-fill, #1f1f1f)',
      primaryText: 'var(--dsw-alias-label-primary-inverted, #fff)',
      primaryDimmed: 'var(--dsw-alias-button-primary-dimmed, rgba(127,127,127,.18))',
      success: 'var(--dsw-alias-state-success-primary, #1a7f37)',
      warning: 'var(--dsw-alias-state-warn-primary, #b26a00)',
      danger: 'var(--dsw-alias-state-error-primary, #c62828)',
    }

    var STYLES = {
      root: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'auto', gap: 12, padding: '16px 18px 24px', color: COLORS.text, fontSize: 13, lineHeight: 1.5 },
      card: { border: '1px solid ' + COLORS.border, borderRadius: 10, background: COLORS.surface, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 },
      cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
      title: { fontSize: 14, fontWeight: 600 },
      subtitle: { color: COLORS.textDim, fontSize: 12 },
      row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
      input: { flex: '1 1 240px', minWidth: 0, height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid ' + COLORS.border, background: COLORS.surface, color: COLORS.text, fontSize: 13, outline: 'none' },
      number: { width: 70, height: 32, padding: '0 8px', borderRadius: 8, border: '1px solid ' + COLORS.border, background: COLORS.surface, color: COLORS.text, fontSize: 13, textAlign: 'center' },
      button: { height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid ' + COLORS.border, background: COLORS.surface, color: COLORS.text, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },
      buttonPrimary: { height: 34, padding: '0 16px', borderRadius: 8, border: '1px solid transparent', background: COLORS.primaryFill, color: COLORS.primaryText, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
      buttonPrimaryDisabled: { height: 34, padding: '0 16px', borderRadius: 8, border: '1px solid ' + COLORS.border, background: COLORS.primaryDimmed, color: COLORS.textTertiary, fontSize: 13, fontWeight: 600, cursor: 'not-allowed' },
      buttonDanger: { height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid ' + COLORS.border, background: COLORS.surface, color: COLORS.danger, fontSize: 13, cursor: 'pointer' },
      badge: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 8px', borderRadius: 999, fontSize: 11, border: '1px solid ' + COLORS.border, background: COLORS.surfaceAlt, color: COLORS.textDim },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
      th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid ' + COLORS.border, color: COLORS.textDim, fontWeight: 500 },
      td: { padding: '6px 8px', borderBottom: '1px solid ' + COLORS.border, color: COLORS.text, verticalAlign: 'top' },
      log: { margin: 0, maxHeight: 180, overflow: 'auto', background: COLORS.surfaceAlt, borderRadius: 8, padding: '8px 10px', fontFamily: 'Consolas, Menlo, monospace', fontSize: 11, color: COLORS.textDim, whiteSpace: 'pre-wrap' },
      overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 24 },
      dialog: { width: 'min(720px, 100%)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: COLORS.surface, borderRadius: 12, border: '1px solid ' + COLORS.border, overflow: 'hidden' },
      dialogBody: { flex: 1, minHeight: 240, overflow: 'auto', padding: '6px 4px' },
      listRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
      dialogFoot: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 14px', borderTop: '1px solid ' + COLORS.border },
      bar: { height: 6, borderRadius: 999, background: COLORS.surfaceAlt, overflow: 'hidden' },
      barFill: { height: '100%', background: COLORS.accent, transition: 'width .3s ease' },
      mono: { fontFamily: 'Consolas, Menlo, monospace', fontSize: 11, color: COLORS.textDim, wordBreak: 'break-all' },
    }

    function makeT(active) {
      var lang = /^en/i.test(String(active || '')) ? 'en' : 'zh'
      var dict = DICT[lang] || DICT.zh
      return function t(key, params) {
        var text = dict[key] || DICT.zh[key] || key
        if (params) {
          text = text.replace(/\{(\w+)\}/g, function (match, name) {
            return params[name] === undefined ? match : String(params[name])
          })
        }
        return text
      }
    }

    function formatSize(bytes) {
      if (!bytes) return ''
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
      return (bytes / 1024 / 1024).toFixed(1) + ' MB'
    }

    async function request(path, options) {
      var settings = Object.assign({ method: 'GET' }, options || {})
      if (settings.body && typeof settings.body !== 'string') {
        settings.headers = Object.assign({ 'Content-Type': 'application/json' }, settings.headers || {})
        settings.body = JSON.stringify(settings.body)
      }
      var response
      try {
        response = await fetch(API + path, settings)
      } catch (error) {
        throw new Error('无法连接插件后台（' + path + '）：' + (error && error.message ? error.message : error))
      }
      var text = await response.text()
      var data = null
      try {
        data = text ? JSON.parse(text) : {}
      } catch (error) {
        throw new Error('后台返回了无法解析的内容（' + path + '，HTTP ' + response.status + '）：' + text.slice(0, 120))
      }
      if (!response.ok || data.ok === false) {
        throw new Error((data && data.error) || ('请求失败：' + path + '（HTTP ' + response.status + '）'))
      }
      return data
    }

    function badgeStyle(kind) {
      var color = COLORS.textDim
      if (kind === 'ok') color = COLORS.success
      if (kind === 'warn') color = COLORS.warning
      if (kind === 'bad') color = COLORS.danger
      return Object.assign({}, STYLES.badge, { color: color })
    }

    function StatusPill(props) {
      return h('span', { style: badgeStyle(props.ok ? 'ok' : 'bad') },
        props.label + ' · ' + (props.ok ? props.t('status.ready') : props.t('status.missing')))
    }

    function BrowserDialog(props) {
      var t = props.t
      var state = props.state
      var onClose = props.onClose
      var onEnter = props.onEnter
      var onToggleFile = props.onToggleFile
      var onConfirm = props.onConfirm
      var onSelectDir = props.onSelectDir
      var selected = state.selected || {}
      var selectedCount = Object.keys(selected).length
      var entries = state.entries || []
      return h('div', { style: STYLES.overlay, onMouseDown: function (event) { if (event.target === event.currentTarget) onClose() } },
        h('div', { style: STYLES.dialog },
          h('div', { style: Object.assign({}, STYLES.cardHead, { padding: '12px 14px', borderBottom: '1px solid ' + COLORS.border }) },
            h('div', { style: STYLES.title }, state.mode === 'dir' ? t('browser.titleDir') : t('browser.titleFiles')),
            h('div', { style: STYLES.row },
              h('button', { style: STYLES.button, onClick: function () { onEnter(state.parent || '') } }, t('browser.up')),
              h('button', { style: STYLES.button, onClick: function () { onEnter(state.home || '') } }, t('browser.home')),
              h('button', { style: STYLES.button, onClick: function () { onEnter('') } }, t('browser.drives'))
            )
          ),
          h('div', { style: Object.assign({}, STYLES.mono, { padding: '6px 14px' }) }, state.dir || t('browser.drives')),
          state.mode === 'dir'
            ? h('div', { style: Object.assign({}, STYLES.subtitle, { padding: '0 14px 4px' }) }, t('browser.dirPickHint'))
            : null,
          h('div', { style: STYLES.dialogBody },
            state.loading
              ? h('div', { style: Object.assign({}, STYLES.subtitle, { padding: '10px 14px' }) }, t('browser.loading'))
              : (entries.length === 0
                ? h('div', { style: Object.assign({}, STYLES.subtitle, { padding: '10px 14px' }) }, t('browser.empty'))
                : entries.map(function (entry) {
                  var isDir = entry.kind === 'dir'
                  var checked = Boolean(selected[entry.path])
                  return h('div', {
                    key: entry.path,
                    style: Object.assign({}, STYLES.listRow, { background: checked ? COLORS.surfaceAlt : 'transparent' }),
                    onClick: function () {
                      if (isDir) onEnter(entry.path)
                      else onToggleFile(entry.path)
                    },
                  },
                    h('span', { style: { width: 16, color: COLORS.accent } }, isDir ? '📁' : (checked ? '☑' : '☐')),
                    h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, entry.name),
                    h('span', { style: { fontSize: 11, color: COLORS.textTertiary } }, isDir ? '' : (entry.fileKind || '') + ' ' + formatSize(entry.size))
                  )
                }))
          ),
          h('div', { style: STYLES.dialogFoot },
            h('div', { style: STYLES.subtitle }, state.mode === 'dir' ? (state.dir || '') : t('browser.selectedCount', { n: selectedCount })),
            h('div', { style: STYLES.row },
              h('button', { style: STYLES.button, onClick: onClose }, t('browser.cancel')),
              h('button', { style: STYLES.buttonPrimary, onClick: function () { state.mode === 'dir' ? onSelectDir(state.dir) : onConfirm() } }, t('browser.confirm'))
            )
          )
        )
      )
    }

    function Panel(props) {
      var locale = props.locale
      var activeLocale = useActiveLocale(locale)
      var t = makeT(activeLocale)

      var dirState = useState('')
      var dir = dirState[0]
      var setDir = dirState[1]
      var statusState = useState(null)
      var status = statusState[0]
      var setStatus = statusState[1]
      var statusErrorState = useState('')
      var statusError = statusErrorState[0]
      var setStatusError = statusErrorState[1]
      var scanState = useState(null)
      var scan = scanState[0]
      var setScan = scanState[1]
      var scanningState = useState(false)
      var scanning = scanningState[0]
      var setScanning = scanningState[1]
      var scanProgressState = useState({ dirs: 0, files: 0, elapsedMs: 0 })
      var scanProgress = scanProgressState[0]
      var setScanProgress = scanProgressState[1]
      var pickedState = useState([])
      var picked = pickedState[0]
      var setPicked = pickedState[1]
      var limitState = useState(10)
      var limit = limitState[0]
      var setLimit = limitState[1]
      var jobIdState = useState(null)
      var jobId = jobIdState[0]
      var setJobId = jobIdState[1]
      var jobState = useState(null)
      var job = jobState[0]
      var setJob = jobState[1]
      var errorState = useState('')
      var error = errorState[0]
      var setError = errorState[1]
      var busyState = useState(false)
      var busy = busyState[0]
      var setBusy = busyState[1]
      var browserState = useState({ open: false, mode: 'files', dir: '', parent: null, home: '', entries: [], loading: false, selected: {} })
      var browser = browserState[0]
      var setBrowser = browserState[1]
      var pollRef = useRef(null)
      var scanPollRef = useRef(null)
      var scanIdRef = useRef(null)

      useEffect(function () {
        return function () {
          if (scanPollRef.current) {
            clearTimeout(scanPollRef.current)
            scanPollRef.current = null
          }
        }
      }, [])

      useEffect(function () {
        var cancelled = false
        request('/status').then(function (data) {
          if (!cancelled) {
            setStatus(data.status)
            setStatusError('')
          }
        }).catch(function (err) {
          if (!cancelled) setStatusError(err.message)
        })
        return function () { cancelled = true }
      }, [])

      useEffect(function () {
        if (!jobId) return undefined
        var stop = false
        function tick() {
          request('/job?id=' + encodeURIComponent(jobId)).then(function (data) {
            if (stop) return
            setJob(data.job)
            if (data.job && data.job.status !== 'running') {
              setBusy(false)
              if (pollRef.current) {
                clearInterval(pollRef.current)
                pollRef.current = null
              }
            }
          }).catch(function (err) {
            if (!stop) setError(err.message)
          })
        }
        tick()
        pollRef.current = setInterval(tick, 1200)
        return function () {
          stop = true
          if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
          }
        }
      }, [jobId])

      var openBrowser = useCallback(function (mode) {
        setBrowser(function (prev) { return Object.assign({}, prev, { open: true, mode: mode, loading: true, selected: {} }) })
        var initial = mode === 'dir' ? (dir || browser.dir || '') : (dir || browser.dir || '')
        loadBrowser(initial)
      }, [dir, browser.dir])

      function loadBrowser(target) {
        setBrowser(function (prev) { return Object.assign({}, prev, { loading: true }) })
        request('/list?dir=' + encodeURIComponent(target || '')).then(function (data) {
          setBrowser(function (prev) {
            var selected = Object.assign({}, prev.selected)
            var entries = data.entries || []
            var keep = {}
            entries.forEach(function (entry) { if (selected[entry.path]) keep[entry.path] = true })
            return Object.assign({}, prev, {
              loading: false,
              dir: data.dir || '',
              parent: data.parent || null,
              home: data.home || '',
              entries: entries,
              selected: keep,
            })
          })
        }).catch(function (err) {
          setBrowser(function (prev) { return Object.assign({}, prev, { loading: false, entries: [] }) })
          setError(err.message)
        })
      }

      function togglePickedFile(path) {
        setBrowser(function (prev) {
          var selected = Object.assign({}, prev.selected)
          if (selected[path]) delete selected[path]
          else selected[path] = true
          return Object.assign({}, prev, { selected: selected })
        })
      }

      function confirmBrowser() {
        var selected = browser.selected || {}
        var files = Object.keys(selected)
        setPicked(files)
        setBrowser(function (prev) { return Object.assign({}, prev, { open: false }) })
      }

      function selectBrowserDir(path) {
        setDir(path || '')
        setBrowser(function (prev) { return Object.assign({}, prev, { open: false }) })
      }

      // Scanning runs in the background on the host so the panel can show live
      // counters instead of freezing on one long request.
      function runScan() {
        if (!dir.trim()) {
          setError(t('source.dirPlaceholder'))
          return
        }
        if (scanPollRef.current) {
          clearTimeout(scanPollRef.current)
          scanPollRef.current = null
        }
        setScanning(true)
        setError('')
        setScan(null)
        setScanProgress({ dirs: 0, files: 0, elapsedMs: 0 })
        request('/scan', {
          method: 'POST',
          body: { dir: dir.trim(), kinds: ['pdf', 'dwg', 'docx'] },
        }).then(function (data) {
          var id = data && data.scanId
          if (!id) {
            setScan(data && data.result ? data.result : data)
            setScanning(false)
            return
          }
          scanIdRef.current = id
          function poll() {
            request('/scan?id=' + encodeURIComponent(id)).then(function (view) {
              setScanProgress({ dirs: view.dirs || 0, files: view.files || 0, elapsedMs: view.elapsedMs || 0 })
              if (view.error) {
                scanIdRef.current = null
                setScanning(false)
                setError(view.error)
                return
              }
              if (view.running) {
                scanPollRef.current = setTimeout(poll, 400)
                return
              }
              scanIdRef.current = null
              setScanning(false)
              setScan(view.result || null)
            }).catch(function (err) {
              scanIdRef.current = null
              setScanning(false)
              setError(err.message)
            })
          }
          poll()
        }).catch(function (err) {
          setError(err.message)
          setScanning(false)
        })
      }

      function cancelScan() {
        var id = scanIdRef.current
        if (!id) return
        request('/scan/cancel', { method: 'POST', body: { id: id } }).catch(function (err) { setError(err.message) })
      }

      function startJob() {
        setError('')
        setBusy(true)
        var payload = { targetLang: 'zh-CN', limit: Number(limit) || 10 }
        if (picked.length > 0) payload.files = picked
        else payload.dir = dir.trim()
        request('/translate', { method: 'POST', body: payload }).then(function (data) {
          setJobId(data.jobId)
        }).catch(function (err) {
          setError(err.message)
          setBusy(false)
        })
      }

      function cancelJob() {
        if (!jobId) return
        request('/cancel', { method: 'POST', body: { jobId: jobId } }).catch(function (err) { setError(err.message) })
      }

      function revealFolder(path) {
        if (!path) return
        request('/reveal', { method: 'POST', body: { path: path } }).catch(function (err) { setError(err.message) })
      }

      var running = Boolean(job && job.status === 'running')
      var translation = status && status.translation ? status.translation : null
      var engineReady = Boolean(status && status.python && status.python.ok)

      return h('div', { style: STYLES.root },
        h('div', null,
          h('div', { style: { fontSize: 18, fontWeight: 600, marginBottom: 2 } }, t('panel.heading')),
          h('div', { style: STYLES.subtitle }, t('panel.subtitle'))
        ),

        h('div', { style: STYLES.card },
          h('div', { style: STYLES.cardHead },
            h('div', { style: STYLES.title }, t('status.refresh')),
            h('button', { style: STYLES.button, onClick: function () {
              request('/status').then(function (data) { setStatus(data.status); setStatusError('') }).catch(function (err) { setStatusError(err.message) })
            } }, t('status.refresh'))
          ),
          h('div', { style: STYLES.row },
            h(StatusPill, { t: t, label: t('status.python'), ok: Boolean(status && status.python && status.python.ok) }),
            h(StatusPill, { t: t, label: t('status.pdf'), ok: Boolean(status && status.pdf && status.pdf.ok) }),
            h(StatusPill, { t: t, label: t('status.dwg'), ok: Boolean(status && status.dwg && status.dwg.ok) }),
            h(StatusPill, { t: t, label: t('status.docx'), ok: Boolean(status && status.docx && status.docx.ok) }),
            h('span', { style: badgeStyle(translation && translation.available ? 'ok' : 'bad') },
              t('status.model') + ' · ' + (translation && translation.model ? translation.model : '—'))
          ),
          statusError ? h('div', { style: Object.assign({}, STYLES.subtitle, { color: COLORS.danger }) }, statusError) : null,
          status && status.dwg && status.dwg.converter === false
            ? h('div', { style: Object.assign({}, STYLES.subtitle, { color: COLORS.warning }) }, 'DWG 转换器（dwg2dxf）未找到，DWG 将无法转换。')
            : null
        ),

        h('div', { style: STYLES.card },
          h('div', { style: STYLES.title }, t('source.title')),
          h('div', { style: STYLES.row },
            h('span', { style: STYLES.subtitle }, t('source.dirLabel')),
            h('input', {
              style: STYLES.input,
              value: dir,
              placeholder: t('source.dirPlaceholder'),
              onChange: function (event) { setDir(event.target.value); setPicked([]) },
            }),
            h('button', { style: STYLES.button, onClick: function () { openBrowser('dir') } }, t('source.pickFolder')),
            h('button', { style: STYLES.button, onClick: function () { openBrowser('files') } }, t('source.pickFiles')),
            h('button', { style: STYLES.button, onClick: runScan, disabled: scanning }, scanning ? t('source.scanning') : t('source.scan'))
          ),
          picked.length > 0
            ? h('div', { style: Object.assign({}, STYLES.row, { alignItems: 'flex-start' }) },
              h('span', { style: badgeStyle('ok') }, t('source.selected', { n: picked.length })),
              h('button', { style: STYLES.button, onClick: function () { setPicked([]) } }, t('source.clear')))
            : null,
          picked.length > 0
            ? h('div', null, picked.slice(0, 8).map(function (item) {
              return h('div', { key: item, style: STYLES.mono }, item)
            }))
            : null,
          h('div', { style: STYLES.row },
            h('span', { style: STYLES.subtitle }, t('source.limit')),
            h('input', {
              style: STYLES.number, type: 'number', min: 1, max: 500, value: limit,
              onChange: function (event) { setLimit(event.target.value) },
            }),
            h('span', { style: STYLES.subtitle }, t('source.limitUnit'))
          ),
          h('div', { style: STYLES.subtitle }, t('source.hint')),
          h('div', { style: STYLES.subtitle }, t('name.rule'))
        ),

        scanning || scan
          ? h('div', { style: STYLES.card },
            h('div', { style: STYLES.cardHead },
              h('div', { style: STYLES.title }, t('scan.title')),
              h('div', { style: STYLES.subtitle }, scanning
                ? t('scan.progress', { dirs: scanProgress.dirs, files: scanProgress.files, sec: (scanProgress.elapsedMs / 1000).toFixed(1) })
                : t('scan.total', { n: scan ? (scan.total || 0) : 0 }))
            ),
            scanning
              ? h('div', { style: STYLES.row },
                h('button', { style: STYLES.button, onClick: cancelScan }, t('scan.cancel')))
              : null,
            scan && scan.truncated
              ? h('div', { style: Object.assign({}, STYLES.subtitle, { color: COLORS.warning }) }, t('scan.truncated'))
              : null,
            scan
              ? h('div', { style: STYLES.row },
                h('span', { style: badgeStyle() }, t('scan.pdf') + ' ' + (scan.pdf ? scan.pdf.length : 0)),
                h('span', { style: badgeStyle() }, t('scan.dwg') + ' ' + (scan.dwg ? scan.dwg.length : 0)),
                h('span', { style: badgeStyle() }, t('scan.docx') + ' ' + (scan.docx ? scan.docx.length : 0))
              )
              : null,
            scan && (scan.total || 0) === 0
              ? h('div', { style: STYLES.subtitle }, t('scan.empty'))
              : null,
            scan && (scan.total || 0) > 0
              ? h('table', { style: STYLES.table },
                h('tbody', null, [].concat(scan.pdf || [], scan.dwg || [], scan.docx || []).slice(0, 40).map(function (file) {
                  return h('tr', { key: file.path },
                    h('td', { style: STYLES.td }, file.relPath || file.name),
                    h('td', { style: Object.assign({}, STYLES.td, { width: 60, color: COLORS.textDim }) }, formatSize(file.size)))
                }))
              )
              : null
          )
          : null,

        h('div', { style: STYLES.card },
          h('div', { style: STYLES.row },
            h('button', {
              style: (busy || running || !engineReady) ? STYLES.buttonPrimaryDisabled : STYLES.buttonPrimary,
              disabled: busy || running || !engineReady,
              onClick: startJob,
            }, running ? t('run.running') : t('run.translate')),
            running ? h('button', { style: STYLES.buttonDanger, onClick: cancelJob }, t('run.cancel')) : null,
            job ? h('span', { style: STYLES.subtitle }, t('result.summary', { done: job.totals.done, failed: job.totals.failed, skipped: job.totals.skipped })) : null
          ),
          error ? h('div', { style: Object.assign({}, STYLES.subtitle, { color: COLORS.danger }) }, t('error.prefix') + '：' + error) : null,
          job
            ? h('div', { style: STYLES.card },
              h('div', { style: STYLES.cardHead },
                h('div', { style: STYLES.title }, t('job.progress', { done: job.totals.done, total: job.totals.files })),
                h('div', { style: STYLES.subtitle }, (t('run.phase.' + job.phase) || job.phase || ''))
              ),
              h('div', { style: STYLES.bar },
                h('div', { style: Object.assign({}, STYLES.barFill, { width: (job.totals.files ? Math.round(job.totals.done / job.totals.files * 100) : 0) + '%' }) })),
              job.current ? h('div', { style: STYLES.subtitle }, t('job.current', { name: job.current })) : null,
              h('div', { style: STYLES.row },
                h('span', { style: badgeStyle() }, t('job.files') + ' ' + job.totals.files),
                h('span', { style: badgeStyle() }, t('job.segments') + ' ' + job.totals.segments),
                h('span', { style: badgeStyle('ok') }, t('job.translated') + ' ' + job.totals.translated)
              ),
              job.sourceDir ? h('div', { style: STYLES.row },
                h('span', { style: STYLES.subtitle }, t('job.output') + '：' + job.sourceDir),
                h('button', { style: STYLES.button, onClick: function () { revealFolder(job.sourceDir) } }, t('job.openFolder'))
              ) : null,
              h('table', { style: STYLES.table },
                h('tbody', null, (job.files || []).map(function (file) {
                  return h('tr', { key: file.path },
                    h('td', { style: Object.assign({}, STYLES.td, { color: file.status === 'failed' ? COLORS.danger : (file.status === 'done' ? COLORS.success : COLORS.textDim), width: 70 }) }, t('file.' + file.status)),
                    h('td', { style: STYLES.td },
                      h('div', null, file.relPath),
                      file.output ? h('div', { style: STYLES.mono }, file.output) : null,
                      file.error ? h('div', { style: Object.assign({}, STYLES.mono, { color: COLORS.danger }) }, file.error) : null
                    ),
                    h('td', { style: Object.assign({}, STYLES.td, { width: 60, color: COLORS.textDim }) }, file.translated ? file.translated + '' : '')
                  )
                }))
              ),
              job.log && job.log.length > 0
                ? h('details', null,
                  h('summary', { style: STYLES.subtitle }, t('job.log')),
                  h('pre', { style: STYLES.log }, job.log.join('\n')))
                : null
            )
            : h('div', { style: STYLES.subtitle }, t('job.none'))
        ),

        browser.open
          ? h(BrowserDialog, {
            t: t,
            state: browser,
            onClose: function () { setBrowser(function (prev) { return Object.assign({}, prev, { open: false }) }) },
            onEnter: loadBrowser,
            onToggleFile: togglePickedFile,
            onConfirm: confirmBrowser,
            onSelectDir: selectBrowserDir,
          })
          : null
      )
    }

    function useActiveLocale(locale) {
      var state = useState(function () {
        try {
          var snapshot = locale && typeof locale.getLocale === 'function' ? locale.getLocale() : null
          return snapshot && snapshot.active ? snapshot.active : 'zh-CN'
        } catch (error) {
          return 'zh-CN'
        }
      })
      var active = state[0]
      var setActive = state[1]
      useEffect(function () {
        if (!locale || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(function () {
          try {
            var snapshot = typeof locale.getLocale === 'function' ? locale.getLocale() : null
            if (snapshot && snapshot.active) setActive(snapshot.active)
          } catch (error) { /* ignore */ }
        })
      }, [locale])
      return active
    }

    function PanelIcon(props) {
      var size = props && props.size ? props.size : 16
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
      },
        h('path', { d: 'M4 5h8M4 9h6M4 13h5' }),
        h('path', { d: 'M13 6h7M13 10h5M13 14h7' }),
        h('path', { d: 'M6 17h12' }),
        h('path', { d: 'M15.5 20l2.5-3 2.5 3' }))
    }

    module.exports.inject = ['slots']
    module.exports.apply = function apply(ctx) {
      var locale = ctx.get('locale')
      function label() {
        var active = 'zh-CN'
        try {
          var snapshot = locale && typeof locale.getLocale === 'function' ? locale.getLocale() : null
          if (snapshot && snapshot.active) active = snapshot.active
        } catch (error) { /* ignore */ }
        return makeT(active)('panel.title')
      }
      ctx.slots.inject('sidebar.panellist', function () {
        return ctx.slots.register({ name: 'sidebar.panellist', id: 'drawing-translator', order: 20, label: label }, PanelIcon)
      })
      ctx.slots.inject('main', function () {
        return ctx.slots.register({ name: 'main', key: 'drawing-translator' }, function () {
          return h(Panel, { locale: locale })
        })
      })
    }

    return module.exports
  },
})
