import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function ensureParentDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function spawnDetachedDaemon(options: {
  cliPath: string;
  projectRoot: string;
  pidPath: string;
  heartbeatPath: string;
  logPath?: string;
  commandArgs?: string[];
}): number {
  const daemonRunArgs = ['daemon', 'run', '--project', options.projectRoot];
  if (options.commandArgs && options.commandArgs.length > 0) {
    daemonRunArgs.push('--command', ...options.commandArgs);
  }
  const stdio: import('node:child_process').StdioOptions = 'ignore';
  let logFd: number | undefined;
  if (options.logPath) {
    ensureParentDir(options.logPath);
    logFd = openSync(options.logPath, 'a');
  }
  const child = spawn(process.execPath, [options.cliPath, ...daemonRunArgs], {
    detached: true,
    stdio: logFd !== undefined ? ['ignore', logFd, logFd] : stdio,
    cwd: options.projectRoot,
    env: { ...process.env },
  });
  child.unref();
  const pid = child.pid;
  if (!pid || pid <= 0) {
    throw new Error('Failed to start daemon child process');
  }
  ensureParentDir(options.pidPath);
  ensureParentDir(options.heartbeatPath);
  writeFileSync(options.pidPath, String(pid), 'utf8');
  writeFileSync(options.heartbeatPath, new Date().toISOString(), 'utf8');
  return pid;
}

export function stopDaemonProcess(pidPath: string): { stopped: boolean; pid?: number } {
  if (!existsSync(pidPath)) {
    return { stopped: false };
  }
  const pid = Number.parseInt(readFileSync(pidPath, 'utf8').trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    unlinkSync(pidPath);
    return { stopped: false };
  }
  if (isProcessAlive(pid)) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (code !== 'ESRCH') {
        throw error;
      }
    }
  }
  unlinkSync(pidPath);
  return { stopped: true, pid };
}

export function defaultCliPath(): string {
  return join(fileURLToPath(new URL('../../bin/foundry.js', import.meta.url)));
}
