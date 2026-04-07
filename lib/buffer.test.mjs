import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(import.meta.dirname, '../.test-buffer');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('buffer', () => {
  test('appendToBuffer creates buffer file and meta', async () => {
    const { appendToBuffer } = await import('./buffer.mjs');
    const line = '{"type":"user","message":"hello"}\n';
    appendToBuffer(TEST_DIR, 'session-1', line);
    const bufferPath = join(TEST_DIR, 'buffer', 'session-1.jsonl');
    const metaPath = join(TEST_DIR, 'buffer', 'session-1.meta.json');
    assert.ok(existsSync(bufferPath));
    assert.ok(existsSync(metaPath));
    assert.strictEqual(readFileSync(bufferPath, 'utf-8'), line);
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    assert.strictEqual(meta.sessionId, 'session-1');
    assert.strictEqual(meta.flushedOffset, 0);
    assert.ok(meta.bufferSizeBytes > 0);
  });

  test('getUnflushedBytes returns correct unflushed byte count', async () => {
    const { appendToBuffer, getUnflushedBytes, markFlushed } = await import('./buffer.mjs');
    const line = '{"type":"user","message":"hello"}\n';
    appendToBuffer(TEST_DIR, 'session-2', line);
    const bytes = getUnflushedBytes(TEST_DIR, 'session-2');
    assert.ok(bytes > 0);
    markFlushed(TEST_DIR, 'session-2');
    assert.strictEqual(getUnflushedBytes(TEST_DIR, 'session-2'), 0);
    appendToBuffer(TEST_DIR, 'session-2', line);
    assert.strictEqual(getUnflushedBytes(TEST_DIR, 'session-2'), Buffer.byteLength(line, 'utf-8'));
  });

  test('getUnflushedContent returns content after flushedOffset', async () => {
    const { appendToBuffer, markFlushed, getUnflushedContent } = await import('./buffer.mjs');
    const line1 = '{"type":"user","message":"first"}\n';
    const line2 = '{"type":"user","message":"second"}\n';
    appendToBuffer(TEST_DIR, 'session-3', line1);
    markFlushed(TEST_DIR, 'session-3');
    appendToBuffer(TEST_DIR, 'session-3', line2);
    const unflushed = getUnflushedContent(TEST_DIR, 'session-3');
    assert.strictEqual(unflushed, line2);
  });

  test('listUnflushedSessions excludes current session', async () => {
    const { appendToBuffer, listUnflushedSessions } = await import('./buffer.mjs');
    appendToBuffer(TEST_DIR, 'session-a', 'line\n');
    appendToBuffer(TEST_DIR, 'session-b', 'line\n');
    const sessions = listUnflushedSessions(TEST_DIR, 'session-a');
    assert.deepStrictEqual(sessions, ['session-b']);
  });

  test('listAllUnflushedSessions returns all sessions with unflushed content', async () => {
    const { appendToBuffer, listAllUnflushedSessions } = await import('./buffer.mjs');
    appendToBuffer(TEST_DIR, 'session-x', 'line\n');
    appendToBuffer(TEST_DIR, 'session-y', 'line\n');
    const sessions = listAllUnflushedSessions(TEST_DIR);
    assert.ok(sessions.includes('session-x'));
    assert.ok(sessions.includes('session-y'));
  });

  test('cleanupBuffer removes buffer and meta files', async () => {
    const { appendToBuffer, cleanupBuffer } = await import('./buffer.mjs');
    appendToBuffer(TEST_DIR, 'session-del', 'line\n');
    cleanupBuffer(TEST_DIR, 'session-del');
    assert.ok(!existsSync(join(TEST_DIR, 'buffer', 'session-del.jsonl')));
    assert.ok(!existsSync(join(TEST_DIR, 'buffer', 'session-del.meta.json')));
  });
});
