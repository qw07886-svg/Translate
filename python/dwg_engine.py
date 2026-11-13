"""DWG engine for the drawing translator plugin.

extract <input.dwg> <out.json>
apply   <input.dwg> <map.json> <output.dxf> [--pdf <output.pdf>]

LibreDWG is not Unicode-path safe on Windows, so the DWG is copied into a pure
ASCII temporary directory before conversion.
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
TEXT_TYPES = ("TEXT", "MTEXT", "ATTRIB", "ATTDEF")


def fail(message):
    print(json.dumps({"ok": False, "error": str(message)}, ensure_ascii=False))
    sys.exit(1)


def log_warning(message):
    print(str(message), file=sys.stderr)


def convert_to_dxf(dwg_path, work_dir):
    if not os.path.exists(DWG2DXF):
        raise RuntimeError("converter-missing: 未找到 %s（LibreDWG 的 dwg2dxf.exe）" % DWG2DXF)
    source = os.path.join(work_dir, "in.dwg")
    shutil.copyfile(dwg_path, source)
    target = os.path.join(work_dir, "out.dxf")
    try:
        proc = subprocess.run([DWG2DXF, "-y", "-o", "out.dxf", "in.dwg"], cwd=work_dir,
                              capture_output=True, timeout=900)
    except subprocess.TimeoutExpired:
        raise RuntimeError("dwg2dxf 转换超时（>900s）")
    if not os.path.exists(target):
        tail = (proc.stderr or b"").decode("utf-8", "replace")[-600:].strip()
        raise RuntimeError("dwg2dxf 转换失败（退出码 %s）：%s" % (proc.returncode, tail or "无输出"))
    return target


def entity_text(entity):
    kind = entity.dxftype()
    try:
        if kind == "MTEXT":
            return entity.plain_text()
        if kind in ("TEXT", "ATTRIB", "ATTDEF"):
            return entity.dxf.get("text", "")
    except Exception as error:
        log_warning("读取 %s 文本失败: %s" % (kind, error))
    return ""


def collect_segments(doc):
    segments = []
    for handle, entity in doc.entitydb.items():
        kind = entity.dxftype()
        if kind not in TEXT_TYPES:
            continue
        text = entity_text(entity)
        if not isinstance(text, str) or not text.strip():
            continue
        layer = ""
        try:
            layer = entity.dxf.get("layer", "")
        except Exception:
            layer = ""
        segments.append({"id": "e" + str(handle).upper(), "handle": str(handle).upper(),
                         "type": kind, "text": text.strip(), "layer": layer})
    return segments


def set_entity_text(entity, text):
    kind = entity.dxftype()
    if kind == "MTEXT":
        entity.text = text
        return True
    if kind in ("TEXT", "ATTRIB", "ATTDEF"):
        entity.dxf.text = text
        return True
    return False


def render_pdf(doc, out_pdf):
    from ezdxf.addons.drawing import Frontend, RenderContext
    from ezdxf.addons.drawing.pymupdf import PyMuPDFBackend
    try:
        backend = PyMuPDFBackend(doc)
    except TypeError:
        backend = PyMuPDFBackend()
    frontend = Frontend(RenderContext(doc), backend)
    frontend.draw_layout(doc.modelspace())
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


def json_to_segments(raw):
    """Best-effort text extraction from LibreDWG's JSON dump."""
    try:
        data = json.loads(raw)
    except Exception:
        return []
    objects = None
    if isinstance(data, dict):
        for key in ("objects", "OBJECTS", "entities", "ENTITIES"):
            if isinstance(data.get(key), list):
                objects = data[key]
                break
    elif isinstance(data, list):
        objects = data
    if not objects:
        return []
    segments = []
    for index, obj in enumerate(objects):
        if not isinstance(obj, dict):
            continue
        kind = str(obj.get("entity") or obj.get("type") or obj.get("object") or obj.get("name") or "").upper()
        if kind not in TEXT_TYPES and "MTEXT" not in kind:
            continue
        text = ""
        for key in ("text_value", "text", "value", "textValue", "content"):
            value = obj.get(key)
            if isinstance(value, str) and value.strip():
                text = value
                break
        if not text:
            continue
        text = clean_mtext(text)
        if not text:
            continue
        handle = obj.get("handle") or obj.get("handle_ref") or obj.get("ownerhandle") or index
        segments.append({"id": "e%s" % str(handle).upper(), "handle": str(handle).upper(),
                         "type": "MTEXT" if "MTEXT" in kind else ("TEXT" if "TEXT" in kind else "ATTRIB"),
                         "text": text.strip(), "layer": str(obj.get("layer") or "")})
    return segments


def cmd_extract(input_path, out_path):
    work_dir = tempfile.mkdtemp(prefix="dwg-extract-")
    try:
        try:
            dxf_path = convert_to_dxf(input_path, work_dir)
            doc = ezdxf.readfile(dxf_path)
            segments = collect_segments(doc)
            payload = {"ok": True, "file": input_path, "converter": "libredwg", "segments": segments,
                       "counts": {"text": sum(1 for s in segments if s["type"] == "TEXT"),
                                  "mtext": sum(1 for s in segments if s["type"] == "MTEXT"),
                                  "attrib": sum(1 for s in segments if s["type"] in ("ATTRIB", "ATTDEF"))}}
            with open(out_path, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, ensure_ascii=False)
            print(json.dumps({"ok": True, "converter": "libredwg", "segments": len(segments)}, ensure_ascii=False))
            return
        except Exception as error:
            log_warning("DXF 转换失败，尝试 JSON 兜底: %s" % error)
            dxf_error = error
        raw = read_dwg_json(input_path, work_dir)
        segments = json_to_segments(raw)
        payload = {"ok": True, "file": input_path, "converter": "libredwg-json", "segments": segments,
                   "warnings": [] if segments else ["DXF 转换失败: %s" % dxf_error,
                                                    "JSON 长度 %d，前 1200 字: %s" % (len(raw), raw[:1200])]}
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
            dxf_path = convert_to_dxf(input_path, work_dir)
        except Exception as error:
            csv_path = os.path.splitext(out_dxf)[0] + ".csv"
            raw = read_dwg_json(input_path, work_dir)
            segments = json_to_segments(raw)
            applied = write_translation_table(csv_path, segments, mapping)
            print(json.dumps({"ok": True, "applied": applied, "skipped": 0, "output": csv_path, "pdf": None,
                              "warnings": ["DXF 写入失败（%s），已输出双语对照表 CSV" % error]}, ensure_ascii=False))
            return
        doc = ezdxf.readfile(dxf_path)
        applied = 0
        skipped = 0
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
            try:
                if set_entity_text(entity, text):
                    applied += 1
                else:
                    skipped += 1
            except Exception as error:
                skipped += 1
                log_warning("替换 %s 失败: %s" % (key, error))
        doc.saveas(out_dxf)
        pdf_written = None
        if out_pdf:
            try:
                render_pdf(doc, out_pdf)
                pdf_written = out_pdf
            except Exception as error:
                warnings.append("PDF 预览渲染失败: %s" % error)
                log_warning(warnings[-1])
        print(json.dumps({"ok": True, "applied": applied, "skipped": skipped, "output": out_dxf,
                          "pdf": pdf_written, "warnings": warnings[:20]}, ensure_ascii=False))
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
        fail(error)


if __name__ == "__main__":
    main(sys.argv)
