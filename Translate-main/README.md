# 图纸文档翻译插件（DSH）

左侧栏入口 + 主面板，把工程图纸（PDF / DWG）和 Word 文档（.docx）里的文字自动翻译成中文（可选英文），
译文**直接保存在原文件所在文件夹**，命名为 `翻译<中文名>_<原名>.<ext>`，不生成任何附属文件。

- 插件包名：`@local/dsh-drawing-translator`
- 面板 id / 路由：`drawing-translator`、`/dsh-drawing-translator/api`
- 翻译：优先使用 DSH 当前默认模型（`ctx.llm`），失败时回退 `ctx.translator`
- 安装位置：`D:\DeepSeekHarness\dsh-plugins\dsh-drawing-translator`

## 使用

两种模式：

- **目录模式**：输入/选择目录 → 勾选 PDF / DWG / Word → 「扫描」确认数量 → 「开始翻译」；
- **文件模式**：点 **「选择文件」** 打开面板内文件浏览器（可多选，只列 PDF/DWG/Word）→ 已选文件可在列表里移除/清空 → 「开始翻译」只处理所选文件。

输出命名：

```
原名：  Tehnicki opis - TS1.docx
译文：  翻译技术说明_Tehnicki opis - TS1.docx      （原名含拉丁文时：翻译+中文名+原名）
原名：  技术说明_TS-1_Tehnicki opis_TS-1.docx
译文：  翻译技术说明_TS-1_Tehnicki opis_TS-1.docx  （原名已含中文时只加「翻译」前缀）
```

- PDF → `.pdf`；Word → `.docx`；DWG → `.dxf`（写 DXF 失败时输出 `.csv` 双语对照表）；
- 不生成 `_翻译结果` 目录、summary、cache 等附属文件；
  翻译缓存保存在插件目录 `data/cache.json`（该文件不随仓库发布）。

## 依赖

| 依赖 | 说明 |
|---|---|
| Python（DSH 运行时自带） | 需要 `pymupdf`、`ezdxf`、`python-docx` |
| LibreDWG 0.14（已内置） | `bin/libredwg/dwg2dxf.exe` / `dwgread.exe`，GPL-3.0，来源 https://github.com/LibreDWG/libredwg/releases/tag/0.14 |
| 中文字体 | `C:\Windows\Fonts\msyh.ttc`（微软雅黑） |

环境变量（可选）：`DSH_DRAWING_PYTHON` 覆盖 Python 路径；`DSH_DRAWING_DIR` 面板默认目录。

## 限制

- 扫描件 PDF（图片型）无文字可提取，会标记「跳过」；
- DWG 不支持写回原文件；LibreDWG 写 DXF 失败时输出双语 CSV；
- 老式 `.doc` 不支持，请先另存为 `.docx`；Word 文本框（形状内文字）不在处理范围；
- 每个文件最多翻译 400 条唯一文本（Word 1500 条），超出会在日志提示。

## Agent 工具

`drawing_translate` 工具：`dir` / `files` / `kinds` / `targetLang` / `limit` / `dryRun`。
`dryRun: true` 只提取文字做预览，不调用翻译模型。
