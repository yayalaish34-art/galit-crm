# -*- coding: utf-8 -*-
"""
Wires merge placeholders + {#hasDiscount}/{^hasDiscount} conditionals into
templates/example.docx so that:
  - Pair 1 (Table 0 items w/ discount col + Table 1 summary w/ discount row)
    renders ONLY when hasDiscount is true.
  - Pair 2 (Table 2 items no discount col + Table 3 summary no discount row)
    renders ONLY when hasDiscount is false.

Idempotent-ish: operates on a fresh unzip each run.
"""
import re, zipfile, shutil, os

TPL_DIR = r"c:\Users\yonat\Desktop\galit_crm\galit-crm\apps\api\templates"
SRC = os.path.join(TPL_DIR, "example.docx")
WORKDIR = os.path.join(TPL_DIR, "example_build")
DOCXML = os.path.join(WORKDIR, "word", "document.xml")

# --- unzip fresh ---
if os.path.isdir(WORKDIR):
    shutil.rmtree(WORKDIR)
with zipfile.ZipFile(SRC) as z:
    z.extractall(WORKDIR)

xml = open(DOCXML, encoding="utf-8").read()

# run-property block reused for injected runs (David font, bold, sz28, RTL) — matches the cells
RPR = '<w:rPr><w:rFonts w:cs="David" w:hint="cs"/><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/><w:rtl/></w:rPr>'

def run(text):
    """A <w:r> run carrying given text with the standard rPr."""
    return f'<w:r>{RPR}<w:t xml:space="preserve">{text}</w:t></w:r>'

def find_tables(s):
    return [(m.start(), m.end()) for m in re.finditer(r'<w:tbl>.*?</w:tbl>', s, re.S)]

def split_rows(tbl_xml):
    return list(re.finditer(r'<w:tr\b.*?</w:tr>', tbl_xml, re.S))

def inject_into_empty_cell_para(cell_xml, runs_xml):
    """Insert runs into the (empty) first <w:p> of a cell, right after its <w:pPr>...</w:pPr>."""
    # cell's first paragraph
    pm = re.search(r'<w:p\b.*?</w:p>', cell_xml, re.S)
    para = pm.group(0)
    # insert after pPr close, or after <w:p ...> if no pPr
    if '</w:pPr>' in para:
        newpara = para.replace('</w:pPr>', '</w:pPr>' + runs_xml, 1)
    else:
        newpara = re.sub(r'(<w:p\b[^>]*>)', r'\1' + runs_xml, para, count=1)
    return cell_xml[:pm.start()] + newpara + cell_xml[pm.end():]

def fill_items_row(row_xml, fields):
    """fields: list of run-text (or loop-wrapped) per cell, in order."""
    cells = list(re.finditer(r'<w:tc>.*?</w:tc>', row_xml, re.S))
    assert len(cells) == len(fields), f"cells {len(cells)} != fields {len(fields)}"
    out = row_xml
    # edit from last to first to keep offsets
    for ci in range(len(cells)-1, -1, -1):
        c = cells[ci]
        new_cell = inject_into_empty_cell_para(c.group(0), fields[ci])
        out = out[:c.start()] + new_cell + out[c.end():]
    return out

def fill_summary_value(row_xml, value_runs):
    """Put value_runs into the 2nd cell (value cell) of a 2-col summary row."""
    cells = list(re.finditer(r'<w:tc>.*?</w:tc>', row_xml, re.S))
    c = cells[1]  # value column
    new_cell = inject_into_empty_cell_para(c.group(0), value_runs)
    return row_xml[:c.start()] + new_cell + row_xml[c.end():]

def replace_table(s, idx, new_tbl):
    tbls = find_tables(s)
    a, b = tbls[idx]
    return s[:a] + new_tbl + s[b:]

# ============ TABLE 0 : items WITH discount column (7 cols) ============
# columns: שורה | מק"ט | תיאור | כמות | מחיר ליחידה | % הנחה לשורה | סה"כ
tbls = find_tables(xml)
t0 = xml[tbls[0][0]:tbls[0][1]]
rows0 = split_rows(t0)
data0 = rows0[1].group(0)
# loop: open in first cell, close in last cell
f0 = [
    run('{#items}{lineNumber}'),
    run('{itemCode}'),
    run('{description}'),
    run('{quantity}'),
    run('{unitPrice}'),
    run('{lineDiscountPercent}'),
    run('{lineTotal}{/items}'),
]
new_data0 = fill_items_row(data0, f0)
t0_new = t0[:rows0[1].start()] + new_data0 + t0[rows0[1].end():]
xml = replace_table(xml, 0, t0_new)

