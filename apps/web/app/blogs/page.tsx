'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiUrl, getStoredToken } from '../lib/api-base';

/* ─────────────────────────────────────────────────────────────
   בלוגים — כתיבה ופרסום לאתר galit.co.il מתוך ה-CRM.
   מנהלים בלבד (ADMIN / MANAGER): התוכן עולה לאתר הציבורי.

   כל בלוג שמפורסם כאן נכנס לקטגוריה "בלוגים" באתר, ועמוד
   galit.co.il/blog מציג אותה אוטומטית — אין צורך לערוך את העמוד.
   ───────────────────────────────────────────────────────────── */

const SESSION_KEY = 'galit-crm-session';
const MANAGER_ROLES = ['ADMIN', 'MANAGER'];

type Session = { id: string; role: string };

type PostSummary = {
  id: number;
  title: string;
  excerpt: string;
  status: string;
  link: string;
  date: string;
  modified: string;
  featuredMediaId: number;
  featuredMediaUrl: string | null;
};

type Draft = {
  id: number | null;
  title: string;
  body: string;
  excerpt: string;
  featuredMediaId: number | null;
  featuredMediaUrl: string | null;
  link: string;
  status: string;
  /** נושאי הבלוג — קובעים באילו עמודי שירות כלליים הוא יופיע בסקשן "בלוג". */
  topicCategoryIds: number[];
};

/** נושא בלוג = קטגוריה באתר + עמוד השירות הכללי שסקשן הבלוג שלו שולף ממנה. */
type Topic = { categoryId: number; label: string; pageLabel: string };

const EMPTY_DRAFT: Draft = {
  id: null,
  title: '',
  body: '',
  excerpt: '',
  featuredMediaId: null,
  featuredMediaUrl: null,
  link: '',
  status: 'draft',
  topicCategoryIds: [],
};

function readSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.id || !s?.role) return null;
    return { id: String(s.id), role: String(s.role).toUpperCase() };
  } catch {
    return null;
  }
}

function fmtDate(v: string): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
}

function statusLabel(s: string): { text: string; className: string } {
  if (s === 'publish') return { text: 'מפורסם', className: 'bg-emerald-100 text-emerald-800' };
  if (s === 'future') return { text: 'מתוזמן', className: 'bg-sky-100 text-sky-800' };
  if (s === 'pending') return { text: 'ממתין', className: 'bg-amber-100 text-amber-800' };
  return { text: 'טיוטה', className: 'bg-slate-200 text-slate-700' };
}

