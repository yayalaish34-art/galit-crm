# -*- coding: utf-8 -*-
"""
Roll out the example.docx two-pair price-table design onto all registered
quote templates (interpretation A: force the example's table design).

For each template:
  - locate the items table ({#items}) and the adjacent summary table
    ({totalAmount}); they are always adjacent (verified).
  - replace the region [first table .. second table] (incl. the gap paragraph
    between them) with the canonical {#hasDiscount}..{/hasDiscount} two-pair
    block extracted from example.docx.
  - keeps every other table/paragraph (intro, milestones, terms, signature).

Skips: the new-style example.docx, non-template files, and any file with
fragmented placeholder tags (handled/reported separately).

Run:  node-free, pure python.  python scripts/rollout-two-pair.py [--apply]
Without --apply it is a DRY RUN (reports plan, writes nothing).
"""
import os, re, zipfile, io, sys, shutil

D = r"c:\Users\yonat\Desktop\galit_crm\galit-crm\apps\api\templates"
APPLY = '--apply' in sys.argv

def read_docxml_bytes(path):
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        data = {n: z.read(n) for n in names}
    return names, data

def get_block():
    p = os.path.join(D, 'example.docx')
    with zipfile.ZipFile(p) as z:
        ex = z.read('word/document.xml').decode('utf-8')
    def para_span(xml, needle, occ=1):
        idx=-1
        for _ in range(occ): idx = xml.find(needle, idx+1)
        s = max(xml.rfind('<w:p>',0,idx), xml.rfind('<w:p ',0,idx))
        e = xml.find('</w:p>', idx)+len('</w:p>')
        return s,e
    s0,_ = para_span(ex,'{#hasDiscount}')
    _,e1 = para_span(ex,'{/hasDiscount}',occ=2)
    return ex[s0:e1]

BLOCK = get_block()

def price_region(xml):
    """Return (start,end) char span covering items+summary tables (adjacent),
    including any paragraphs strictly between them. None if not found cleanly."""
    tbls=[(m.start(),m.end()) for m in re.finditer(r'<w:tbl>.*?</w:tbl>', xml, re.S)]
    items_i = next((i for i,(a,b) in enumerate(tbls) if '{#items}' in xml[a:b]), None)
    summ_i  = next((i for i,(a,b) in enumerate(tbls)
                    if ('{totalAmount}' in xml[a:b] or '{total}' in xml[a:b])), None)
    if items_i is None or summ_i is None: return None
    lo,hi = sorted([items_i, summ_i])
    if hi-lo != 1: return None   # require adjacency (verified true for all clean files)
    return tbls[lo][0], tbls[hi][1]

# build artifacts / samples that must NOT be rewritten (not live templates)
EXCLUDE = {
    'kol-holem-acoustic-source.docx',
    'kol-holem-acoustic-tagged-before-user-merge.docx',
    'kol-holem-acoustic-SAMPLE-OUTPUT.docx',
    '_mapping-check.docx',
}

def process(fname):
    if fname in EXCLUDE:
        return ('skip-artifact', None)
    path = os.path.join(D, fname)
    names, data = read_docxml_bytes(path)
    xml = data['word/document.xml'].decode('utf-8')
    if '{^hasDiscount}' in xml:  return ('skip-new', None)
    if '{#items}' not in xml:    return ('skip-nontpl', None)
    if 'totalAmount' in xml and '{totalAmount}' not in xml and '{total}' not in xml:
        return ('skip-fragmented', None)
    reg = price_region(xml)
    if reg is None: return ('no-region', None)
    a,b = reg
    new_xml = xml[:a] + BLOCK + xml[b:]
    # balance check
    if new_xml.count('{#hasDiscount}')!=1 or new_xml.count('{^hasDiscount}')!=1 \
       or new_xml.count('{/hasDiscount}')!=2 or new_xml.count('{#items}')!=2:
        return ('tag-imbalance', None)
    if not APPLY:
        return ('would-apply', None)
    # backup
    bak = path+'.bak'
    if not os.path.exists(bak):
        shutil.copy2(path, bak)
    # rewrite zip
    data['word/document.xml'] = new_xml.encode('utf-8')
    tmp = path+'.tmp'
    with zipfile.ZipFile(tmp,'w',zipfile.ZIP_DEFLATED) as zf:
        for n in names:
            zf.writestr(n, data[n])
    os.replace(tmp, path)
    return ('applied', None)

files=[f for f in sorted(os.listdir(D)) if f.lower().endswith('.docx')]
from collections import Counter
res=Counter(); detail={}
for f in files:
    try:
        status,_ = process(f)
    except Exception as e:
        status='ERROR:'+str(e)[:80]
    res[status]+=1
    detail.setdefault(status,[]).append(f)

print(("APPLY" if APPLY else "DRY RUN")+" — results:")
for s,c in res.most_common():
    print(f"  {c:3d}  {s}")
for s in ['skip-fragmented','no-region','tag-imbalance']:
    for f in detail.get(s,[]):
        print(f"     ! {s}: {f}")
for s in [k for k in detail if k.startswith('ERROR')]:
    for f in detail[s]:
        print(f"     !! {s}: {f}")
