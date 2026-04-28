import path from 'path';
import type { AgentConfig } from './types.js';

/** Resolve the CRM project root (two levels up from agents/dev-agent/) */
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

export function getConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    maxAttempts: 3,
    projectRoot: PROJECT_ROOT,
    webDir: path.join(PROJECT_ROOT, 'apps', 'web'),
    apiDir: path.join(PROJECT_ROOT, 'apps', 'api'),
    logsDir: path.join(__dirname, 'logs'),
    allowedPaths: ['apps/web', 'apps/api'],
    dryRun: false,
    ...overrides,
  };
}
