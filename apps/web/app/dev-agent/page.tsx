'use client';

import { useState } from 'react';

type RunStatus = 'idle' | 'running' | 'success' | 'failed';

interface AgentResult {
  success: boolean;
  output: string;
  error: string;
  durationMs: number;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function DevAgentPage() {
  const [task, setTask] = useState('');
  const [status, setStatus] = useState<RunStatus>('idle');
  const [result, setResult] = useState<AgentResult | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const handleRun = async () => {
    if (!task.trim() || status === 'running') return;

    setStatus('running');
    setResult(null);
    setElapsed(0);

    // Timer to show elapsed time
    const startTime = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      const res = await fetch(`${API}/dev-agent/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: task.trim() }),
      });

      const data: AgentResult = await res.json();
      setResult(data);
      setStatus(data.success ? 'success' : 'failed');
    } catch (err: any) {
      setResult({
        success: false,
        output: '',
        error: err.message || 'שגיאת תקשורת עם השרת',
        durationMs: Date.now() - startTime,
      });
      setStatus('failed');
    } finally {
      clearInterval(timer);
    }
  };

  const statusLabel: Record<RunStatus, string> = {
    idle: 'ממתין למשימה',
    running: `הסוכן רץ... (${elapsed}s)`,
    success: 'הסוכן סיים בהצלחה',
    failed: 'הסוכן נכשל',
  };

  const statusColor: Record<RunStatus, string> = {
    idle: '#64748b',
    running: '#3b82f6',
    success: '#22c55e',
    failed: '#ef4444',
  };

  const statusBg: Record<RunStatus, string> = {
    idle: '#f1f5f9',
    running: '#eff6ff',
    success: '#f0fdf4',
    failed: '#fef2f2',
  };

  return (
    <div style={{ direction: 'rtl', minHeight: '100vh', background: '#f1f5f9', padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg, #059669, #10b981)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="m9 9 6 6"/><path d="m15 9-6 6"/></svg>
        </div>
        <div>
          <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#1e293b', margin: 0 }}>סוכן פיתוח</h1>
          <p style={{ fontSize: '20px', color: '#64748b', margin: 0 }}>הפעלת Claude Code אוטומטית מתוך המערכת</p>
        </div>
        <div style={{ marginRight: 'auto', display: 'flex', gap: '12px' }}>
          <a href="/dev-assistant" style={{ fontSize: '20px', fontWeight: 700, color: '#7c3aed', textDecoration: 'none', padding: '10px 24px', borderRadius: '12px', border: '2px solid #7c3aed', background: 'white' }}>
            עוזר פיתוח
          </a>
          <a href="/dashboard" style={{ fontSize: '20px', fontWeight: 700, color: '#059669', textDecoration: 'none', padding: '10px 24px', borderRadius: '12px', border: '2px solid #059669', background: 'white' }}>
            חזרה לדשבורד
          </a>
        </div>
      </div>

      {/* Task Input */}
      <div style={{ background: 'white', borderRadius: '20px', padding: '28px', marginBottom: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#1e293b', margin: 0 }}>משימת פיתוח</h2>
        </div>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          disabled={status === 'running'}
          placeholder="תאר את משימת הפיתוח שהסוכן צריך לבצע...&#10;&#10;לדוגמה: להגדיל את הפונטים בשלב שיחה ל-32px, לשנות צבע כפתורים..."
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
            opacity: status === 'running' ? 0.6 : 1,
          }}
          onFocus={(e) => (e.target.style.borderColor = '#059669')}
          onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
        />
        <button
          onClick={handleRun}
          disabled={!task.trim() || status === 'running'}
          style={{
            marginTop: '16px',
            padding: '16px 48px',
            borderRadius: '14px',
            border: 'none',
            background: !task.trim() || status === 'running' ? '#cbd5e1' : 'linear-gradient(135deg, #059669, #10b981)',
            color: 'white',
            fontSize: '24px',
            fontWeight: 800,
            cursor: !task.trim() || status === 'running' ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            transition: 'all 0.2s',
          }}
        >
          {status === 'running' ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          )}
          {status === 'running' ? 'הסוכן רץ...' : 'הפעל סוכן'}
        </button>
      </div>

      {/* Status Bar */}
      <div style={{
        background: statusBg[status],
        borderRadius: '16px',
        padding: '20px 28px',
        marginBottom: '20px',
        border: `2px solid ${statusColor[status]}30`,
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
      }}>
        <div style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: statusColor[status],
          ...(status === 'running' ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}),
        }} />
        <span style={{ fontSize: '24px', fontWeight: 700, color: statusColor[status] }}>
          {statusLabel[status]}
        </span>
        {result && (
          <span style={{ fontSize: '20px', fontWeight: 600, color: '#64748b', marginRight: 'auto' }}>
            זמן ריצה: {Math.round((result.durationMs || 0) / 1000)}s
          </span>
        )}
      </div>

      {/* Output / Logs */}
      {result && (
        <div style={{ background: 'white', borderRadius: '20px', padding: '28px', marginBottom: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            </div>
            <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#1e293b', margin: 0 }}>לוגים</h2>
          </div>
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
            margin: 0,
            fontFamily: "'Courier New', Courier, monospace",
            direction: 'ltr',
            textAlign: 'left',
            maxHeight: '500px',
            overflow: 'auto',
          }}>
            {result.output || '(no output)'}
          </pre>

          {/* Error section */}
          {result.error && (
            <>
              <h3 style={{ fontSize: '24px', fontWeight: 800, color: '#ef4444', margin: '20px 0 12px' }}>שגיאות:</h3>
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
                {result.error}
              </pre>
            </>
          )}
        </div>
      )}

      {/* Summary */}
      {result && (
        <div style={{
          background: result.success ? '#f0fdf4' : '#fef2f2',
          borderRadius: '20px',
          padding: '28px',
          marginBottom: '20px',
          border: `2px solid ${result.success ? '#86efac' : '#fecaca'}`,
        }}>
          <h2 style={{ fontSize: '28px', fontWeight: 800, color: result.success ? '#166534' : '#991b1b', margin: '0 0 16px' }}>
            {result.success ? '✅ סיכום — הצלחה' : '❌ סיכום — כישלון'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
            <div>
              <span style={{ fontSize: '20px', fontWeight: 700, color: '#64748b' }}>סטטוס:</span>
              <span style={{ fontSize: '22px', fontWeight: 800, color: result.success ? '#22c55e' : '#ef4444', marginRight: '10px' }}>
                {result.success ? 'הצלחה' : 'כישלון'}
              </span>
            </div>
            <div>
              <span style={{ fontSize: '20px', fontWeight: 700, color: '#64748b' }}>זמן ריצה:</span>
              <span style={{ fontSize: '22px', fontWeight: 800, color: '#1e293b', marginRight: '10px' }}>
                {Math.round((result.durationMs || 0) / 1000)} שניות
              </span>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={{ fontSize: '20px', fontWeight: 700, color: '#64748b' }}>משימה:</span>
              <span style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', marginRight: '10px' }}>
                {task.slice(0, 120)}{task.length > 120 ? '...' : ''}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* CSS animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
