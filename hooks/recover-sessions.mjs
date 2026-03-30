#!/usr/bin/env node
// @ts-check
// Recovers missing raw log entries from transcript files on SessionStart.
// Uses a lock file to prevent concurrent recovery across multiple sessions.
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { loadConfig, createStorageAdapter } from '../lib/config.mjs';
import { formatDate } from '../lib/periods.mjs';
import { getRawDir } from '../lib/vault.mjs';

const LOCK_STALE_MS = 120_000; // 2 minutes

function getLockPath() {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dataDir) return null;
  return join(dataDir, 'recover.lock');
}

/** @returns {boolean} */
function acquireLock() {
  const lockPath = getLockPath();
  if (!lockPath) return false;

  mkdirSync(dirname(lockPath), { recursive: true });

  // Check for stale lock
  if (existsSync(lockPath)) {
    try {
      const lock = JSON.parse(readFileSync(lockPath, 'utf-8'));
      const age = Date.now() - new Date(lock.timestamp).getTime();
      if (age < LOCK_STALE_MS) return false; // Another session is recovering
    } catch { /* corrupt lock, take over */ }
  }

  try {
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString() }));
    return true;
  } catch { return false; }
}

function releaseLock() {
  const lockPath = getLockPath();
  if (!lockPath) return;
  try { unlinkSync(lockPath); } catch { /* already removed */ }
}

/**
 * Parse transcript JSONL and extract user/assistant message pairs with timestamps.
 * @param {string} transcriptPath
 * @returns {Array<{type: string, message: string, cwd: string, timestamp: string}>}
 */
function parseTranscript(transcriptPath) {
  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');
    /** @type {Array<{type: string, message: string, cwd: string, timestamp: string}>} */
    const entries = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const ts = entry.timestamp || '';
        const cwd = entry.cwd || '';

        if (entry.type === 'user') {
          const msgContent = entry.message?.content;
          let text = '';
          if (typeof msgContent === 'string') text = msgContent;
          else if (Array.isArray(msgContent)) {
            const textPart = msgContent.find(p => p.type === 'text' && p.text?.trim());
            if (textPart) text = textPart.text;
          }
          if (text.trim()) entries.push({ type: 'user', message: text, cwd, timestamp: ts });
        } else if (entry.type === 'assistant') {
          const msgContent = entry.message?.content;
          let text = '';
          if (typeof msgContent === 'string') text = msgContent;
          else if (Array.isArray(msgContent)) {
            const textParts = msgContent.filter(p => p.type === 'text').map(p => p.text);
            text = textParts.join('\n');
          }
          if (text.trim()) entries.push({ type: 'assistant', message: text, cwd, timestamp: ts });
        }
      } catch { continue; }
    }
    return entries;
  } catch { return []; }
}

/**
 * Count raw log entries for a session across all date files.
 * @param {import('../lib/types.d.ts').StorageAdapter} storage
 * @param {string} sessionDir
 * @returns {Promise<{count: number, timestamps: Set<string>}>}
 */
async function getRawLogState(storage, sessionDir) {
  const timestamps = new Set();
  let count = 0;
  try {
    const files = await storage.list(sessionDir);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const content = await storage.read(`${sessionDir}/${file}`);
      if (!content) continue;
      for (const line of content.trim().split('\n')) {
        try {
          const entry = JSON.parse(line);
          if (entry.timestamp) timestamps.add(entry.timestamp);
          count++;
        } catch { continue; }
      }
    }
  } catch { /* session dir might not be listable */ }
  return { count, timestamps };
}

async function main() {
  if (!acquireLock()) return; // Another session is already recovering

  try {
    const config = loadConfig();
    if (!config) return;
    const storage = await createStorageAdapter(config);

    const sessions = await storage.list('.raw');

    for (const sessionId of sessions) {
      const sessionDir = getRawDir(sessionId);

      // Read .meta.json for transcript path
      const metaContent = await storage.read(`${sessionDir}/.meta.json`);
      if (!metaContent) continue;

      let meta;
      try { meta = JSON.parse(metaContent); } catch { continue; }
      if (!meta.transcript_path || !existsSync(meta.transcript_path)) continue;

      // Compare transcript entries with raw log entries
      const transcriptEntries = parseTranscript(meta.transcript_path);
      if (transcriptEntries.length === 0) continue;

      const rawState = await getRawLogState(storage, sessionDir);

      // If raw logs have same or more entries, skip
      if (rawState.count >= transcriptEntries.length) continue;

      // Find missing entries (by timestamp) and append them
      const missingByDate = {};
      for (const entry of transcriptEntries) {
        if (rawState.timestamps.has(entry.timestamp)) continue;
        const date = entry.timestamp ? formatDate(new Date(entry.timestamp)) : formatDate(new Date());
        if (!missingByDate[date]) missingByDate[date] = [];
        missingByDate[date].push(entry);
      }

      // Append missing entries to appropriate date files
      for (const [date, entries] of Object.entries(missingByDate)) {
        const logPath = `${sessionDir}/${date}.jsonl`;
        const lines = entries.map(e =>
          JSON.stringify({ type: e.type, message: e.message, session_id: sessionId, cwd: e.cwd, timestamp: e.timestamp })
        ).join('\n') + '\n';
        await storage.append(logPath, lines);
      }
    }
  } catch (err) {
    try {
      const logDir = process.env.CLAUDE_PLUGIN_DATA;
      if (logDir) {
        const logPath = join(logDir, 'error.log');
        mkdirSync(dirname(logPath), { recursive: true });
        writeFileSync(logPath, `${new Date().toISOString()} recover: ${err.message}\n`, { flag: 'a' });
      }
    } catch { /* silent */ }
  } finally {
    releaseLock();
  }
}

main();
