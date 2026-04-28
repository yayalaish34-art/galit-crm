import { execSync } from 'child_process';
import type { AgentConfig } from './types.js';

/**
 * Run a git command in the project root. Returns stdout as string.
 */
function git(args: string, cwd: string): string {
  return execSync(`git ${args}`, { cwd, encoding: 'utf-8', timeout: 30_000 }).trim();
}

/**
 * Check if the working tree has uncommitted changes.
 * Returns true if dirty (uncommitted changes exist).
 */
export function isDirty(config: AgentConfig): boolean {
  const status = git('status --porcelain', config.projectRoot);
  return status.length > 0;
}

/**
 * Get list of uncommitted changed files (for reporting).
 */
export function getDirtyFiles(config: AgentConfig): string[] {
  const status = git('status --porcelain', config.projectRoot);
  if (!status) return [];
  return status.split('\n').map((line) => line.trim());
}

/**
 * Create a new branch for the task. Returns the branch name.
 */
export function createBranch(config: AgentConfig, slug: string): string {
  const ts = new Date().toISOString().replace(/[:.T]/g, '').slice(0, 14);
  const branchName = `dev-agent/task-${ts}-${slug}`;
  git(`checkout -b ${branchName}`, config.projectRoot);
  return branchName;
}

/**
 * Get list of files changed since the branch was created (compared to parent).
 */
export function getChangedFiles(config: AgentConfig): string[] {
  try {
    // Files changed in working tree + staged
    const diff = git('diff --name-only HEAD', config.projectRoot);
    const staged = git('diff --name-only --cached', config.projectRoot);
    const untracked = git('ls-files --others --exclude-standard', config.projectRoot);

    const all = new Set<string>();
    for (const output of [diff, staged, untracked]) {
      if (output) {
        output.split('\n').forEach((f) => { if (f.trim()) all.add(f.trim()); });
      }
    }
    return [...all];
  } catch {
    return [];
  }
}

/**
 * Check if any changed files are outside the allowed paths.
 * Returns list of unauthorized file paths.
 */
export function getUnauthorizedFiles(
  changedFiles: string[],
  allowedPaths: string[],
): string[] {
  return changedFiles.filter((file) => {
    return !allowedPaths.some((allowed) => file.startsWith(allowed));
  });
}

/**
 * Get current branch name.
 */
export function getCurrentBranch(config: AgentConfig): string {
  return git('rev-parse --abbrev-ref HEAD', config.projectRoot);
}
