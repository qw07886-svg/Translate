"""DWG engine for the drawing translator plugin.

extract <input.dwg> <out.json>
apply   <input.dwg> <map.json> <output.dxf> [--pdf <output.pdf>]

LibreDWG is not Unicode-path safe on Windows, so the DWG is copied into a pure
ASCII temporary directory before conversion. Conversion is attempted with
several DXF versions because dwg2dxf fails on some newer DWG files.

Translated text is written with a dedicated 宋体 (SimSun) text style so that
CJK glyphs render at full size inside AutoCAD/DXF viewers.
"""

import json
import os
import re
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

PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _first_existing(candidates):
    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            return candidate
    return candidates[0]


BIN_DIR = os.path.join(PLUGIN_DIR, "bin", "libredwg")
LEGACY_BIN_DIR = r"C:\Users\Administrator\dsh-dwg-tools\libredwg"
DWG2DXF = _first_existing([os.path.join(BIN_DIR, "dwg2dxf.exe"), os.path.join(LEGACY_BIN_DIR, "dwg2dxf.exe")])
DWGREAD = _first_existing([os.path.join(BIN_DIR, "dwgread.exe"), os.path.join(LEGACY_BIN_DIR, "dwgread.exe")])

# Entity kinds whose text we translate. ATTRIB/ATTDEF live inside INSERT blocks,
# MULTILEADER/DIMENSION/TOLERANCE cover annotation text that plain TEXT misses.
TEXT_TYPES = ("TEXT", "MTEXT", "ATTRIB", "ATTDEF", "MULTILEADER", "DIMENSION", "TOLERANCE", "ACAD_TABLE")
PLAIN_TYPES = ("TEXT", "MTEXT", "ATTRIB", "ATTDEF")

CJK_FONT_NAME = "宋体"
CJK_FONT_FILE = "simsun.ttc"

DXF_ATTEMPTS = (
    ("default", []),
    ("r2018", ["--as", "r2018"]),
    ("r2000", ["--as", "r2000"]),
    ("r12", ["--as", "r12"]),
)


def fail(message):
    print(json.dumps({"ok": False, "error": str(message)}, ensure_ascii=False))
    sys.exit(1)


def log_warning(message):
    print(str(message), file=sys.stderr)


def convert_to_dxf(dwg_path, work_dir):
    """Convert DWG to DXF, trying several target DXF versions.

    Returns (path, ezdxf_document, variant_label). Raises RuntimeError when no
    variant produces a readable DXF.
    """
    if not os.path.exists(DWG2DXF):
        raise RuntimeError("converter-missing: 未找到 %s（LibreDWG 的 dwg2dxf.exe）" % DWG2DXF)
    source = os.path.join(work_dir, "in.dwg")
    if not os.path.exists(source):
        shutil.copyfile(dwg_path, source)
    errors = []
    for label, extra in DXF_ATTEMPTS:
        target_name = "out_%s.dxf" % label
        target = os.path.join(work_dir, target_name)
        if os.path.exists(target):
            try:
                os.remove(target)
            except OSError:
                pass
        command = [DWG2DXF, "-y", "-o", target_name, "in.dwg"] + extra
        try:
            proc = subprocess.run(command, cwd=work_dir, capture_output=True, timeout=900)
        except subprocess.TimeoutExpired:
            errors.append("%s: 转换超时" % label)
            continue
        if not os.path.exists(target) or os.path.getsize(target) < 64:
            tail = (proc.stderr or b"").decode("utf-8", "replace")[-300:].strip()
            errors.append("%s: 退出码 %s %s" % (label, proc.returncode, tail))
            continue
        try:
            doc = ezdxf.readfile(target)
        except Exception as error:
            errors.append("%s: DXF 读取失败 %s" % (label, error))
            continue
        return target, doc, label
    raise RuntimeError("dwg2dxf 转换失败（尝试 %d 种 DXF 版本）：%s" % (len(DXF_ATTEMPTS), " | ".join(errors)))


