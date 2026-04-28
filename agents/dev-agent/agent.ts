import { getConfig } from './config.js';
import { Logger } from './logger.js';
import { isDirty, getDirtyFiles, createBranch, getChangedFiles, getUnauthorizedFiles, getCurrentBranch } from './git-manager.js';
import { buildPrompt, runClaude } from './runner.js';
import { validate } from './validator.js';
import type { AgentConfig, AttemptRecord, RunSummary } from './types.js';

// ──────────────────────────────────────────────
// Parse CLI arguments
// ──────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const taskArgs = args.filter((a) => !a.startsWith('--'));
const task = taskArgs.join(' ').trim();

if (!task) {
  console.error('\n❌ לא הוזנה משימה.');
  console.error('שימוש: npm run agent -- "תיאור המשימה"\n');
  process.exit(1);
}

// ──────────────────────────────────────────────
// Create slug from task text (first few Hebrew/English words)
// ──────────────────────────────────────────────
function createSlug(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9\u0590-\u05FF\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join('-')
    .slice(0, 50)
    || 'task';
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────
async function main() {
  const config: AgentConfig = getConfig({ dryRun });
  const slug = createSlug(task);
  const logger = new Logger(config.logsDir, slug);
  const startTime = new Date();

  logger.info(`סוכן פיתוח גלית — התחלה`);
  logger.info(`משימה: ${task}`);
  logger.info(`dry-run: ${dryRun}`);
  logger.info(`מקסימום ניסיונות: ${config.maxAttempts}`);
  logger.info(``);

  // ── Step 1: Check for dirty git ──
  if (isDirty(config)) {
    const dirty = getDirtyFiles(config);
    logger.error(`יש שינויים לא שמורים ב-git. הסוכן לא יכול להמשיך.`);
    logger.error(`קבצים שהשתנו:`);
    dirty.forEach((f) => logger.error(`  ${f}`));
    logger.info(``);
    logger.info(`פתרון: בצע git add + git commit או git stash לפני הרצת הסוכן.`);

    const summary: RunSummary = {
      status: 'stopped_dirty_git',
      task,
      branch: getCurrentBranch(config),
      slug,
      attempts: 0,
      filesChanged: [],
      validationsRun: [],
      remainingErrors: 'Working tree is dirty — agent cannot start.',
      startTime: startTime.toISOString(),
      endTime: new Date().toISOString(),
      totalDurationMs: Date.now() - startTime.getTime(),
      logDir: logger.getLogDir(),
      howToVerify: 'Fix uncommitted changes and re-run.',
    };
    logger.saveSummary(summary);
    process.exit(1);
  }

  // ── Step 2: Create branch ──
  let branch: string;
  try {
    branch = createBranch(config, slug);
    logger.success(`נוצר branch: ${branch}`);
  } catch (err: any) {
    logger.error(`כשל ביצירת branch: ${err.message}`);
    process.exit(1);
  }

  // ── Step 3: Run attempts loop ──
  const attemptRecords: AttemptRecord[] = [];
  let lastErrors = '';
  let lastFilesChanged: string[] = [];
  let lastChecksRun: string[] = [];
  let succeeded = false;
  let stoppedUnauthorized = false;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    logger.info(`── ניסיון ${attempt}/${config.maxAttempts} ──`);
    const attemptStart = Date.now();

    // Build prompt
    const prompt = buildPrompt(task, {
      previousErrors: attempt > 1 ? lastErrors : undefined,
      attempt,
    });

    if (dryRun) {
      logger.info(`[DRY RUN] הפרומפט שהיה נשלח לקלוד:`);
      console.log('\n' + prompt + '\n');

      const record: AttemptRecord = {
        attempt,
        prompt,
        claudeOutput: '[dry run — not executed]',
        claudeExitCode: 0,
        validationPassed: false,
        validationErrors: '',
        filesChanged: [],
        durationMs: Date.now() - attemptStart,
      };
      logger.saveAttempt(record);
      attemptRecords.push(record);
      break;
    }

    // Run Claude
    logger.info(`מריץ Claude Code...`);
    const { output, exitCode } = runClaude(prompt, config);

    logger.info(`Claude סיים (exit code: ${exitCode})`);

    // Check which files changed
    const changedFiles = getChangedFiles(config);
    lastFilesChanged = changedFiles;
    logger.info(`קבצים שהשתנו: ${changedFiles.length > 0 ? changedFiles.join(', ') : 'אין'}`);

    // Check for unauthorized file changes
    const unauthorized = getUnauthorizedFiles(changedFiles, config.allowedPaths);
    if (unauthorized.length > 0) {
      logger.error(`קלוד שינה קבצים מחוץ לתחום המותר!`);
      unauthorized.forEach((f) => logger.error(`  ⚠ ${f}`));
      logger.info(`הסוכן עוצר. נדרש אישור ידני.`);

      const record: AttemptRecord = {
        attempt,
        prompt,
        claudeOutput: output,
        claudeExitCode: exitCode,
        validationPassed: false,
        validationErrors: `Unauthorized files changed: ${unauthorized.join(', ')}`,
        filesChanged: changedFiles,
        durationMs: Date.now() - attemptStart,
      };
      logger.saveAttempt(record);
      attemptRecords.push(record);
      stoppedUnauthorized = true;
      break;
    }

    // Validate
    logger.info(`מריץ בדיקות...`);
    const validation = validate(config, changedFiles);
    lastChecksRun = validation.checksRun;
    lastErrors = validation.errors;

    validation.checksRun.forEach((c) => logger.info(`  ${c}`));

    const record: AttemptRecord = {
      attempt,
      prompt,
      claudeOutput: output,
      claudeExitCode: exitCode,
      validationPassed: validation.passed,
      validationErrors: validation.errors,
      filesChanged: changedFiles,
      durationMs: Date.now() - attemptStart,
    };
    logger.saveAttempt(record);
    attemptRecords.push(record);

    if (validation.passed) {
      logger.success(`כל הבדיקות עברו בהצלחה!`);
      succeeded = true;
      break;
    }

    logger.error(`בדיקות נכשלו. ${attempt < config.maxAttempts ? 'שולח שגיאות לקלוד לתיקון...' : 'הגענו למקסימום ניסיונות.'}`);
  }

  // ── Step 4: Summary ──
  const endTime = new Date();
  const status = stoppedUnauthorized
    ? 'stopped_unauthorized_files' as const
    : succeeded
      ? 'success' as const
      : 'failed' as const;

  const summary: RunSummary = {
    status,
    task,
    branch,
    slug,
    attempts: attemptRecords.length,
    filesChanged: lastFilesChanged,
    validationsRun: lastChecksRun,
    remainingErrors: succeeded ? '' : lastErrors.slice(0, 2000),
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    totalDurationMs: endTime.getTime() - startTime.getTime(),
    logDir: logger.getLogDir(),
    howToVerify: succeeded
      ? `git checkout ${branch} && cd apps/web && npm run dev`
      : `בדוק את הלוגים ב: ${logger.getLogDir()}`,
  };
  logger.saveSummary(summary);

  // Print summary
  console.log('\n');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║          סיכום ריצת הסוכן                ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`  סטטוס:       ${status === 'success' ? '✅ הצלחה' : status === 'stopped_unauthorized_files' ? '⚠ עצירה — קבצים לא מורשים' : '❌ כישלון'}`);
  console.log(`  משימה:       ${task.slice(0, 80)}`);
  console.log(`  branch:      ${branch}`);
  console.log(`  ניסיונות:     ${attemptRecords.length}/${config.maxAttempts}`);
  console.log(`  קבצים ששונו: ${lastFilesChanged.length > 0 ? lastFilesChanged.join(', ') : 'אין'}`);
  console.log(`  בדיקות:      ${lastChecksRun.join(', ') || 'לא רצו'}`);
  if (!succeeded && lastErrors) {
    console.log(`  שגיאות:      ${lastErrors.slice(0, 300)}`);
  }
  console.log(`  זמן ריצה:    ${Math.round(summary.totalDurationMs / 1000)}s`);
  console.log(`  לוגים:       ${logger.getLogDir()}`);
  console.log(`  בדיקה:       ${summary.howToVerify}`);
  console.log('');

  process.exit(status === 'success' ? 0 : 1);
}

main().catch((err) => {
  console.error('❌ שגיאה לא צפויה:', err);
  process.exit(1);
});
