/** בדיקה: האם המפתח של OpenAI תומך ב-web_search דרך Responses API. */
(async()=>{
  const key=process.env.OPENAI_API_KEY;
  if(!key){console.log('NO OPENAI_API_KEY');return;}
  console.log('key present, len',key.length);
  for(const model of ['gpt-4o','gpt-4.1','gpt-5']){
    try{
      const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',
        headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
        body:JSON.stringify({model,tools:[{type:'web_search'}],
          input:'מהו ראדון? חפש באינטרנט והחזר משפט אחד עם מקור.'})});
      const t=await r.text();
      if(!r.ok){console.log(`${model}: HTTP ${r.status} ${t.slice(0,200)}`);continue;}
      const j=JSON.parse(t);
      const types=(j.output||[]).map(o=>o.type).join(',');
      const txt=(j.output||[]).filter(o=>o.type==='message').flatMap(o=>o.content||[]).map(c=>c.text||'').join(' ');
      const ann=(j.output||[]).filter(o=>o.type==='message').flatMap(o=>o.content||[]).flatMap(c=>c.annotations||[]);
      console.log(`${model}: OK output=[${types}] annotations=${ann.length}`);
      console.log('   text:',txt.slice(0,220));
      for(const a of ann.slice(0,3)) console.log('   src:',a.url||JSON.stringify(a).slice(0,120));
    }catch(e){console.log(`${model}: ERR ${e.message}`);}
  }
})();
