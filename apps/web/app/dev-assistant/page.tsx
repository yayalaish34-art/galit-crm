'use client';

import { useState } from 'react';

export default function DevAssistantPage() {
  const [task, setTask] = useState('');
  const [generatedInstruction, setGeneratedInstruction] = useState('');
  const [claudeResponse, setClaudeResponse] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [expectedResult, setExpectedResult] = useState('');
  const [fixInstruction, setFixInstruction] = useState('');

  // Agent run state
  const [agentStatus, setAgentStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [agentOutput, setAgentOutput] = useState('');
  const [agentError, setAgentError] = useState('');
  const [agentExitCode, setAgentExitCode] = useState<number | null>(null);
  const [agentElapsed, setAgentElapsed] = useState(0);

  const runAgent = async (dryRun: boolean) => {
    if (!task.trim() || agentStatus === 'running') return;
    const trimmed = task.trim();
    if (trimmed.length > 2000) {
      setAgentError('המשימה ארוכה מדי (מקסימום 2000 תווים)');
      setAgentStatus('error');
      return;
    }

    setAgentStatus('running');
    setAgentOutput('');
    setAgentError('');
    setAgentExitCode(null);
    setAgentElapsed(0);

    const startTime = Date.now();
    const timer = setInterval(() => {
      setAgentElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      const res = await fetch('/api/dev-agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: trimmed, dryRun }),
      });
      const data = await res.json();
      setAgentOutput(data.stdout || '');
      setAgentError(data.stderr || data.error || '');
      setAgentExitCode(data.exitCode ?? -1);
      setAgentStatus(data.status === 'success' ? 'success' : 'error');
    } catch (err: any) {
      setAgentError(err.message || 'שגיאת תקשורת');
      setAgentStatus('error');
    } finally {
      clearInterval(timer);
    }
  };

  const handleGenerateInstruction = () => {
    if (!task.trim()) return;
    const t = task.trim();
    const lower = t.toLowerCase();

    // Auto-detect UI task
    const uiKeywords = ['עיצוב', 'ui', 'מסך', 'כפתור', 'פונט', 'צבע', 'rtl', 'layout', 'css', 'סטייל', 'גודל', 'רוחב', 'גובה', 'מרווח', 'ריווח', 'טקסט', 'אייקון'];
    const isUI = uiKeywords.some((kw) => lower.includes(kw));

    // Auto-detect bug/fix task
    const bugKeywords = ['שגיאה', 'build', 'console', 'error', 'bug', 'באג', 'קריסה', 'crash', 'לא עובד', 'נשבר', 'תקלה', 'warning', 'typescript', 'lint'];
    const isBug = bugKeywords.some((kw) => lower.includes(kw));

    // Build structured instruction
    const sections: string[] = [];

    // 1. כלל קשיח
    let strict = `1. כלל קשיח:\n- לא לגעת בשום דבר מחוץ למשימה הזו.\n- לא ריפקטור.\n- אם משהו לא ברור — לעצור ולשאול.`;
    if (isUI) {
      strict += `\n- זו משימת UI בלבד — לא לשנות לוגיקה, API או מבנה נתונים.\n- לא לגעת בשרת / API.\n- רק UI / Layout למסך הזה.`;
    }
    if (isBug) {
      strict += `\n- זו משימת תיקון בלבד — לא לשנות עיצוב, לא להוסיף פיצ׳רים.\n- לתקן רק את הבאג הספציפי שמתואר.`;
    }
    sections.push(strict);

    // 2. רקע קצר
    sections.push(`2. רקע:\nמדובר במערכת CRM בעברית (RTL), בנויה ב-Next.js. הקבצים הרלוונטיים נמצאים ב-apps/web/app/.`);

    // 3. המשימה המדויקת
    sections.push(`3. המשימה המדויקת:\n${t}`);

    // 4. מה לבצע בפועל
    let actions = `4. מה לבצע בפועל:\n- לבצע את המשימה כפי שמתוארת למעלה.`;
    if (isUI) {
      actions += `\n- לשנות רק קבצי UI (tsx/css).\n- לוודא שהעיצוב נראה טוב ב-RTL.`;
    }
    if (isBug) {
      actions += `\n- לזהות את מקור השגיאה.\n- לתקן בצורה מינימלית וממוקדת.`;
    }
    sections.push(actions);

    // 5. מה אסור לעשות
    let forbidden = `5. מה אסור לעשות:\n- לא לשנות קבצים שלא קשורים למשימה.\n- לא ריפקטור כללי.`;
    if (isUI) {
      forbidden += `\n- לא לשנות לוגיקה עסקית.\n- לא לגעת ב-API או בשרת.\n- לא לשנות מבנה נתונים.`;
    }
    if (isBug) {
      forbidden += `\n- לא לשנות עיצוב או UI.\n- לא להוסיף פיצ׳רים חדשים.`;
    }
    sections.push(forbidden);

    // 6. בדיקות חובה
    let checks = `6. בדיקות חובה:\n- לוודא שאין שגיאות TypeScript.\n- לוודא שה-build עובר.`;
    if (isUI) {
      checks += `\n- לוודא שהמסך נראה נכון ב-RTL.\n- לוודא שהפונטים קריאים וגדולים.`;
    }
    if (isBug) {
      checks += `\n- לוודא שהשגיאה נפתרה.\n- לוודא שלא נוצרו שגיאות חדשות.`;
    }
    sections.push(checks);

    // 7. מה להחזיר בסיום
    sections.push(`7. מה להחזיר בסיום:\n- איזה קובץ/קבצים שינית.\n- צילום מסך של התוצאה.\n- מה בדיוק שינית לעומת המצב הקודם.\n- אישור שאין שגיאות build.`);

    setGeneratedInstruction(sections.join('\n\n'));
  };

  const handleScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setScreenshot(file);
      const reader = new FileReader();
      reader.onload = (ev) => setScreenshotPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleCheckAndFix = () => {
    if (!claudeResponse.trim()) return;
    const resp = claudeResponse.trim();
    const t = task.trim();
    const expected = expectedResult.trim();
    const sections: string[] = [];

    // 1. מה ביקשתי במקור
    sections.push(`1. מה ביקשתי במקור:\n${t || '[לא הוזנה משימה]'}`);

    // 2. מה ציפיתי לראות
    sections.push(`2. מה ציפיתי לראות:\n${expected || '[לא הוזנו ציפיות — בדוק מול המשימה המקורית]'}`);

    // 3. מה קלוד טען שביצע
    sections.push(`3. מה קלוד טען שביצע:\n${resp.slice(0, 600)}${resp.length > 600 ? '...' : ''}`);

    // 4. מה כנראה עדיין לא תקין
    let issues = `4. מה כנראה עדיין לא תקין:`;
    if (screenshotPreview) {
      issues += `\nצילום מסך צורף — בדוק מול צילום המסך שהועלה וזהה פערים בין התוצאה למה שמתואר בסעיפים 1 ו-2.`;
    }
    issues += `\n[תאר כאן מה לא עובד או לא תואם לציפיות]`;
    sections.push(issues);

    // 5. הוראת תיקון מדויקת
    sections.push(`5. הוראת תיקון מדויקת:\n[תאר כאן בדיוק מה צריך לשנות]\n[ציין שמות קבצים אם ידועים]`);

    // 6. מה אסור לשנות
    sections.push(`6. מה אסור לשנות:\n- לא לגעת בשום דבר מחוץ לתיקון.\n- לא לשנות לוגיקה עסקית.\n- לא ריפקטור.\n- לא להוסיף פיצ׳רים חדשים.\n- רק לתקן את מה שמתואר בסעיף 5.`);

    // 7. מה להחזיר בסיום
    sections.push(`7. מה להחזיר בסיום:\n- מה תיקנת ובאיזה קובץ.\n- צילום מסך של התוצאה המתוקנת.\n- מה שינית לעומת המצב הקודם.\n- אישור שאין שגיאות build.`);

    setFixInstruction(sections.join('\n\n'));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div style={{ direction: 'rtl', minHeight: '100vh', background: '#f1f5f9', padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg, #2563eb, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </div>
        <div>
          <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#1e293b', margin: 0 }}>עוזר פיתוח</h1>
          <p style={{ fontSize: '20px', color: '#64748b', margin: 0 }}>ניהול משימות פיתוח מול Claude</p>
        </div>
        <a href="/dashboard" style={{ marginRight: 'auto', fontSize: '20px', fontWeight: 700, color: '#2563eb', textDecoration: 'none', padding: '10px 24px', borderRadius: '12px', border: '2px solid #2563eb', background: 'white' }}>
          חזרה לדשבורד
        </a>
      </div>

      {/* Step 1: Task Input */}
      <div style={{ background: 'white', borderRadius: '20px', padding: '28px', marginBottom: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '22px', fontWeight: 800, color: '#2563eb' }}>1</span>
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#1e293b', margin: 0 }}>מה המשימה?</h2>
        </div>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="תאר את המשימה שאתה רוצה שקלוד יבצע...&#10;&#10;לדוגמה: להגדיל את הפונטים בשלב שיחה, לשנות צבעים, להוסיף כפתור חדש..."
          style={{
            width: '100%',
            minHeight: '180px',
            borderRadius: '16px',
            border: '2px solid #e2e8f0',
            padding: '20px',
            fontSize: '24px',
            fontWeight: 600,
            lineHeight: 1.8,
            resize: 'vertical',
            outline: 'none',
            direction: 'rtl',
            fontFamily: 'inherit',
            color: '#1e293b',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => (e.target.style.borderColor = '#2563eb')}
          onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
        />
        <button
          onClick={handleGenerateInstruction}
          disabled={!task.trim()}
          style={{
            marginTop: '16px',
            padding: '16px 40px',
            borderRadius: '14px',
            border: 'none',
            background: task.trim() ? 'linear-gradient(135deg, #2563eb, #2563eb)' : '#cbd5e1',
            color: 'white',
            fontSize: '24px',
            fontWeight: 800,
            cursor: task.trim() ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            transition: 'all 0.2s',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          צור הוראה לקלוד
        </button>
      </div>

      {/* Step 1 Result */}
      {generatedInstruction && (
        <div style={{ background: '#eff6ff', borderRadius: '20px', padding: '28px', marginBottom: '20px', border: '2px solid #93c5fd' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '24px', fontWeight: 800, color: '#2563eb', margin: 0 }}>הוראה מוכנה להעתקה:</h3>
            <button
              onClick={() => copyToClipboard(generatedInstruction)}
              style={{ padding: '10px 24px', borderRadius: '10px', border: '2px solid #2563eb', background: 'white', color: '#2563eb', fontSize: '20px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              העתק
            </button>
          </div>
          <pre style={{
            background: 'white',
            borderRadius: '14px',
            padding: '24px',
            fontSize: '22px',
            fontWeight: 600,
            lineHeight: 1.8,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: '#1e293b',
            border: '1px solid #bfdbfe',
            margin: 0,
            fontFamily: 'inherit',
            direction: 'rtl',
          }}>
            {generatedInstruction}
          </pre>
        </div>
      )}

      {/* Step 1.5: Expected Result */}
      <div style={{ background: 'white', borderRadius: '20px', padding: '28px', marginBottom: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#1e293b', margin: 0 }}>מה רציתי לקבל?</h2>
          <span style={{ fontSize: '18px', fontWeight: 600, color: '#94a3b8' }}>(ציפיות מהתוצאה)</span>
        </div>
        <textarea
          value={expectedResult}
          onChange={(e) => setExpectedResult(e.target.value)}
          placeholder="תאר מה ציפית לראות בתוצאה...&#10;&#10;לדוגמה: הפונטים צריכים להיות 32px, הכפתורים עגולים, הכותרת בצד ימין..."
          style={{
            width: '100%',
            minHeight: '140px',
            borderRadius: '16px',
            border: '2px solid #e2e8f0',
            padding: '20px',
            fontSize: '24px',
            fontWeight: 600,
            lineHeight: 1.8,
            resize: 'vertical',
            outline: 'none',
            direction: 'rtl',
            fontFamily: 'inherit',
            color: '#1e293b',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => (e.target.style.borderColor = '#d97706')}
          onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
        />
      </div>

      {/* Step 2: Claude Response */}
      <div style={{ background: 'white', borderRadius: '20px', padding: '28px', marginBottom: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '22px', fontWeight: 800, color: '#2563eb' }}>2</span>
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#1e293b', margin: 0 }}>הדבק כאן את תשובת קלוד</h2>
        </div>
        <textarea
          value={claudeResponse}
          onChange={(e) => setClaudeResponse(e.target.value)}
          placeholder="העתק והדבק כאן את התשובה שקיבלת מקלוד..."
          style={{
            width: '100%',
            minHeight: '180px',
            borderRadius: '16px',
            border: '2px solid #e2e8f0',
            padding: '20px',
            fontSize: '24px',
            fontWeight: 600,
            lineHeight: 1.8,
            resize: 'vertical',
            outline: 'none',
            direction: 'rtl',
            fontFamily: 'inherit',
            color: '#1e293b',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => (e.target.style.borderColor = '#2563eb')}
          onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
        />

        {/* Screenshot Upload */}
        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <label style={{
            padding: '14px 28px',
            borderRadius: '14px',
            border: '2px dashed #94a3b8',
            background: '#f8fafc',
            color: '#475569',
            fontSize: '22px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            transition: 'all 0.2s',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
            העלה צילום מסך
            <input type="file" accept="image/*" onChange={handleScreenshot} style={{ display: 'none' }} />
          </label>
          {screenshot && (
            <span style={{ fontSize: '20px', fontWeight: 600, color: '#22c55e', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              {screenshot.name}
            </span>
          )}
        </div>

        {/* Screenshot Preview */}
        {screenshotPreview && (
          <div style={{ marginTop: '16px', borderRadius: '14px', overflow: 'hidden', border: '1px solid #e2e8f0', maxHeight: '300px' }}>
            <img src={screenshotPreview} alt="צילום מסך" style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', background: '#f8fafc' }} />
          </div>
        )}

        <button
          onClick={handleCheckAndFix}
          disabled={!claudeResponse.trim()}
          style={{
            marginTop: '16px',
            padding: '16px 40px',
            borderRadius: '14px',
            border: 'none',
            background: claudeResponse.trim() ? 'linear-gradient(135deg, #2563eb, #2563eb)' : '#cbd5e1',
            color: 'white',
            fontSize: '24px',
            fontWeight: 800,
            cursor: claudeResponse.trim() ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            transition: 'all 0.2s',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          בדוק ותן תיקון
        </button>
      </div>

      {/* Step 2 Result */}
      {fixInstruction && (
        <div style={{ background: '#eff6ff', borderRadius: '20px', padding: '28px', marginBottom: '20px', border: '2px solid #93c5fd' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '24px', fontWeight: 800, color: '#2563eb', margin: 0 }}>הוראת תיקון מוכנה:</h3>
            <button
              onClick={() => copyToClipboard(fixInstruction)}
              style={{ padding: '10px 24px', borderRadius: '10px', border: '2px solid #2563eb', background: 'white', color: '#2563eb', fontSize: '20px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              העתק
            </button>
          </div>
          <pre style={{
            background: 'white',
            borderRadius: '14px',
            padding: '24px',
            fontSize: '22px',
            fontWeight: 600,
            lineHeight: 1.8,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: '#1e293b',
            border: '1px solid #bfdbfe',
            margin: 0,
            fontFamily: 'inherit',
            direction: 'rtl',
          }}>
            {fixInstruction}
          </pre>
        </div>
      )}
      {/* Dev Agent Section */}
      <div style={{ background: 'white', borderRadius: '20px', padding: '28px', marginBottom: '20px', border: '2px solid #22c55e', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(135deg, #16a34a, #22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="m9 9 6 6"/><path d="m15 9-6 6"/></svg>
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#1e293b', margin: 0 }}>סוכן פיתוח אוטומטי</h2>
          {agentStatus === 'running' && (
            <span style={{ fontSize: '20px', fontWeight: 700, color: '#2563eb', marginRight: '8px' }}>
              הסוכן עובד... ({agentElapsed}s)
            </span>
          )}
        </div>
        <p style={{ fontSize: '22px', fontWeight: 600, color: '#475569', lineHeight: 1.8, margin: '0 0 20px' }}>
          הסוכן משתמש במשימה שכתבת למעלה, יוצר branch חדש, מריץ Claude Code, בודק שגיאות, ומתקן עד 3 פעמים.
        </p>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <button
            onClick={() => runAgent(false)}
            disabled={!task.trim() || agentStatus === 'running'}
            style={{
              padding: '16px 40px',
              borderRadius: '14px',
              border: 'none',
              background: !task.trim() || agentStatus === 'running' ? '#cbd5e1' : 'linear-gradient(135deg, #16a34a, #22c55e)',
              color: 'white',
              fontSize: '24px',
              fontWeight: 800,
              cursor: !task.trim() || agentStatus === 'running' ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              transition: 'all 0.2s',
            }}
          >
            {agentStatus === 'running' ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'agent-spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            )}
            הפעל סוכן אוטומטי
          </button>
          <button
            onClick={() => runAgent(true)}
            disabled={!task.trim() || agentStatus === 'running'}
            style={{
              padding: '16px 40px',
              borderRadius: '14px',
              border: '2px solid #16a34a',
              background: !task.trim() || agentStatus === 'running' ? '#f1f5f9' : 'white',
              color: !task.trim() || agentStatus === 'running' ? '#94a3b8' : '#16a34a',
              fontSize: '24px',
              fontWeight: 800,
              cursor: !task.trim() || agentStatus === 'running' ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              transition: 'all 0.2s',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            הפעל בדיקה בלבד (Dry Run)
          </button>
        </div>

        <div style={{ padding: '14px 20px', background: '#fef3c7', borderRadius: '12px', border: '1px solid #fcd34d', marginBottom: '16px' }}>
          <span style={{ fontSize: '20px', fontWeight: 700, color: '#92400e' }}>
            ודא שאין שינויים לא שמורים ב-git לפני הרצה. המשימה נלקחת מהשדה למעלה.
          </span>
        </div>

        {/* Agent Output */}
        {agentStatus !== 'idle' && agentStatus !== 'running' && (
          <div style={{ marginTop: '4px' }}>
            {/* Status badge */}
            <div style={{
              padding: '16px 24px',
              borderRadius: '14px',
              marginBottom: '16px',
              background: agentStatus === 'success' ? '#f0fdf4' : '#fef2f2',
              border: `2px solid ${agentStatus === 'success' ? '#86efac' : '#fecaca'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: agentStatus === 'success' ? '#22c55e' : '#ef4444' }} />
              <span style={{ fontSize: '24px', fontWeight: 800, color: agentStatus === 'success' ? '#166534' : '#991b1b' }}>
                {agentStatus === 'success' ? 'הסוכן סיים בהצלחה' : 'הסוכן נכשל'}
              </span>
              {agentExitCode !== null && (
                <span style={{ fontSize: '18px', fontWeight: 600, color: '#64748b', marginRight: 'auto' }}>
                  exit code: {agentExitCode}
                </span>
              )}
            </div>

            {/* stdout */}
            {agentOutput && (
              <>
                <h3 style={{ fontSize: '22px', fontWeight: 800, color: '#1e293b', margin: '0 0 8px' }}>פלט:</h3>
                <pre style={{
                  background: '#0f172a',
                  borderRadius: '14px',
                  padding: '24px',
                  fontSize: '18px',
                  fontWeight: 500,
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: '#e2e8f0',
                  margin: '0 0 16px',
                  fontFamily: "'Courier New', Courier, monospace",
                  direction: 'ltr',
                  textAlign: 'left',
                  maxHeight: '500px',
                  overflow: 'auto',
                }}>
                  {agentOutput}
                </pre>
              </>
            )}

            {/* stderr / error */}
            {agentError && (
              <>
                <h3 style={{ fontSize: '22px', fontWeight: 800, color: '#ef4444', margin: '0 0 8px' }}>שגיאות:</h3>
                <pre style={{
                  background: '#fef2f2',
                  borderRadius: '14px',
                  padding: '24px',
                  fontSize: '18px',
                  fontWeight: 500,
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: '#991b1b',
                  margin: 0,
                  fontFamily: "'Courier New', Courier, monospace",
                  direction: 'ltr',
                  textAlign: 'left',
                  maxHeight: '300px',
                  overflow: 'auto',
                  border: '1px solid #fecaca',
                }}>
                  {agentError}
                </pre>
              </>
            )}
          </div>
        )}

        {/* Running indicator */}
        {agentStatus === 'running' && (
          <div style={{
            padding: '24px',
            borderRadius: '14px',
            background: '#eff6ff',
            border: '2px solid #93c5fd',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}>
            <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#2563eb', animation: 'agent-pulse 1.5s ease-in-out infinite' }} />
            <span style={{ fontSize: '24px', fontWeight: 700, color: '#1d4ed8' }}>
              הסוכן עובד... ({agentElapsed} שניות)
            </span>
          </div>
        )}
      </div>

      {/* Terminal instructions (collapsed) */}
      <details style={{ background: 'white', borderRadius: '20px', padding: '20px 28px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
        <summary style={{ fontSize: '22px', fontWeight: 700, color: '#64748b', cursor: 'pointer' }}>
          הפעלה מהטרמינל (מתקדם)
        </summary>
        <div style={{ background: '#0f172a', borderRadius: '14px', padding: '24px', direction: 'ltr', textAlign: 'left', marginTop: '16px' }}>
          <pre style={{ margin: 0, fontSize: '18px', fontWeight: 600, lineHeight: 2.0, color: '#e2e8f0', fontFamily: "'Courier New', Courier, monospace", whiteSpace: 'pre-wrap' }}>
{`cd agents\\dev-agent
npm install
npm run agent:dry -- "המשימה שלך"
npm run agent -- "המשימה שלך"`}
          </pre>
        </div>
      </details>

      {/* CSS animations */}
      <style>{`
        @keyframes agent-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes agent-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
