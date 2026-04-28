import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import * as path from 'path';

export interface AgentRunResult {
  success: boolean;
  output: string;
  error: string;
  durationMs: number;
}

@Injectable()
export class DevAgentService {
  private readonly logger = new Logger(DevAgentService.name);

  /** Absolute path to the agent directory */
  private readonly agentDir = path.resolve(
    __dirname,
    '..', '..', '..', '..', 'agents', 'dev-agent',
  );

  /** Run the dev agent with the given task description */
  async run(task: string): Promise<AgentRunResult> {
    const start = Date.now();

    this.logger.log(`Starting dev-agent run: "${task.slice(0, 80)}..."`);
    this.logger.log(`Agent directory: ${this.agentDir}`);

    return new Promise<AgentRunResult>((resolve) => {
      // Run: npx tsx agent.ts "<task>"
      // Using execFile to prevent shell injection — task is passed as argument, not interpolated
      execFile(
        'npx',
        ['tsx', 'agent.ts', task],
        {
          cwd: this.agentDir,
          timeout: 10 * 60 * 1000, // 10 minutes max
          maxBuffer: 10 * 1024 * 1024, // 10MB
          shell: true, // needed for npx on Windows
        },
        (error, stdout, stderr) => {
          const durationMs = Date.now() - start;

          if (error) {
            this.logger.warn(`Dev-agent finished with error (${durationMs}ms): ${error.message}`);
            resolve({
              success: false,
              output: stdout?.toString() || '',
              error: stderr?.toString() || error.message,
              durationMs,
            });
          } else {
            this.logger.log(`Dev-agent finished successfully (${durationMs}ms)`);
            resolve({
              success: true,
              output: stdout?.toString() || '',
              error: '',
              durationMs,
            });
          }
        },
      );
    });
  }
}
