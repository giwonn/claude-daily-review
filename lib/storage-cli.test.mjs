// @ts-check
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const TEST_DIR = join(import.meta.dirname, '../.test-storage-cli');
const DATA_DIR = join(TEST_DIR, 'data');
const STORAGE_DIR = join(TEST_DIR, 'storage');
const CLI_PATH = join(import.meta.dirname, 'storage-cli.mjs');

function setupConfig() {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(STORAGE_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, 'config.json'), JSON.stringify({
    storage: { type: 'local', local: { basePath: STORAGE_DIR } },
    language: 'ko',
    periods: { daily: true, weekly: false, monthly: false, quarterly: false, yearly: false },
    profile: { company: '', role: '', team: '', context: '' },
  }));
}

function runCli(command, stdinData) {
  const env = { ...process.env, CLAUDE_PLUGIN_DATA: DATA_DIR };
  const opts = { encoding: 'utf-8', env, timeout: 10000 };
  if (stdinData) {
    opts.input = stdinData;
  }
  return execSync(`node "${CLI_PATH}" ${command}`, opts);
}

beforeEach(() => {
  setupConfig();
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('storage-cli batch commands', () => {
  test('batch-write creates multiple files', () => {
    const items = [
      { path: 'daily/2026-04-01.md', content: '# April 1' },
      { path: 'daily/2026-04-02.md', content: '# April 2' },
    ];
    runCli('batch-write', JSON.stringify(items));

    assert.strictEqual(readFileSync(join(STORAGE_DIR, 'daily/2026-04-01.md'), 'utf-8'), '# April 1');
    assert.strictEqual(readFileSync(join(STORAGE_DIR, 'daily/2026-04-02.md'), 'utf-8'), '# April 2');
  });

  test('batch-read returns multiple files as JSON', () => {
    mkdirSync(join(STORAGE_DIR, 'daily'), { recursive: true });
    writeFileSync(join(STORAGE_DIR, 'daily/a.md'), 'content-a');
    writeFileSync(join(STORAGE_DIR, 'daily/b.md'), 'content-b');

    const result = runCli('batch-read', JSON.stringify(['daily/a.md', 'daily/b.md']));
    const parsed = JSON.parse(result);
    assert.strictEqual(parsed['daily/a.md'], 'content-a');
    assert.strictEqual(parsed['daily/b.md'], 'content-b');
  });

  test('batch-read skips non-existent files', () => {
    mkdirSync(join(STORAGE_DIR, 'daily'), { recursive: true });
    writeFileSync(join(STORAGE_DIR, 'daily/exists.md'), 'hello');

    const result = runCli('batch-read', JSON.stringify(['daily/exists.md', 'daily/nope.md']));
    const parsed = JSON.parse(result);
    assert.strictEqual(parsed['daily/exists.md'], 'hello');
    assert.strictEqual(parsed['daily/nope.md'], undefined);
  });

  test('batch-write overwrites existing files', () => {
    mkdirSync(join(STORAGE_DIR, 'daily'), { recursive: true });
    writeFileSync(join(STORAGE_DIR, 'daily/old.md'), 'old content');

    runCli('batch-write', JSON.stringify([{ path: 'daily/old.md', content: 'new content' }]));
    assert.strictEqual(readFileSync(join(STORAGE_DIR, 'daily/old.md'), 'utf-8'), 'new content');
  });
});
