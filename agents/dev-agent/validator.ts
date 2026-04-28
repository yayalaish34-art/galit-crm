import { execSync } from 'child_process';
import type { AgentConfig, ValidationResult } from './types.js';

/**
 * Determine which parts of the project were affected based on changed file paths.
 */
function detectScope(changedFiles: string[]): { web: boolean; api: boolean } {
  return {
    web: changedFiles.some((f) => f.startsWith('apps/web')),
    api: changedFiles.some((f) => f.startsWith('apps/api')),
  };
}

/**
 * Run a shell command and return { ok, output }.
 * Does not throw — captures errors.
 */
function runCheck(cmd: string, cwd: string, label: string): { ok: boolean; output: string; label: string } {
  try {
    const output = execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      timeout: 3 * 60 * 1000, // 3 minutes
      maxBuffer: 5 * 1024 * 1024,
    });
    return { ok: true, output: output.trim(), label };
  } catch (err: any) {
    const output = [err.stdout, err.stderr, err.message]
      .filter(Boolean)
      .map((s: any) => s.toString())
      .join('\n');
    return { ok: false, output: output.trim(), label };
  }
}

/**
 * Validate the project after Claude made changes.
 * Runs only the checks relevant to the files that changed.
 */
export function validate(config: AgentConfig, changedFiles: string[]): ValidationResult {
  const scope = detectScope(changedFiles);
  const checks: { ok: boolean; output: string; label: string }[] = [];

  // If no files changed, nothing to validate
  if (changedFiles.length === 0) {
    return { passed: true, errors: '', checksRun: ['none — no files changed'] };
  }

  // Web checks
  if (scope.web) {
    // TypeScript check only (fast, no full build)
    checks.push(runCheck('npx tsc --noEmit', config.webDir, 'web:typecheck'));
  }

  // API checks
  if (scope.api) {
    checks.push(runCheck('npx tsc --noEmit', config.apiDir, 'api:typecheck'));
  }

  // If neither web nor api were touched, run a basic check on both
  if (!scope.web && !scope.api) {
    checks.push(runCheck('npx tsc --noEmit', config.webDir, 'web:typecheck (fallback)'));
  }

  const failed = checks.filter((c) => !c.ok);
  const checksRun = checks.map((c) => `${c.label}: ${c.ok ? 'PASS' : 'FAIL'}`);

  if (failed.length === 0) {
    return { passed: true, errors: '', checksRun };
  }

  // Combine error outputs
  const errors = failed
    .map((c) => `=== ${c.label} ===\n${c.output}`)
    .join('\n\n');

  return { passed: false, errors, checksRun };
}
