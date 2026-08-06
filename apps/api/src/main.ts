import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Allow large request bodies — מסמכים/דוחות/הצעות מצורפים נשלחים כ-base64 (מנפח ~33%),
  // ואין להגביל את גודל הקובץ שאפשר לצרף. ברירת מחדל גבוהה מאוד (500MB), ניתן לכוונון ב-BODY_LIMIT.
  const bodyLimit = process.env.BODY_LIMIT || '500mb';
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ limit: bodyLimit, extended: true }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Simple, stable CORS policy for Vercel + local dev.
  // Fixes cases where Render doesn't have CORS_ORIGIN set for the Vercel origin.
  const corsOriginsFromEnv = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const isAllowedOrigin = (origin?: string) => {
    if (!origin) return true; // non-browser requests

    // Allow explicit origins from env if provided.
    if (corsOriginsFromEnv.includes(origin)) return true;

    // Local dev (hostname + 127.0.0.1 — avoids CORS "failed" when opening the app via 127.0.0.1)
    if (
      origin === 'http://localhost:3000' ||
      origin === 'http://localhost:3001' ||
      origin === 'http://localhost:3002' ||
      origin === 'http://127.0.0.1:3000' ||
      origin === 'http://127.0.0.1:3001' ||
      origin === 'http://127.0.0.1:3002'
    ) {
      return true;
    }

    // Production frontends — the `web` Vercel project's stable aliases ONLY.
    // (Previously any *.vercel.app was allowed; tightened to these specific origins.)
    // Add more without redeploy via the CORS_ORIGIN env var (checked above).
    const ALLOWED_PROD_ORIGINS = [
      'https://crm.galit.co.il',
      'https://www.crm.galit.co.il',
      'https://web-mu-one-96.vercel.app',
      'https://web-yayalaish34-6177s-projects.vercel.app',
      'https://web-yayalaish34-6177-yayalaish34-6177s-projects.vercel.app',
    ];
    if (ALLOWED_PROD_ORIGINS.includes(origin)) return true;

    return false;
  };

  app.enableCors({
    origin: (origin, callback) => {
      try {
        callback(null, isAllowedOrigin(origin));
      } catch (e) {
        callback(e as any, false);
      }
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-role', 'x-user-id'],
  });

  const port = Number(process.env.PORT || 3001);
  await app.listen(port);
}
bootstrap();