/* taskpane.js — חלון My CRM: התחברות, זיהוי המייל, סטטוס, והוספה כבקשה. */
(function () {
  var busy = false;

  function $(id) { return document.getElementById(id); }
  function show(el, yes) { if (el) el.classList.toggle('hidden', !yes); }

  function setConn(ok, text) {
    var el = $('conn');
    el.className = 'status ' + (ok ? 'ok' : 'no');
    el.textContent = text;
  }

  function renderMessage(m) {
    if (!m) { show($('noMail'), true); show($('mailCard'), false); show($('addBtn'), false); return; }
    show($('noMail'), false);
    show($('mailCard'), true);
    show($('addBtn'), true);
    $('senderName').textContent = m.senderName || '—';
    $('senderEmail').textContent = m.senderEmail || '—';
    $('subject').textContent = m.subject || '(ללא נושא)';
  }

  /** מציג/מסתיר את אזור ההתחברות מול אזור העבודה לפי מצב החיבור. */
  function setLoggedIn(loggedIn) {
    show($('loginCard'), !loggedIn);
    show($('logoutBtn'), loggedIn);
    if (loggedIn) setConn(true, 'מחובר ל-CRM');
    else { setConn(false, 'יש להתחבר ל-CRM'); show($('mailCard'), false); show($('addBtn'), false); show($('noMail'), false); }
  }

  async function loadMessage() {
    try {
      var m = await window.MYCRM.readOpenMessage();
      renderMessage(m);
    } catch (e) {
      renderMessage(null);
    }
  }

  /** בכניסה: אם כבר יש טוקן — עובדים; אחרת מנסים SSO בשקט; ואם אין — מציגים התחברות. */
  async function init() {
    if (window.MYCRM.hasToken()) { setLoggedIn(true); await loadMessage(); return; }
    // ניסיון SSO שקט (יעבוד רק אם Azure מוגדר) — לא חובה.
    try {
      await window.MYCRM.ensureCrmToken();
      setLoggedIn(true);
      await loadMessage();
    } catch (e) {
      setLoggedIn(false);
    }
  }

  async function onLogin() {
    if (busy) return;
    busy = true;
    var btn = $('loginBtn'); btn.disabled = true; btn.textContent = 'מתחבר…';
    $('loginErr').textContent = '';
    try {
      await window.MYCRM.loginWithPassword($('loginEmail').value, $('loginPassword').value);
      $('loginPassword').value = '';
      setLoggedIn(true);
      await loadMessage();
    } catch (e) {
      $('loginErr').textContent = 'אימייל או סיסמה שגויים.';
    } finally {
      busy = false; btn.disabled = false; btn.textContent = 'התחברות';
    }
  }

  function onLogout() {
    window.MYCRM.clearToken();
    resultMsg('', 'ok');
    setLoggedIn(false);
  }

  function resultMsg(text, kind, url, urlText) {
    var el = $('result');
    el.className = 'msg ' + (kind === 'err' ? 'err' : 'ok');
    el.innerHTML = '';
    if (!text) return;
    var span = document.createElement('div');
    span.textContent = text;
    el.appendChild(span);
    if (url) {
      var a = document.createElement('a');
      a.className = 'link';
      a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = urlText || 'פתיחת הבקשה';
      el.appendChild(a);
    }
  }

  async function onAdd() {
    if (busy) return;
    busy = true;
    var btn = $('addBtn');
    btn.disabled = true; btn.textContent = 'מוסיף…';
    resultMsg('', 'ok');
    try {
      var m = await window.MYCRM.readOpenMessage();
      var emlBlob = null;
      try { emlBlob = await window.MYCRM.getEmlBlob(); } catch (e) { emlBlob = null; }
      var metadata = {
        source: 'OUTLOOK_ADDIN', subject: m.subject, senderName: m.senderName, senderEmail: m.senderEmail,
        to: m.to, cc: m.cc, receivedAt: m.receivedAt, sentAt: m.sentAt, bodyHtml: m.bodyHtml, bodyText: m.bodyText,
        outlookItemId: m.outlookItemId, internetMessageId: m.internetMessageId, conversationId: m.conversationId,
        mailboxEmail: m.mailboxEmail, hasAttachments: m.hasAttachments, attachments: m.attachments, emlArchived: !!emlBlob,
      };
      var r = await window.MYCRM.importEmail(metadata, emlBlob);
      if (r && r.success) {
        var head = (r.duplicate ? 'המייל כבר מתויק בבקשה ' : 'המייל נוסף בהצלחה — מספר בקשה ') + (r.requestNumber || '');
        resultMsg(head, 'ok', r.requestUrl, 'פתיחת הבקשה');
      } else {
        resultMsg((r && r.message) || 'לא ניתן היה להוסיף את המייל. ניתן לנסות שוב.', 'err');
      }
    } catch (e) {
      var code = e && e.message;
      if (code === 'NOT_AUTHENTICATED') { setLoggedIn(false); resultMsg('פג תוקף ההתחברות. יש להתחבר שוב.', 'err'); }
      else resultMsg(code === 'NO_OPEN_MESSAGE' ? 'אין מייל פתוח.' : 'לא ניתן היה להוסיף את המייל. ניתן לנסות שוב.', 'err');
    } finally {
      busy = false; btn.disabled = false; btn.textContent = 'הוספה ל-CRM';
    }
  }

  Office.onReady(function (info) {
    if (info.host !== Office.HostType.Outlook) return;
    $('loginBtn').addEventListener('click', onLogin);
    $('logoutBtn').addEventListener('click', onLogout);
    $('addBtn').addEventListener('click', onAdd);
    $('loginPassword').addEventListener('keydown', function (e) { if (e.key === 'Enter') onLogin(); });
    init();
    try {
      Office.context.mailbox.addHandlerAsync(Office.EventType.ItemChanged, function () {
        resultMsg('', 'ok');
        if (window.MYCRM.hasToken()) loadMessage();
      });
    } catch (e) { /* ignore */ }
  });
})();
