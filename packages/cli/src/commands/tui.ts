import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRunJson } from '@foundry/core/schema/run-json.js';
import { findLatestRun, RunStateError } from '@foundry/core/state/run-writer.js';
import { renderRunPanels } from '../tui/render.js';
import { daemonStatus, daemonLogPath } from './daemon.js';

function tailLog(logPath: string, maxLines = 40): string {
  if (!existsSync(logPath)) {
    return '(no log output yet)';
  }
  const content = readFileSync(logPath, 'utf8').trimEnd();
  if (!content) {
    return '(no log output yet)';
  }
  const lines = content.split('\n');
  return lines.slice(-maxLines).join('\n');
}

export function runTui(args: string[]): void {
  const projectRoot = process.cwd();
  const runId = args[0];

  try {
    // Re-attach to a running daemon first (issue #42 attach/detach).
    const daemon = daemonStatus(projectRoot);
    if (daemon.running) {
      const cmd = daemon.command?.length ? ` foundry ${daemon.command.join(' ')}` : '';
      console.log('┌─ Foundry TUI — daemon attached ─────────────────────');
      console.log(`│ Daemon pid ${daemon.pid}${cmd}`);
      console.log(`│ Log: ${daemonLogPath(projectRoot)}`);
      console.log('└─────────────────────────────────────────────────────');
      console.log('\n--- daemon.log (tail) ---\n');
      console.log(tailLog(daemonLogPath(projectRoot)));
      process.exit(0);
    }

    let runDir: string;
    if (runId) {
      runDir = join(projectRoot, '.foundry', 'runs', runId);
    } else {
      const latest = findLatestRun(projectRoot);
      if (!latest) {
        throw new RunStateError('NO_RUNS', 'No runs found.');
      }
      runDir = latest.runDir;
    }

    const run = parseRunJson(JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8')));
    const statusMd = readFileSync(join(runDir, 'status.md'), 'utf8');
    console.log(renderRunPanels(run));
    console.log('\n--- status.md ---\n');
    console.log(statusMd.trim());
    process.exit(0);
  } catch (err) {
    if (err instanceof RunStateError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}
