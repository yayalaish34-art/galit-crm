import './globals.css';
import { Assistant } from 'next/font/google';
import UiTranslationApplier from './UiTranslationApplier';

// Professional Hebrew + Latin web font, loaded once and exposed as --font-assistant.
// globals.css wires --font-sans to this variable so the whole UI uses it.
const assistant = Assistant({
  subsets: ['hebrew', 'latin'],
  variable: '--font-assistant',
  display: 'swap',
});

export const metadata = {
  title: 'גלית CRM',
  description: 'מערכת CRM לחברת גלית',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/icon.png', type: 'image/png' }],
    apple: [{ url: '/apple-icon.png', type: 'image/png' }],
  },
};

export const viewport = {
  themeColor: '#5a9c2e',
  // חובה כדי שהאתר יוצג נכון בטלפון (רוחב אמיתי של המכשיר במקום ~980px של דסקטופ).
  // בלי זה הדפדפן בטלפון מקטין את הכל ונראה "שבור" עד שמסובבים לרוחב.
  width: 'device-width',
  initialScale: 1,
  // מאפשר למשתמש עדיין לזום ידני (נגישות) — לא נועלים.
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl" className={assistant.variable}>
      <head>
        {/* מחיל את מצב התצוגה השמור (בהיר/כהה) לפני הצביעה הראשונה — מונע הבהוב לבן בטעינה */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('galit-crm-theme');if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}`,
          }}
        />
      </head>
      <body>
        {children}
        <UiTranslationApplier />
      </body>
    </html>
  );
}