def entity_text(entity):
    kind = entity.dxftype()
    try:
        if kind == "MTEXT":
            return entity.plain_text()
        if kind in ("TEXT", "ATTRIB", "ATTDEF"):
            return entity.dxf.get("text", "")
        if kind == "DIMENSION":
            value = entity.dxf.get("text", "") or ""
            return "" if value.strip() in ("", "<>") else value
        if kind == "TOLERANCE":
            return entity.dxf.get("text", "") or ""
        if kind == "MULTILEADER":
            try:
                return entity.get_mtext_content()
            except Exception:
                try:
                    return entity.context.mtext.default_content
                except Exception:
                    return ""
        if kind == "ACAD_TABLE":
            values = []
            try:
                for cell in entity.cells:
                    value = getattr(cell, "text", "")
                    if isinstance(value, str) and value.strip():
                        values.append(value)
            except Exception:
                pass
            return "\n".join(values)
    except Exception as error:
        log_warning("读取 %s 文本失败: %s" % (kind, error))
    return ""


def collect_segments(doc):
    """Collect every text-bearing entity in the entity database.

    `doc.entitydb` is the global entity database: it includes modelspace,
    paperspace/layouts, block definitions, INSERT attributes and dimension
    overrides, which is why a plain modelspace query misses many texts.
    """
    segments = []
    seen = set()
    for handle, entity in doc.entitydb.items():
        kind = entity.dxftype()
        if kind not in TEXT_TYPES:
            continue
        text = entity_text(entity)
        if not isinstance(text, str):
            continue
        text = text.strip()
        if not text:
            continue
        handle_key = str(handle).upper()
        if handle_key in seen:
            continue
        seen.add(handle_key)
        layer = ""
        try:
            layer = entity.dxf.get("layer", "")
        except Exception:
            layer = ""
        segments.append({"id": "e" + handle_key, "handle": handle_key,
                         "type": kind, "text": text, "layer": layer})
    return segments


def ensure_cjk_style(doc):
    """Create (or find) the 宋体 text style used for translated text."""
    try:
        for candidate in (CJK_FONT_NAME, "SimSun"):
            if doc.styles.has_entry(candidate):
                style = doc.styles.get(candidate)
                try:
                    style.dxf.font = CJK_FONT_FILE
                except Exception:
                    pass
                return candidate
    except Exception as error:
        log_warning("查找宋体样式失败: %s" % error)
    try:
        doc.styles.new(CJK_FONT_NAME, dxfattribs={"font": CJK_FONT_FILE, "bigfont": ""})
        return CJK_FONT_NAME
    except Exception as error:
        log_warning("创建宋体样式失败: %s" % error)
    try:
        doc.styles.add(CJK_FONT_NAME, font=CJK_FONT_FILE)
        return CJK_FONT_NAME
    except Exception as error:
        log_warning("创建宋体样式失败(2): %s" % error)
    return None


def _mtext_height_scale(raw):
    """Return the effective height of an MTEXT before inline formatting is lost.

    MTEXT often carries inline height overrides such as ``\\H2.5x;`` or
    ``\\H150;``; replacing the content drops them and the Chinese text then
    renders at the small default height.
    """
    if not isinstance(raw, str) or "\\H" not in raw:
        return None
    factors = []
    absolutes = []
    for value, marker in re.findall(r"\\H([0-9.]+)([xX]?);", raw):
        try:
            number = float(value)
        except ValueError:
            continue
        if marker:
            factors.append(number)
        else:
            absolutes.append(number)
    scale = max(factors) if factors else 1.0
    absolute = max(absolutes) if absolutes else 0.0
    return scale, absolute


TEXT_HEIGHT_FACTOR = 1.2


