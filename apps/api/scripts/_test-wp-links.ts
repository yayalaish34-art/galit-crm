/**
 * מוודא שקישורים שנוצרו ב-textToBlocks שורדים את וורדפרס — כלומר שהם באמת
 * מגיעים לאתר כתגית <a> ולא מסוננים ע"י kses. יוצר טיוטה, בודק, ומוחק.
 * הרצה: npx ts-node --transpile-only -r dotenv/config scripts/_test-wp-links.ts
 */
import { BlogResearchService } from '../src/blog/blog-research.service';
import { BlogService } from '../src/blog/blog.service';
import { Client } from 'pg';
import * as crypto from 'crypto';

function dec(enc: string): string {
  const [iv, data] = String(enc).split(':');
  const key = crypto.createHash('sha256').update(process.env.JWT_SECRET || '').digest();
  const d = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(iv, 'hex'));
  return Buffer.concat([d.update(Buffer.from(data, 'hex')), d.final()]).toString('utf8');
}

const SAMPLE = [
  '## כותרת בדיקה',
  '',
  'לפי [ארגון הבריאות העולמי](https://www.who.int/news-room/fact-sheets/detail/radon-and-health) הגז חודר מהקרקע.',
  '',
  '- פריט עם [קישור לרשות](https://www.gov.il/he/pages/radon)',
  '- פריט רגיל בלי קישור',
].join('\n');

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query(`SELECT "value" FROM "SystemSetting" WHERE "key"='wordpress'`);
  await c.end();
  const v: any = typeof r.rows[0].value === 'string' ? JSON.parse(r.rows[0].value) : r.rows[0].value;
  const site = String(v.siteUrl).replace(/\/$/, '');
  const auth = 'Basic ' + Buffer.from(`${v.username}:${dec(v.appPasswordEnc)}`).toString('base64');

  const blog = new BlogService({} as any, new BlogResearchService());
  const blocks = blog.textToBlocks(SAMPLE);
  console.log('block markup anchors:', (blocks.match(/<a href="/g) || []).length);

  const create = await fetch(`${site}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'בדיקת קישורים (זמני)', content: blocks, status: 'draft' }),
  });
  const post: any = await create.json();
  if (!create.ok) {
    console.error('create failed:', JSON.stringify(post).slice(0, 300));
    process.exit(1);
  }
  console.log(`created draft post ${post.id} -> HTTP ${create.status}`);

  const read = await fetch(`${site}/wp-json/wp/v2/posts/${post.id}?context=edit`, {
    headers: { Authorization: auth },
  });
  const back: any = await read.json();
  const raw = String(back?.content?.raw || '');
  const rendered = String(back?.content?.rendered || '');
  const hrefs = [...raw.matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1]);

  console.log('anchors stored in WP :', hrefs.length);
  for (const h of hrefs) console.log('   ', h);
  console.log('rel preserved        :', /rel="[^"]*noopener/.test(raw));
  console.log('target preserved     :', /target="_blank"/.test(raw));
  console.log('anchors rendered     :', (rendered.match(/<a /g) || []).length);
  console.log('round-trip to editor :', blog.blocksToText(raw).match(/\]\(https?:/g)?.length || 0);

  const del = await fetch(`${site}/wp-json/wp/v2/posts/${post.id}?force=true`, {
    method: 'DELETE',
    headers: { Authorization: auth },
  });
  console.log(`deleted test post -> HTTP ${del.status}`);

  if (hrefs.length !== 2) {
    console.error('\nFAILED: WordPress did not keep both links');
    process.exit(1);
  }
  console.log('\nOK — links survive WordPress');
})().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
