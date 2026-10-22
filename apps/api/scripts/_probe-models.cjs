/** אילו מודלים זמינים לניסוח JSON, ומה עלות/זמן. */
(async()=>{
  const key=process.env.OPENAI_API_KEY;
  for(const model of ['gpt-5','gpt-4.1','gpt-4o']){
    const t0=Date.now();
    const body={model,messages:[{role:'system',content:'ענה בעברית'},{role:'user',content:'החזר JSON {"ok":true,"note":"משפט קצר"}'}],response_format:{type:'json_object'}};
    if(!/^gpt-5/.test(model)) body.temperature=0.6;
    const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',
      headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const t=await r.text();
    console.log(`${model}: HTTP ${r.status} ${Date.now()-t0}ms ${t.slice(0,160).replace(/\s+/g,' ')}`);
  }
})();
