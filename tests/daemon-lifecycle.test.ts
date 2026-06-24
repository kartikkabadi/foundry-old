import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  daemonPidPath,
  daemonStart,
  daemonStatus,
  daemonStop,
  daemonLogPath,
  daemonCommandPath,
} from '../packages/cli/src/commands/daemon.js';

describe('daemon lifecycle (#42)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-daemon-'));
    fs.mkdirSync(path.join(projectRoot, '.foundry'), { recursive: true });
  });

  afterEach(() => {
    delete process.env.FOUNDRY_DAEMON_MOCK;
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('start/stop roundtrip manages pid file', () => {
    process.env.FOUNDRY_DAEMON_MOCK = '1';
    const start = daemonStart(projectRoot);
    assert.strictEqual(start.started, true);
    assert.ok(fs.existsSync(daemonPidPath(projectRoot)));
    assert.strictEqual(daemonStatus(projectRoot).running, true);

    const stop = daemonStop(projectRoot);
    assert.strictEqual(stop.stopped, true);
    assert.strictEqual(daemonStatus(projectRoot).running, false);
  });

  it('stop clears invalid pid file without signaling', () => {
    const pidPath = daemonPidPath(projectRoot);
    fs.writeFileSync(pidPath, '-1', 'utf8');
    const stop = daemonStop(projectRoot);
    assert.strictEqual(stop.stopped, false);
    assert.strictEqual(fs.existsSync(pidPath), false);
    assert.strictEqual(daemonStatus(projectRoot).running, false);
  });

  it('start with command records command + log and status exposes them (#42 attach)', () => {
    process.env.FOUNDRY_DAEMON_MOCK = '1';
    const start = daemonStart(projectRoot, ['plan', 'some idea']);
    assert.strictEqual(start.started, true);
    assert.ok(fs.existsSync(daemonCommandPath(projectRoot)));
    assert.ok(fs.existsSync(daemonLogPath(projectRoot)));

    const status = daemonStatus(projectRoot);
    assert.strictEqual(status.running, true);
    assert.deepStrictEqual(status.command, ['plan', 'some idea']);
    assert.strictEqual(status.logPath, daemonLogPath(projectRoot));
    const log = fs.readFileSync(daemonLogPath(projectRoot), 'utf8');
    assert.match(log, /plan some idea/);

    const stop = daemonStop(projectRoot);
    assert.strictEqual(stop.stopped, true);
    assert.ok(!fs.existsSync(daemonCommandPath(projectRoot)));
  });

  it('start without command leaves command undefined', () => {
    process.env.FOUNDRY_DAEMON_MOCK = '1';
    daemonStart(projectRoot);
    const status = daemonStatus(projectRoot);
    assert.strictEqual(status.running, true);
    assert.strictEqual(status.command, undefined);
  });
});
