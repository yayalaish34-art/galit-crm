/* commands.js — הפעולה הישירה "הוספה ל-CRM" (ExecuteFunction). */
(function () {
  var busy = false; // מניעת לחיצה כפולה

  function notify(text, type, persistent) {
    try {
      var msg = {
        type: type === 'error'
          ? Office.MailboxEnums.ItemNotificationMessageType.ErrorMessage
          : Office.MailboxEnums.ItemNotificationMessageType.InformationalMessage,
        message: String(text).slice(0, 150),
      };
      if (type !== 'error') msg.icon = 'Icon.16';
      if (type !== 'error') msg.persistent = !!persistent;
      Office.context.mailbox.item.notificationMessages.replaceAsync('mycrm-status', msg, function () {});
    } catch (e) { /* ignore */ }
  }

  function errorText(code) {
    switch (code) {
      case 'NO_OPEN_MESSAGE': return 'יש לפתוח הודעת דואר כדי להוסיף אותה ל-CRM.';
      case 'NOT_AUTHENTICATED': return 'יש להתחבר ל-CRM (פתח את חלון My CRM).';
      case 'SERVER_UNAVAILABLE': return 'השרת אינו זמין כרגע. נסה שוב.';
      default: return 'לא ניתן היה להוסיף את המייל. ניתן לנסות שוב.';
    }
  }

  /** הפעולה הראשית — נקראת ישירות מהכפתור בסרגל. */
  async function addCurrentEmailToCrm(event) {
    if (busy) { if (event) event.completed(); return; }
    busy = true;
    try {
      notify('מוסיף את המייל ל-CRM...', 'info', true);

      // 1-3: וידוא מייל פתוח + Message Read
      var message = await window.MYCRM.readOpenMessage(); // זורק NO_OPEN_MESSAGE אם אין

      // 6: יצירת EML + הורדת הצרופות (שתיהן best-effort — לא חוסמות תיוק)
      var emlBlob = null;
      try { emlBlob = await window.MYCRM.getEmlBlob(); } catch (e) { emlBlob = null; }
      var attachmentBlobs = [];
      try { attachmentBlobs = await window.MYCRM.getAttachmentBlobs(); } catch (e) { attachmentBlobs = []; }

      var metadata = {
        source: 'OUTLOOK_ADDIN',
        subject: message.subject,
        senderName: message.senderName,
        senderEmail: message.senderEmail,
        to: message.to,
        cc: message.cc,
        receivedAt: message.receivedAt,
        sentAt: message.sentAt,
        bodyHtml: message.bodyHtml,
        bodyText: message.bodyText,
        outlookItemId: message.outlookItemId,
        internetMessageId: message.internetMessageId,
        conversationId: message.conversationId,
        mailboxEmail: message.mailboxEmail,
        hasAttachments: message.hasAttachments,
        attachments: message.attachments,
        emlArchived: !!emlBlob,
      };

      // 7: שליחה לשרת
      var result = await window.MYCRM.importEmail(metadata, emlBlob, attachmentBlobs);

      if (result && result.success) {
        var num = result.requestNumber || '';
        notify(result.duplicate
          ? ('המייל כבר מתויק בבקשה ' + num)
          : ('המייל נוסף לבקשה ' + num), 'info', true);
      } else {
        notify(errorText((result && result.errorCode) || ''), 'error');
      }
    } catch (e) {
      notify(errorText(e && e.message), 'error');
    } finally {
      busy = false;
      if (event) event.completed(); // 9: תמיד
    }
  }

  /**
   * תיוק מייל **יוצא** בזמן כתיבה. נפרד מהמסלול של הקריאה כי הודעה שנכתבת
   * עדיין לא נשלחה: אין לה שולח, תאריך קבלה או Message-ID, וכל שדה נקרא
   * אסינכרונית. השרת משייך אותה לכרטיס לפי **הנמענים** (direction=OUTGOING).
   */
  async function fileComposeEmailToCrm(event) {
    if (busy) { if (event) event.completed(); return; }
    busy = true;
    try {
      notify('מתייק את המייל ל-CRM...', 'info', true);
      var message = await window.MYCRM.readComposeMessage();

      var metadata = {
        source: 'OUTLOOK_ADDIN',
        direction: 'OUTGOING',
        subject: message.subject,
        senderName: message.senderName,
        senderEmail: message.senderEmail,
        to: message.to,
        cc: message.cc,
        receivedAt: message.receivedAt,
        sentAt: message.sentAt,
        bodyHtml: message.bodyHtml,
        bodyText: message.bodyText,
        outlookItemId: message.outlookItemId,
        internetMessageId: message.internetMessageId,
        conversationId: message.conversationId,
        mailboxEmail: message.mailboxEmail,
        hasAttachments: message.hasAttachments,
        attachments: message.attachments,
        emlArchived: false,
      };

      // בכתיבה אין getAsFileAsync ולכן אין EML — אבל את הצרופות עצמן כן אפשר
      // למשוך, וכך הן נשמרות בכרטיס הלקוח גם במייל יוצא.
      var attachmentBlobs = [];
      try { attachmentBlobs = await window.MYCRM.getAttachmentBlobs(); } catch (e) { attachmentBlobs = []; }
      var result = await window.MYCRM.importEmail(metadata, null, attachmentBlobs);

      if (result && result.success) {
        var num = result.requestNumber || '';
        notify(result.duplicate
          ? ('המייל כבר מתויק בבקשה ' + num)
          : ('המייל תויק בבקשה ' + num), 'info', true);
      } else {
        notify(errorText((result && result.errorCode) || ''), 'error');
      }
    } catch (e) {
      notify(errorText(e && e.message), 'error');
    } finally {
      busy = false;
      if (event) event.completed();
    }
  }

  // רישום הפונקציות ל-Office (נדרש עבור ExecuteFunction).
  if (typeof Office !== 'undefined') {
    Office.onReady(function () {});
    if (Office.actions && Office.actions.associate) {
      Office.actions.associate('addCurrentEmailToCrm', addCurrentEmailToCrm);
      Office.actions.associate('fileComposeEmailToCrm', fileComposeEmailToCrm);
    }
  }
  // חשיפה גלובלית (תאימות לפלטפורמות שקוראות לשם הפונקציה ישירות).
  window.addCurrentEmailToCrm = addCurrentEmailToCrm;
  window.fileComposeEmailToCrm = fileComposeEmailToCrm;
})();
