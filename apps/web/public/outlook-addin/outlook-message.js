/* קריאת פרטי המייל הפתוח באמצעות Office.js. מחזיר Promise עם המבנה המלא. */
(function () {
  window.MYCRM = window.MYCRM || {};

  function mapRecipients(list) {
    return (list || []).map(function (r) {
      return { name: r.displayName || '', email: (r.emailAddress || '').toLowerCase() };
    });
  }

  function getBody(coercionType) {
    return new Promise(function (resolve) {
      try {
        Office.context.mailbox.item.body.getAsync(coercionType, function (res) {
          resolve(res && res.status === Office.AsyncResultStatus.Succeeded ? (res.value || '') : '');
        });
      } catch (e) { resolve(''); }
    });
  }

  /** קורא את כל פרטי המייל. זורק אם אין פריט/שולח. */
  window.MYCRM.readOpenMessage = async function readOpenMessage() {
    const item = Office.context.mailbox.item;
    if (!item || item.itemType !== Office.MailboxEnums.ItemType.Message) {
      throw new Error('NO_OPEN_MESSAGE');
    }

    const from = item.from || item.sender || null;
    const senderEmail = from && from.emailAddress ? String(from.emailAddress).toLowerCase() : null;
    const senderName = from && from.displayName ? from.displayName : null;

    const [bodyHtml, bodyText] = await Promise.all([
      getBody(Office.CoercionType.Html),
      getBody(Office.CoercionType.Text),
    ]);

    const attachments = (item.attachments || []).map(function (a) {
      return {
        id: a.id,
        name: a.name,
        size: a.size || 0,
        contentType: a.contentType || null,
        isInline: !!a.isInline,
      };
    });

    return {
      outlookItemId: item.itemId || null,
      internetMessageId: item.internetMessageId || null,
      conversationId: item.conversationId || null,
      subject: item.subject || '',
      senderName: senderName,
      senderEmail: senderEmail,
      to: mapRecipients(item.to),
      cc: mapRecipients(item.cc),
      receivedAt: item.dateTimeCreated ? new Date(item.dateTimeCreated).toISOString() : null,
      sentAt: item.dateTimeCreated ? new Date(item.dateTimeCreated).toISOString() : null,
      bodyHtml: bodyHtml,
      bodyText: bodyText,
      hasAttachments: attachments.length > 0,
      attachments: attachments,
      mailboxEmail: (Office.context.mailbox.userProfile && Office.context.mailbox.userProfile.emailAddress
        ? Office.context.mailbox.userProfile.emailAddress.toLowerCase() : null),
    };
  };

  /** עוטף Office API אסינכרוני בסגנון callback ל-Promise; מחזיר fallback בכשל. */
  function asyncGet(fn, fallback) {
    return new Promise(function (resolve) {
      try {
        fn(function (res) {
          resolve(res && res.status === Office.AsyncResultStatus.Succeeded ? res.value : fallback);
        });
      } catch (e) { resolve(fallback); }
    });
  }

  /**
   * קריאת מייל **בכתיבה** (compose). שונה מהותית מקריאה:
   *   • אין שולח, אין תאריך קבלה ואין internetMessageId — ההודעה טרם נשלחה.
   *     השולח הוא בעל התיבה, וזה גם נכון עובדתית.
   *   • כל שדה נקרא אסינכרונית (subject/to/cc/body), לא כמאפיין ישיר.
   *   • saveAsync שומר טיוטה ומחזיר itemId — זה מה שמאפשר דדופ, אחרת לחיצה
   *     כפולה הייתה מתייקת פעמיים.
   */
  window.MYCRM.readComposeMessage = async function readComposeMessage() {
    const item = Office.context.mailbox.item;
    if (!item || item.itemType !== Office.MailboxEnums.ItemType.Message) {
      throw new Error('NO_OPEN_MESSAGE');
    }

    const profile = Office.context.mailbox.userProfile || {};
    const mailboxEmail = (profile.emailAddress || '').toLowerCase() || null;

    const [subject, to, cc, bodyHtml, bodyText, itemId] = await Promise.all([
      asyncGet(function (cb) { item.subject.getAsync(cb); }, ''),
      asyncGet(function (cb) { item.to.getAsync(cb); }, []),
      asyncGet(function (cb) { item.cc.getAsync(cb); }, []),
      asyncGet(function (cb) { item.body.getAsync(Office.CoercionType.Html, cb); }, ''),
      asyncGet(function (cb) { item.body.getAsync(Office.CoercionType.Text, cb); }, ''),
      asyncGet(function (cb) { item.saveAsync(cb); }, null),
    ]);

    const recipients = mapRecipients(to);
    if (recipients.length === 0) throw new Error('NO_RECIPIENTS');

    return {
      direction: 'OUTGOING',
      outlookItemId: itemId || item.itemId || null,
      internetMessageId: null,
      conversationId: item.conversationId || null,
      subject: subject || '',
      senderName: profile.displayName || null,
      senderEmail: mailboxEmail,
      to: recipients,
      cc: mapRecipients(cc),
      receivedAt: null,
      sentAt: new Date().toISOString(),
      bodyHtml: bodyHtml,
      bodyText: bodyText,
      hasAttachments: false,
      attachments: [],
      mailboxEmail: mailboxEmail,
    };
  };

  /** האם ה-API לשליפת תוכן צרופות זמין בלקוח הזה (Mailbox 1.8). */
  function supportsAttachmentContent() {
    try {
      return !!(Office.context.requirements
        && Office.context.requirements.isSetSupported('Mailbox', '1.8')
        && Office.context.mailbox.item.getAttachmentContentAsync);
    } catch (e) { return false; }
  }

  function base64ToBlob(b64, type) {
    var chars = atob(b64);
    var bytes = new Uint8Array(chars.length);
    for (var i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);
    return new Blob([bytes], { type: type || 'application/octet-stream' });
  }

  /** רשימת הצרופות — בקריאה מהמאפיין, בכתיבה דרך API אסינכרוני. */
  function listAttachments() {
    var item = Office.context.mailbox.item;
    if (item.attachments) return Promise.resolve(item.attachments);
    return asyncGet(function (cb) { item.getAttachmentsAsync(cb); }, []);
  }

  /**
   * מוריד את תוכן הצרופות כ-Blobs, לשמירתן כמסמכים נפרדים בכרטיס הלקוח.
   * מדלג על צרופות inline (תמונות חתימה וכד') ועל מה שגדול מדי.
   * מחזיר [] כשה-API אינו נתמך — התיוק עצמו לא נפגע.
   */
  window.MYCRM.getAttachmentBlobs = async function getAttachmentBlobs(maxBytes) {
    var limit = maxBytes || 10 * 1024 * 1024;
    if (!supportsAttachmentContent()) return [];
    var item = Office.context.mailbox.item;
    var list = (await listAttachments()) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (!a || a.isInline) continue;
      if (a.size && a.size > limit) continue;
      /* eslint-disable no-loop-func */
      var content = await new Promise(function (resolve) {
        try {
          item.getAttachmentContentAsync(a.id, function (res) {
            resolve(res && res.status === Office.AsyncResultStatus.Succeeded ? res.value : null);
          });
        } catch (e) { resolve(null); }
      });
      /* eslint-enable no-loop-func */
      if (!content || !content.content) continue;
      // רק Base64 ניתן לשחזור כקובץ; Url/Eml/ICalendar אינם תוכן בינארי ישיר.
      var fmt = Office.MailboxEnums.AttachmentContentFormat;
      if (fmt && content.format !== fmt.Base64) continue;
      try {
        out.push({ name: a.name || ('attachment-' + (i + 1)), blob: base64ToBlob(content.content, a.contentType) });
      } catch (e) { /* צרופה פגומה — מדלגים */ }
    }
    return out;
  };

  /** מנסה להפיק קובץ EML (message.eml). מחזיר Blob או null אם לא נתמך/נכשל. */
  window.MYCRM.getEmlBlob = function getEmlBlob() {
    return new Promise(function (resolve) {
      try {
        const item = Office.context.mailbox.item;
        if (!item.getAsFileAsync) { resolve(null); return; }
        item.getAsFileAsync(function (res) {
          if (!res || res.status !== Office.AsyncResultStatus.Succeeded || !res.value) { resolve(null); return; }
          try {
            // res.value הוא base64 של ה-EML.
            const byteChars = atob(res.value);
            const bytes = new Uint8Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
            resolve(new Blob([bytes], { type: 'message/rfc822' }));
          } catch (e) { resolve(null); }
        });
      } catch (e) { resolve(null); }
    });
  };
})();
