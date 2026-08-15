// lib/codex-ingest.test.mjs
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parseCodexRollout, ingestCodexSessions, getCodexSessionsDir } from './codex-ingest.mjs';
import { LocalStorageAdapter } from './storage.mjs';

const TEST_DIR = join(import.meta.dirname, '../.test-codex');
const DATA_DIR = join(TEST_DIR, 'data');
const STORAGE_DIR = join(TEST_DIR, 'storage');
const CODEX_HOME = join(TEST_DIR, 'codex-home');

/** Build a rollout .jsonl string from record objects. */
function rollout(...records) {
  return records.map(r => JSON.stringify(r)).join('\n') + '\n';
}

const META = (id, cwd) => ({ type: 'session_meta', timestamp: '2026-05-28T00:00:00.000Z', payload: { id, cwd } });
const USER = (message, ts) => ({ type: 'event_msg', timestamp: ts, payload: { type: 'user_message', message } });
const AGENT = (message, ts) => ({ type: 'event_msg', timestamp: ts, payload: { type: 'agent_message', message, phase: 'commentary' } });
const NOISE = (ts) => ({ type: 'event_msg', timestamp: ts, payload: { type: 'token_count', info: {} } });

function writeRollout(dateDir, name, content) {
  const dir = join(CODEX_HOME, 'sessions', dateDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), content);
}

beforeEach(() => {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(STORAGE_DIR, { recursive: true });
  process.env.CODEX_HOME = CODEX_HOME;
});

afterEach(() => {
  delete process.env.CODEX_HOME;
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('parseCodexRollout', () => {
  test('extracts user_message / agent_message with cwd and timestamp', () => {
    const content = rollout(
      META('sess-uuid', '/projects/app'),
      USER('fix the bug', '2026-05-28T10:00:00Z'),
      NOISE('2026-05-28T10:00:01Z'),
      AGENT('on it', '2026-05-28T10:00:02Z'),
    );
    const { sessionId, messages } = parseCodexRollout(content);
    assert.strictEqual(sessionId, 'sess-uuid');
    assert.strictEqual(messages.length, 2);
    assert.deepStrictEqual(messages[0], { role: 'user', message: 'fix the bug', cwd: '/projects/app', timestamp: '2026-05-28T10:00:00Z' });
    assert.deepStrictEqual(messages[1], { role: 'assistant', message: 'on it', cwd: '/projects/app', timestamp: '2026-05-28T10:00:02Z' });
  });

  test('tracks cwd changes from turn_context (worktrees)', () => {
    const content = rollout(
      META('s', '/a'),
      USER('one', '2026-05-28T10:00:00Z'),
      { type: 'turn_context', timestamp: '2026-05-28T10:05:00Z', payload: { cwd: '/b' } },
      USER('two', '2026-05-28T10:06:00Z'),
    );
    const { messages } = parseCodexRollout(content);
    assert.strictEqual(messages[0].cwd, '/a');
    assert.strictEqual(messages[1].cwd, '/b');
  });

  test('ignores blank and malformed lines', () => {
    const content = 'not json\n\n' + JSON.stringify(USER('hi', '2026-05-28T10:00:00Z')) + '\n';
    const { messages } = parseCodexRollout(content);
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0].message, 'hi');
  });

  test('skips empty messages', () => {
    const content = rollout(USER('   ', '2026-05-28T10:00:00Z'), AGENT('real', '2026-05-28T10:00:01Z'));
    const { messages } = parseCodexRollout(content);
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0].message, 'real');
  });
});

describe('ingestCodexSessions', () => {
  test('no-op when sessions dir is absent', async () => {
    process.env.CODEX_HOME = join(TEST_DIR, 'nonexistent');
    const storage = new LocalStorageAdapter(STORAGE_DIR);
    const res = await ingestCodexSessions(storage, DATA_DIR);
    assert.strictEqual(res.ingested, 0);
  });

  test('writes raw logs grouped by date with source=codex', async () => {
    writeRollout('2026/05/28', 'rollout-2026-05-28T10-00-00-019e6bd1-f24d-7a91-bb2c-c2acfcc55886.jsonl', rollout(
      META('019e6bd1-f24d-7a91-bb2c-c2acfcc55886', STORAGE_DIR),
      USER('hello codex', '2026-05-28T10:00:00Z'),
      AGENT('hi there', '2026-05-28T10:00:05Z'),
    ));
    const storage = new LocalStorageAdapter(STORAGE_DIR);
    const res = await ingestCodexSessions(storage, DATA_DIR);
    assert.strictEqual(res.ingested, 2);

    const logPath = join(STORAGE_DIR, 'raw', '2026-05-28', 'codex-019e6bd1-f24d-7a91-bb2c-c2acfcc55886.jsonl');
    assert.ok(existsSync(logPath));
    const entries = readFileSync(logPath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[0].type, 'user');
    assert.strictEqual(entries[0].message, 'hello codex');
    assert.strictEqual(entries[0].source, 'codex');
    assert.strictEqual(entries[0].session_id, 'codex-019e6bd1-f24d-7a91-bb2c-c2acfcc55886');
    assert.strictEqual(entries[1].type, 'assistant');
  });

  test('is incremental: second run emits only new messages', async () => {
    const name = 'rollout-2026-05-28T10-00-00-019e6bd1-f24d-7a91-bb2c-c2acfcc55886.jsonl';
    writeRollout('2026/05/28', name, rollout(
      META('019e6bd1-f24d-7a91-bb2c-c2acfcc55886', STORAGE_DIR),
      USER('first', '2026-05-28T10:00:00Z'),
    ));
    const storage = new LocalStorageAdapter(STORAGE_DIR);
    const r1 = await ingestCodexSessions(storage, DATA_DIR);
    assert.strictEqual(r1.ingested, 1);

    // Session grows (append-only)
    writeRollout('2026/05/28', name, rollout(
      META('019e6bd1-f24d-7a91-bb2c-c2acfcc55886', STORAGE_DIR),
      USER('first', '2026-05-28T10:00:00Z'),
      AGENT('reply', '2026-05-28T10:00:05Z'),
    ));
    const r2 = await ingestCodexSessions(storage, DATA_DIR);
    assert.strictEqual(r2.ingested, 1);

    const logPath = join(STORAGE_DIR, 'raw', '2026-05-28', 'codex-019e6bd1-f24d-7a91-bb2c-c2acfcc55886.jsonl');
    const entries = readFileSync(logPath, 'utf-8').trim().split('\n');
    assert.strictEqual(entries.length, 2, 'no duplicate of the first message');

    // Third run with no growth ingests nothing
    const r3 = await ingestCodexSessions(storage, DATA_DIR);
    assert.strictEqual(r3.ingested, 0);
  });

  test('updates the index so collect can find codex dates', async () => {
    writeRollout('2026/05/28', 'rollout-2026-05-28T10-00-00-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl', rollout(
      META('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', STORAGE_DIR),
      USER('indexed?', '2026-05-28T10:00:00Z'),
    ));
    const storage = new LocalStorageAdapter(STORAGE_DIR);
    await ingestCodexSessions(storage, DATA_DIR);
    const index = JSON.parse(readFileSync(join(DATA_DIR, 'index.json'), 'utf-8'));
    assert.ok(index.byDate['2026-05-28'].includes('codex-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'));
  });
});
