import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

/** Max task length */
const MAX_TASK_LENGTH = 2000;

/** Dangerous shell patterns to reject */
const DANGEROUS_PATTERNS = [
  /[;&|`$]/,          // shell operators
  /\.\.\//,           // path traversal
  /\n/,               // newlines
  /\\n/,              // escaped newlines
  /rm\s+-/i,          // rm commands
  /sudo/i,            // sudo
  /chmod/i,           // chmod
  /chown/i,           // chown
  /curl\s/i,          // curl
  /wget\s/i,          // wget
  /eval\s*\(/i,       // eval
  />\s*\//,           // redirect to path
];

function isTaskSafe(task: string): boolean {
  return !DANGEROUS_PATTERNS.some((p) => p.test(task));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { task, dryRun } = body as { task?: string; dryRun?: boolean };

    // Validate task
    if (!task || typeof task !== 'string' || !task.trim()) {
      return NextResponse.json(
        { status: 'error', error: 'task is required', stdout: '', stderr: '', exitCode: -1 },
        { status: 400 },
      );
    }

    const trimmed = task.trim();

    if (trimmed.length > MAX_TASK_LENGTH) {
      return NextResponse.json(
        { status: 'error', error: `task too long (max ${MAX_TASK_LENGTH} chars)`, stdout: '', stderr: '', exitCode: -1 },
        { status: 400 },
      );
    }

    if (!isTaskSafe(trimmed)) {
      return NextResponse.json(
        { status: 'error', error: 'task contains forbidden characters', stdout: '', stderr: '', exitCode: -1 },
        { status: 400 },
      );
    }

    // Resolve agent directory (apps/web -> project root -> agents/dev-agent)
    const agentDir = path.resolve(process.cwd(), '..', '..', 'agents', 'dev-agent');

    // Build command args — only the fixed script, task passed as a single argument
    const args = dryRun
      ? ['run', 'agent:dry', '--', trimmed]
      : ['run', 'agent', '--', trimmed];

    // Run using spawn for safety — no shell interpolation of the task
    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      const chunks: string[] = [];
      const errChunks: string[] = [];

      const child = spawn('npm', args, {
        cwd: agentDir,
        shell: true,        // needed for npm on Windows
        timeout: 10 * 60 * 1000, // 10 minutes
        env: { ...process.env },
      });

      child.stdout?.on('data', (data: Buffer) => {
        chunks.push(data.toString());
      });

      child.stderr?.on('data', (data: Buffer) => {
        errChunks.push(data.toString());
      });

      child.on('close', (code) => {
        resolve({
          stdout: chunks.join(''),
          stderr: errChunks.join(''),
          exitCode: code ?? 1,
        });
      });

      child.on('error', (err) => {
        resolve({
          stdout: chunks.join(''),
          stderr: err.message,
          exitCode: 1,
        });
      });
    });

    return NextResponse.json({
      status: result.exitCode === 0 ? 'success' : 'error',
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  } catch (err: any) {
    return NextResponse.json(
      { status: 'error', error: err.message || 'Unknown error', stdout: '', stderr: '', exitCode: -1 },
      { status: 500 },
    );
  }
}