export default function BlogsPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  const [settings, setSettings] = useState<{
    configured: boolean;
    siteUrl: string;
    username: string;
    categoryId: number;
  } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ siteUrl: '', username: '', appPassword: '' });
  const [testResult, setTestResult] = useState('');

  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [dirty, setDirty] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');

  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiForm, setAiForm] = useState({
    topic: '',
    audience: '',
    tone: 'מקצועי ונגיש',
    length: 'long' as 'short' | 'medium' | 'long',
    notes: '',
    /** מחקר ממקורות אמיתיים ברשת לפני הכתיבה — ברירת מחדל דולקת. */
    research: true,
  });

  /** "נסח מחדש" — משפר טיוטה קיימת במקום להתחיל מאפס. */
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [rewriteInstruction, setRewriteInstruction] = useState('');
  /** האם הגענו לכאן מהפופ-אפ של אישור טיוטה אוטומטית — משנה את הכותרת בעורך. */
  /** המקורות שנוסחו לתוך הבלוג האחרון — מוצגים כדי שהמנהל יוכל לבדוק אותם. */
  const [aiSources, setAiSources] = useState<{ url: string; title: string; publisher: string }[]>([]);
  const [fromApproval, setFromApproval] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  /** יצירת התמונה הראשית רצה ~15 שניות — דגל נפרד כדי לא לנעול את כל המסך. */
  const [imaging, setImaging] = useState(false);
  /**
   * החלופות שחזרו מהשרת. הן עדיין *לא* בוורדפרס — רק הנבחרת תועלה, כדי
   * שספריית המדיה לא תתמלא בתמונות שאיש לא בחר.
   */
  const [imageOptions, setImageOptions] = useState<
    { dataUrl: string; filename: string; scene: string }[]
  >([]);
  /** אינדקס החלופה שנמצאת כרגע בהעלאה — משבית את השאר בזמן ההמתנה. */
  const [pickingImage, setPickingImage] = useState<number | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSession(readSession());
  }, []);

  const headers = useCallback((): Record<string, string> => {
    const token = getStoredToken();
    return token
      ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' };
  }, []);

  const allowed = !!session && MANAGER_ROLES.includes(session.role);

  /** קריאה ל-API עם טיפול אחיד בשגיאות — מחזירה null בכישלון ומציגה הודעה. */
  const call = useCallback(
    async (path: string, init?: RequestInit): Promise<any | null> => {
      try {
        const r = await fetch(apiUrl(path), { ...init, headers: headers() });
        const text = await r.text();
        const data = text ? JSON.parse(text) : null;
        if (!r.ok) {
          setErr(data?.message || `שגיאה (${r.status})`);
          return null;
        }
        return data;
      } catch (e: any) {
        setErr(e?.message || 'שגיאת רשת');
        return null;
      }
    },
    [headers],
  );

  const loadSettings = useCallback(async () => {
    const s = await call('/blog/settings');
    if (s) {
      setSettings(s);
      setSettingsForm((f) => ({
        ...f,
        siteUrl: s.siteUrl || 'https://galit.co.il',
        username: s.username || '',
      }));
      if (!s.configured) setShowSettings(true);
    }
  }, [call]);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    const rows = await call('/blog/posts');
    setLoading(false);
    if (Array.isArray(rows)) setPosts(rows);
  }, [call]);

  useEffect(() => {
    if (!allowed) return;
    loadSettings();
  }, [allowed, loadSettings]);

  const loadTopics = useCallback(async () => {
    const rows = await call('/blog/topics');
    if (Array.isArray(rows)) setTopics(rows);
  }, [call]);

  useEffect(() => {
    if (!allowed || !settings?.configured) return;
    loadPosts();
    loadTopics();
  }, [allowed, settings?.configured, loadPosts, loadTopics]);

  /* ── פתיחה ישירה של בלוג מתוך הפופ-אפ "ממתין לאישורך" (/blogs?post=123) ──
     רץ פעם אחת בלבד: אחרי שהמנהל פתח, עריכה או ניווט לא אמורים לגרור אותו
     בחזרה לאותה טיוטה. */
  const deepLinkedRef = useRef(false);
  useEffect(() => {
    if (!allowed || !settings?.configured || deepLinkedRef.current) return;
    const id = Number(new URLSearchParams(window.location.search).get('post'));
    if (!id) return;
    deepLinkedRef.current = true;
    setFromApproval(true);
    void openPost(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, settings?.configured]);

  // ── פעולות ────────────────────────────────────────────────────────────────

  const saveSettings = async () => {
    setErr('');
    setTestResult('');
    setSaving(true);
    const ok = await call('/blog/settings', {
      method: 'POST',
      body: JSON.stringify({
        siteUrl: settingsForm.siteUrl.trim() || 'https://galit.co.il',
        username: settingsForm.username.trim(),
        appPassword: settingsForm.appPassword.trim() || undefined,
      }),
    });
    setSaving(false);
    if (!ok) return;
    setSettingsForm((f) => ({ ...f, appPassword: '' }));
    setNotice('פרטי החיבור נשמרו');
    await loadSettings();
  };

  const testConnection = async () => {
    setErr('');
    setTestResult('בודק…');
    const r = await call('/blog/test', { method: 'POST' });
    setTestResult(r ? `${r.ok ? '✅' : '⚠️'} ${r.message}` : '');
  };

  const openNew = () => {
    setDraft(EMPTY_DRAFT);
    setDirty(false);
    setErr('');
    setNotice('');
  };

  const openPost = async (id: number) => {
    setErr('');
    setNotice('');
    const p = await call(`/blog/posts/${id}`);
    if (!p) return;
    setDraft({
      id: p.id,
      title: p.title || '',
      body: p.body || '',
      excerpt: p.excerpt || '',
      featuredMediaId: p.featuredMediaId || null,
      featuredMediaUrl: p.featuredMediaUrl || null,
      link: p.link || '',
      status: p.status || 'draft',
      topicCategoryIds: Array.isArray(p.topicCategoryIds) ? p.topicCategoryIds : [],
    });
    setDirty(false);
  };

  const toggleTopic = (categoryId: number) => {
    setDraft((d) => ({
      ...d,
      topicCategoryIds: d.topicCategoryIds.includes(categoryId)
        ? d.topicCategoryIds.filter((x) => x !== categoryId)
        : [...d.topicCategoryIds, categoryId],
    }));
    setDirty(true);
  };

  const save = async (status: 'draft' | 'publish') => {
    if (!draft.title.trim()) {
      setErr('כותרת נדרשת');
      return;
    }
    setErr('');
    setNotice('');
    setSaving(true);
    const payload = {
      title: draft.title,
      body: draft.body,
      excerpt: draft.excerpt,
      status,
      featuredMediaId: draft.featuredMediaId,
      topicCategoryIds: draft.topicCategoryIds,
    };
    const res = draft.id
      ? await call(`/blog/posts/${draft.id}`, { method: 'POST', body: JSON.stringify(payload) })
      : await call('/blog/posts', { method: 'POST', body: JSON.stringify(payload) });
    setSaving(false);
    if (!res) return;
    setDraft((d) => ({ ...d, id: res.id, link: res.link, status: res.status }));
    setDirty(false);
    setNotice(
      status === 'publish'
        ? 'הבלוג פורסם — הוא כבר מופיע בעמוד הבלוגים באתר'
        : 'הטיוטה נשמרה (לא מוצגת באתר)',
    );
    loadPosts();
  };

  const remove = async () => {
    if (!draft.id) return;
    if (!window.confirm('להעביר את הבלוג לפח האשפה בוורדפרס? ניתן לשחזר משם.')) return;
    setErr('');
    const ok = await call(`/blog/posts/${draft.id}`, { method: 'DELETE' });
    if (!ok) return;
    setNotice('הבלוג הועבר לפח האשפה');
    openNew();
    loadPosts();
  };

  const onPickImage = async (file: File | null) => {
    if (!file) return;
    setErr('');
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(new Error('קריאת הקובץ נכשלה'));
      fr.readAsDataURL(file);
    }).catch((e) => {
      setErr(e.message);
      return '';
    });
    if (!dataUrl) return;
    setSaving(true);
    const r = await call('/blog/media', {
      method: 'POST',
      body: JSON.stringify({ dataUrl, filename: file.name }),
    });
    setSaving(false);
    if (!r) return;
    setDraft((d) => ({ ...d, featuredMediaId: r.id, featuredMediaUrl: r.url }));
    setDirty(true);
  };

  /* שלוש הצעות תמונה מנושא הבלוג. השרת מייצר בלבד — ההעלאה לוורדפרס קורית
     רק על החלופה שנבחרה (`chooseImage`), דרך אותו מסלול של העלאה ידנית. */
  const generateImage = async () => {
    const title = draft.title.trim();
    if (!title) {
      setErr('כדי לייצר תמונה צריך קודם כותרת לבלוג');
      return;
    }
    setErr('');
    setNotice('');
    setImageOptions([]);
    setImaging(true);
    const r = await call('/blog/ai-image-options', {
      method: 'POST',
      body: JSON.stringify({ title, topic: draft.excerpt.trim() || title }),
    });
    setImaging(false);
    if (!r?.options?.length) return;
    setImageOptions(r.options);
    setNotice(`נוצרו ${r.options.length} הצעות — בחרו אחת`);
  };

  /** מעלה את החלופה שנבחרה לוורדפרס וקובעת אותה כתמונה הראשית. */
  const chooseImage = async (index: number) => {
    const opt = imageOptions[index];
    if (!opt) return;
    setErr('');
    setPickingImage(index);
    const r = await call('/blog/media', {
      method: 'POST',
      body: JSON.stringify({ dataUrl: opt.dataUrl, filename: opt.filename }),
    });
    setPickingImage(null);
    if (!r) return;
    setDraft((d) => ({ ...d, featuredMediaId: r.id, featuredMediaUrl: r.url }));
    setImageOptions([]);
    setDirty(true);
    setNotice('נבחרה תמונה — לא לשכוח לשמור');
  };

  const runAi = async () => {
    if (!aiForm.topic.trim()) {
      setErr('נושא נדרש');
      return;
    }
    setErr('');
    setAiBusy(true);
    const r = await call('/blog/ai-draft', { method: 'POST', body: JSON.stringify(aiForm) });
    setAiBusy(false);
    if (!r) return;
    setDraft((d) => ({
      ...d,
      title: r.title || d.title,
      excerpt: r.excerpt || d.excerpt,
      body: r.body || d.body,
    }));
    setAiSources(Array.isArray(r.sources) ? r.sources : []);
    setDirty(true);
    setAiOpen(false);
    setNotice(
      r.sources?.length
        ? `נוצרה טיוטה על בסיס ${r.sources.length} מקורות — עברו עליה, ערכו, ורק אז פרסמו`
        : 'נוצרה טיוטה — עברו עליה, ערכו, ורק אז פרסמו',
    );
  };

  /**
   * ניסוח מחדש של מה שכרגע בעורך. שולח את הטקסט הנוכחי (כולל עריכות שטרם
   * נשמרו) כדי שהשיפור יתבסס על מה שהמנהל רואה מולו, לא על הגרסה בשרת.
   */
  const runRewrite = async () => {
    if (!draft.title.trim() && !draft.body.trim()) {
      setErr('אין תוכן לנסח מחדש');
      return;
    }
    setErr('');
    setRewriteBusy(true);
    const r = await call(`/blog/posts/${draft.id || 0}/rewrite`, {
      method: 'POST',
      body: JSON.stringify({
        title: draft.title,
        body: draft.body,
        instruction: rewriteInstruction,
      }),
    });
    setRewriteBusy(false);
    if (!r) return;
    setDraft((d) => ({
      ...d,
      title: r.title || d.title,
      excerpt: r.excerpt || d.excerpt,
      body: r.body || d.body,
    }));
    setAiSources(Array.isArray(r.sources) ? r.sources : []);
    setDirty(true);
    setRewriteOpen(false);
    setRewriteInstruction('');
    setNotice('נוסח מחדש — עברו על התוצאה לפני פרסום');
  };

  /**
   * "נסח לי בלוג עכשיו" — מריץ ידנית את אותו ניסוח שרץ כל בוקר ב-09:00,
   * ופותח את התוצאה בעורך. שימושי גם לבדיקה וגם כשרוצים בלוג נוסף באותו יום.
   */
  const runAutoDraftNow = async () => {
    setErr('');
    setNotice('');
    setAutoBusy(true);
    const r = await call('/blog/auto-draft/run', { method: 'POST' });
    setAutoBusy(false);
    if (!r) return;
    if (!r.ok) {
      setErr(r.message || 'הניסוח נכשל');
      return;
    }
    await loadPosts();
    if (r.postId) {
      setFromApproval(true);
      await openPost(Number(r.postId));
    }
    setNotice('נוצרה טיוטה חדשה — עברו עליה ופרסמו כשהיא מוכנה');
  };

  /** חזרה לדשבורד — שואלת קודם אם יש עריכה שלא נשמרה, כי היא תאבד. */
  const backToDashboard = () => {
    if (dirty && !window.confirm('יש שינויים שלא נשמרו. לחזור לדשבורד בלי לשמור?')) return;
    window.location.href = '/dashboard';
  };

  const blogPageUrl = useMemo(
    () => `${(settings?.siteUrl || 'https://galit.co.il').replace(/\/$/, '')}/blog/`,
    [settings?.siteUrl],
  );

  // ── שערי גישה ─────────────────────────────────────────────────────────────

  if (session === undefined) {
    return (
      <main className="min-h-screen bg-[#f5f6f8] p-8 text-slate-600" dir="rtl">
        טוען…
      </main>
    );
  }
  if (!session) {
    return (
      <main className="min-h-screen bg-[#f5f6f8] p-8 text-slate-700" dir="rtl">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mb-2 text-lg font-bold">נדרשת התחברות</div>
          <div className="text-sm text-slate-500">התחברו למערכת ואז חזרו למסך הבלוגים.</div>
          <a
            href="/"
            className="mt-4 inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white"
          >
            למסך ההתחברות
          </a>
        </div>
      </main>
    );
  }
  if (!allowed) {
    return (
      <main className="min-h-screen bg-[#f5f6f8] p-8 text-slate-700" dir="rtl">
        <div className="mx-auto max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <div className="mb-1 text-lg font-bold text-amber-800">אין הרשאה</div>
          <div className="text-sm text-amber-700">
            כתיבת בלוגים זמינה למנהלים בלבד — התוכן מתפרסם באתר הציבורי.
          </div>
          <a
            href="/dashboard"
            className="mt-4 inline-block rounded-xl border border-amber-300 bg-white px-5 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100"
          >
            חזרה לדשבורד
          </a>
        </div>
      </main>
    );
  }

  // ── המסך ──────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#f5f6f8] p-4 text-slate-800 md:p-8" dir="rtl">
      <div className="mx-auto max-w-[1500px] space-y-5">
        {/* כותרת */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button
              onClick={backToDashboard}
              className="mb-2 inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <span aria-hidden="true">→</span>
              חזרה לדשבורד
            </button>
            <h1 className="text-2xl font-bold">בלוגים</h1>
            <p className="text-sm text-slate-500">
              כתיבה ופרסום ישירות לאתר. כל בלוג שמפורסם מופיע אוטומטית בעמוד{' '}
              <a
                href={blogPageUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-blue-600 hover:underline"
              >
                הבלוגים באתר
              </a>
              .
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              הגדרות חיבור
            </button>
            <button
              onClick={runAutoDraftNow}
              disabled={autoBusy}
              title="מנסח עכשיו בלוג בנושא הבא בתור — נשמר כטיוטה לאישורך"
              className="rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
            >
              {autoBusy ? 'מנסח…' : '🤖 נסח לי בלוג עכשיו'}
            </button>
            <button
              onClick={openNew}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
            >
              בלוג חדש
            </button>
          </div>
        </div>

        {/* הודעות */}
        {err && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {err}
          </div>
        )}
        {notice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </div>
        )}

        {/* הגדרות חיבור */}
        {showSettings && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-1 text-base font-bold">חיבור לאתר וורדפרס</div>
            <p className="mb-4 text-xs leading-relaxed text-slate-500">
              נדרשת <strong>סיסמת אפליקציה</strong> של וורדפרס (משתמשים ← הפרופיל שלי ← סיסמאות
              אפליקציה) — לא הסיסמה הרגילה. הסיסמה נשמרת מוצפנת וניתן לבטל אותה בוורדפרס בכל רגע.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">כתובת האתר</span>
                <input
                  value={settingsForm.siteUrl}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, siteUrl: e.target.value }))}
                  placeholder="https://galit.co.il"
                  dir="ltr"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">שם משתמש</span>
                <input
                  value={settingsForm.username}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="admin_haim"
                  dir="ltr"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  סיסמת אפליקציה {settings?.configured && '(ריק = ללא שינוי)'}
                </span>
                <input
                  type="password"
                  value={settingsForm.appPassword}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, appPassword: e.target.value }))}
                  placeholder="xxxx xxxx xxxx xxxx"
                  dir="ltr"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={saveSettings}
                disabled={saving}
                className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                שמירה
              </button>
              <button
                onClick={testConnection}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
                בדיקת חיבור
              </button>
              {testResult && <span className="text-sm text-slate-600">{testResult}</span>}
            </div>
          </section>
        )}

        {!settings?.configured ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
            החיבור לוורדפרס עדיין לא הוגדר. הזינו את פרטי הגישה למעלה כדי להתחיל לכתוב.
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
            {/* רשימת בלוגים */}
            <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-bold">הבלוגים שלי</div>
                <button
                  onClick={loadPosts}
                  className="text-xs text-blue-600 hover:underline"
                  disabled={loading}
                >
                  {loading ? 'טוען…' : 'רענון'}
                </button>
              </div>
              {posts.length === 0 ? (
                <div className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">
                  אין בלוגים עדיין. לחצו «בלוג חדש» כדי לכתוב את הראשון.
                </div>
              ) : (
                <ul className="max-h-[65vh] space-y-2 overflow-y-auto pl-1">
                  {posts.map((p) => {
                    const st = statusLabel(p.status);
                    const active = draft.id === p.id;
                    return (
                      <li key={p.id}>
                        <button
                          onClick={() => openPost(p.id)}
                          className={`w-full rounded-xl border p-3 text-right transition ${
                            active
                              ? 'border-blue-400 bg-blue-50'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${st.className}`}
                            >
                              {st.text}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {fmtDate(p.modified)}
                            </span>
                          </div>
                          <div className="line-clamp-2 text-sm font-medium text-slate-800">
                            {p.title || '(ללא כותרת)'}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>

            {/* עורך */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="text-base font-bold">
                  {draft.id ? 'עריכת בלוג' : 'בלוג חדש'}
                  {draft.id && (
                    <span
                      className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusLabel(draft.status).className}`}
                    >
                      {statusLabel(draft.status).text}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {draft.id ? (
                    <button
                      onClick={() => setRewriteOpen((v) => !v)}
                      className="rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-bold text-violet-700 hover:bg-violet-50"
                    >
                      🔁 נסח מחדש
                    </button>
                  ) : null}
                  <button
                    onClick={() => setAiOpen((v) => !v)}
                    className="rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 hover:bg-violet-100"
                  >
                    ✨ נסח לי טיוטה
                  </button>
                </div>
              </div>

              {/* הגעה מהפופ-אפ: מסבירה למה הבלוג הזה פתוח ומה מצופה עכשיו */}
              {fromApproval && draft.id && draft.status === 'draft' ? (
                <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
                  <span className="font-bold">טיוטה שנוצרה אוטומטית וממתינה לאישורך.</span>{' '}
                  ערכו ידנית או לחצו «נסח מחדש», ואז «פרסם» כדי להעלות אותה לאתר. כל עוד לא
                  פרסמתם — היא לא מוצגת לאף אחד.
                </div>
              ) : null}

              {/* פאנל ניסוח מחדש */}
              {rewriteOpen && draft.id ? (
                <div className="mb-5 rounded-xl border border-violet-200 bg-white p-4">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">
                      מה לשנות? <span className="text-slate-400">(אפשר להשאיר ריק לשיפור כללי)</span>
                    </span>
                    <input
                      value={rewriteInstruction}
                      onChange={(e) => setRewriteInstruction(e.target.value)}
                      placeholder="קצר יותר / פחות שיווקי / הוסף פסקה על התקן הישראלי"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={runRewrite}
                      disabled={rewriteBusy}
                      className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {rewriteBusy ? 'מנסח…' : 'נסח מחדש'}
                    </button>
                    <span className="text-xs text-slate-500">
                      התוצאה נכנסת לעורך — עדיין צריך לשמור או לפרסם.
                    </span>
                  </div>
                </div>
              ) : null}

              {/* פאנל AI */}
              {aiOpen && (
                <div className="mb-5 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className="mb-1 block text-xs font-medium text-slate-600">
                        נושא הבלוג *
                      </span>
                      <input
                        value={aiForm.topic}
                        onChange={(e) => setAiForm((f) => ({ ...f, topic: e.target.value }))}
                        placeholder="לדוגמה: למה חשוב לבדוק ראדון בבית פרטי לפני כניסה לדירה"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-600">קהל יעד</span>
                      <input
                        value={aiForm.audience}
                        onChange={(e) => setAiForm((f) => ({ ...f, audience: e.target.value }))}
                        placeholder="בעלי בתים / קבלנים / ועדי בתים"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-600">טון</span>
                      <input
                        value={aiForm.tone}
                        onChange={(e) => setAiForm((f) => ({ ...f, tone: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-600">אורך</span>
                      <select
                        value={aiForm.length}
                        onChange={(e) =>
                          setAiForm((f) => ({ ...f, length: e.target.value as any }))
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="short">קצר (~400 מילים)</option>
                        <option value="medium">בינוני (~650 מילים)</option>
                        <option value="long">ארוך (~1000 מילים)</option>
                      </select>
                    </label>
                    <label className="flex items-start gap-2 sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={aiForm.research}
                        onChange={(e) =>
                          setAiForm((f) => ({ ...f, research: e.target.checked }))
                        }
                        className="mt-0.5 h-4 w-4 accent-violet-600"
                      />
                      <span className="text-xs text-slate-600">
                        <b className="text-slate-800">מחקר ממקורות אמיתיים</b> — חיפוש באתרי
                        רשויות, משרד הבריאות, המשרד להגנת הסביבה, WHO, EPA ומכוני תקינה, וכתיבת
                        הבלוג מתוכם עם קישורים בגוף הטקסט. לוקח כחצי דקה יותר.
                      </span>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-600">
                        דגשים נוספים
                      </span>
                      <input
                        value={aiForm.notes}
                        onChange={(e) => setAiForm((f) => ({ ...f, notes: e.target.value }))}
                        placeholder="להזכיר הסמכת ISO 17025"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={runAi}
                      disabled={aiBusy}
                      className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {aiBusy ? (aiForm.research ? 'אוסף מקורות ומנסח…' : 'מנסח…') : 'צור טיוטה'}
                    </button>
                    <span className="text-xs text-slate-500">
                      הטיוטה נכנסת לעורך לעריכה — היא לא מתפרסמת לבד.
                    </span>
                  </div>
                </div>
              )}

              {/* המקורות שנכנסו לבלוג — כדי שהמנהל יוכל ללחוץ ולוודא לפני פרסום */}
              {aiSources.length > 0 && (
                <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-emerald-900">
                      {aiSources.length} מקורות שולבו בבלוג
                    </span>
                    <button
                      onClick={() => setAiSources([])}
                      className="text-xs text-emerald-700 hover:underline"
                    >
                      הסתר
                    </button>
                  </div>
                  <ul className="space-y-1">
                    {aiSources.map((s) => (
                      <li key={s.url} className="text-xs">
                        <span className="font-mono text-emerald-800">{s.publisher}</span>
                        <span className="mx-1 text-slate-400">·</span>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-700 hover:underline"
                        >
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-slate-500">
                    הקישורים מוטמעים בגוף הבלוג. כדאי לפתוח ולוודא שהם נכונים לפני פרסום.
                  </p>
                </div>
              )}

              {/* שדות */}
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">כותרת *</span>
                  <input
                    value={draft.title}
                    onChange={(e) => {
                      setDraft((d) => ({ ...d, title: e.target.value }));
                      setDirty(true);
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base font-medium"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    תקציר <span className="text-slate-400">(מוצג ברשימת הבלוגים באתר)</span>
                  </span>
                  <textarea
                    value={draft.excerpt}
                    onChange={(e) => {
                      setDraft((d) => ({ ...d, excerpt: e.target.value }));
                      setDirty(true);
                    }}
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>

                {/* נושאים — קובעים באיזה עמוד שירות כללי הבלוג יופיע */}
                <div>
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    נושאים{' '}
                    <span className="text-slate-400">
                      (הבלוג יופיע בסקשן &quot;בלוג&quot; של עמוד השירות הכללי הנבחר)
                    </span>
                  </span>
                  {topics.length === 0 ? (
                    <div className="text-xs text-slate-400">טוען נושאים…</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {topics.map((t) => {
                        const on = draft.topicCategoryIds.includes(t.categoryId);
                        return (
                          <button
                            key={t.categoryId}
                            type="button"
                            onClick={() => toggleTopic(t.categoryId)}
                            title={`עמוד ${t.pageLabel} באתר`}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                              on
                                ? 'border-teal-600 bg-teal-600 text-white'
                                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {draft.topicCategoryIds.length === 0 && topics.length > 0 && (
                    <p className="mt-1.5 text-[11px] text-amber-700">
                      בלי נושא הבלוג יופיע רק בעמוד הבלוגים הכללי, ולא בעמוד השירות שלו.
                    </p>
                  )}
                </div>

                {/* תמונה ראשית */}
                <div>
                  <span className="mb-1 block text-xs font-medium text-slate-600">תמונה ראשית</span>
                  <div className="flex items-center gap-3">
                    {draft.featuredMediaUrl ? (
                      <img
                        src={draft.featuredMediaUrl}
                        alt=""
                        className="h-20 w-32 rounded-lg border border-slate-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-32 items-center justify-center rounded-lg border border-dashed border-slate-300 text-[10px] text-slate-400">
                        אין תמונה
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => onPickImage(e.target.files?.[0] || null)}
                      />
                      <button
                        onClick={generateImage}
                        disabled={imaging}
                        title="מייצר שלוש הצעות תמונה מנושא הבלוג, לבחירתכם"
                        className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                      >
                        {imaging ? 'מייצר 3 הצעות…' : '✨ צור תמונות'}
                      </button>
                      <button
                        onClick={() => fileRef.current?.click()}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                      >
                        העלאת תמונה
                      </button>
                      {draft.featuredMediaId && (
                        <button
                          onClick={() => {
                            setDraft((d) => ({
                              ...d,
                              featuredMediaId: null,
                              featuredMediaUrl: null,
                            }));
                            setDirty(true);
                          }}
                          className="text-xs text-red-600 hover:underline"
                        >
                          הסרה
                        </button>
                      )}
                    </div>
                  </div>

                  {/* בורר החלופות. נעלם ברגע שנבחרה אחת — השאר לא נשמרות בשום מקום. */}
                  {imageOptions.length > 0 && (
                    <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-indigo-900">
                          בחרו תמונה ({imageOptions.length} הצעות)
                        </span>
                        <button
                          onClick={() => setImageOptions([])}
                          className="text-xs text-indigo-700 hover:underline"
                        >
                          ביטול
                        </button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {imageOptions.map((opt, i) => (
                          <button
                            key={i}
                            onClick={() => chooseImage(i)}
                            disabled={pickingImage !== null}
                            title={opt.scene}
                            className="group relative overflow-hidden rounded-lg border-2 border-transparent bg-white ring-1 ring-slate-200 transition hover:border-indigo-500 disabled:opacity-60"
                          >
                            <img
                              src={opt.dataUrl}
                              alt={`הצעה ${i + 1}`}
                              className="block aspect-[3/2] w-full object-cover"
                            />
                            <span className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-[11px] font-medium text-white">
                              {pickingImage === i ? 'מעלה…' : `בחירה ${i + 1}`}
                            </span>
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] text-slate-500">
                        רק התמונה שתבחרו תועלה לוורדפרס. הלוגו כבר חתום בפינה.
                      </p>
                    </div>
                  )}
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">תוכן הבלוג</span>
                  <textarea
                    value={draft.body}
                    onChange={(e) => {
                      setDraft((d) => ({ ...d, body: e.target.value }));
                      setDirty(true);
                    }}
                    rows={18}
                    className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm leading-relaxed"
                    placeholder={'פסקה ראשונה.\n\n## כותרת משנה\n\nעוד פסקה.\n\n- פריט ברשימה\n- פריט נוסף'}
                  />
                  <span className="mt-1 block text-[11px] text-slate-500">
                    עיצוב: <code className="rounded bg-slate-100 px-1">##</code> כותרת ·{' '}
                    <code className="rounded bg-slate-100 px-1">###</code> כותרת קטנה ·{' '}
                    <code className="rounded bg-slate-100 px-1">-</code> פריט ברשימה · שורה ריקה =
                    פסקה חדשה
                  </span>
                </label>
              </div>

              {/* פעולות */}
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
                <button
                  onClick={() => save('publish')}
                  disabled={saving}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? 'שומר…' : 'פרסום לאתר'}
                </button>
                <button
                  onClick={() => save('draft')}
                  disabled={saving}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                >
                  שמירה כטיוטה
                </button>
                {draft.link && draft.status === 'publish' && (
                  <a
                    href={draft.link}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-50"
                  >
                    צפייה באתר
                  </a>
                )}
                {draft.id && (
                  <button
                    onClick={remove}
                    className="mr-auto rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100"
                  >
                    מחיקה
                  </button>
                )}
                {dirty && <span className="text-xs text-amber-600">יש שינויים שלא נשמרו</span>}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
