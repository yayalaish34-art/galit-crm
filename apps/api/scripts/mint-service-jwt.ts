/**
 * Mint a long-lived SERVICE JWT for machine-to-machine callers of this API —
 * currently the WhatsApp-bot voice assistant ("גלי"), which creates/updates
 * CRM tasks through /tasks on behalf of spoken requests.
 *
 * The token is signed with the SAME JWT_SECRET the API verifies with
 * (RolesGuard), so no server change is needed. Role ADMIN is used so the
 * caller may set `ownerId` explicitly (the voice layer always sets it to the
 * SPEAKING user — ownership stays truthful).
 *
 * Usage (from apps/api, with JWT_SECRET in env or .env):
 *   npx ts-node scripts/mint-service-jwt.ts [days]
 *
 * Default lifetime: 365 days. Paste the output into the bot's env as
 * CRM_SERVICE_JWT (Render dashboard). Rotate by re-running + replacing.
 */
import { JwtService } from '@nestjs/jwt';

// Load .env like the API does, if present (no hard dependency on it).
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config();
} catch {
  /* dotenv not installed here — rely on process env */
}

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('JWT_SECRET is not set. Run with the API env (Railway: `railway run`).');
  process.exit(1);
}

const days = Number(process.argv[2] ?? 365);
if (!Number.isFinite(days) || days <= 0 || days > 3650) {
  console.error('days must be a number between 1 and 3650');
  process.exit(1);
}

const jwt = new JwtService({ secret });
const token = jwt.sign(
  {
    sub: 'voice-assistant-service',
    role: 'ADMIN',
    email: 'voice-assistant@internal',
    name: 'העוזרת הקולית (שירות)',
  },
  { expiresIn: `${days}d` },
);

console.log('\n=== CRM service JWT (voice assistant) ===\n');
console.log(token);
console.log(`\nתוקף: ${days} ימים. שמור כ-CRM_SERVICE_JWT בסביבת הבוט (Render).\n`);
