# 图纸文档翻译（DSH 插件）

左侧栏入口的 DeepSeek Harness 插件：扫描文件夹或直接选择文件，自动翻译 **PDF 图纸 / DWG 图纸 / Word 文档** 中的文字，译文保存在 **原文件所在文件夹**，文件名规则 `翻译+中文名+原名`，不生成 `_翻译结果`、汇总 CSV、缓存等附属文件。

- 包名：`@local/dsh-drawing-translator`
- 左侧栏入口 id：`drawing-translator`
- 后台接口前缀：`/dsh-drawing-translator/api`
- Agent 工具：`drawing_translate`

## 功能

| 能力 | 实现 |
| --- | --- |
| PDF | 有文字层：PyMuPDF 提取逐行文字 → 擦除原文字 → 按原位置回填中文（宋体），字号放不下时自动缩小。扫描件：先用 Tesseract OCR 识别（按页面脚本自动选语言包），把原图文字涂白后再回填中文 |
| DWG | LibreDWG `dwg2dxf` 转 DXF → ezdxf 遍历全实体库提取 TEXT/MTEXT/ATTRIB/ATTDEF/MULTILEADER/DIMENSION/TOLERANCE/表格 → 写回并统一宋体，字高 ×1.2；可同时输出 PDF 预览；DXF 写回失败时降级为双语 CSV |
| Word (.docx) | python-docx 遍历正文/表格/页眉页脚段落 → 写回中文（宋体），保留段落样式 |
| 翻译 | 使用当前默认模型（`agentDefaultModel.currentSelection()` + `ctx.llm.stream`），按条输出严格 JSON；批量过大自动二分，截断 JSON 自动修复，缺口自动补译 |
| 文件选择 | 面板内文件浏览器（可跨盘、点目录进入、勾选文件），也支持直接输入目录；扫描结果可预览 |
| 扫描 | 逐层并行遍历（24 路并发 `readdir`，64 路并发 `stat`），跳过系统目录；面板实时显示已扫文件夹数 / 文件数与耗时，可随时「停止扫描」 |
| 命名 | 原名含中文 → `翻译<原名>`；纯外文原名 → `翻译<中文名>_<原名>`；译文与原件同目录 |

## 安装

插件源码放在 **DSH 安装目录之外**（例如 `D:\图纸翻译软件\dsh-drawing-translator`），因为 DSH 升级会替换安装目录、删除里面的插件源码。

```powershell
# 在 DSH 里安装并启用（本机已有该 bundle 时先移除）
plugin_manager install_bundle  target: "D:\图纸翻译软件\dsh-drawing-translator"
plugin_manager set_plugin      target: "include:drawing-translator"  enabled: true
```

安装后左侧栏出现「图纸翻译」入口，点开即是主面板。若面板没刷新，重新启用一次插件（重载时 Host 与 Client 两半都会重新加载）。

## 使用

1. 左侧栏点「图纸翻译」。
2. 输入或「选择文件夹」确定要扫描的目录；只想翻某个文件时点「选择文件」直接勾选。
3. 「扫描目录」预览会处理哪些文件；「开始翻译」执行。
4. 进度、每个文件的状态与日志都在面板里；完成后「打开所在文件夹」直接定位译文。

Agent 也可以直接调用工具：

```json
{ "dir": "E:\\项目\\图纸", "kinds": ["pdf", "dwg", "docx"], "limit": 5 }
{ "files": ["E:\\项目\\图纸\\A.dwg", "E:\\项目\\说明.docx"] }
{ "dir": "E:\\项目\\图纸", "dryRun": true }
```

## 运行依赖

- Python（默认使用 DSH 自带解释器 `~/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe`；可用 `DSH_DRAWING_PYTHON` 覆盖）
  - `pymupdf`（PDF）、`ezdxf`（DWG/DXF + PDF 预览）、`python-docx`（Word）
- LibreDWG 命令行工具（`dwg2dxf.exe`、`dwgread.exe`）：放在 `bin/libredwg/`，未内置时回退到 `C:\Users\Administrator\dsh-dwg-tools\libredwg`
- 宋体字体 `C:\Windows\Fonts\simsun.ttc`（缺失时依次回退 微软雅黑/黑体）
- Tesseract OCR（**仅扫描版 PDF 需要**）：默认找 `C:\Program Files\Tesseract-OCR\tesseract.exe`，也可用环境变量 `TESSERACT_PATH` 指定或装进 PATH。至少需要 `chi_sim`、`eng` 两个语言包；装了 `srp`/`rus` 等西里尔语言包时会按页面脚本自动选用，扫描的外文合同才不会读成乱码。未安装时扫描版 PDF 会在日志里明确提示，而不是静默跳过

## 已知限制

- 扫描版 PDF 依赖 Tesseract OCR：识别 9 页扫描件约 38 秒，页数越多越慢；字迹模糊、手写或倾斜严重的页面识别率会下降。旧版 `.doc` 不支持，请先另存为 `.docx`。
- Word 文本框内的文字不处理。
- DWG 中个别实体类型（如 ACAD_TABLE）只能读取不能写回；旋转文字回填后为水平方向。
- DWG 的 DXF 写回失败时（LibreDWG 对极少数高版本文件）会输出同名双语 CSV 代替。
- 图纸中的型号、电压、回路号等纯拉丁串会原样保留，不做翻译。

## 扫描上限

扫描是逐层并行的，但为防止整盘扫描把机器拖死，有以下硬上限（触发任一条都会在面板/日志里提示「已达到扫描上限」）：

- 最多 8000 个目标文件、40000 个文件夹
- 单次扫描最长 30 秒
- 跳过 `node_modules`、`.git`、`Windows`、`WinSxS`、`AppData`、`$RECYCLE.BIN` 等系统与构建目录

需要更多文件时，请选择子目录分几次扫描。

## 目录

```
index.js               Host 入口：HTTP 路由 + agent 工具
client.js              左侧栏入口 + 主面板（React.createElement，无 JSX）
lib/api.js             HTTP 接口
lib/engine.js          扫描 / 提取 / 翻译 / 写回 与 LLM 调用
lib/jobs.js            任务管理（批处理、缓存、补译、命名）
lib/python.js          Python 桥
lib/util.js            工具函数
python/pdf_engine.py   PDF 引擎
python/dwg_engine.py   DWG 引擎
python/docx_engine.py  Word 引擎
```

## 许可

插件代码为内部使用。随附的 LibreDWG 二进制为 GPLv3，第三方组件许可见 `NOTICE.txt`。
