#!/usr/bin/env python3
"""
Build DOCX Template from Original Word Document
================================================
Takes an original Word document and inserts docxtemplater placeholders
at bookmark positions. Uses ONLY string replacement — no XML parser.

Usage:
  python3 scripts/build-docx-template.py <input.docx> <output.docx>

Example:
  python3 scripts/build-docx-template.py \
    "original-quote.docx" \
    "apps/api/templates/kol-holem-acoustic.docx"

The script:
1. Opens the original DOCX (ZIP file)
2. Reads word/document.xml as a string
3. Finds all fld* bookmarks and inserts {placeholder} text runs
4. Adds {#items}/{/items} loop markers for the items table
5. Adds {quoteDate} inside the title paragraph
6. Adds {notes} before the validity section
7. Writes a new DOCX preserving all other files byte-identical
"""

import zipfile, re, io, sys

# ── Configuration ──

BOOKMARK_PLACEHOLDERS = {
    'fldCode':                '{quoteNumber}',
    'fldKidomet':             '{contactTitle}',
    'fldCustName':            '{customerName}',
    'fldKtovet':              '{customerAddress}',
    'fldCity':                '{customerCity}',
    'fldCellular':            '{customerPhone}',
    'fldEmail':               '{customerEmail}',
    'fldSochenName':          '{approverName}',
    'fldLine':                '{rowNum}',
    'fldMakat':               '{code}',
    'fldProduct':             '{name}',
    'fldAmmount':             '{quantity}',
    'fldPrice':               '{unitPrice}',
    'fldLineDiscount':        '{discountPct}',
    'fldLineTotal':           '{lineTotal}',
    'fldDiscount':            '{discountPercent}',
    'fldTotalAfterDiscount':  '{subtotalAfterDiscount}',
    'fldMAAM':                '{vat}',
    'fldTotalAfterMaaM':      '{total}',
    'fldPaymentDesc':         '{paymentTerms}',
    'fldTokef':               '{validityDate}',
}

ITEMS_BOOKMARKS = {'fldLine', 'fldMakat', 'fldProduct', 'fldAmmount',
                   'fldPrice', 'fldLineDiscount', 'fldLineTotal'}


def make_run(text: str) -> str:
    """Create a Word text run with RTL support."""
    return (f'<w:r><w:rPr><w:rtl w:val="true"/></w:rPr>'
            f'<w:t xml:space="preserve">{text}</w:t></w:r>')


def make_run_small(text: str) -> str:
    """Create a smaller text run (David 11pt) for the date field."""
    return (f'<w:r><w:rPr>'
            f'<w:rFonts w:hint="cs" w:cs="David"/>'
            f'<w:sz w:val="22"/><w:szCs w:val="22"/>'
            f'<w:rtl w:val="true"/>'
            f'</w:rPr>'
            f'<w:t xml:space="preserve">{text}</w:t></w:r>')


