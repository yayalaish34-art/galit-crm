import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Allow large request bodies — merged DOCX quotes are sent as base64 (~2-5 MB).
  // Default Express limit is 100 KB which rejected every quote send/save.
  app.use(json({ limit: '25mb' }));
  app.use(urlencoded({ limit: '25mb', extended: true }));

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

    // Main Vercel domain
    if (origin === 'https://galit-crm.vercel.app') return true;

    // Any Vercel preview domain (requested)
    if (/^https:\/\/.+\.vercel\.app$/.test(origin)) return true;

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