/** Task status after agent run */
export type TaskStatus = 'success' | 'failed' | 'stopped_unauthorized_files' | 'stopped_dirty_git';

/** A single attempt record */
export interface AttemptRecord {
  attempt: number;
  prompt: string;
  claudeOutput: string;
  claudeExitCode: number;
  validationPassed: boolean;
  validationErrors: string;
  filesChanged: string[];
  durationMs: number;
}

/** Final summary of an agent run */
export interface RunSummary {
  status: TaskStatus;
  task: string;
  branch: string;
  slug: string;
  attempts: number;
  filesChanged: string[];
  validationsRun: string[];
  remainingErrors: string;
  startTime: string;
  endTime: string;
  totalDurationMs: number;
  logDir: string;
  howToVerify: string;
}

/** Agent configuration */
export interface AgentConfig {
  maxAttempts: number;
  projectRoot: string;
  webDir: string;
  apiDir: string;
  logsDir: string;
  allowedPaths: string[];
  dryRun: boolean;
}

/** Validation result */
export interface ValidationResult {
  passed: boolean;
  errors: string;
  checksRun: string[];
}
