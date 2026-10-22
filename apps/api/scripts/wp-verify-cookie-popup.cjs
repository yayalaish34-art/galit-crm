const fs = require('node:fs');
const path = require('node:path');
const { wp } = require('./_wp-lib.cjs');

const popupId = 16671;
const output = path.resolve(__dirname, '../../../../wp-backups/cookie-popup-16671');

async function main() {
  const { site, auth } = await wp();
  const request = async (pathname, method = 'GET', body) => {
    const response = await fetch(`${site}/wp-json${pathname}`, {
      method,
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${pathname}: HTTP ${response.status} ${text.slice(0, 200)}`);
    return { status: response.status, data: text ? JSON.parse(text) : null };
  };
  fs.mkdirSync(output, { recursive: true });
  const before = (await request(`/wp/v2/elementor_library/${popupId}?context=edit`)).data;
  const activate = process.argv.includes('--activate');
  const fixConsent = process.argv.includes('--fix-consent');
  const refresh = process.argv.includes('--refresh') || activate || fixConsent;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(output, `${stamp}-popup.json`), JSON.stringify(before, null, 2));
  if (activate) {
    await request(`/wp/v2/elementor_library/${popupId}`, 'POST', { meta: { _elementor_edit_mode: 'builder' } });
    console.log('Enabled Elementor builder rendering for popup', popupId);
  }
  if (fixConsent) {
    const tree = JSON.parse(before.meta._elementor_data);
    let replaced = 0;
    const script = fs.readFileSync(path.join(__dirname, 'cookie-popup-consent.js'), 'utf8');
    new (require('node:vm').Script)(script);
    function walk(elements) {
      for (const element of elements) {
        if (element.widgetType === 'html' && element.settings.html.includes('galit-cookie-accept')) {
          element.settings.html = element.settings.html.replace(/<script>[\s\S]*?<\/script>/, '<script>\n' + script + '\n</script>');
          replaced++;
        }
        if (element.elements) walk(element.elements);
      }
    }
    walk(tree);
    if (replaced !== 1) throw new Error('Expected exactly one cookie popup HTML widget.');
    const data = JSON.stringify(tree);
    await request(`/wp/v2/elementor_library/${popupId}`, 'POST', { meta: { _elementor_data: data } });
    before.meta._elementor_data = data;
    console.log('Updated CookieYes choice detection and popup lifecycle.');
  }
  if (refresh) {
    if (before.status !== 'publish') throw new Error('Popup is not published; inspect before changing it.');
    const result = await request('/elementor/v1/cache', 'DELETE');
    console.log('Elementor cache refresh:', JSON.stringify(result));
  }
  const popup = refresh ? (await request(`/wp/v2/elementor_library/${popupId}?context=edit`)).data : before;
  if (activate) before.meta._elementor_edit_mode = 'builder';
  if (refresh && JSON.stringify(before.meta) !== JSON.stringify(popup.meta)) {
    throw new Error('Popup metadata changed during cache refresh; review the saved snapshot.');
  }
  console.log(JSON.stringify({ site, id: popup.id, status: popup.status, modified: popup.modified,
    title: popup.title, meta: Object.fromEntries(Object.entries(popup.meta).filter(([key]) => key.startsWith('_elementor') && key !== '_elementor_data')) }, null, 2));
  if (process.argv.includes('--diagnose')) {
    const root = (await request('')).data;
    const routes = Object.fromEntries(Object.entries(root.routes).filter(([key]) => /elementor.*(document|popup|condition)|\/wp\/v2\/elementor_library\//i.test(key)));
    fs.writeFileSync(path.join(output, 'routes.json'), JSON.stringify(routes, null, 2));
    console.log('Relevant routes:', Object.keys(routes));
    for (const endpoint of ['/elementor/v1/documents/16671', '/wp/v2/elementor_library?per_page=30&context=edit', '/wp/v2/taxonomies']) {
      try {
        const result = await request(endpoint);
        fs.writeFileSync(path.join(output, endpoint.includes('taxonomies') ? 'taxonomies.json' : endpoint.includes('?') ? 'templates.json' : 'document.json'), JSON.stringify(result.data, null, 2));
        console.log(endpoint, result.status, Array.isArray(result.data) ? result.data.map(p => ({id:p.id,title:p.title?.raw,type:p.meta?._elementor_template_type,editMode:p.meta?._elementor_edit_mode,conditions:p.meta?._elementor_conditions,settings:p.meta?._elementor_page_settings})) : Object.keys(result.data));
      } catch (error) { console.log(error.message); }
    }
  }
  const response = await fetch(`${site}/?popup_check=${Date.now()}`, { signal: AbortSignal.timeout(30000) });
  const html = await response.text();
  fs.writeFileSync(path.join(output, 'homepage.html'), html);
  console.log('Homepage:', JSON.stringify({ status: response.status, length: html.length,
    popupReference: html.includes(String(popupId)), cookieYes: /cookieyes|cookie-law-info/i.test(html) }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
