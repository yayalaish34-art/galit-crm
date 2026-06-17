# -*- coding: utf-8 -*-
"""
Fixes the one template whose placeholder tags were fragmented by Word's
spellchecker (תרמי-הצעת-מחיר-ליעוץ-תרמי-ודירוג-אנרגטי.docx), then converts it
to the two-pair design like the rest.

Steps:
  1. Back up to .bak (if not already).
  2. Normalize document.xml: drop <w:proofErr/> markers and merge adjacent
     <w:r> runs that share identical run-properties, so split {place}holders
     become contiguous text. This is the same de-fragmentation docxtemplater
     does internally, applied to the raw XML so the splice can find the tables.
  3. Run the same price-region replacement used in rollout-two-pair.py.

Idempotent: re-running re-normalizes from the .bak original if present.
"""
import os, re, zipfile, shutil

D = r"c:\Users\yonat\Desktop\galit_crm\galit-crm\apps\api\templates"
TARGET = "תרמי-הצעת-מחיר-ליעוץ-תרמי-ודירוג-אנרגטי.docx"
PATH = os.path.join(D, TARGET)
BAK = PATH + ".bak"

# ---- canonical two-pair block from example.docx (same as rollout) ----
def get_block():
    with zipfile.ZipFile(os.path.join(D, "example.docx")) as z:
        ex = z.read("word/document.xml").decode("utf-8")
    def para_span(xml, needle, occ=1):
        idx = -1
        for _ in range(occ):
            idx = xml.find(needle, idx + 1)
        s = max(xml.rfind("<w:p>", 0, idx), xml.rfind("<w:p ", 0, idx))
        e = xml.find("</w:p>", idx) + len("</w:p>")
        return s, e
    s0, _ = para_span(ex, "{#hasDiscount}")
    _, e1 = para_span(ex, "{/hasDiscount}", occ=2)
    return ex[s0:e1]

BLOCK = get_block()

def rpr_of(run_xml):
    m = re.search(r"<w:rPr>.*?</w:rPr>", run_xml, re.S)
    return m.group(0) if m else ""

def text_of(run_xml):
    # concatenate all <w:t> contents in the run (preserve), ignore others
    return "".join(re.findall(r"<w:t(?:\s[^>]*)?>([^<]*)</w:t>", run_xml))

def normalize(xml):
    # 1) remove proofErr markers (self-closing, no content)
    xml = re.sub(r"<w:proofErr[^>]*/>", "", xml)
    # 2) merge adjacent runs with identical rPr that are plain text-only runs
    #    (no <w:br/>, <w:tab/>, drawings, etc.) — safe to coalesce their text.
    def merge_in_para(p):
        runs = list(re.finditer(r"<w:r\b[^>]*>.*?</w:r>", p, re.S))
        if not runs:
            return p
        out = []
        last_end = 0
        i = 0
        merged_runs = []  # (start,end,replacement) list
        while i < len(runs):
            r = runs[i]
            rx = r.group(0)
            # only coalesce simple text runs
            simple = ("<w:t" in rx) and ("<w:br" not in rx) and ("<w:tab" not in rx) \
                     and ("<w:drawing" not in rx) and ("<w:fldChar" not in rx)
            if not simple:
                i += 1
                continue
            rpr = rpr_of(rx)
            j = i + 1
            group = [r]
            while j < len(runs):
                rx2 = runs[j].group(0)
                # contiguous (no other run/markup between) and same rPr and simple
                between = p[runs[j-1].end():runs[j].start()]
                simple2 = ("<w:t" in rx2) and ("<w:br" not in rx2) and ("<w:tab" not in rx2) \
                          and ("<w:drawing" not in rx2) and ("<w:fldChar" not in rx2)
                if between.strip() == "" and simple2 and rpr_of(rx2) == rpr:
                    group.append(runs[j]); j += 1
                else:
                    break
            if len(group) > 1:
                combined = "".join(text_of(g.group(0)) for g in group)
                newrun = f'<w:r>{rpr}<w:t xml:space="preserve">{combined}</w:t></w:r>'
                merged_runs.append((group[0].start(), group[-1].end(), newrun))
            i = j if j > i + 1 else i + 1
        # apply merges from last to first
        for s, e, rep in sorted(merged_runs, key=lambda x: -x[0]):
            p = p[:s] + rep + p[e:]
        return p
    # operate per paragraph
    paras = list(re.finditer(r"<w:p\b[^>]*>.*?</w:p>", xml, re.S))
    for m in reversed(paras):
        newp = merge_in_para(m.group(0))
        if newp != m.group(0):
            xml = xml[:m.start()] + newp + xml[m.end():]
    return xml

def price_region(xml):
    tbls = [(m.start(), m.end()) for m in re.finditer(r"<w:tbl>.*?</w:tbl>", xml, re.S)]
    items_i = next((i for i,(a,b) in enumerate(tbls) if "{#items}" in xml[a:b]), None)
    summ_i  = next((i for i,(a,b) in enumerate(tbls)
                    if ("{totalAmount}" in xml[a:b] or "{total}" in xml[a:b])), None)
    if items_i is None or summ_i is None:
        return None, (items_i, summ_i)
    lo, hi = sorted([items_i, summ_i])
    if hi - lo != 1:
        return None, (items_i, summ_i)
    return (tbls[lo][0], tbls[hi][1]), (items_i, summ_i)

# ---- run ----
# always start from the pristine original (bak) to stay idempotent
if not os.path.exists(BAK):
    shutil.copy2(PATH, BAK)
src = BAK

with zipfile.ZipFile(src) as z:
    names = z.namelist()
    data = {n: z.read(n) for n in names}

xml = data["word/document.xml"].decode("utf-8")
print("before normalize: {#items} contiguous =", "{#items}" in xml,
      "| {totalAmount} =", "{totalAmount}" in xml, "| {total} =", "{total}" in xml)

xml = normalize(xml)
print("after  normalize: {#items} contiguous =", "{#items}" in xml,
      "| {totalAmount} =", "{totalAmount}" in xml, "| {total} =", "{total}" in xml)

reg, idxs = price_region(xml)
print("price region:", reg, "table idxs:", idxs)
if reg is None:
    print("!! could not locate adjacent items+summary tables — aborting, file unchanged.")
    raise SystemExit(1)

a, b = reg
new_xml = xml[:a] + BLOCK + xml[b:]
# balance check
counts = {t: new_xml.count(t) for t in ["{#hasDiscount}","{^hasDiscount}","{/hasDiscount}","{#items}","{/items}"]}
print("tag counts:", counts)
assert counts["{#hasDiscount}"]==1 and counts["{^hasDiscount}"]==1 and counts["{/hasDiscount}"]==2 and counts["{#items}"]==2, "tag imbalance"

data["word/document.xml"] = new_xml.encode("utf-8")
tmp = PATH + ".tmp"
with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zf:
    for n in names:
        zf.writestr(n, data[n])
os.replace(tmp, PATH)
print("WROTE", TARGET)
