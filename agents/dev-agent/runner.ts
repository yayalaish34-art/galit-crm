import { execSync } from 'child_process';
import type { AgentConfig } from './types.js';

/**
 * Build a structured prompt for Claude Code from a task description.
 */
export function buildPrompt(task: string, context?: { previousErrors?: string; attempt?: number }): string {
  const lines: string[] = [];

  // 1. כלל קשיח
  lines.push(`כלל קשיח:`);
  lines.push(`- לא לגעת בשום דבר מחוץ למשימה הזו.`);
  lines.push(`- לא ריפקטור.`);
  lines.push(`- לא לשנות לוגיקה שלא קשורה למשימה.`);
  lines.push(`- לא לגעת בשרת / API אלא אם המשימה דורשת זאת במפורש.`);
  lines.push(`- אם משהו לא ברור — לעצור בלי לשנות.`);
  lines.push(``);

  // 2. רקע
  lines.push(`רקע:`);
  lines.push(`מדובר במערכת CRM בעברית (RTL), בנויה ב-Next.js (apps/web) ו-NestJS (apps/api).`);
  lines.push(`Prisma ORM, PostgreSQL, Redis.`);
  lines.push(``);

  // 3. המשימה
  if (context?.previousErrors && context.attempt && context.attempt > 1) {
    lines.push(`המשימה המקורית:`);
    lines.push(task);
    lines.push(``);
    lines.push(`ניסיון תיקון מספר ${context.attempt}:`);
    lines.push(`הריצה הקודמת נכשלה עם השגיאות הבאות:`);
    lines.push(context.previousErrors);
    lines.push(``);
    lines.push(`תקן רק את השגיאות שלמעלה. אל תשנה דברים אחרים.`);
  } else {
    lines.push(`המשימה:`);
    lines.push(task);
  }
  lines.push(``);

  // 4. מה לבצע
  lines.push(`מה לבצע בפועל:`);
  lines.push(`- לבצע את המשימה כפי שמתוארת למעלה.`);
  lines.push(`- לוודא שאין שגיאות TypeScript.`);
  lines.push(``);

  // 5. מה אסור
  lines.push(`מה אסור לעשות:`);
  lines.push(`- לא לשנות קבצים שלא קשורים למשימה.`);
  lines.push(`- לא ריפקטור כללי.`);
  lines.push(`- לא למחוק קוד קיים שלא קשור.`);
  lines.push(`- לא לעשות commit.`);
  lines.push(``);

  // 6. מה להחזיר
  lines.push(`בסיום תחזיר:`);
  lines.push(`- איזה קובץ/קבצים שינית.`);
  lines.push(`- מה בדיוק שינית.`);
  lines.push(`- אישור שאין שגיאות.`);

  return lines.join('\n');
}

/**
 * Run Claude Code in non-interactive mode with the given prompt.
 * Returns { output, exitCode }.
 */
export function runClaude(
  prompt: string,
  config: AgentConfig,
): { output: string; exitCode: number } {
  const cmd = `claude --print --output-format json`;

  try {
    const output = execSync(cmd, {
      cwd: config.projectRoot,
      encoding: 'utf-8',
      timeout: 5 * 60 * 1000, // 5 minutes max
      input: prompt,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });
    return { output, exitCode: 0 };
  } catch (err: any) {
    // execSync throws on non-zero exit code
    return {
      output: err.stdout?.toString() || err.stderr?.toString() || err.message || 'Unknown error',
      exitCode: err.status ?? 1,
    };
  }
}
