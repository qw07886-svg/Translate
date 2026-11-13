"""DWG engine for the drawing translator plugin.

extract <input.dwg> <out.json>                 text segments (DXF via LibreDWG, JSON fallback)
apply   <input.dwg> <map.json> <out.dxf> [--pdf <out.pdf>]

The DXF is produced by LibreDWG's dwg2dxf and edited with ezdxf; translated text
keeps the drawing's own styles but is forced to the 宋体 (simsun) font.
"""

import json
import math
import os
import shutil
import subprocess
import sys
import tempfile

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

import ezdxf

TEXT_TYPES = (
    "TEXT", "MTEXT", "ATTRIB", "ATTDEF", "MULTILEADER",
    "DIMENSION", "TOLERANCE", "ACAD_TABLE", "TABLE",
)
TEXT_HEIGHT_FACTOR = 1.2
CJK_STYLE_NAME = "宋体"

# (label, dwg2dxf extra args). LibreDWG's default output is lossless for the
# drawings tested here; the version overrides are validated before use and are
# only tried when the previous attempt produced an unreadable DXF.
DXF_ATTEMPTS = (
    ("default", []),
    ("r2018", ["--as", "r2018"]),
    ("r2000", ["--as", "r2000"]),
    ("r12", ["--as", "r12"]),
)

JSON_TEXT_KEYS = ("text_value", "text", "textValue", "content", "value", "default_content")

LEGACY_TOOLS = r"C:\Users\Administrator\dsh-dwg-tools\libredwg"


def fail(message):
    print(json.dumps({"ok": False, "error": str(message)}, ensure_ascii=False))
    sys.exit(1)


def log_warning(message):
    print(str(message), file=sys.stderr)


def tools_dir():
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(os.path.dirname(here), "bin", "libredwg"),
        LEGACY_TOOLS,
    ]
    for candidate in candidates:
        if os.path.exists(os.path.join(candidate, "dwg2dxf.exe")):
            return candidate
    return None


