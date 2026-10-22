// האם ה-POST בכלל מעובד כהתחברות? השוואת HTML גולמי מול טעינה רגילה. לא מחייג.
const BASE = 'https://pbx.cloudplus.co.il';
const USER = process.env.CLOUDPLUS_USER || '';
const PASS = process.env.CLOUDPLUS_PASS || '';
const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
};
const cookies = (r) => (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]);
const lines = (h) => h.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

async function login(pass, label, browser) {
  const h = browser ? BROWSER : {};
  const g = await fetch(`${BASE}/index.php`, { headers: h,