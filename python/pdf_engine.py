"""PDF engine for the drawing translator plugin.

extract <input.pdf> <out.json>   line-level text segments (OCR for scanned pages)
apply   <input.pdf> <map.json> <output.pdf>
"""

import json
import os
import shutil
import re
import subprocess
import sys
import tempfile

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

import pymupdf

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\simsun.ttc",
    r"C:\Windows\Fonts\simsun.ttf",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\msyh.ttf",
    r"C:\Windows\Fonts\simhei.ttf",
]
# Inserted Chinese uses 宋体 uniformly (matches the DWG output).
FONT_NAME = "simsun"

TESSERACT_CANDIDATES = [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    r"C:\Users\Administrator\AppData\Local\Programs\Tesseract-OCR\tesseract.exe",
]
OCR_LANGS = ["chi_sim", "eng"]
# Rendering resolution for OCR. 200 dpi keeps a scanned A4 page near 1650x2340
# pixels, which Tesseract reads in one to three seconds per page.
OCR_DPI = 200
OCR_MIN_CONFIDENCE = 35.0


def fail(message):
    print(json.dumps({"ok": False, "error": str(message)}, ensure_ascii=False))
    sys.exit(1)


def pick_font():
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return path
    return None


def find_tesseract():
    for path in TESSERACT_CANDIDATES:
        if os.path.exists(path):
            return path
    found = os.environ.get("TESSERACT_PATH")
    if found and os.path.exists(found):
        return found
    # Any Tesseract on PATH (winget/chocolatey installs) works as well.
    return shutil.which("tesseract")


# OCR languages worth trying per detected script, most specific first.
SCRIPT_LANGS = {
    "Cyrillic": ["rus", "srp", "ukr", "bul", "bel", "mkd"],
    "Han": ["chi_sim", "chi_tra"],
    "Latin": ["eng"],
    "Fraktur": ["eng"],
}


def installed_languages(tesseract):
    """List the OCR language packs this Tesseract install actually carries."""
    base = os.path.dirname(tesseract)
    tessdata = os.path.join(base, "tessdata")
    if not os.path.isdir(tessdata):
        return set()
    available = set()
    try:
        for name in os.listdir(tessdata):
            if name.endswith(".traineddata"):
                available.add(name[:-len(".traineddata")])
    except OSError:
        return set()
    return available


def languages_for_script(script, available):
    """Choose OCR languages for one page from its detected script.

    A scanned Serbian contract read with English-only OCR turns "УГОВОР" into
    "YIOBOP", so the script decides the language packs, not one fixed default.
    """
    if not available:
        return ""
    wanted = SCRIPT_LANGS.get(script or "", []) or []
    chosen = [lang for lang in wanted if lang in available]
    if "eng" in available and "eng" not in chosen:
        chosen.append("eng")
    if not chosen:
        chosen = [lang for lang in OCR_LANGS if lang in available][:2]
    if not chosen and "eng" in available:
        chosen = ["eng"]
    return "+".join(chosen[:3])


