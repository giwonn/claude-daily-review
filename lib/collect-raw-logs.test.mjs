// lib/collect-raw-logs.test.mjs
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const TEST_DIR = join(import.meta.dirname, '../.test-collect');
const DATA_DIR = join(TEST_DIR, 'data');
const STORAGE_DIR = join(TEST_DIR, 'storage');
const CLI_PATH = join(import.meta.dirname, 'collect-raw-logs.mjs');

function setupConfig() {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(STORAGE_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, 'config.json'), JSON.stringify({
    storage: { type: 'local', local: { basePath: STORAGE_DIR } },
    language: 'ko',
    periods: { daily: true, weekly: true, monthly: true, quarterly: false, yearly: false },
    profile: { company: 'test', role: 'dev', team: 'team', context: 'ctx' },
  }));
}

function writeRawLog(date, sessionId, entries) {
  const dir = join(STORAGE_DIR, 'raw', date);
  mkdirSync(dir, { recursive: true });
  const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(join(dir, `${sessionId}.jsonl`), lines);
}

function runCollect(args = '') {
  const env = { ...process.env, CLAUDE_PLUGIN_DATA: DATA_DIR };
  const result = execSync(`node "${CLI_PATH}" ${args}`, { encoding: 'utf-8', env, timeout: 10000 });
  return JSON.parse(result.trim());
}

beforeEach(() => {
  setupConfig();
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('collect-raw-logs', () => {
  test('collects logs from raw directory', () => {
    writeRawLog('2026-04-05', 'sess-1', [
      { type: 'user', message: 'hello', cwd: '/projects/app', timestamp: '2026-04-05T10:00:00Z' },
      { type: 'assistant', message: 'hi', cwd: '/projects/app', timestamp: '2026-04-05T10:00:01Z' },
    ]);

    const result = runCollect('--force');
    assert.ok(result.needs.daily.includes('2026-04-05'));
    assert.strictEqual(result.logs['2026-04-05'].length, 2);
    assert.strictEqual(result.logs['2026-04-05'][0].message, 'hello');
  });

  test('--from and --to filter by date range', () => {
    writeRawLog('2026-04-01', 'sess-1', [
      { type: 'user', message: 'early', cwd: '/app', timestamp: '2026-04-01T10:00:00Z' },
    ]);
    writeRawLog('2026-04-05', 'sess-2', [
      { type: 'user', message: 'mid', cwd: '/app', timestamp: '2026-04-05T10:00:00Z' },
    ]);
    writeRawLog('2026-04-10', 'sess-3', [
      { type: 'user', message: 'late', cwd: '/app', timestamp: '2026-04-10T10:00:00Z' },
    ]);

    const result = runCollect('--force --from 2026-04-03 --to 2026-04-07');
    assert.deepStrictEqual(result.needs.daily, ['2026-04-05']);
    assert.ok(!result.logs['2026-04-01']);
    assert.ok(!result.logs['2026-04-10']);
  });

  test('uses index for project filtering when available', async () => {
    // Write raw logs for two projects
    writeRawLog('2026-04-05', 'sess-1', [
      { type: 'user', message: 'app work', cwd: '/projects/my-app', timestamp: '2026-04-05T10:00:00Z' },
    ]);
    writeRawLog('2026-04-05', 'sess-2', [
      { type: 'user', message: 'other work', cwd: '/projects/other', timestamp: '2026-04-05T10:00:00Z' },
    ]);
    writeRawLog('2026-04-06', 'sess-3', [
      { type: 'user', message: 'more app', cwd: '/projects/my-app', timestamp: '2026-04-06T10:00:00Z' },
    ]);

    // Create index
    const { updateIndex } = await import('./index-manager.mjs');
    updateIndex(DATA_DIR, { sessionId: 'sess-1', date: '2026-04-05', project: 'my-app' });
    updateIndex(DATA_DIR, { sessionId: 'sess-2', date: '2026-04-05', project: 'other' });
    updateIndex(DATA_DIR, { sessionId: 'sess-3', date: '2026-04-06', project: 'my-app' });

    const result = runCollect('--force --project my-app');
    // Should include dates for my-app project
    assert.ok(result.needs.daily.includes('2026-04-05'));
    assert.ok(result.needs.daily.includes('2026-04-06'));
  });

  test('returns empty needs when no new data', () => {
    // Set lastGenerated to future
    writeFileSync(join(DATA_DIR, 'last-generated.json'), JSON.stringify({ timestamp: '2099-01-01T00:00:00Z' }));

    writeRawLog('2026-04-05', 'sess-1', [
      { type: 'user', message: 'old', cwd: '/app', timestamp: '2026-04-05T10:00:00Z' },
    ]);

    const result = runCollect();
    assert.deepStrictEqual(result.needs.daily, []);
  });

  test('includes git activity in output', () => {
    writeRawLog('2026-04-05', 'sess-1', [
      { type: 'user', message: 'work', cwd: '/app', timestamp: '2026-04-05T10:00:00Z' },
      { type: 'git', action: 'commit', hash: 'abc123', branch: 'main', message: 'fix bug', cwd: '/app', timestamp: '2026-04-05T10:01:00Z' },
    ]);

    const result = runCollect('--force');
    assert.ok(result.gitActivity['2026-04-05']);
    assert.strictEqual(result.gitActivity['2026-04-05'][0].hash, 'abc123');
  });

  test('calculates affected weekly and monthly periods', () => {
    writeRawLog('2026-04-05', 'sess-1', [
      { type: 'user', message: 'work', cwd: '/app', timestamp: '2026-04-05T10:00:00Z' },
    ]);

    const result = runCollect('--force');
    assert.ok(result.needs.weekly.length > 0);
    assert.ok(result.needs.monthly.length > 0);
    assert.ok(result.needs.monthly[0].startsWith('2026-04'));
  });
});
