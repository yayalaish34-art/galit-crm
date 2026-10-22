/**
 * בדיקה מקצה-לקצה של הניסוח מבוסס-המקורות, בלי לגעת בוורדפרס.
 * הרצה: npx ts-node -r dotenv/config scripts/_test-blog-research.ts "נושא"
 */
import { BlogResearchService } from '../src/blog/blog-research.service';
import { BlogService } from '../src/blog/blog.service';

const topic = process.argv[2] || 'בדיקת ראדון בבית פרטי — מתי צריך, איך נמדד ומה עושים עם התוצאה';

(async () => {
  const research = new BlogResearchService();

  // בדיקת המסנן: כתובת של מתחרה ושל גלית חייבות ליפול, של רשות חייבת לעבור.
  const filterCases: Array<[string, boolean]> = [
    ['https://www.epa.gov/radon/what-radon', true],
    ['https://www.gov.il/he/departments/ministry_of_environmental_protection', true],
    ['https://www.who.int/news-room/fact-sheets/detail/radon-and-health', true],
    ['https://galit.co.il/radon/', false],
    ['https://radon.co.il/some-page/', false],
    ['javascript:alert(1)', false],
  ];
  console.log('— מסנן דומיינים —');
  let filterOk = true;
  for (const [url, want] of filterCases) {
    const got = research.isAllowed(url);
    if (got !== want) filterOk = false;
    console.log(`  ${got === want ? 'OK  ' : 'FAIL'} ${want ? 'allow' : 'block'}  ${url}`);
  }

  // המרת קישורים לבלוקים של וורדפרס וחזרה.
  const blog = new BlogService({} as any, research);
  const sample = 'לפי [EPA](https://www.epa.gov/radon/what-radon) הגז חודר מהקרקע.\n\n- ראו [WHO](https://who.int/x)';
  const html = blog.textToBlocks(sample);
  const back = blog.blocksToText(html);
  console.log('\n— המרת קישורים —');
  console.log('  anchors in HTML:', (html.match(/<a href="/g) || []).length);
  console.log('  target/rel present:', /rel="noopener noreferrer nofollow"/.test(html));
  console.log('  round-trip keeps links:', (back.match(/\]\(https?:/g) || []).length);
  console.log('  XSS attempt escaped:', !blog.textToBlocks('[x](javascript:alert(1))').includes('<a href'));

  console.log(`\n— מחקר: "${topic}" —`);
  const t0 = Date.now();
  const r = await research.research(topic);
  console.log(`  angles ${r.anglesSucceeded}/${r.anglesTotal}, ${r.sources.length} sources, ${Date.now() - t0}ms`);
  for (const s of r.sources) console.log(`    ${s.publisher.padEnd(28)} ${s.url}`);
  console.log(`  findings: ${r.findings.length} chars`);

  console.log('\n— ניסוח —');
  const t1 = Date.now();
  const draft = await blog.aiDraft({
    topic,
    audience: 'בעלי דירות, ועדי בתים, קבלנים ומנהלי מבנים בישראל',
    tone: 'מקצועי, ענייני ונגיש',
    length: 'long',
    sources: r.sources,
  });
  const words = draft.body.split(/\s+/).filter(Boolean).length;
  const links = [...draft.body.matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g)];
  const domains = new Set(links.map((m) => new URL(m[2]).hostname.replace(/^www\./, '')));
  console.log(`  ${Date.now() - t1}ms — ${words} words, ${links.length} links, ${domains.size} distinct domains`);
  console.log(`  title: ${draft.title}`);
  console.log(`  sources returned: ${draft.sources.length}`);
  const bad = links.filter((m) => !r.sources.some((s) => s.url === m[2]));
  console.log(`  hallucinated links surviving: ${bad.length}${bad.length ? ' <-- BUG' : ''}`);
  console.log(`  has sources section: ${/##\s*מקורות/.test(draft.body)}`);
  console.log('\n----- BODY -----\n');
  console.log(draft.body);

  if (!filterOk) {
    console.error('\nFILTER TEST FAILED');
    process.exit(1);
  }
})().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
