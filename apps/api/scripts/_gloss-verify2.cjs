/** אימות מבני: ווידג'ט המילון אחרון בעמוד, אחרי כל ווידג'טי הבלוג, ומונה המונחים נכון. */
const {wp}=require('./_wp-lib.cjs');
const CATEGORY=[3723,3725,3727,3729,3731,3733,3735,3737,3739,3741];
function walk(node,cb){if(Array.isArray(node)){node.forEach(n=>walk(n,cb));return;}
 if(node&&typeof node==='object'){cb(node);if(Array.isArray(node.elements))walk(node.elements,cb);}}
(async()=>{
  const {site,auth}=await wp();
  for(const id of CATEGORY){
    const r=await fetch(`${site}/wp-json/wp/v2/pages/${id}?context=edit`,{headers:{Authorization:auth}});
    const p=await r.json();
    const tree=JSON.parse(String(p.meta._elementor_data||'[]'));
    const ws=[];walk(tree,n=>{if(n.elType==='widget')ws.push(n);});
    const glossIdx=ws.findIndex(n=>n.widgetType==='html'&&String(n.settings?.html||'').includes('galit-gloss'));
    const lastPosts=ws.map((n,i)=>n.widgetType==='posts'?i:-1).filter(i=>i>=0).pop();
    const g=ws[glossIdx];
    const html=String(g.settings.html);
    const body=html.slice(html.indexOf('galit-gloss__grid">'));
    const terms=(body.match(/<details class="galit-gloss__item">/g)||[]).length;
    const badge=(html.match(/galit-gloss__count">(\d+) מונחים/)||[])[1];
    console.log(`${id} ${String(p.title.raw).trim().padEnd(13)} widgets=${ws.length} lastBlog=#${lastPosts} gloss=#${glossIdx} last=${glossIdx===ws.length-1?'YES':'no'} belowBlog=${glossIdx>lastPosts?'YES':'NO'} terms=${terms} badge=${badge} ${String(terms)===badge?'match':'MISMATCH'}`);
  }
})().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
