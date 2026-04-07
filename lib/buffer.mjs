// @ts-check
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';

const DEFAULT_FLUSH_THRESHOLD = 10 * 1024; // 10KB

export function appendToBuffer(dataDir, sessionId, content) {
  const bufferDir = join(dataDir, 'buffer');
  mkdirSync(bufferDir, { recursive: true });
  const bufferPath = join(bufferDir, `${sessionId}.jsonl`);
  const metaPath = join(bufferDir, `${sessionId}.meta.json`);
  appendFileSync(bufferPath, content, 'utf-8');
  const stats = statSync(bufferPath);
  const meta = loadMeta(metaPath, sessionId);
  meta.lastActive = new Date().toISOString();
  meta.bufferSizeBytes = stats.size;
  writeFileSync(metaPath, JSON.stringify(meta), 'utf-8');
}

export function shouldFlush(dataDir, sessionId, threshold = DEFAULT_FLUSH_THRESHOLD) {
  const metaPath = join(dataDir, 'buffer', `${sessionId}.meta.json`);
  if (!existsSync(metaPath)) return false;
  const meta = loadMeta(metaPath, sessionId);
  return (meta.bufferSizeBytes - meta.flushedOffset) >= threshold;
}

export function getUnflushedContent(dataDir, sessionId) {
  const bufferPath = join(dataDir, 'buffer', `${sessionId}.jsonl`);
  const metaPath = join(dataDir, 'buffer', `${sessionId}.meta.json`);
  if (!existsSync(bufferPath)) return '';
  const content = readFileSync(bufferPath, 'utf-8');
  const meta = loadMeta(metaPath, sessionId);
  return content.slice(meta.flushedOffset);
}

export function markFlushed(dataDir, sessionId) {
  const bufferPath = join(dataDir, 'buffer', `${sessionId}.jsonl`);
  const metaPath = join(dataDir, 'buffer', `${sessionId}.meta.json`);
  if (!existsSync(bufferPath)) return;
  const stats = statSync(bufferPath);
  const meta = loadMeta(metaPath, sessionId);
  meta.flushedOffset = stats.size;
  meta.bufferSizeBytes = stats.size;
  writeFileSync(metaPath, JSON.stringify(meta), 'utf-8');
}

export function listUnflushedSessions(dataDir, currentSessionId) {
  return listAllUnflushedSessions(dataDir).filter(id => id !== currentSessionId);
}

export function listAllUnflushedSessions(dataDir) {
  const bufferDir = join(dataDir, 'buffer');
  if (!existsSync(bufferDir)) return [];
  return readdirSync(bufferDir)
    .filter(f => f.endsWith('.meta.json'))
    .map(f => f.replace('.meta.json', ''))
    .filter(sessionId => {
      const content = getUnflushedContent(dataDir, sessionId);
      return content.length > 0;
    });
}

export function cleanupBuffer(dataDir, sessionId) {
  const bufferPath = join(dataDir, 'buffer', `${sessionId}.jsonl`);
  const metaPath = join(dataDir, 'buffer', `${sessionId}.meta.json`);
  try { unlinkSync(bufferPath); } catch {}
  try { unlinkSync(metaPath); } catch {}
}

function loadMeta(metaPath, sessionId) {
  if (existsSync(metaPath)) {
    try { return JSON.parse(readFileSync(metaPath, 'utf-8')); } catch {}
  }
  return { sessionId, lastActive: new Date().toISOString(), flushedOffset: 0, bufferSizeBytes: 0 };
}
