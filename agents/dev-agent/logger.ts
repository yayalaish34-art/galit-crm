import fs from 'fs';
import path from 'path';
import type { AttemptRecord, RunSummary } from './types.js';

export class Logger {
  private logDir: string;

  constructor(logsRoot: string, slug: string) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.logDir = path.join(logsRoot, `${ts}-${slug}`);
    fs.mkdirSync(this.logDir, { recursive: true });
  }

  getLogDir(): string {
    return this.logDir;
  }

  /** Save a single attempt record */
  saveAttempt(record: AttemptRecord): void {
    const file = path.join(this.logDir, `attempt-${record.attempt}.json`);
    fs.writeFileSync(file, JSON.stringify(record, null, 2), 'utf-8');
  }

  /** Save the final run summary */
  saveSummary(summary: RunSummary): void {
    const file = path.join(this.logDir, 'summary.json');
    fs.writeFileSync(file, JSON.stringify(summary, null, 2), 'utf-8');
  }

  /** Print a message to stdout with timestamp */
  info(msg: string): void {
    const ts = new Date().toLocaleTimeString('he-IL');
    console.log(`[${ts}] ${msg}`);
  }

  /** Print error message */
  error(msg: string): void {
    const ts = new Date().toLocaleTimeString('he-IL');
    console.error(`[${ts}] ❌ ${msg}`);
  }

  /** Print success message */
  success(msg: string): void {
    const ts = new Date().toLocaleTimeString('he-IL');
    console.log(`[${ts}] ✅ ${msg}`);
  }
}
