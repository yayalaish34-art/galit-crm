/* התחברות ל-CRM וקריאות API. SSO דרך Office → החלפת טוקן ל-JWT של ה-CRM. */
(function () {
  window.MYCRM = window.MYCRM || {};
  var CFG = (window.MYCRM.CONFIG) || {};

  function apiUrl(path) { return (CFG.CRM_API_URL || '').replace(/\/+$/, '') + path; }
  function getStoredToken() { try { return localStorage.getItem(CFG.TOKEN_KEY); } catch (e) { return null; } }
  function setStoredToken(t) { try { if (t) localStorage.setItem(CFG.TOKEN_KEY, t); } catch (e) {} }
  function clearStoredToken() { try { localStorage.removeItem(CFG.TOKEN_KEY); } catch (e) {} }
  window.MYCRM.clearToken = clearStoredToken;
  window.MYCRM.hasToken = function () { return !!getStoredToken(); };

  /**
   * התחברות עם אימייל+סיסמה של ה-CRM (fallback ל-SSO). שומר את ה-JWT.
   * זורק שגיאה עם הודעה בעברית אם הפרטים שגויים.
   */
  window.MYCRM.loginWithPassword = async function loginWithPassword(email, password) {
    var res = await fetch(apiUrl('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: (email || '').trim(), password: password || '' }),
    });
    if (!res.ok) throw new Error('BAD_CREDENTIALS');
    var data = await res.json();
    if (!data || !data.accessToken) throw new Error('BAD_CREDENTIALS');
    setStoredToken(data.accessToken);
    return { name: data.name || (data.token && data.token.name) || '', email: data.email || (data.token && data.token.email) || '' };
  };

  /** משיג Microsoft access token דרך Office SSO. מחזיר null אם לא נתמך. */
  function getMicrosoftToken() {
    return new Promise(function (resolve) {
      try {
        if (!Office.auth || !Office.auth.getAccessToken) { resolve(null); return; }
        Office.auth.getAccessToken({ allowSignInPrompt: true, allowConsentPrompt: true })
          .then(function (t) { resolve(t || null); })
          .catch(function () { resolve(null); });
      } catch (e) { resolve(null); }
    });
  }

  /**
   * מוודא שיש JWT תקף של ה-CRM. אם אין — מבצע SSO exchange מול השרת.
   * מחזיר את הטוקן, או זורק 'NOT_AUTHENTICATED' אם לא ניתן להזדהות.
   */
  window.MYCRM.ensureCrmToken = async function ensureCrmToken() {
    var existing = getStoredToken();
    if (existing) return existing;

    var msToken = await getMicrosoftToken();
    if (!msToken) throw new Error('NOT_AUTHENTICATED');

    var res = await fetch(apiUrl('/integrations/outlook/auth'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msAccessToken: msToken }),
    });
    if (!res.ok) throw new Error('NOT_AUTHENTICATED');
    var data = await res.json();
    if (!data || !data.accessToken) throw new Error('NOT_AUTHENTICATED');
    setStoredToken(data.accessToken);
    return data.accessToken;
  };

  /**
   * שולח את המייל ל-CRM (multipart). מחזיר את גוף התשובה.
   * attachments — [{name, blob}]; כל אחת נשמרת כמסמך נפרד בכרטיס הלקוח.
   */
  window.MYCRM.importEmail = async function importEmail(metadata, emlBlob, attachments) {
    var token = await window.MYCRM.ensureCrmToken();

    var form = new FormData();
    form.append('metadata', JSON.stringify(metadata));
    if (emlBlob) form.append('emailFile', emlBlob, 'message.eml');
    (attachments || []).forEach(function (a) {
      if (a && a.blob) form.append('attachments', a.blob, a.name || 'attachment');
    });

    var res = await fetch(apiUrl('/integrations/outlook/requests'), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: form,
    });

    if (res.status === 401) {
      // הטוקן פג — מנקים ומנסים פעם אחת נוספת.
      clearStoredToken();
      token = await window.MYCRM.ensureCrmToken();
      res = await fetch(apiUrl('/integrations/outlook/requests'), {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: form,
      });
    }

    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!data) throw new Error('SERVER_UNAVAILABLE');
    return data;
  };
})();
