"""PDF engine for the drawing translator plugin.

extract <input.pdf> <out.json>   line-level text segments
apply   <input.pdf> <map.json> <output.pdf>
"""

import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

import pymupdf

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\msyh.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
]


def fail(message):
    print(json.dumps({"ok": False, "error": str(message)}, ensure_ascii=False))
    sys.exit(1)


def pick_font():
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return path
    return None


def line_segments(page, page_no):
    data = page.get_text("dict")
    segments = []
    line_index = 0
    for block in data.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            spans = [s for s in line.get("spans", []) if str(s.get("text", "")).strip()]
            if not spans:
                continue
            text = "".join(str(s.get("text", "")) for s in spans).strip()
            if not text:
                continue
            x0 = min(float(s["bbox"][0]) for s in spans)
            y0 = min(float(s["bbox"][1]) for s in spans)
            x1 = max(float(s["bbox"][2]) for s in spans)
            y1 = max(float(s["bbox"][3]) for s in spans)
            size = max(float(s.get("size", 0) or 0) for s in spans)
            direction = line.get("dir", (1, 0))
            segments.append({
                "id": "p%d:l%d" % (page_no, line_index),
                "page": page_no,
                "text": text,
                "bbox": [round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2)],
                "font_size": round(size, 2),
                "dir": [round(float(direction[0]), 3), round(float(direction[1]), 3)],
            })
            line_index += 1
    return segments


def cmd_extract(input_path, out_path):
    doc = pymupdf.open(input_path)
    segments = []
    for page_no in range(doc.page_count):
        try:
            segments.extend(line_segments(doc[page_no], page_no))
        except Exception as error:
            print("page %d extract failed: %s" % (page_no, error), file=sys.stderr)
    payload = {"ok": True, "file": input_path, "page_count": doc.page_count, "segments": segments}
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False)
    print(json.dumps({"ok": True, "page_count": doc.page_count, "segments": len(segments)}, ensure_ascii=False))


def insert_translation(page, segment, text, font_path):
    rect = pymupdf.Rect(segment["bbox"])
    if rect.width <= 1 or rect.height <= 0.5:
        return False
    base = segment.get("font_size") or 8.0
    sizes = []
    for factor in (1.0, 0.92, 0.85, 0.78, 0.7, 0.62, 0.55, 0.48):
        candidate = base * factor
        if candidate < 3.2:
            break
        sizes.append(candidate)
    if not sizes:
        return False
    target = rect + (-0.5, -0.5, 0.5, 0.5)
    for size in sizes:
        try:
            if font_path:
                result = page.insert_textbox(target, text, fontsize=size, fontname="msyh", fontfile=font_path,
                                             color=(0, 0, 0), align=0, lineheight=1.0)
            else:
                result = page.insert_textbox(target, text, fontsize=size, fontname="china-s",
                                             color=(0, 0, 0), align=0, lineheight=1.0)
        except Exception:
            result = -1
        if result >= 0:
            return True
    return False


def cmd_apply(input_path, map_path, out_path):
    with open(map_path, "r", encoding="utf-8") as handle:
        mapping = json.load(handle)
    if not isinstance(mapping, dict):
        fail("翻译映射必须是 JSON 对象")
    font_path = pick_font()
    doc = pymupdf.open(input_path)
    applied = 0
    missing = 0
    warnings = []
    for page_no in range(doc.page_count):
        page = doc[page_no]
        try:
            segments = line_segments(page, page_no)
        except Exception as error:
            warnings.append("第 %d 页读取失败: %s" % (page_no, error))
            continue
        page_pairs = []
        for segment in segments:
            translated = mapping.get(segment["id"])
            if translated is None:
                missing += 1
                continue
            text = str(translated).replace("\r", " ").replace("\n", " ").strip()
            if not text:
                missing += 1
                continue
            page_pairs.append((segment, text))
        if not page_pairs:
            continue
        try:
            for segment, _text in page_pairs:
                page.add_redact_annot(pymupdf.Rect(segment["bbox"]))
            try:
                page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
            except TypeError:
                page.apply_redactions()
        except Exception as error:
            warnings.append("第 %d 页擦除失败: %s" % (page_no, error))
            continue
        for segment, text in page_pairs:
            try:
                if insert_translation(page, segment, text, font_path):
                    applied += 1
                else:
                    warnings.append("第 %d 页 %s 字号放不下，已跳过" % (page_no, segment["id"]))
            except Exception as error:
                warnings.append("第 %d 页 %s 写入失败: %s" % (page_no, segment["id"], error))
    doc.save(out_path, garbage=3, deflate=True)
    print(json.dumps({"ok": True, "applied": applied, "skipped": missing, "output": out_path,
                      "warnings": warnings[:50]}, ensure_ascii=False))


def main(argv):
    if len(argv) < 2:
        fail("用法: pdf_engine.py <extract|apply> ...")
    command = argv[1]
    try:
        if command == "extract":
            if len(argv) != 4:
                fail("用法: pdf_engine.py extract <input.pdf> <out.json>")
            cmd_extract(argv[2], argv[3])
        elif command == "apply":
            if len(argv) != 5:
                fail("用法: pdf_engine.py apply <input.pdf> <map.json> <output.pdf>")
            cmd_apply(argv[2], argv[3], argv[4])
        else:
            fail("未知命令: %s" % command)
    except SystemExit:
        raise
    except Exception as error:
        fail(error)


if __name__ == "__main__":
    main(sys.argv)
