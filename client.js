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
        'run.phase.finished': '已结束',
        'task.title': '当前任务',
        'task.idle': '当前没有正在运行的任务',
        'task.status.running': '运行中',
        'task.status.done': '已完成',
        'task.status.failed': '失败',
        'task.status.cancelled': '已取消',
        'task.phase': '阶段：{phase}',
        'task.files': '文件 {done}/{total}',
        'task.segments': '段落 {translated}/{segments}',
        'task.elapsed': '已用时 {time}',
        'task.eta': '预计还需 {time}',
        'task.percent': '完成 {pct}%',
        'task.cancel': '取消任务',
        'task.openFolder': '打开输出文件夹',
        'file.queued': '排队',
        'file.running': '处理中',
        'file.done': '完成',
        'file.failed': '失败',
        'file.skipped': '跳过',
        'result.summary': '成功 {done}，失败 {failed}，跳过 {skipped}',
        'result.savedNext': '译文已保存在原文件所在文件夹。',
        'result.title': '翻译结果',
        'result.doneTitle': '已翻译完成的文件（{n}）',
        'result.openFile': '打开译文',
        'result.showInFolder': '在文件夹中显示',
        'result.outputFile': '译文',
        'result.sourceFile': '原文',
        'result.pending': '任务运行中，每完成一个文件就会出现在这里，点击文件名即可打开。',
        'result.empty': '还没有完成的文件。',
        'result.openFailed': '无法打开 {path}：{error}',
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
        'run.phase.finished': 'finished',
        'task.title': 'Current task',
        'task.idle': 'No task is running',
        'task.status.running': 'running',
        'task.status.done': 'done',
        'task.status.failed': 'failed',
        'task.status.cancelled': 'cancelled',
        'task.phase': 'Phase: {phase}',
        'task.files': 'files {done}/{total}',
        'task.segments': 'segments {translated}/{segments}',
        'task.elapsed': '{time} elapsed',
        'task.eta': 'about {time} left',
        'task.percent': '{pct}% done',
        'task.cancel': 'Cancel task',
        'task.openFolder': 'Open output folder',
        'file.queued': 'queued',
        'file.running': 'running',
        'file.done': 'done',
        'file.failed': 'failed',
        'file.skipped': 'skipped',
        'result.summary': '{done} done, {failed} failed, {skipped} skipped',
        'result.savedNext': 'Translations are saved in each source file folder.',
        'result.title': 'Results',
        'result.doneTitle': 'Translated files ({n})',
        'result.openFile': 'Open translation',
        'result.showInFolder': 'Show in folder',
        'result.outputFile': 'translation',
        'result.sourceFile': 'source',
        'result.pending': 'Files appear here as they finish; click a file name to open it.',
        'result.empty': 'No translated file yet.',
        'result.openFailed': 'Cannot open {path}: {error}',
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
      col: { display: 'flex', flexDirection: 'column', gap: 8 },
      link: { color: COLORS.accent, cursor: 'pointer', wordBreak: 'break-all', textDecoration: 'underline', textUnderlineOffset: 2 },
      buttonSmall: { height: 26, padding: '0 8px', borderRadius: 6, border: '1px solid ' + COLORS.border, background: COLORS.surface, color: COLORS.text, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' },
      resultRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid ' + COLORS.border },
      resultMain: { flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }
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

    /** Compact duration for the task card: "12 秒" / "3 分 20 秒" / "1 小时 5 分". */
    function formatDuration(ms, lang) {
      var total = Math.max(0, Math.round((ms || 0) / 1000))
      var english = lang === 'en'
      if (total < 60) return english ? total + 's' : total + ' 秒'
      var minutes = Math.floor(total / 60)
      var seconds = total % 60
      if (minutes < 60) {
        if (english) return minutes + 'm' + (seconds ? ' ' + seconds + 's' : '')
        return minutes + ' 分' + (seconds ? ' ' + seconds + ' 秒' : '')
      }
      var hours = Math.floor(minutes / 60)
      var rest = minutes % 60
      if (english) return hours + 'h' + (rest ? ' ' + rest + 'm' : '')
      return hours + ' 小时' + (rest ? ' ' + rest + ' 分' : '')
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
      if (kind === 'accent') color = COLORS.accent
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
      var jobsState = useState([])
      var jobs = jobsState[0]
      var setJobs = jobsState[1]
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

      // One poller drives both the current-task card and the results list, and it
      // follows a running job even when the agent tool started it, so the panel
      // always shows the task the machine is actually doing.
      useEffect(function () {
        var stop = false
        function apply(payload) {
          var list = (payload && payload.jobs) || []
          var runningJob = null
          for (var i = 0; i < list.length; i += 1) {
            if (list[i].status === 'running') { runningJob = list[i]; break }
          }
          var focus = null
          if (jobId) focus = list.filter(function (item) { return item.id === jobId })[0] || null
          if (runningJob && (!focus || focus.status !== 'running')) focus = runningJob
          if (!focus) focus = list[0] || null
          setJobs(list)
          if (!focus) {
            setJob(null)
            return
          }
          if (focus.id !== jobId) setJobId(focus.id)
          setJob(focus)
          if (focus.status !== 'running') setBusy(false)
        }
        function tick() {
          request('/jobs').then(function (data) {
            if (!stop) apply(data)
          }).catch(function (err) {
            if (!stop) setError(err.message)
          })
        }
        tick()
        pollRef.current = setInterval(tick, 1500)
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

      function dirOf(target) {
        if (!target) return ''
        return String(target).replace(/[\\/][^\\/]*$/, '')
      }

      function fileNameOf(target) {
        if (!target) return ''
        var parts = String(target).split(/[\\/]/)
        return parts[parts.length - 1] || target
      }

      function openPath(target, select) {
        if (!target) return
        request('/open', { method: 'POST', body: { path: target, select: select === true } }).catch(function (err) {
          setError(t('result.openFailed', { path: target, error: err.message }))
        })
      }

      function openFile(target) { openPath(target, false) }

      function showInFolder(target) { openPath(target, true) }

      function jobOptionText(item) {
        var stamp = ''
        try { stamp = new Date(item.createdAt).toLocaleTimeString() } catch (error) { stamp = '' }
        var done = item.totals && item.totals.done ? item.totals.done : 0
        var total = item.totals && item.totals.files ? item.totals.files : 0
        return stamp + ' · ' + t('task.status.' + item.status) + ' · ' + done + '/' + total
      }

      var running = Boolean(job && job.status === 'running')
      var translation = status && status.translation ? status.translation : null
      var engineReady = Boolean(status && status.python && status.python.ok)
      var lang = /^en/i.test(String(activeLocale || '')) ? 'en' : 'zh'
      var jobFiles = job && job.files ? job.files : []
      var doneFiles = jobFiles.filter(function (file) { return file.status === 'done' && file.output })
      var otherFiles = jobFiles.filter(function (file) { return !(file.status === 'done' && file.output) })
      var totals = (job && job.totals) || {}
      var filesTotal = totals.files || 0
      var filesDone = (totals.done || 0) + (totals.failed || 0) + (totals.skipped || 0)
      var segmentsTotal = totals.segments || 0
      var translatedTotal = totals.translated || 0
      var elapsedMs = job ? Math.max(0, (job.finishedAt || Date.now()) - (job.createdAt || Date.now())) : 0
      var pct = 0
      if (job) {
        if ((job.phase === 'translate' || job.phase === 'apply') && segmentsTotal > 0) pct = Math.round((translatedTotal / segmentsTotal) * 100)
        else if (filesTotal > 0) pct = Math.round((filesDone / filesTotal) * 100)
      }
      if (pct > 100) pct = 100
      var etaMs = 0
      if (running && pct > 4 && pct < 100) etaMs = Math.round((elapsedMs * (100 - pct)) / pct)
      var outputDir = job ? (job.outputDir || job.sourceDir || '') : ''
      var jobStatusKind = !job ? 'warn' : (job.status === 'done' ? 'ok' : (job.status === 'failed' ? 'bad' : (job.status === 'cancelled' ? 'warn' : 'accent')))
      var jobStatusText = !job ? t('task.idle') : t('task.status.' + job.status)
      var phaseText = job && job.phase ? t('run.phase.' + job.phase) : '—'

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
            job ? h('span', { style: STYLES.subtitle }, t('result.summary', { done: totals.done || 0, failed: totals.failed || 0, skipped: totals.skipped || 0 })) : null
          ),
          error ? h('div', { style: Object.assign({}, STYLES.subtitle, { color: COLORS.danger }) }, t('error.prefix') + '：' + error) : null
        ),

        h('div', { style: STYLES.card },
          h('div', { style: STYLES.cardHead },
            h('div', { style: STYLES.title }, t('task.title')),
            h('span', { style: badgeStyle(jobStatusKind) }, jobStatusText)
          ),
          job ? h('div', { style: STYLES.col },
            h('div', { style: STYLES.row },
              h('span', { style: badgeStyle() }, t('task.phase', { phase: phaseText })),
              h('span', { style: badgeStyle() }, t('task.files', { done: filesDone, total: filesTotal })),
              h('span', { style: badgeStyle() }, t('task.segments', { translated: translatedTotal, segments: segmentsTotal })),
              h('span', { style: badgeStyle() }, t('task.elapsed', { time: formatDuration(elapsedMs, lang) })),
              running && etaMs > 0 ? h('span', { style: badgeStyle() }, t('task.eta', { time: formatDuration(etaMs, lang) })) : null
            ),
            h('div', { style: STYLES.bar },
              h('div', { style: Object.assign({}, STYLES.barFill, { width: pct + '%' }) })),
            h('div', { style: STYLES.row },
              h('span', { style: STYLES.subtitle }, t('task.percent', { pct: pct })),
              job.current ? h('span', { style: Object.assign({}, STYLES.subtitle, { flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }) }, t('job.current', { name: job.current })) : null
            ),
            job.error ? h('div', { style: Object.assign({}, STYLES.subtitle, { color: COLORS.danger }) }, job.error) : null,
            h('div', { style: STYLES.row },
              running ? h('button', { style: STYLES.buttonDanger, onClick: cancelJob }, t('task.cancel')) : null,
              outputDir ? h('button', { style: STYLES.button, onClick: function () { revealFolder(outputDir) } }, t('task.openFolder')) : null,
              jobs.length > 1
                ? h('select', {
                  style: Object.assign({}, STYLES.button, { paddingLeft: 6, paddingRight: 6 }),
                  value: job.id,
                  onChange: function (event) { setJobId(event.target.value) },
                }, jobs.map(function (item) {
                  return h('option', { key: item.id, value: item.id }, jobOptionText(item))
                }))
                : null
            )
          ) : h('div', { style: STYLES.subtitle }, t('task.idle'))
        ),

        h('div', { style: STYLES.card },
          h('div', { style: STYLES.cardHead },
            h('div', { style: STYLES.title }, t('result.title')),
            h('div', { style: STYLES.subtitle }, t('result.doneTitle', { n: doneFiles.length }))
          ),
          doneFiles.length > 0
            ? h('div', null, doneFiles.map(function (file) {
              return h('div', { key: file.path, style: STYLES.resultRow },
                h('div', { style: STYLES.resultMain },
                  h('a', {
                    style: STYLES.link,
                    title: file.output,
                    onClick: function (event) {
                      event.preventDefault()
                      openFile(file.output)
                    },
                  }, fileNameOf(file.output)),
                  h('div', { style: STYLES.mono }, t('result.outputFile') + '：' + file.output),
                  h('div', { style: STYLES.mono }, t('result.sourceFile') + '：' + file.relPath + (file.translated ? '（' + file.translated + ' 段）' : ''))
                ),
                h('div', { style: STYLES.row },
                  h('button', { style: STYLES.buttonSmall, onClick: function () { openFile(file.output) } }, t('result.openFile')),
                  h('button', { style: STYLES.buttonSmall, onClick: function () { showInFolder(file.output) } }, t('result.showInFolder')),
                  h('button', { style: STYLES.buttonSmall, onClick: function () { revealFolder(dirOf(file.output)) } }, t('job.openFolder'))
                )
              )
            }))
            : h('div', { style: STYLES.subtitle }, job ? t('result.pending') : t('job.none')),
          otherFiles.length > 0
            ? h('table', { style: STYLES.table },
              h('tbody', null, otherFiles.map(function (file) {
                return h('tr', { key: file.path },
                  h('td', { style: Object.assign({}, STYLES.td, { color: file.status === 'failed' ? COLORS.danger : (file.status === 'skipped' ? COLORS.warning : COLORS.textDim), width: 70 }) }, t('file.' + file.status)),
                  h('td', { style: STYLES.td },
                    h('div', null, file.relPath),
                    file.error ? h('div', { style: Object.assign({}, STYLES.mono, { color: COLORS.danger }) }, file.error) : null
                  ),
                  h('td', { style: Object.assign({}, STYLES.td, { width: 60, color: COLORS.textDim }) }, file.translated ? String(file.translated) : '')
                )
              })))
            : null,
          job && job.log && job.log.length > 0
            ? h('details', null,
              h('summary', { style: STYLES.subtitle }, t('job.log')),
              h('pre', { style: STYLES.log }, job.log.join('\n')))
            : null
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
