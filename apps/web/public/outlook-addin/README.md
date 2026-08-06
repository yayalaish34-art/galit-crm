# My CRM — Outlook Add-in

תוסף Outlook השומר הודעת דואר פתוחה כ**בקשה** בכרטיס הלקוח ב-CRM (טאב "בקשות"),
כולל שולח / נושא / גוף / קובץ ה-EML המקורי.

## מבנה

```
apps/web/public/outlook-addin/        ← מוגש סטטית ב-https://crm.galit.co.il/outlook-addin/
  manifest.xml            ← מניפסט התוסף (מאומת ✓)
  commands.html/.js       ← כפתור "הוספה ל-CRM" (ExecuteFunction — בלי חלון צד)
  taskpane.html/.js       ← חלון "פתיחת My CRM" (זיהוי, סטטוס, הוספה, קישור לבקשה)
  config.js               ← כתובות ה-CRM/API (ללא secrets)
  outlook-message.js      ← קריאת המייל + הפקת EML דרך Office.js
  crm-api.js              ← SSO exchange + שליחת המייל (multipart)
  assets/icon-*.png       ← אייקונים (placeholder — יש להחליף בלוגו My CRM)
```

צד השרת (NestJS):
```
apps/api/src/integrations/outlook/
  outlook.controller.ts       POST /integrations/outlook/auth  (SSO exchange)
                              POST /integrations/outlook/requests  (multipart, מוגן JWT)
  outlook-import.service.ts   דדופ / שיוך לקוח / EML כ-Document / סיווג / audit
  outlook-auth.service.ts     אימות זהות Microsoft → JWT של ה-CRM
  outlook-import.service.spec.ts  בדיקות (6, עוברות)
```

## זרימת עבודה

1. העובד פותח מייל ב-Outlook ולוחץ **"הוספה ל-CRM"**.
2. התוסף קורא את המייל (Office.js), מפיק EML (אם נתמך), ומזהה את העובד דרך Office-SSO.
3. השרת:
   - מזהה את העובד מה-JWT (לא מ-metadata),
   - בודק כפילות (internetMessageId → outlookItemId),
   - משייך לפי `senderEmail` ללקוח/איש-קשר קיים, אחרת ל**"בקשות נכנסות (Outlook)"**,
   - יוצר בקשה (`CustomerEmailRequest`, source=`OUTLOOK_ADDIN`),
   - שומר את ה-EML כ-`Document` (dataBase64),
   - מסווג את השירות (best-effort),
   - רושם `OutlookImportAudit`.
4. מוצגת הודעה: **"המייל נוסף לבקשה REQ-1234"** + קישור לפתיחתה.

## דרישות (Add-in only manifest)
- Host: Mailbox · Permission: ReadItem · DefaultLocale: he-IL (RTL) · Message Read בלבד.
- שני כפתורים ב-`MessageReadCommandSurface`: "הוספה ל-CRM" (ExecuteFunction) + "פתיחת My CRM" (Taskpane).
- אימות מניפסט: `npx office-addin-manifest validate manifest.xml` → **The manifest is valid.**

## Sideload (התקנה ידנית ב-Outlook)

### Outlook החדש / בדפדפן (OWA)
1. הגדרות ⚙ → **Manage add-ins** / **Get add-ins** → **My add-ins** → **Add a custom add-in** → **Add from URL**.
2. הזן: `https://crm.galit.co.il/outlook-addin/manifest.xml` → **Install**.
3. פתח מייל שהתקבל → בסרגל הכפתורים יופיע **My CRM › הוספה ל-CRM**.

### Outlook קלאסי (דסקטופ Windows)
1. **File → Manage Add-ins** (נפתח ב-OWA) → כנ"ל, Add from URL עם כתובת ה-manifest.

> הערה: ההתקנה מ-URL דורשת שהמניפסט והקבצים יהיו נגישים ב-HTTPS (הם מוגשים דרך Vercel).

## הגדרת סביבה
ראה [ENV.md](./ENV.md).

## התחברות
- **ברירת מחדל: התחברות עם אימייל+סיסמה של ה-CRM** בחלון הצד ("פתיחת My CRM"). העובד מזין
  את פרטי ה-CRM שלו פעם אחת → מקבל JWT (8 שעות) שנשמר בתוסף. אין צורך בהגדרת Azure.
- **SSO אוטומטי (אופציונלי)**: אם מגדירים Azure App (ראה ENV.md), התוסף ינסה SSO בשקט בכניסה
  ורק אם ייכשל יציג את מסך ההתחברות. הקוד תומך בשני המסלולים אוטומטית.
- כפתור **"הוספה ל-CRM"** הישיר משתמש בטוקן ששמור מהתחברות בחלון הצד; אם עדיין לא התחברת,
  הוא יבקש לפתוח את חלון My CRM ולהתחבר.

## מגבלות ידועות
- **Office-SSO** (אופציונלי) דורש רישום Azure App עם `webApplicationInfo`. עד שמוגדר — משתמשים
  בהתחברות email+password (עובד מיד). ראה ENV.md.
- האייקונים הם placeholder (ריבוע טורקיז) — יש להחליף בלוגו My CRM אמיתי (16/32/64/80).
- `SupportsPinning` הוסר מהמניפסט כי סכימת ה-mail 1.1 דחתה אותו; Outlook החדש מציע הצמדה
  אוטומטית לחלונות taskpane.
- חילוץ קבצים מצורפים בנפרד (מעבר ל-EML) לא מיושם בגרסה זו (ה-EML הוא התיעוד המלא).