def detect_script(image_path, tesseract, available):
    """Ask Tesseract's OSD engine which script a page uses (Cyrillic, Han, Latin...)."""
    if "osd" not in available:
        return ""
    try:
        completed = subprocess.run(
            [tesseract, image_path, "stdout", "--psm", "0"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=60,
        )
    except Exception:
        return ""
    text = completed.stdout.decode("utf-8", "replace")
    for line in text.splitlines():
        if line.lower().startswith("script:"):
            return line.split(":", 1)[1].strip()
    return ""


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


def join_words(words):
    """Join OCR words of one line: keep CJK tight, put a space between Latin words."""
    text = ""
    for word in words:
        if not text:
            text = word
            continue
        previous = text[-1]
        current = word[0]
        cjk = lambda ch: "\u3400" <= ch <= "\u9fff" or "\uff00" <= ch <= "\uffef"
        if cjk(previous) or cjk(current):
            text += word
        else:
            text += " " + word
    return text.strip()


def ocr_page(page, page_no, tesseract, available):
    """OCR one rendered page; returns (segments, detected script, languages)."""
    zoom = OCR_DPI / 72.0
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
    handle, image_path = tempfile.mkstemp(suffix=".png", prefix="dsh-ocr-")
    os.close(handle)
    script = ""
    langs = ""
    try:
        pixmap.save(image_path)
        script = detect_script(image_path, tesseract, available)
        langs = languages_for_script(script, available)
        if not langs:
            raise RuntimeError("Tesseract 没有可用的语言包（需要 eng 或 chi_sim）")
        completed = subprocess.run(
            [tesseract, image_path, "stdout", "-l", langs, "--psm", "3", "tsv"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=180,
        )
        table = completed.stdout.decode("utf-8", "replace")
        if completed.returncode != 0:
            raise RuntimeError(completed.stderr.decode("utf-8", "replace").strip()[:300] or "tesseract 失败")
    finally:
        try:
            os.unlink(image_path)
        except OSError:
            pass

    header = None
    lines = {}
    order = []
    for row in table.splitlines():
        cells = row.split("\t")
        if header is None:
            header = {name: index for index, name in enumerate(cells)}
            continue
        if len(cells) < len(header):
            continue
        try:
            level = int(cells[header["level"]])
        except (KeyError, ValueError):
            continue
        if level != 5:
            continue
        text = cells[header.get("text", len(cells) - 1)]
        if not text.strip():
            continue
        try:
            confidence = float(cells[header["conf"]])
        except (KeyError, ValueError):
            confidence = 100.0
        if confidence < OCR_MIN_CONFIDENCE:
            continue
        key = (int(cells[header["block_num"]]), int(cells[header["par_num"]]), int(cells[header["line_num"]]))
        left = float(cells[header["left"]]) / zoom
        top = float(cells[header["top"]]) / zoom
        width = float(cells[header["width"]]) / zoom
        height = float(cells[header["height"]]) / zoom
        if key not in lines:
            lines[key] = {"words": [], "x0": left, "y0": top, "x1": left + width, "y1": top + height}
            order.append(key)
        bucket = lines[key]
        bucket["words"].append(text.strip())
        bucket["x0"] = min(bucket["x0"], left)
        bucket["y0"] = min(bucket["y0"], top)
        bucket["x1"] = max(bucket["x1"], left + width)
        bucket["y1"] = max(bucket["y1"], top + height)

    segments = []
    for index, key in enumerate(order):
        bucket = lines[key]
        text = join_words(bucket["words"])
        if not text:
            continue
        height = max(1.0, bucket["y1"] - bucket["y0"])
        segments.append({
            "id": "p%d:l%d" % (page_no, index),
            "page": page_no,
            "text": text,
            "bbox": [round(bucket["x0"], 2), round(bucket["y0"], 2), round(bucket["x1"], 2), round(bucket["y1"], 2)],
            "font_size": round(height * 0.78, 2),
            "dir": [1.0, 0.0],
            "ocr": True,
        })
    return segments, script, langs


def cmd_extract(input_path, out_path):
    doc = pymupdf.open(input_path)
    segments = []
    warnings = []
    ocr_pages = []
    tesseract = find_tesseract()
    available = installed_languages(tesseract) if tesseract else set()
    used_langs = set()
    for page_no in range(doc.page_count):
        page = doc[page_no]
        try:
            page_segments = line_segments(page, page_no)
        except Exception as error:
            warnings.append("第 %d 页读取失败: %s" % (page_no + 1, error))
            page_segments = []
        if not page_segments:
            # No text layer: this is a scanned or photographed page. OCR it so the
            # contract/scan the user picked can be translated instead of skipped.
            if tesseract and available:
                try:
                    page_segments, script, langs = ocr_page(page, page_no, tesseract, available)
                    if page_segments:
                        ocr_pages.append(page_no)
                        if langs:
                            used_langs.add(langs)
                        if script:
                            warnings.append("第 %d 页按 %s 文字识别（OCR 语言 %s）" % (page_no + 1, script, langs))
                    else:
                        warnings.append("第 %d 页 OCR 没有识别出文字" % (page_no + 1))
                except Exception as error:
                    warnings.append("第 %d 页 OCR 失败: %s" % (page_no + 1, error))
            elif not tesseract:
                warnings.append("该 PDF 没有文字层（扫描件），且本机未安装 Tesseract OCR，无法识别图片中的文字")
            else:
                warnings.append("该 PDF 没有文字层（扫描件），Tesseract 缺少 chi_sim 或 eng 语言包")
        segments.extend(page_segments)
    payload = {
        "ok": True,
        "file": input_path,
        "page_count": doc.page_count,
        "segments": segments,
        "ocr": bool(ocr_pages),
        "ocr_pages": ocr_pages,
        "ocr_langs": sorted(used_langs),
        "warnings": warnings[:50],
    }
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False)
    print(json.dumps({"ok": True, "page_count": doc.page_count, "segments": len(segments),
                      "ocr_pages": len(ocr_pages), "ocr_langs": sorted(used_langs),
                      "warnings": warnings[:5]}, ensure_ascii=False))


def load_geometry(map_path):
    """Read the segment geometry the extract step wrote next to the map file."""
    extract_path = re.sub(r"\.map\.json$", ".extract.json", map_path)
    if extract_path == map_path or not os.path.exists(extract_path):
        return None
    try:
        with open(extract_path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except Exception:
        return None
    segments = payload.get("segments") if isinstance(payload, dict) else None
    if not isinstance(segments, list):
        return None
    by_page = {}
    for segment in segments:
        if not isinstance(segment, dict):
            continue
        page_no = segment.get("page")
        bbox = segment.get("bbox")
        if not isinstance(page_no, int) or not isinstance(bbox, list) or len(bbox) != 4:
            continue
        by_page.setdefault(page_no, []).append(segment)
    return by_page


def insert_translation(page, segment, text, font_path):
    rect = pymupdf.Rect(segment["bbox"])
    if rect.width <= 1 or rect.height <= 0.5:
        return False
    base = segment.get("font_size") or 8.0
    minimum = max(6.0, base * 0.6)
    sizes = []
    for factor in (1.0, 0.92, 0.85, 0.78, 0.7, 0.62, 0.55, 0.48):
        candidate = base * factor
        if candidate < minimum:
            break
        sizes.append(candidate)
    if not sizes:
        sizes = [minimum]
    target = rect + (-0.5, -0.5, 0.5, 0.5)
    for size in sizes:
        try:
            if font_path:
                result = page.insert_textbox(target, text, fontsize=size, fontname=FONT_NAME, fontfile=font_path,
                                             color=(0, 0, 0), align=0, lineheight=1.0)
            else:
                result = page.insert_textbox(target, text, fontsize=size, fontname="china-s",
                                             color=(0, 0, 0), align=0, lineheight=1.0)
        except Exception:
            result = -1
        if result >= 0:
            return True
    # Last resort: draw one line at the minimum readable size without wrapping.
    try:
        y = rect.y1 - 1.0
        page.insert_text((rect.x0 + 0.5, y), text, fontsize=minimum,
                         fontname=FONT_NAME, fontfile=font_path or "", color=(0, 0, 0))
        return True
    except Exception:
        return False


def cover_rect(page, segment):
    """Paint white over OCR text: the scan is an image, so redaction cannot erase it."""
    rect = pymupdf.Rect(segment["bbox"])
    padded = pymupdf.Rect(rect.x0 - 0.6, rect.y0 - 0.6, rect.x1 + 0.6, rect.y1 + 0.6)
    try:
        page.draw_rect(padded, color=None, fill=(1, 1, 1), overlay=True, width=0)
        return True
    except Exception:
        return False


def cmd_apply(input_path, map_path, out_path):
    with open(map_path, "r", encoding="utf-8") as handle:
        mapping = json.load(handle)
    if not isinstance(mapping, dict):
        fail("翻译映射必须是 JSON 对象")
    font_path = pick_font()
    geometry = load_geometry(map_path)
    doc = pymupdf.open(input_path)
    applied = 0
    missing = 0
    covered = 0
    warnings = []
    for page_no in range(doc.page_count):
        page = doc[page_no]
        if geometry is not None and page_no in geometry:
            segments = geometry[page_no]
        else:
            try:
                segments = line_segments(page, page_no)
            except Exception as error:
                warnings.append("第 %d 页读取失败: %s" % (page_no, error))
                continue
        page_pairs = []
        for segment in segments:
            translated = mapping.get(segment.get("id"))
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
        text_pairs = [pair for pair in page_pairs if not pair[0].get("ocr")]
        if text_pairs:
            try:
                for segment, _text in text_pairs:
                    page.add_redact_annot(pymupdf.Rect(segment["bbox"]))
                try:
                    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
                except TypeError:
                    page.apply_redactions()
            except Exception as error:
                warnings.append("第 %d 页擦除失败: %s" % (page_no, error))
        for segment, _text in page_pairs:
            if segment.get("ocr") and cover_rect(page, segment):
                covered += 1
        for segment, text in page_pairs:
            try:
                if insert_translation(page, segment, text, font_path):
                    applied += 1
                else:
                    warnings.append("第 %d 页 %s 字号放不下，已跳过" % (page_no, segment.get("id")))
            except Exception as error:
                warnings.append("第 %d 页 %s 写入失败: %s" % (page_no, segment.get("id"), error))
    doc.save(out_path, garbage=3, deflate=True)
    print(json.dumps({"ok": True, "applied": applied, "skipped": missing, "covered": covered,
                      "output": out_path, "warnings": warnings[:50]}, ensure_ascii=False))


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
