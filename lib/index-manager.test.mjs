import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(import.meta.dirname, '../.test-index');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('index-manager', () => {
  test('updateIndex adds session entry correctly', async () => {
    const { updateIndex, loadIndex } = await import('./index-manager.mjs');
    updateIndex(TEST_DIR, { sessionId: 'abc-123', date: '2026-04-05', project: 'my-app' });
    const index = loadIndex(TEST_DIR);
    assert.deepStrictEqual(index.byDate['2026-04-05'], ['abc-123']);
    assert.deepStrictEqual(index.byProject['my-app'], ['2026-04-05']);
    assert.deepStrictEqual(index.sessions['abc-123'].dates, ['2026-04-05']);
    assert.deepStrictEqual(index.sessions['abc-123'].projects, ['my-app']);
  });

  test('updateIndex deduplicates entries', async () => {
    const { updateIndex, loadIndex } = await import('./index-manager.mjs');
    updateIndex(TEST_DIR, { sessionId: 'abc', date: '2026-04-05', project: 'app' });
    updateIndex(TEST_DIR, { sessionId: 'abc', date: '2026-04-05', project: 'app' });
    const index = loadIndex(TEST_DIR);
    assert.strictEqual(index.byDate['2026-04-05'].length, 1);
    assert.strictEqual(index.byProject['app'].length, 1);
  });

  test('updateIndex handles multiple projects per session', async () => {
    const { updateIndex, loadIndex } = await import('./index-manager.mjs');
    updateIndex(TEST_DIR, { sessionId: 'abc', date: '2026-04-05', project: 'app-a' });
    updateIndex(TEST_DIR, { sessionId: 'abc', date: '2026-04-05', project: 'app-b' });
    const index = loadIndex(TEST_DIR);
    assert.deepStrictEqual(index.sessions['abc'].projects.sort(), ['app-a', 'app-b']);
  });

  test('getDatesByProject returns correct dates', async () => {
    const { updateIndex, getDatesByProject } = await import('./index-manager.mjs');
    updateIndex(TEST_DIR, { sessionId: 'a', date: '2026-04-01', project: 'my-app' });
    updateIndex(TEST_DIR, { sessionId: 'b', date: '2026-04-03', project: 'my-app' });
    updateIndex(TEST_DIR, { sessionId: 'c', date: '2026-04-02', project: 'other' });
    const dates = getDatesByProject(TEST_DIR, 'my-app');
    assert.deepStrictEqual(dates.sort(), ['2026-04-01', '2026-04-03']);
  });

  test('getFilesByDateRange returns correct files', async () => {
    const { updateIndex, getFilesByDateRange } = await import('./index-manager.mjs');
    updateIndex(TEST_DIR, { sessionId: 'a', date: '2026-04-01', project: 'app' });
    updateIndex(TEST_DIR, { sessionId: 'b', date: '2026-04-05', project: 'app' });
    updateIndex(TEST_DIR, { sessionId: 'c', date: '2026-04-10', project: 'app' });
    const files = getFilesByDateRange(TEST_DIR, '2026-04-03', '2026-04-07');
    assert.strictEqual(files.length, 1);
    assert.strictEqual(files[0].date, '2026-04-05');
    assert.deepStrictEqual(files[0].sessions, ['b']);
  });

  test('loadIndex returns empty index when file does not exist', async () => {
    const { loadIndex } = await import('./index-manager.mjs');
    const index = loadIndex(TEST_DIR);
    assert.deepStrictEqual(index.byDate, {});
    assert.deepStrictEqual(index.byProject, {});
    assert.deepStrictEqual(index.sessions, {});
  });

  test('indexExists returns false when no index', async () => {
    const { indexExists } = await import('./index-manager.mjs');
    assert.strictEqual(indexExists(TEST_DIR), false);
  });

  test('indexExists returns true after update', async () => {
    const { updateIndex, indexExists } = await import('./index-manager.mjs');
    updateIndex(TEST_DIR, { sessionId: 'a', date: '2026-04-01', project: 'app' });
    assert.strictEqual(indexExists(TEST_DIR), true);
  });
});