def set_entity_text(entity, text, style_name=None):
    kind = entity.dxftype()
    raw = ""
    try:
        if kind == "MTEXT":
            raw = entity.text
        elif kind in ("TEXT", "ATTRIB", "ATTDEF"):
            raw = entity.dxf.get("text", "") or ""
    except Exception:
        raw = ""
    try:
        if kind == "MTEXT":
            entity.text = text
        elif kind in ("TEXT", "ATTRIB", "ATTDEF"):
            entity.dxf.text = text
        elif kind == "TOLERANCE":
            entity.dxf.text = text
        elif kind == "DIMENSION":
            entity.dxf.text = text
        elif kind == "MULTILEADER":
            try:
                entity.set_mtext_content(text)
            except Exception:
                return False
        else:
            return False
    except Exception as error:
        log_warning("写入 %s 文本失败: %s" % (kind, error))
        return False
    if style_name:
        try:
            entity.dxf.style = style_name
        except Exception:
            pass
    # Chinese glyphs look smaller than Latin capitals at the same nominal height
    # and squeeze into a narrow width factor; enlarge slightly and reset width.
    try:
        if kind in ("TEXT", "ATTRIB", "ATTDEF"):
            height = float(entity.dxf.get("height", 0) or 0)
            if height > 0:
                entity.dxf.height = round(height * TEXT_HEIGHT_FACTOR, 3)
            entity.dxf.width = 1.0
        elif kind == "MTEXT":
            char_height = float(entity.dxf.get("char_height", 0) or 0)
            info = _mtext_height_scale(raw)
            scale, absolute = (1.0, 0.0) if info is None else info
            effective = char_height * scale if char_height > 0 else 0.0
            if absolute > effective:
                effective = absolute
            if effective > 0:
                entity.dxf.char_height = round(effective * TEXT_HEIGHT_FACTOR, 3)
    except Exception:
        pass
    return True


def repair_materials(doc):
    """Rebuild the standard materials that ezdxf expects when saving a DXF.

    DXF files written by LibreDWG often carry an ACAD_MATERIAL dictionary whose
    entries point at MATERIAL objects that do not exist in the file. ezdxf then
    resolves those entries to handle strings and its save path crashes with
    "'str' object has no attribute 'dxf'".
    """
    try:
        table = doc.materials
    except Exception as error:
        log_warning("材质表不可用: %s" % error)
        return False
    fixed = False
    for name in ("ByBlock", "ByLayer", "Global"):
        entry = None
        try:
            entry = table.get(name)
        except Exception:
            entry = None
        if entry is None or isinstance(entry, str) or not hasattr(entry, "dxf"):
            try:
                table.object_dict.discard(name)
            except Exception:
                pass
            try:
                table.new(name)
                fixed = True
            except Exception as error:
                log_warning("重建材质 %s 失败: %s" % (name, error))
    return fixed


def save_dxf(doc, path):
    try:
        doc.saveas(path)
        return True
    except Exception as error:
        log_warning("直接保存 DXF 失败（%s），修复材质表后重试" % error)
    repair_materials(doc)
    try:
        doc.saveas(path)
        return True
    except Exception as error:
        log_warning("修复后仍无法保存 DXF: %s" % error)
    return False


def save_dxf(doc, path):
    try:
        doc.saveas(path)
        return True
    except Exception as error:
        log_warning("直接保存 DXF 失败（%s），修复材质表后重试" % error)
    repair_materials(doc)
    try:
        doc.saveas(path)
        return True
    except Exception as error:
        log_warning("修复后仍无法保存 DXF: %s" % error)
    return False


def render_pdf(doc, out_pdf):
    from ezdxf.addons.drawing import Frontend, RenderContext
    from ezdxf.addons.drawing.pymupdf import PyMuPDFBackend
    backend = PyMuPDFBackend()
    frontend = Frontend(RenderContext(doc), backend)
    frontend.draw_layout(doc.modelspace())
    try:
        backend.finalize()
    except Exception:
        pass
    data = backend.get_pdf_bytes()
    with open(out_pdf, "wb") as handle:
        handle.write(data)


def clean_mtext(text):
    """Strip MTEXT inline formatting so the translator sees plain strings."""
    if not isinstance(text, str):
        return ""
    value = text.replace("\\P", " ").replace("\\p", " ").replace("\\~", " ")
    previous = None
    while previous != value:
        previous = value
        value = re.sub(r"\{[^{}]*;", "", value)
    value = value.replace("{", "").replace("}", "")
    value = re.sub(r"\\[A-Za-z][^;\\]*;?", "", value)
    return re.sub(r"\s+", " ", value).strip()


