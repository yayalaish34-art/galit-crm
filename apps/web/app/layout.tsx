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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl" className={assistant.variable}>
      <body>
        {children}
        <UiTranslationApplier />
      </body>
    </html>
  );
}
