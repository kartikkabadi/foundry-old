import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { getProjectFoundryDir } from '@foundry/core/state/run-writer.js';
import {
  defaultCliPath,
  isProcessAlive,
  spawnDetachedDaemon,
  stopDaemonProcess,
} from '../daemon/process.js';

export function daemonPidPath(projectRoot: string): string {
  return join(getProjectFoundryDir(projectRoot), 'daemon.pid');
}

export function daemonHeartbeatPath(projectRoot: string): string {
  return join(getProjectFoundryDir(projectRoot), 'daemon.heartbeat');
}

export function daemonLogPath(projectRoot: string): string {
  return join(getProjectFoundryDir(projectRoot), 'daemon.log');
}

export function daemonCommandPath(projectRoot: string): string {
  return join(getProjectFoundryDir(projectRoot), 'daemon.command');
}

export function daemonStart(
  projectRoot: string,
  commandArgs?: string[],
): { started: boolean; pid: number } {
  mkdirSync(getProjectFoundryDir(projectRoot), { recursive: true });
  const pidPath = daemonPidPath(projectRoot);
  if (process.env.FOUNDRY_DAEMON_MOCK === '1') {
    const mockPid = 42_042;
    writeFileSync(pidPath, String(mockPid), 'utf8');
    writeFileSync(daemonHeartbeatPath(projectRoot), new Date().toISOString(), 'utf8');
    if (commandArgs && commandArgs.length > 0) {
      writeFileSync(daemonCommandPath(projectRoot), commandArgs.join('\n'), 'utf8');
      writeFileSync(daemonLogPath(projectRoot), `mock daemon: would run ${commandArgs.join(' ')}\n`, 'utf8');
    }
    return { started: true, pid: mockPid };
  }
  if (existsSync(pidPath)) {
    const existing = Number.parseInt(readFileSync(pidPath, 'utf8').trim(), 10);
    if (Number.isFinite(existing) && isProcessAlive(existing)) {
      return { started: false, pid: existing };
    }
  }

  const pid = spawnDetachedDaemon({
    cliPath: defaultCliPath(),
    projectRoot,
    pidPath,
    heartbeatPath: daemonHeartbeatPath(projectRoot),
    logPath: daemonLogPath(projectRoot),
    commandArgs,
  });
  if (commandArgs && commandArgs.length > 0) {
    writeFileSync(daemonCommandPath(projectRoot), commandArgs.join('\n'), 'utf8');
  }
  return { started: true, pid };
}

export function daemonStop(projectRoot: string): { stopped: boolean; pid?: number } {
  const pidPath = daemonPidPath(projectRoot);
  const heartbeatPath = daemonHeartbeatPath(projectRoot);
  const commandPath = daemonCommandPath(projectRoot);

  if (process.env.FOUNDRY_DAEMON_MOCK === '1') {
    let pid: number | undefined;
    let hadPidFile = false;
    if (existsSync(pidPath)) {
      hadPidFile = true;
      const parsed = Number.parseInt(readFileSync(pidPath, 'utf8').trim(), 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        pid = parsed;
      }
      unlinkSync(pidPath);
    }
    if (existsSync(heartbeatPath)) {
      unlinkSync(heartbeatPath);
    }
    if (existsSync(commandPath)) {
      unlinkSync(commandPath);
    }
    return { stopped: hadPidFile, pid };
  }

  const result = stopDaemonProcess(pidPath);
  if (existsSync(heartbeatPath)) {
    unlinkSync(heartbeatPath);
  }
  if (existsSync(commandPath)) {
    unlinkSync(commandPath);
  }
  return result;
}