def read_dwg_json(dwg_path, work_dir):
    if not os.path.exists(DWGREAD):
        raise RuntimeError("dwgread-missing: %s" % DWGREAD)
    source = os.path.join(work_dir, "in.dwg")
    if not os.path.exists(source):
        shutil.copyfile(dwg_path, source)
    proc = subprocess.run([DWGREAD, "-O", "JSON", "in.dwg"], cwd=work_dir, capture_output=True, timeout=900)
    text = (proc.stdout or b"").decode("utf-8", "replace")
    if text.strip():
        return text
    target = os.path.join(work_dir, "out.json")
    if os.path.exists(target):
        with open(target, "r", encoding="utf-8", errors="replace") as handle:
            return handle.read()
    raise RuntimeError("dwgread JSON 无输出（退出码 %s）: %s" %
                       (proc.returncode, (proc.stderr or b"").decode("utf-8", "replace")[-400:]))


JSON_KINDS = ("TEXT", "MTEXT", "ATTRIB", "ATTDEF", "MULTILEADER", "DIMENSION", "TOLERANCE")
JSON_TEXT_KEYS = ("text_value", "text", "textValue", "content", "value", "default_content")


def _kind_of(obj):
    for key in ("entity", "object", "type", "name", "class"):
        value = obj.get(key)
        if isinstance(value, str) and value:
            return value.upper()
    return ""


def _text_of(obj):
    for key in JSON_TEXT_KEYS:
        value = obj.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return ""


def json_to_segments(raw):
    """Extract text entities from LibreDWG's JSON dump (recursive, best effort)."""
    try:
        data = json.loads(raw)
    except Exception:
        return []
    found = []

    def walk(node, depth=0):
        if depth > 12 or len(found) > 20000:
            return
        if isinstance(node, dict):
            kind = _kind_of(node)
            base_kind = kind.split(".")[-1]
            if base_kind in JSON_KINDS:
                text = _text_of(node)
                if text:
                    found.append((node, base_kind, text))
            for value in node.values():
                walk(value, depth + 1)
        elif isinstance(node, list):
            for item in node:
                walk(item, depth + 1)

    walk(data)
    segments = []
    for index, (obj, kind, text) in enumerate(found):
        handle = obj.get("handle") or obj.get("handle_ref") or obj.get("ownerhandle") or index
        segments.append({
            "id": "j%s" % str(handle).upper(),
            "handle": str(handle).upper(),
            "type": "MTEXT" if kind == "MTEXT" else ("TEXT" if kind == "TEXT" else kind),
            "text": clean_mtext(text) or text.strip(),
            "layer": str(obj.get("layer") or ""),
        })
    return segments


def cmd_extract(input_path, out_path):
    work_dir = tempfile.mkdtemp(prefix="dwg-extract-")
    try:
        try:
            dxf_path, doc, variant = convert_to_dxf(input_path, work_dir)
            segments = collect_segments(doc)
            payload = {
                "ok": True,
                "file": input_path,
                "converter": "libredwg",
                "dxf_variant": variant,
                "segments": segments,
                "counts": {kind: sum(1 for s in segments if s["type"] == kind) for kind in sorted({s["type"] for s in segments})},
            }
            with open(out_path, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, ensure_ascii=False)
            print(json.dumps({"ok": True, "converter": "libredwg", "dxf_variant": variant,
                              "segments": len(segments), "counts": payload["counts"]}, ensure_ascii=False))
            return
        except Exception as error:
            log_warning("DXF 转换失败，尝试 JSON 兜底: %s" % error)
            dxf_error = error
        raw = read_dwg_json(input_path, work_dir)
        segments = json_to_segments(raw)
        payload = {
            "ok": True,
            "file": input_path,
            "converter": "libredwg-json",
            "segments": segments,
            "warnings": [] if segments else ["DXF 转换失败: %s" % dxf_error,
                                             "JSON 长度 %d，前 1200 字: %s" % (len(raw), raw[:1200])],
        }
        with open(out_path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False)
        print(json.dumps({"ok": True, "converter": "libredwg-json", "segments": len(segments)}, ensure_ascii=False))
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def write_translation_table(csv_path, segments, mapping):
    import csv
    applied = 0
    with open(csv_path, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["原文", "译文", "图层", "类型", "实体句柄"])
        for segment in segments:
            translated = mapping.get(segment["id"])
            if translated is None:
                continue
            applied += 1
            writer.writerow([segment["text"], str(translated), segment.get("layer", ""),
                             segment.get("type", ""), segment.get("handle", "")])
    return applied


