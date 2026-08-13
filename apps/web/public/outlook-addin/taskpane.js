/* taskpane.js — חלון My CRM: התחברות, זיהוי המייל, סטטוס, והוספה כבקשה.
   תיוק אוטומטי (שיוך לפי שולח/נמענים בשרת) או ידני — חיפוש לקוח ותיוק לכרטיס שנבחר. */
(function () {
  var busy = false;
  var searchTimer = null;
  var searchSeq = 0; // מזהה רץ — תשובה ישנה שמגיעה אחרי חדשה לא תדרוס אותה
  var selectedCustomer = null; // {id, name} שנבחר מתוצאות החיפוש

  function $(id) { return document.getElementById(id); }
  function show(el, yes) { if (el) el.classList.toggle('hidden', !yes); }

  function setConn(ok, text) {
    var el = $('conn');
    el.className = 'status ' + (ok ? 'ok' : 'no');
    el.textContent = text;
  }

  function renderMessage(m) {
    if (!m) { show($('noMail'), true); show($('mailCard'), false); show($('addBtn'), false); show($('searchCard'), false); return; }
    show($('noMail'), false);
    show($('mailCard'), true);
    show($('addBtn'), true);
    show($('searchCard'), true);
    $('senderName').textContent = m.senderName || '—';
    $('senderEmail').textContent = m.senderEmail || '—';
    $('subject').textContent = m.subject || '(ללא נושא)';
  }

  /** מציג/מסתיר את אזור ההתחברות מול אזור העבודה לפי מצב החיבור. */
  function setLoggedIn(loggedIn) {
    show($('loginCard'), !loggedIn);
    show($('logoutBtn'), loggedIn);
    if (loggedIn) setConn(true, 'מחובר ל-CRM');
    else {
      setConn(false, 'יש להתחבר ל-CRM');
      show($('mailCard'), false); show($('addBtn'), false); show($('noMail'), false); show($('searchCard'), false);
      resetSearch();
    }
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

  /* ── חיפוש לקוח לתיוק ידני ── */

  function resetSearch() {
    selectedCustomer = null;
    if ($('custSearch')) $('custSearch').value = '';
    if ($('custResults')) $('custResults').innerHTML = '';
    show($('fileToBtn'), false);
  }

  function setSelectedCustomer(c, rowEl) {
    selectedCustomer = c;
    var rows = $('custResults').querySelectorAll('.result-row');
    for (var i = 0; i < rows.length; i++) rows[i].classList.remove('selected');
    if (rowEl) rowEl.classList.add('selected');
    var btn = $('fileToBtn');
    btn.textContent = 'תייק את המייל לכרטיס: ' + (c.name || '');
    show(btn, true);
  }

  /** שורת תוצאה: שם + טלפון/מייל/עיר, ואיש הקשר שתאם (אם החיפוש תפס איש קשר). */
  function renderResults(customers) {
    var box = $('custResults');
    box.innerHTML = '';
    selectedCustomer = null;
    show($('fileToBtn'), false);
    if (!customers.length) {
      var empty = document.createElement('div');
      empty.className = 'results-empty';
      empty.textContent = 'לא נמצאו לקוחות מתאימים';
      box.appendChild(empty);
      return;
    }
    customers.forEach(function (c) {
      var row = document.createElement('div');
      row.className = 'result-row';
      var name = document.createElement('div');
      name.className = 'result-name';
      name.textContent = c.name || '(ללא שם)';
      row.appendChild(name);
      var subParts = [c.phone, c.email, c.city].filter(function (x) { return !!x; });
      if (subParts.length) {
        var sub = document.createElement('div');
        sub.className = 'result-sub';
        sub.textContent = subParts.join(' · ');
        row.appendChild(sub);
      }
      var ct = (c.matchedContacts && c.matchedContacts[0]) || null;
      if (ct && ct.fullName) {
        var ctEl = document.createElement('div');
        ctEl.className = 'result-sub';
        ctEl.textContent = 'איש קשר: ' + ct.fullName + (ct.mobile || ct.phone ? ' · ' + (ct.mobile || ct.phone) : '');
        row.appendChild(ctEl);
      }
      row.addEventListener('click', function () {
        setSelectedCustomer({ id: c.id, name: c.name || '' }, row);
      });
      box.appendChild(row);
    });
  }

  function onSearchInput() {
    var q = $('custSearch').value.trim();
    if (searchTimer) clearTimeout(searchTimer);
    if (q.length < 2) { $('custResults').innerHTML = ''; selectedCustomer = null; show($('fileToBtn'), false); return; }
    searchTimer = setTimeout(function () { runSearch(q); }, 300);
  }

  async function runSearch(q) {
    var seq = ++searchSeq;
    try {
      var customers = await window.MYCRM.searchCustomers(q, 8);
      if (seq !== searchSeq) return; // הגיעה כבר תשובה לחיפוש עדכני יותר
      renderResults(customers);
    } catch (e) {
      if (seq !== searchSeq) return;
      if (e && e.message === 'NOT_AUTHENTICATED') { setLoggedIn(false); return; }
      $('custResults').innerHTML = '';
      var err = document.createElement('div');
      err.className = 'results-empty';
      err.textContent = 'החיפוש נכשל. נסה שוב.';
      $('custResults').appendChild(err);
    }
  }

  /* ── תיוק המייל — משותף לשני המסלולים ── */

  /**
   * מתייק את המייל הפתוח, כולל ה-EML וכל הצרופות.
   * customer=null → שיוך אוטומטי בשרת; אחרת {id,name} — תיוק ישיר לכרטיס שנבחר.
   */
  async function fileEmail(customer) {
    if (busy) return;
    busy = true;
    var addBtn = $('addBtn'); var fileBtn = $('fileToBtn');
    addBtn.disabled = true; fileBtn.disabled = true;
    var activeBtn = customer ? fileBtn : addBtn;
    var idleText = activeBtn.textContent;
    activeBtn.textContent = 'מתייק…';
    resultMsg('', 'ok');
    try {
      var m = await window.MYCRM.readOpenMessage();
      var emlBlob = null;
      try { emlBlob = await window.MYCRM.getEmlBlob(); } catch (e) { emlBlob = null; }
      var attachmentBlobs = [];
      try { attachmentBlobs = await window.MYCRM.getAttachmentBlobs(); } catch (e) { attachmentBlobs = []; }
      var metadata = {
        source: 'OUTLOOK_ADDIN', subject: m.subject, senderName: m.senderName, senderEmail: m.senderEmail,
        to: m.to, cc: m.cc, receivedAt: m.receivedAt, sentAt: m.sentAt, bodyHtml: m.bodyHtml, bodyText: m.bodyText,
        outlookItemId: m.outlookItemId, internetMessageId: m.internetMessageId, conversationId: m.conversationId,
        mailboxEmail: m.mailboxEmail, hasAttachments: m.hasAttachments, attachments: m.attachments, emlArchived: !!emlBlob,
        customerId: customer ? customer.id : null,
      };
      var r = await window.MYCRM.importEmail(metadata, emlBlob, attachmentBlobs);
      if (r && r.success) {
        var head;
        if (r.moved) head = r.message || ('המייל הועבר לכרטיס "' + ((customer && customer.name) || '') + '"');
        else if (r.duplicate) head = 'המייל כבר מתויק בבקשה ' + (r.requestNumber || '');
        else if (r.customerName) head = 'המייל תויק לכרטיס "' + r.customerName + '" — בקשה ' + (r.requestNumber || '');
        else head = 'המייל נוסף בהצלחה — מספר בקשה ' + (r.requestNumber || '');
        resultMsg(head, 'ok', r.requestUrl, 'פתיחת הבקשה');
        if (customer) resetSearch();
      } else {
        resultMsg((r && r.message) || 'לא ניתן היה להוסיף את המייל. ניתן לנסות שוב.', 'err');
      }
    } catch (e) {
      var code = e && e.message;
      if (code === 'NOT_AUTHENTICATED') { setLoggedIn(false); resultMsg('פג תוקף ההתחברות. יש להתחבר שוב.', 'err'); }
      else resultMsg(code === 'NO_OPEN_MESSAGE' ? 'אין מייל פתוח.' : 'לא ניתן היה להוסיף את המייל. ניתן לנסות שוב.', 'err');
    } finally {
      busy = false;
      addBtn.disabled = false; fileBtn.disabled = false;
      activeBtn.textContent = idleText;
    }
  }

  Office.onReady(function (info) {
    if (info.host !== Office.HostType.Outlook) return;
    $('loginBtn').addEventListener('click', onLogin);
    $('logoutBtn').addEventListener('click', onLogout);
    $('addBtn').addEventListener('click', function () { fileEmail(null); });
    $('fileToBtn').addEventListener('click', function () { if (selectedCustomer) fileEmail(selectedCustomer); });
    $('custSearch').addEventListener('input', onSearchInput);
    $('loginPassword').addEventListener('keydown', function (e) { if (e.key === 'Enter') onLogin(); });
    init();
    try {
      Office.context.mailbox.addHandlerAsync(Office.EventType.ItemChanged, function () {
        resultMsg('', 'ok');
        resetSearch();
        if (window.MYCRM.hasToken()) loadMessage();
      });
    } catch (e) { /* ignore */ }
  });
})();
