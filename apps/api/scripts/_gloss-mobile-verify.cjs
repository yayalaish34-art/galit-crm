/** אימות חי: הכפתור והתיבה שרדו את וורדפרס, וה-CSS מקפל 5 בטלפון. */
const {wp}=require('./_wp-lib.cjs');
const CATEGORY=[3723,3725,3727,3729,3731,3733,3735,3737,3739,3741];
(async()=>{
  const {site,auth}=await wp();
  let bad=0;
  for(const id of CATEGORY){
    const r=await fetch(`${site}/wp-json/wp/v2/pages/${id}?context=edit`,{headers:{Authorization:auth}});
    const p=await r.json();
    const live=await fetch(decodeURIComponent(p.link));
    const h=await live.text();
    const cb=(h.match(/class="galit-gloss__more-cb"/g)||[]).length;
    const lb=(h.match(/class="galit-gloss__more"/g)||[]).length;
    const rule=h.includes('.galit-gloss__grid>.galit-gloss__item:nth-of-type(n+6)');
    const checked=h.includes('.galit-gloss__more-cb:checked~.galit-gloss__grid>.galit-gloss__item');
    const media=h.includes('@media(max-width:819px)');
    const label=(h.match(/הצג עוד (\d+) מונחים/)||[])[1]||'-';
    const ok=cb===1&&lb===1&&rule&&checked&&media;
    if(!ok)bad++;
    console.log(`${id} ${String(p.title.raw).trim().padEnd(13)} input=${cb} label=${lb} hideRule=${rule?'Y':'N'} expandRule=${checked?'Y':'N'} media=${media?'Y':'N'} "+${label}"  ${ok?'OK':'<-- FAIL'}`);
  }
  console.log(bad?`\n${bad} pages FAILED`:'\nall 10 pages OK');
  process.exit(bad?1:0);
})().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