def run_tool(name, args, timeout=600):
    directory = tools_dir()
    if directory is None:
        raise RuntimeError("未找到 LibreDWG 工具（bin/libredwg 或 %s）" % LEGACY_TOOLS)
    exe = os.path.join(directory, name)
    if not os.path.exists(exe):
        raise RuntimeError("未找到 %s" % exe)
    proc = subprocess.run(
        [exe] + list(args),
        cwd=directory,
        capture_output=True,
        timeout=timeout,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if proc.returncode != 0:
        detail = (proc.stderr or b"").decode("utf-8", "replace").strip()
        detail = " | ".join([line for line in detail.splitlines() if line.strip()][-3:])
        raise RuntimeError("%s 退出码 %d%s" % (name, proc.returncode, ("：" + detail) if detail else ""))
    return proc


def convert_to_dxf(input_path, work_dir):
    """Convert with dwg2dxf, trying the documented variants until one reads."""
    errors = []
    for label, extra in DXF_ATTEMPTS:
        out_path = os.path.join(work_dir, "converted_%s.dxf" % label)
        args = ["-y", "-o", out_path] + list(extra) + [input_path]
        try:
            run_tool("dwg2dxf.exe", args)
        except Exception as error:
            errors.append("%s: %s" % (label, error))
            continue
        if not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
            errors.append("%s: 未生成 DXF" % label)
            continue
        try:
            doc = ezdxf.readfile(out_path)
        except Exception as error:
            errors.append("%s: 读取失败 %s" % (label, error))
            continue
        return out_path, doc, label
    raise RuntimeError("DWG 转换为 DXF 失败（" + "；".join(errors[:3]) + "）")


def convert_to_json(input_path, work_dir):
    out_path = os.path.join(work_dir, "converted.json")
    run_tool("dwgread.exe", ["-O", "JSON", "-o", out_path, input_path])
    if not os.path.exists(out_path):
        raise RuntimeError("dwgread 未生成 JSON")
    with open(out_path, "r", encoding="utf-8", errors="replace") as handle:
        return json.load(handle)


def _clean_text(value):
    if not isinstance(value, str):
        return ""
    return value.replace("\\P", " ").replace("\r", " ").replace("\n", " ").strip()


def _mtext_height_scale(raw):
    """Read the largest inline `\\H<n>x;` / `\\H<n>;` height override in MTEXT."""
    if not isinstance(raw, str) or "\\H" not in raw:
        return 1.0
    scale = 1.0
    index = 0
    while True:
        index = raw.find("\\H", index)
        if index < 0:
            break
        cursor = index + 2
        digits = ""
        while cursor < len(raw) and (raw[cursor].isdigit() or raw[cursor] == "."):
            digits += raw[cursor]
            cursor += 1
        if digits:
            try:
                value = float(digits)
                rest = raw[cursor:cursor + 1]
                if rest == "x":
                    scale = max(scale, value)
                elif value > 0:
                    base = 2.5
                    scale = max(scale, value / base)
            except ValueError:
                pass
        index += 2
    return scale


def entity_text(entity):
    kind = entity.dxftype()
    try:
        if kind == "MTEXT":
            return _clean_text(entity.plain_text())
        if kind in ("TEXT", "ATTRIB", "ATTDEF"):
            return _clean_text(entity.dxf.get("text", ""))
        if kind == "MULTILEADER":
            getter = getattr(entity, "get_mtext_content", None)
            if getter is None:
                return ""
            return _clean_text(getter())
        if kind == "DIMENSION":
            text = entity.dxf.get("text", "")
            if text in ("", "<>"):
                return ""
            return _clean_text(text)
        if kind == "TOLERANCE":
            return _clean_text(entity.dxf.get("content", ""))
        if kind in ("ACAD_TABLE", "TABLE"):
            parts = []
            try:
                for cell in entity.cells():
                    value = getattr(cell, "text", "")
                    value = _clean_text(value)
                    if value:
                        parts.append(value)
            except Exception:
                return ""
            return " | ".join(parts)
    except Exception as error:
        log_warning("读取 %s 失败: %s" % (kind, error))
    return ""


def collect_segments(doc):
    segments = []
    try:
        entitydb = doc.entitydb
    except Exception:
        entitydb = {}
    for handle, entity in list(entitydb.items()):
        try:
            kind = entity.dxftype()
        except Exception:
            continue
        if kind not in TEXT_TYPES:
            continue
        text = entity_text(entity)
        if not text:
            continue
        try:
            layer = entity.dxf.get("layer", "")
        except Exception:
            layer = ""
        segments.append({
            "id": "e:%X" % int(handle) if isinstance(handle, int) else "e:%s" % handle,
            "text": text,
            "entity": kind,
            "layer": layer,
        })
    order = {kind: index for index, kind in enumerate(TEXT_TYPES)}
    segments.sort(key=lambda segment: order.get(segment["entity"], 99))
    counts = {}
    for segment in segments:
        counts[segment["entity"]] = counts.get(segment["entity"], 0) + 1
    return segments, counts


def json_to_segments(payload):
    segments = []
    seen = set()

    def walk(node, depth=0):
        if depth > 40:
            return
        if isinstance(node, dict):
            kind = ""
            for key in ("entity", "object", "type", "name", "class"):
                value = node.get(key)
                if isinstance(value, str):
                    kind = value
                    break
            for key in JSON_TEXT_KEYS:
                value = node.get(key)
                if isinstance(value, str) and value.strip():
                    text = _clean_text(value)
                    if text:
                        identifier = "j:%d" % len(segments)
                        if identifier not in seen:
                            seen.add(identifier)
                            segments.append({"id": identifier, "text": text, "entity": kind or key, "layer": ""})
                    break
            for value in node.values():
                if isinstance(value, (dict, list)):
                    walk(value, depth + 1)
        elif isinstance(node, list):
            for item in node:
                walk(item, depth + 1)

    walk(payload)
    counts = {}
    for segment in segments:
        counts[segment["entity"]] = counts.get(segment["entity"], 0) + 1
    return segments, counts


def ensure_cjk_style(doc):
    """Return the name of a text style that uses 宋体 (create it if missing)."""
    try:
        if doc.styles.has_entry(CJK_STYLE_NAME):
            return CJK_STYLE_NAME
    except Exception:
        pass
    try:
        doc.styles.new(CJK_STYLE_NAME, dxfattribs={"font": "simsun.ttc", "bigfont": ""})
        return CJK_STYLE_NAME
    except Exception as error:
        log_warning("创建宋体样式失败: %s" % error)
    try:
        doc.styles.add(CJK_STYLE_NAME, font="simsun.ttc")
        return CJK_STYLE_NAME
    except Exception as error:
        log_warning("添加宋体样式失败: %s" % error)
    return None


def set_entity_text(entity, text, style_name):
    kind = entity.dxftype()
    if kind == "MTEXT":
        raw = ""
        try:
            raw = entity.text
        except Exception:
            raw = ""
        scale = _mtext_height_scale(raw)
        entity.text = text
        try:
            if entity.dxf.hasattr("char_height"):
                entity.dxf.char_height = float(entity.dxf.char_height) * TEXT_HEIGHT_FACTOR * max(1.0, scale)
        except Exception:
            pass
    elif kind in ("TEXT", "ATTRIB", "ATTDEF"):
        entity.dxf.text = text
        try:
            if entity.dxf.hasattr("height"):
                entity.dxf.height = float(entity.dxf.height) * TEXT_HEIGHT_FACTOR
        except Exception:
            pass
    elif kind == "MULTILEADER":
        setter = getattr(entity, "set_mtext_content", None)
        if setter is None:
            raise RuntimeError("MULTILEADER 不支持写入")
        setter(text)
    elif kind == "DIMENSION":
        entity.dxf.text = text
    elif kind == "TOLERANCE":
        entity.dxf.content = text
    elif kind in ("ACAD_TABLE", "TABLE"):
        raise RuntimeError("表格不支持写入")
    else:
        raise RuntimeError("不支持的类型 %s" % kind)
    if style_name:
        try:
            entity.dxf.style = style_name
        except Exception:
            pass
    try:
        entity.dxf.width = 1.0
    except Exception:
        pass


def repair_materials(doc):
    """LibreDWG emits ACAD_MATERIAL entries that point at missing MATERIAL objects."""
    try:
        materials = doc.materials
    except Exception:
        return
    for name in ("ByBlock", "ByLayer", "Global"):
        try:
            entry = materials.get(name)
        except Exception:
            entry = None
        broken = entry is None or isinstance(entry, str) or not hasattr(entry, "dxf")
        if not broken:
            continue
        try:
            materials.object_dict.discard(name)
        except Exception as error:
            log_warning("清理材质 %s 失败: %s" % (name, error))
        try:
            materials.new(name)
        except Exception as error:
            log_warning("重建材质 %s 失败: %s" % (name, error))


def write_translation_table(path, rows, applied_count):
    """Degraded output: a bilingual CSV when the DXF cannot be written."""
    import csv

    with open(path, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["id", "entity", "layer", "original", "translation"])
        for row in rows:
            writer.writerow([row["id"], row.get("entity", ""), row.get("layer", ""), row["text"], row.get("translation", "")])
    return applied_count


def save_dxf(doc, out_path):
    try:
        doc.saveas(out_path)
        return True, None
    except Exception as error:
        first_error = error
    repair_materials(doc)
    try:
        doc.saveas(out_path)
        return True, "材质已修复后保存（%s）" % first_error
    except Exception as error:
        return False, error


def render_pdf(doc, out_path):
    from ezdxf.addons.drawing import Frontend, RenderContext
    from ezdxf.addons.drawing.pymupdf import PyMuPDFBackend

    backend = PyMuPDFBackend()
    try:
        context = RenderContext(doc)
    except TypeError:
        context = RenderContext(doc, backend)
    frontend = Frontend(context, backend)
    frontend.draw_layout(doc.modelspace())
    backend.finalize()
    pdf_bytes = backend.get_pdf_bytes()
    with open(out_path, "wb") as handle:
        handle.write(pdf_bytes)


def cmd_extract(input_path, out_path):
    work_dir = tempfile.mkdtemp(prefix="dwg-extract-")
    warnings = []
    try:
        try:
            dxf_path, doc, variant = convert_to_dxf(input_path, work_dir)
            segments, counts = collect_segments(doc)
            converter = "dwg2dxf"
        except Exception as error:
            warnings.append("DXF 转换失败，改用 dwgread JSON：%s" % error)
            payload = convert_to_json(input_path, work_dir)
            segments, counts = json_to_segments(payload)
            converter = "dwgread-json"
            variant = ""
        payload = {
            "ok": True,
            "file": input_path,
            "kind": "dwg",
            "converter": converter,
            "dxf_variant": variant,
            "counts": counts,
            "segments": segments,
            "warnings": warnings,
        }
        with open(out_path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False)
        print(json.dumps({"ok": True, "segments": len(segments), "counts": counts,
                          "converter": converter, "warnings": warnings[:10]}, ensure_ascii=False))
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def cmd_apply(input_path, map_path, out_path, pdf_path=None):
    with open(map_path, "r", encoding="utf-8") as handle:
        mapping = json.load(handle)
    if not isinstance(mapping, dict):
        fail("翻译映射必须是 JSON 对象")
    work_dir = tempfile.mkdtemp(prefix="dwg-apply-")
    warnings = []
    try:
        dxf_path, doc, variant = convert_to_dxf(input_path, work_dir)
        style_name = ensure_cjk_style(doc)
        rows = []
        applied = 0
        try:
            entitydb = doc.entitydb
        except Exception:
            entitydb = {}
        for handle, entity in list(entitydb.items()):
            try:
                kind = entity.dxftype()
            except Exception:
                continue
            if kind not in TEXT_TYPES:
                continue
            identifier = "e:%X" % int(handle) if isinstance(handle, int) else "e:%s" % handle
            original = entity_text(entity)
            translated = mapping.get(identifier)
            row = {"id": identifier, "entity": kind, "layer": "", "text": original}
            try:
                row["layer"] = entity.dxf.get("layer", "")
            except Exception:
                pass
            if translated is None or not str(translated).strip():
                rows.append(row)
                continue
            text = str(translated).replace("\r", " ").replace("\n", " ").strip()
            row["translation"] = text
            rows.append(row)
            try:
                set_entity_text(entity, text, style_name)
                applied += 1
            except Exception as error:
                warnings.append("%s 写入失败: %s" % (identifier, error))
        ok, save_note = save_dxf(doc, out_path)
        if save_note:
            warnings.append(save_note)
        pdf_written = None
        if pdf_path:
            try:
                render_pdf(doc, pdf_path)
                pdf_written = pdf_path
            except Exception as error:
                warnings.append("PDF 预览生成失败: %s" % error)
        if not ok:
            csv_path = os.path.splitext(out_path)[0] + ".csv"
            write_translation_table(csv_path, rows, applied)
            print(json.dumps({
                "ok": True, "applied": applied, "output": csv_path, "pdf": pdf_written,
                "converter": "dwg2dxf/%s" % variant,
                "warnings": warnings[:20] + ["DXF 无法写回，已输出双语 CSV"],
            }, ensure_ascii=False))
            return
        print(json.dumps({"ok": True, "applied": applied, "output": out_path, "pdf": pdf_written,
                          "converter": "dwg2dxf/%s" % variant, "warnings": warnings[:20]}, ensure_ascii=False))
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def main(argv):
    if len(argv) < 2:
        fail("用法: dwg_engine.py <extract|apply> ...")
    command = argv[1]
    try:
        if command == "extract":
            if len(argv) != 4:
                fail("用法: dwg_engine.py extract <input.dwg> <out.json>")
            cmd_extract(argv[2], argv[3])
        elif command == "apply":
            if len(argv) < 5:
                fail("用法: dwg_engine.py apply <input.dwg> <map.json> <output.dxf> [--pdf <out.pdf>]")
            pdf_path = None
            if "--pdf" in argv:
                index = argv.index("--pdf")
                if index + 1 < len(argv):
                    pdf_path = argv[index + 1]
            cmd_apply(argv[2], argv[3], argv[4], pdf_path)
        else:
            fail("未知命令: %s" % command)
    except SystemExit:
        raise
    except Exception as error:
        fail(error)


if __name__ == "__main__":
    main(sys.argv)
