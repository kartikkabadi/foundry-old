import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(REPO_ROOT, 'packages', 'cli', 'bin', 'foundry.js');

describe('TUI daemon re-attach (#42 attach/detach)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-tui-attach-'));
    fs.mkdirSync(path.join(projectRoot, '.foundry'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('tui attaches to a running mock daemon and tails the log', () => {
    const env = { ...process.env, FOUNDRY_DAEMON_MOCK: '1' };
    // Start a mock daemon with a command.
    const startOut = execSync(`node "${CLI}" daemon start plan "my idea"`, {
      encoding: 'utf8',
      cwd: projectRoot,
      env,
    });
    assert.match(startOut, /Daemon started/);

    // TUI should re-attach and show the daemon panel + log tail.
    const tuiOut = execSync(`node "${CLI}" tui`, {
      encoding: 'utf8',
      cwd: projectRoot,
      env,
    });
    assert.match(tuiOut, /daemon attached/);
    assert.match(tuiOut, /foundry plan my idea/);
    assert.match(tuiOut, /daemon\.log/);

    // Stop cleans up.
    execSync(`node "${CLI}" daemon stop`, { cwd: projectRoot, env });
    assert.ok(!fs.existsSync(path.join(projectRoot, '.foundry', 'daemon.pid')));
  });

  it('daemon status reports command + log path when running', () => {
    const env = { ...process.env, FOUNDRY_DAEMON_MOCK: '1' };
    execSync(`node "${CLI}" daemon start build`, {
      cwd: projectRoot,
      env,
    });
    const statusOut = execSync(`node "${CLI}" daemon status`, {
      encoding: 'utf8',
      cwd: projectRoot,
      env,
    });
    assert.match(statusOut, /Daemon running/);
    assert.match(statusOut, /foundry build/);
    assert.match(statusOut, /Log:/);
    execSync(`node "${CLI}" daemon stop`, { cwd: projectRoot, env });
  });
});