def build_template(input_path: str, output_path: str):
    # Read original
    with zipfile.ZipFile(input_path, 'r') as zin:
        xml = zin.read('word/document.xml').decode('utf-8')
        file_infos = {}
        file_data = {}
        for info in zin.infolist():
            file_infos[info.filename] = info
            file_data[info.filename] = zin.read(info.filename)

    print(f'Original: {input_path} ({len(xml):,} chars XML, {len(file_infos)} files)')

    # Step 1: Insert placeholders at bookmarks
    print('\nStep 1: Bookmark placeholders')
    for bm_name, placeholder in BOOKMARK_PLACEHOLDERS.items():
        pat = (rf'(<w:bookmarkStart\s+w:id="(\d+)"\s+w:name="{bm_name}"\s*/>)'
               rf'(\s*)'
               rf'(<w:bookmarkEnd\s+w:id="\2"\s*/>)')
        m = re.search(pat, xml)
        if m:
            xml = xml[:m.start()] + m.group(1) + make_run(placeholder) + m.group(3) + m.group(4) + xml[m.end():]
            print(f'  + {bm_name} -> {placeholder}')
        else:
            print(f'  ! {bm_name} NOT FOUND')

    # Step 2: Date after fldCode
    print('\nStep 2: Date placeholder')
    m = re.search(r'(<w:bookmarkEnd\s+w:id="0"\s*/>)', xml)
    if m:
        date_xml = ('<w:r><w:rPr><w:rFonts w:cs="David"/>'
                    '<w:sz w:val="28"/><w:szCs w:val="28"/>'
                    '</w:rPr><w:br/></w:r>'
                    + make_run_small('תאריך: {quoteDate}'))
        xml = xml[:m.end()] + date_xml + xml[m.end():]
        print('  + {quoteDate} inserted after fldCode')
    else:
        print('  ! bookmarkEnd id=0 not found')

    # Step 3: Items loop
    print('\nStep 3: Items loop markers')
    fld_line_pos = xml.find('{rowNum}')
    if fld_line_pos > 0:
        tr_start = xml.rfind('<w:tr ', 0, fld_line_pos)
        if tr_start < 0: tr_start = xml.rfind('<w:tr>', 0, fld_line_pos)
        tr_end_tag = xml.find('</w:tr>', fld_line_pos)
        tr_end = tr_end_tag + len('</w:tr>') if tr_end_tag > 0 else -1

        if tr_start > 0 and tr_end > tr_start:
            first_tc = xml.find('<w:tc>', tr_start, tr_end)
            if first_tc < 0: first_tc = xml.find('<w:tc ', tr_start, tr_end)
            first_p = xml.find('<w:p ', first_tc, tr_end)
            if first_p < 0: first_p = xml.find('<w:p>', first_tc, tr_end)
            first_r = xml.find('<w:r>', first_p, tr_end)
            if first_r < 0: first_r = xml.find('<w:r ', first_p, tr_end)

            if first_r > 0:
                run = make_run('{#items}')
                xml = xml[:first_r] + run + xml[first_r:]
                tr_end += len(run)
                last_p_end = xml.rfind('</w:p>', tr_start, tr_end)
                if last_p_end > 0:
                    xml = xml[:last_p_end] + make_run('{/items}') + xml[last_p_end:]
                    print('  + {#items} / {/items} added to data row')
    else:
        print('  ! {rowNum} not found')

    # Step 4: Notes before "תוקף ההצעה"
    print('\nStep 4: Notes placeholder')
    tokef_pos = xml.find('תוקף ההצעה')
    if tokef_pos > 0:
        p_start = xml.rfind('<w:p ', 0, tokef_pos)
        if p_start < 0: p_start = xml.rfind('<w:p>', 0, tokef_pos)
        if p_start > 0:
            notes_para = ('<w:p><w:pPr><w:bidi/><w:jc w:val="start"/></w:pPr>'
                          + make_run('{notes}') + '</w:p>')
            xml = xml[:p_start] + notes_para + xml[p_start:]
            print('  + {notes} added before validity section')
    else:
        print('  ! "תוקף ההצעה" not found')

    # Write output
    output_buf = io.BytesIO()
    with zipfile.ZipFile(output_buf, 'w') as zout:
        for info in file_infos.values():
            new_info = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            new_info.compress_type = info.compress_type
            new_info.external_attr = info.external_attr
            if info.filename == 'word/document.xml':
                zout.writestr(new_info, xml.encode('utf-8'))
            else:
                zout.writestr(new_info, file_data[info.filename])

    with open(output_path, 'wb') as f:
        f.write(output_buf.getvalue())

    # Verify
    print(f'\nOutput: {output_path} ({len(output_buf.getvalue()):,} bytes)')
    with zipfile.ZipFile(output_path, 'r') as zf:
        final_xml = zf.read('word/document.xml').decode('utf-8')
        expected = ['{quoteNumber}', '{quoteDate}', '{customerName}', '{contactTitle}',
                    '{customerAddress}', '{customerCity}', '{customerPhone}', '{customerEmail}',
                    '{approverName}', '{discountPercent}', '{subtotalAfterDiscount}',
                    '{vat}', '{total}', '{paymentTerms}', '{validityDate}', '{notes}',
                    '{#items}', '{/items}', '{rowNum}', '{code}', '{name}', '{quantity}',
                    '{unitPrice}', '{discountPct}', '{lineTotal}']
        missing = [p for p in expected if p not in final_xml]
        print(f'Placeholders: {len(expected)-len(missing)}/{len(expected)}')
        if missing:
            print(f'MISSING: {missing}')
        else:
            print('All present!')


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(f'Usage: {sys.argv[0]} <input.docx> <output.docx>')
        sys.exit(1)
    build_template(sys.argv[1], sys.argv[2])