export function daemonStatus(projectRoot: string): {
  running: boolean;
  pid?: number;
  stale?: boolean;
  logPath?: string;
  command?: string[];
} {
  const pidPath = daemonPidPath(projectRoot);
  const commandPath = daemonCommandPath(projectRoot);
  const logPath = daemonLogPath(projectRoot);
  const command = existsSync(commandPath)
    ? readFileSync(commandPath, 'utf8').split('\n').filter(Boolean)
    : undefined;
  if (!existsSync(pidPath)) {
    return { running: false, logPath, command };
  }
  const raw = readFileSync(pidPath, 'utf8').trim();
  const numeric = Number.parseInt(raw, 10);
  if (process.env.FOUNDRY_DAEMON_MOCK === '1') {
    return {
      running: true,
      pid: Number.isInteger(numeric) && numeric > 0 ? numeric : undefined,
      logPath,
      command,
    };
  }
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return { running: false, stale: true, logPath, command };
  }
  if (!isProcessAlive(numeric)) {
    return { running: false, stale: true, pid: numeric, logPath, command };
  }
  return { running: true, pid: numeric, logPath, command };
}

function runDaemonWatch(projectRoot: string, commandArgs?: string[]): void {
  const heartbeatPath = daemonHeartbeatPath(projectRoot);
  mkdirSync(getProjectFoundryDir(projectRoot), { recursive: true });
  writeFileSync(heartbeatPath, new Date().toISOString(), 'utf8');
  const interval = setInterval(() => {
    writeFileSync(heartbeatPath, new Date().toISOString(), 'utf8');
  }, 5000);

  const cleanup = () => {
    clearInterval(interval);
  };

  if (commandArgs && commandArgs.length > 0) {
    const child = spawn(process.execPath, [defaultCliPath(), ...commandArgs], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env },
    });
    child.on('exit', (code) => {
      cleanup();
      process.exit(code ?? 0);
    });
    child.on('error', () => {
      cleanup();
      process.exit(1);
    });
    process.on('SIGTERM', () => {
      child.kill('SIGTERM');
      cleanup();
      process.exit(0);
    });
    return;
  }

  // Heartbeat-only watch (no command): keep alive until signaled.
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });
}

export function runDaemon(args: string[]): void {
  if (args[0] === 'run') {
    let projectRoot = process.cwd();
    let commandArgs: string[] | undefined;
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--project') {
        projectRoot = args[++i] ?? projectRoot;
      } else if (args[i] === '--command') {
        commandArgs = args.slice(i + 1);
        break;
      }
    }
    runDaemonWatch(projectRoot, commandArgs);
    return;
  }

  const sub = args[0];
  const projectRoot = process.cwd();

  if (!sub || !['start', 'stop', 'status'].includes(sub)) {
    console.error('Usage: foundry daemon start [plan|build ...] | stop | status | run');
    process.exit(1);
  }

  if (sub === 'start') {
    const commandArgs = args.slice(1);
    const result = daemonStart(projectRoot, commandArgs.length > 0 ? commandArgs : undefined);
    if (result.started) {
      const what = commandArgs.length > 0 ? ` running: foundry ${commandArgs.join(' ')}` : '';
      console.log(`Daemon started (pid ${result.pid})${what}`);
      if (commandArgs.length > 0) {
        console.log(`Tail output: foundry tui  (log: ${daemonLogPath(projectRoot)})`);
      }
    } else {
      console.log(`Daemon already running (pid ${result.pid})`);
    }
    process.exit(0);
  }

  if (sub === 'stop') {
    const result = daemonStop(projectRoot);
    if (result.stopped) {
      console.log(`Daemon stopped (was pid ${result.pid})`);
    } else {
      console.log('Daemon not running');
    }
    process.exit(0);
  }

  const status = daemonStatus(projectRoot);
  if (status.running) {
    const cmd = status.command?.length ? ` — foundry ${status.command.join(' ')}` : '';
    console.log(`Daemon running (pid ${status.pid})${cmd}`);
    if (status.logPath && existsSync(status.logPath)) {
      console.log(`Log: ${status.logPath}`);
    }
  } else if (status.stale) {
    console.log(`Daemon not running (stale pid file${status.pid ? `: ${status.pid}` : ''})`);
  } else {
    console.log('Daemon not running');
  }
  process.exit(0);
}