# ============ TABLE 1 : summary WITH discount row (4 rows) ============
# rows: % הנחה | סה"כ לאחר הנחה | מע"מ 18% | סה"כ לתשלום
tbls = find_tables(xml)
t1 = xml[tbls[1][0]:tbls[1][1]]
rows1 = split_rows(t1)
vals1 = ['{discountPercent}', '{subtotalAfterDiscount}', '{vatAmount}', '{totalAmount}']
t1_new = t1
# edit rows last->first
for ri in range(len(rows1)-1, -1, -1):
    r = rows1[ri]
    nr = fill_summary_value(r.group(0), run(vals1[ri]))
    t1_new = t1_new[:r.start()] + nr + t1_new[r.end():]
xml = replace_table(xml, 1, t1_new)

# ============ TABLE 2 : items WITHOUT discount column (6 cols) ============
tbls = find_tables(xml)
t2 = xml[tbls[2][0]:tbls[2][1]]
rows2 = split_rows(t2)
data2 = rows2[1].group(0)
f2 = [
    run('{#items}{lineNumber}'),
    run('{itemCode}'),
    run('{description}'),
    run('{quantity}'),
    run('{unitPrice}'),
    run('{lineTotal}{/items}'),
]
new_data2 = fill_items_row(data2, f2)
t2_new = t2[:rows2[1].start()] + new_data2 + t2[rows2[1].end():]
xml = replace_table(xml, 2, t2_new)

# ============ TABLE 3 : summary WITHOUT discount row (3 rows) ============
# rows: סה"כ | מע"מ 18% | סה"כ לתשלום
tbls = find_tables(xml)
t3 = xml[tbls[3][0]:tbls[3][1]]
rows3 = split_rows(t3)
vals3 = ['{subtotalAfterDiscount}', '{vatAmount}', '{totalAmount}']
t3_new = t3
for ri in range(len(rows3)-1, -1, -1):
    r = rows3[ri]
    nr = fill_summary_value(r.group(0), run(vals3[ri]))
    t3_new = t3_new[:r.start()] + nr + t3_new[r.end():]
xml = replace_table(xml, 3, t3_new)

# ============ WRAP PAIRS IN CONDITIONALS ============
# {#hasDiscount} before T0 ; {/hasDiscount} after T1
# {^hasDiscount} before T2 ; {/^hasDiscount(=}) after T3  -> docxtemplater uses {/} or {/hasDiscount}
def cond_para(tag):
    return (f'<w:p><w:pPr><w:rPr><w:vanish/></w:rPr></w:pPr>'
            f'<w:r><w:rPr><w:vanish/></w:rPr><w:t xml:space="preserve">{tag}</w:t></w:r></w:p>')

tbls = find_tables(xml)
# insert order from last to first to preserve offsets
ins = [
    (tbls[3][1], cond_para('{/hasDiscount}')), # close inverted section after T3
    (tbls[2][0], cond_para('{^hasDiscount}')), # open inverted before T2
    (tbls[1][1], cond_para('{/hasDiscount}')), # close section after T1
    (tbls[0][0], cond_para('{#hasDiscount}')), # open section before T0
]
ins.sort(key=lambda x: -x[0])
for pos, frag in ins:
    xml = xml[:pos] + frag + xml[pos:]

open(DOCXML, "w", encoding="utf-8").write(xml)

# --- re-zip into example.docx (overwrite) ---
OUT = os.path.join(TPL_DIR, "example.docx")
tmp = OUT + ".tmp"
with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zf:
    for root, _, files in os.walk(WORKDIR):
        for fn in files:
            full = os.path.join(root, fn)
            arc = os.path.relpath(full, WORKDIR).replace(os.sep, "/")
            zf.write(full, arc)
os.replace(tmp, OUT)
print("WROTE", OUT)

# verify tags present
chk = open(DOCXML, encoding="utf-8").read()
import collections
for t in ['{#items}', '{/items}', '{#hasDiscount}', '{^hasDiscount}', '{/hasDiscount}', '{discountPercent}', '{lineDiscountPercent}', '{totalAmount}', '{vatAmount}', '{subtotalAfterDiscount}', '{lineNumber}']:
    print(f"  {t}: {chk.count(t)}")
