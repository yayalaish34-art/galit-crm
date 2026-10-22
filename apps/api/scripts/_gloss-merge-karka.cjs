/**
 * מאחד את מונחי המילון של עמודי השירות "קרקע מזוהמת" לתוך מילון קטגוריית קרקע (3735),
 * ואז מסיר את המילון מעמודי השירות. המילון חי רק בעמודי הקטגוריה.
 * הרצה: node -r dotenv/config scripts/_gloss-merge-karka.cjs [--apply]
 */
const {wp}=require('./_wp-lib.cjs');
const fs=require('fs');
const APPLY=process.argv.includes('--apply');
const CATEGORY=3735;
const SERVICE=[6540,6544];

function items(html){
  return [...html.matchAll(/<details class="galit-gloss__item">[\s\S]*?<\/details>/g)].map(m=>m[0]);
}
function termOf(item){
  const m=item.match(/<span class="galit-gloss__term">([\s\S]*?)<\/span>/);
  return m?m[1].replace(/<[^>]*>/g,'').trim():'';
}
/** מיישר לסגנון עמוד הקטגוריה: שורה אחת, בלי רווחי מבנה מיותרים */
function tidy(item){
  return item.replace(/>\s+</g,'><').replace(/[ \t]+/g,' ').trim();
}
/** מאתר את ווידג'ט ה-HTML שמכיל את המילון בעץ של Elementor */
function findGlossWidget(node,out=[]){
  if(Array.isArray(node)){for(const n of node) findGlossWidget(n,out);return out;}
  if(node&&typeof node==='object'){
    if(node.widgetType==='html'&&typeof node.settings?.html==='string'&&node.settings.html.includes('galit-gloss')) out.push(node);
    if(Array.isArray(node.elements)) findGlossWidget(node.elements,out);
  }
  return out;
}

(async()=>{
  const {site,auth}=await wp();
  const get=async id=>{
    const r=await fetch(`${site}/wp-json/wp/v2/pages/${id}?context=edit`,{headers:{Authorization:auth}});
    if(!r.ok) throw new Error(`GET ${id} -> ${r.status}`);
    return r.json();
  };

  const cat=await get(CATEGORY);
  const catRawMeta=String(cat.meta._elementor_data||'');
  const tree=JSON.parse(catRawMeta);
  const widgets=findGlossWidget(tree);
  if(widgets.length!==1) throw new Error(`ציפיתי לווידג'ט מילון אחד בעמוד ${CATEGORY}, נמצאו ${widgets.length}`);
  const w=widgets[0];
  let html=w.settings.html;
  const catTerms=new Set(items(html).map(termOf));
  console.log(`category ${CATEGORY} "${cat.title.raw.trim()}" - ${catTerms.size} terms`);

  const incoming=[];
  const seen=new Set(catTerms);
  const serviceRaw={};
  for(const id of SERVICE){
    const p=await get(id);
    const raw=String(p.content.raw||'');
    serviceRaw[id]=raw;
    for(const it of items(raw)){
      const t=termOf(it);
      if(!t||seen.has(t)) continue;
      seen.add(t);
      incoming.push({from:id,term:t,html:tidy(it)});
    }
  }
  console.log(`\nterms to merge into ${CATEGORY}: ${incoming.length}`);
  for(const x of incoming) console.log(`   [${x.from}] ${x.term}`);

  const MARK='</details></div></section>';
  if(!html.includes(MARK)) throw new Error('לא נמצא סוף רשת המילון בעמוד הקטגוריה');
  html=html.replace(MARK,'</details>'+incoming.map(x=>x.html).join('')+'</div></section>');
  const total=catTerms.size+incoming.length;
  const before=html;
  html=html.replace(/<span class="galit-gloss__count">\d+ מונחים<\/span>/,`<span class="galit-gloss__count">${total} מונחים</span>`);
  if(before===html) throw new Error('לא עודכן מונה המונחים');
  if(items(html).length!==total) throw new Error(`ספירת פריטים לא תואמת: ${items(html).length} != ${total}`);
  w.settings.html=html;
  const nextMeta=JSON.stringify(tree);
  JSON.parse(nextMeta);
  console.log(`\nmeta ${catRawMeta.length} -> ${nextMeta.length} bytes, items ${catTerms.size} -> ${total}`);

  fs.writeFileSync(`scripts/_gloss-merge-backup-${CATEGORY}.json`,
    JSON.stringify({when:new Date().toISOString(),category:{id:CATEGORY,meta:catRawMeta},services:serviceRaw},null,2),'utf8');
  console.log('backup -> scripts/_gloss-merge-backup-'+CATEGORY+'.json');

  if(!APPLY){console.log('\nDRY RUN - הרץ עם --apply כדי לכתוב');return;}

  let res=await fetch(`${site}/wp-json/wp/v2/pages/${CATEGORY}`,{method:'POST',
    headers:{Authorization:auth,'Content-Type':'application/json'},
    body:JSON.stringify({meta:{_elementor_data:nextMeta}})});
  console.log(`POST category ${CATEGORY} -> ${res.status}`);
  if(!res.ok) throw new Error(await res.text());

  for(const id of SERVICE){
    const raw=serviceRaw[id];
    const i=raw.indexOf('<section class="galit-gloss"');
    const end=raw.indexOf('</section>',i);
    if(i<0||end<0){console.log(`   ${id}: no glossary section, skipped`);continue;}
    const stripped=(raw.slice(0,i)+raw.slice(end+'</section>'.length)).trim();
    const r2=await fetch(`${site}/wp-json/wp/v2/pages/${id}`,{method:'POST',
      headers:{Authorization:auth,'Content-Type':'application/json'},
      body:JSON.stringify({content:stripped})});
    console.log(`   removed glossary from ${id} -> ${r2.status} (content ${raw.length} -> ${stripped.length})`);
  }

  const cc=await fetch(`${site}/wp-json/elementor/v1/cache`,{method:'DELETE',headers:{Authorization:auth}});
  console.log(`elementor cache clear -> ${cc.status}`);
})().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
