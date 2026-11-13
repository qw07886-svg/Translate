"""Word (.docx) engine for the drawing translator plugin.

extract <input.docx> <out.json>            paragraph segments
apply   <input.docx> <map.json> <output.docx>
"""

import copy
import json
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from docx import Document
from docx.oxml.ns import qn

RUN_TAGS = {qn("w:r"), qn("w:hyperlink"), qn("w:smartTag"), qn("w:sdt"), qn("w:ins"), qn("w:del")}


def fail(message):
    print(json.dumps({"ok": False, "error": str(message)}, ensure_ascii=False))
    sys.exit(1)


def log_warning(message):
    print(str(message), file=sys.stderr)


def iter_paragraphs(doc):
    """Yield (segment id, paragraph) pairs in a stable traversal order."""
    for index, paragraph in enumerate(doc.paragraphs):
        yield "b:%d" % index, paragraph

    def walk_tables(tables, prefix):
        for table_index, table in enumerate(tables):
            for row_index, row in enumerate(table.rows):
                for cell_index, cell in enumerate(row.cells):
                    base = "%s:t%d:%d:%d" % (prefix, table_index, row_index, cell_index)
                    for paragraph_index, paragraph in enumerate(cell.paragraphs):
                        yield "%s:p:%d" % (base, paragraph_index), paragraph
                    yield from walk_tables(cell.tables, base)

    yield from walk_tables(doc.tables, "b")

    for section_index, section in enumerate(doc.sections):
        try:
            header = section.header
            if header is not None and not header.is_linked_to_previous:
                for paragraph_index, paragraph in enumerate(header.paragraphs):
                    yield "h:%d:%d" % (section_index, paragraph_index), paragraph
        except Exception as error:
            log_warning("读取页眉失败: %s" % error)
        try:
            footer = section.footer
            if footer is not None and not footer.is_linked_to_previous:
                for paragraph_index, paragraph in enumerate(footer.paragraphs):
                    yield "f:%d:%d" % (section_index, paragraph_index), paragraph
        except Exception as error:
            log_warning("读取页脚失败: %s" % error)


def cmd_extract(input_path, out_path):
    doc = Document(input_path)
    segments = []
    for segment_id, paragraph in iter_paragraphs(doc):
        try:
            text = (paragraph.text or "").strip()
        except Exception:
            continue
        if not text:
            continue
        style = ""
        try:
            style = paragraph.style.name if paragraph.style is not None else ""
        except Exception:
            style = ""
        segments.append({"id": segment_id, "text": text, "style": style})
    payload = {"ok": True, "file": input_path, "kind": "docx", "segments": segments, "warnings": []}
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False)
    print(json.dumps({"ok": True, "segments": len(segments)}, ensure_ascii=False))


def replace_paragraph_text(paragraph, text):
    """Replace a paragraph's content, keeping its style and first-run formatting."""
    runs = []
    try:
        runs = list(paragraph.runs)
    except Exception:
        runs = []
    first_run = runs[0] if runs else None
    properties = None
    if first_run is not None:
        try:
            if first_run._element.rPr is not None:
                properties = copy.deepcopy(first_run._element.rPr)
        except Exception:
            properties = None
    element = paragraph._p
    for child in list(element):
        if child.tag in RUN_TAGS:
            element.remove(child)
    new_run = paragraph.add_run(text)
    if properties is not None:
        try:
            new_run._element.insert(0, properties)
        except Exception:
            pass


def cmd_apply(input_path, map_path, out_path):
    with open(map_path, "r", encoding="utf-8") as handle:
        mapping = json.load(handle)
    if not isinstance(mapping, dict):
        fail("翻译映射必须是 JSON 对象")
    doc = Document(input_path)
    applied = 0
    skipped = 0
    warnings = []
    for segment_id, paragraph in iter_paragraphs(doc):
        translated = mapping.get(segment_id)
        if translated is None:
            skipped += 1
            continue
        text = str(translated).replace("\r", " ").replace("\n", " ").strip()
        if not text:
            skipped += 1
            continue
        try:
            replace_paragraph_text(paragraph, text)
            applied += 1
        except Exception as error:
            skipped += 1
            warnings.append("%s 写入失败: %s" % (segment_id, error))
    doc.save(out_path)
    print(json.dumps({"ok": True, "applied": applied, "skipped": skipped, "output": out_path,
                      "pdf": None, "warnings": warnings[:20]}, ensure_ascii=False))


def main(argv):
    if len(argv) < 2:
        fail("用法: docx_engine.py <extract|apply> ...")
    command = argv[1]
    try:
        if command == "extract":
            if len(argv) != 4:
                fail("用法: docx_engine.py extract <input.docx> <out.json>")
            cmd_extract(argv[2], argv[3])
        elif command == "apply":
            if len(argv) != 5:
                fail("用法: docx_engine.py apply <input.docx> <map.json> <output.docx>")
            cmd_apply(argv[2], argv[3], argv[4])
        else:
            fail("未知命令: %s" % command)
    except SystemExit:
        raise
    except Exception as error:
        fail(error)


if __name__ == "__main__":
    main(sys.argv)