def cmd_apply(input_path, map_path, out_dxf, out_pdf=None):
    with open(map_path, "r", encoding="utf-8") as handle:
        mapping = json.load(handle)
    if not isinstance(mapping, dict):
        fail("翻译映射必须是 JSON 对象")
    work_dir = tempfile.mkdtemp(prefix="dwg-apply-")
    warnings = []
    try:
        try:
            dxf_path, doc, variant = convert_to_dxf(input_path, work_dir)
        except Exception as error:
            csv_path = os.path.splitext(out_dxf)[0] + ".csv"
            raw = read_dwg_json(input_path, work_dir)
            segments = json_to_segments(raw)
            applied = write_translation_table(csv_path, segments, mapping)
            print(json.dumps({"ok": True, "applied": applied, "skipped": 0, "output": csv_path, "pdf": None,
                              "warnings": ["DXF 写入失败（%s），已输出双语对照表 CSV" % error]}, ensure_ascii=False))
            return
        style_name = ensure_cjk_style(doc)
        applied = 0
        skipped = 0
        style_missing = 0
        for key, value in mapping.items():
            if not isinstance(key, str) or not key.startswith("e"):
                skipped += 1
                continue
            entity = doc.entitydb.get(key[1:].upper())
            if entity is None:
                skipped += 1
                continue
            text = str(value).replace("\r", " ").replace("\n", " ").strip()
            if not text:
                skipped += 1
                continue
            if set_entity_text(entity, text, style_name):
                applied += 1
            else:
                skipped += 1
                style_missing += 1
        saved = save_dxf(doc, out_dxf)
        if not saved:
            csv_path = os.path.splitext(out_dxf)[0] + ".csv"
            try:
                csv_applied = write_translation_table(csv_path, collect_segments(doc), mapping)
            except Exception as error:
                csv_applied = 0
                log_warning("输出 CSV 失败: %s" % error)
            print(json.dumps({"ok": True, "applied": csv_applied, "skipped": skipped, "output": csv_path,
                              "pdf": None, "style": style_name, "dxf_variant": variant,
                              "warnings": warnings + ["DXF 保存失败，已输出双语对照表 CSV"]}, ensure_ascii=False))
            return
        pdf_written = None
        if out_pdf:
            try:
                render_pdf(doc, out_pdf)
                pdf_written = out_pdf
            except Exception as error:
                warnings.append("PDF 预览渲染失败: %s" % error)
                log_warning(warnings[-1])
        if style_missing > 0:
            warnings.append("%d 个实体类型不支持直接改文字（已跳过）" % style_missing)
        print(json.dumps({"ok": True, "applied": applied, "skipped": skipped, "output": out_dxf,
                          "pdf": pdf_written, "style": style_name, "dxf_variant": variant,
                          "warnings": warnings[:20]}, ensure_ascii=False))
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
                fail("用法: dwg_engine.py apply <input.dwg> <map.json> <output.dxf> [--pdf <output.pdf>]")
            out_pdf = None
            rest = argv[5:]
            for index, item in enumerate(rest):
                if item == "--pdf" and index + 1 < len(rest):
                    out_pdf = rest[index + 1]
            cmd_apply(argv[2], argv[3], argv[4], out_pdf)
        else:
            fail("未知命令: %s" % command)
    except SystemExit:
        raise
    except Exception as error:
        import traceback
        traceback.print_exc()
        fail(error)


if __name__ == "__main__":
    main(sys.argv)
