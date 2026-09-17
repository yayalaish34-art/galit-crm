/** אבחון "נסח מחדש": בודק מפתח, מכסה וזמינות המודל שה-AiMailService משתמש בו. */
(async () => {
  const key = process.env.OPENAI_API_KEY;
  console.log('OPENAI_API_KEY present :', !!key, key ? `(${key.slice(0, 7)}…${key.slice(-4)}, len=${key.length})` : '');
  if (!key) return;

  // 1. האם המפתח תקף בכלל
  const models = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  console.log('GET /v1/models        :', models.status, models.ok ? 'OK' : (await models.text()).slice(0, 300));

  // 2. בדיוק הקריאה שהשירות עושה
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'החזר JSON בלבד: {"subject":"בדיקה","body":"בדיקה"}' }],
      temperature: 0.4,
      response_format: { type: 'json_object' },
    }),
  });
  const text = await res.text();
  console.log('POST chat/completions :', res.status);
  console.log(text.slice(0, 600));
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
