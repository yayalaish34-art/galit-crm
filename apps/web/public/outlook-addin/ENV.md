# משתני סביבה — Outlook Add-in

## צד השרת (Railway — apps/api)

| משתנה | חובה | תיאור |
|---|---|---|
| `JWT_SECRET` | ✔ (קיים) | חתימת ה-JWT של ה-CRM. כבר מוגדר; ה-SSO exchange מנפיק JWT קצר-טווח (8ש') איתו. |
| `CRM_PUBLIC_URL` | מומלץ | בסיס הכתובת הציבורית לבניית `requestUrl` (ברירת מחדל: `https://crm.galit.co.il`). |
| `OPENAI_API_KEY` | אופציונלי | לסיווג שירות אוטומטי (`AiMailService`). בלעדיו הבקשה נוצרת בלי סיווג. |
| `DATABASE_URL` | ✔ (קיים) | Postgres. |

> אין להוסיף secrets לתוסף עצמו או ל-`manifest.xml`.

## צד הלקוח (התוסף)
מוגדר ב-`config.js` (לא secrets):
- `CRM_PUBLIC_URL = https://crm.galit.co.il`
- `CRM_API_URL = https://galit.up.railway.app`

## Office-SSO (Azure) — נדרש להתחברות ללא סיסמה
כדי ש-`Office.auth.getAccessToken` יעבוד, יש להשלים ב-Azure Portal:
1. **App registration** עבור התוסף (יכול להיות אותו App של Graph הקיים או חדש).
2. הוסף למניפסט בלוק `<WebApplicationInfo>` עם `<Id>` (Application (client) ID) ו-`<Resource>`
   (`api://crm.galit.co.il/<client-id>`), ו-`<Scope>` (`access_as_user`).
3. ב-Azure: **Expose an API** → הוסף scope `access_as_user`; **API permissions** → Graph `User.Read`.
4. הוסף את מזהי הלקוח של Outlook ל-Pre-authorized applications (Web/Desktop Outlook).

> אם ה-SSO אינו זמין בסביבתכם, ניתן להוסיף מסך התחברות (email+password → `POST /auth/login`)
> בחלון ה-taskpane כ-fallback. הזרימה בקוד כבר מפרידה בין השגת הטוקן (`ensureCrmToken`) לשליחה,
> כך שהחלפת מקור הטוקן היא נקודתית.

## מיגרציית DB
`prisma/migrations/20260730120000_outlook_addin/` — מרחיב את `CustomerEmailRequest`
(requestNumber, source, status, outlookItemId, conversationId, mailboxEmail, toJson/ccJson,
bodyHtml, emlArchived, emlDocumentId, serviceTypeGuess) ומוסיף טבלת `OutlookImportAudit`.
הרצה: `railway run npx prisma migrate deploy` (או החלת ה-SQL ישירות — ראה הערת ה-gotcha במטמון).
