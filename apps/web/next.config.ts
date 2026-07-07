import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

/** Absolute path to apps/web — fixes wrong workspace root when multiple lockfiles exist (e.g. user home + monorepo). */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * כתובת ה-API הציבורית שמוטמעת ב-build (NEXT_PUBLIC_API_URL). אם הוגדר משתנה סביבה
 * אמיתי ב-Vercel — הוא מנצח; אחרת נופלים לברירת המחדל = הבקאנד החי ב-Railway.
 * (הוגדר כאן כי ה-env var ב-Vercel אופס בטעות; זה מבטיח שהפרונט תמיד מדבר עם הבקאנד הנכון.)
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL?.trim() || 'https://galit.up.railway.app';

const nextConfig: NextConfig = {
  // Dev uses `next dev --webpack`; this still applies if anyone runs Turbopack or for tooling that reads the config.
  turbopack: {
    root: projectRoot,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  env: {
    NEXT_PUBLIC_API_URL: API_URL,
  },
};

export default nextConfig;
