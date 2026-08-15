// @ts-check
// Ingests Codex CLI session rollout logs into the shared raw-log store,
// so Codex conversations show up in daily reviews alongside Claude Code.
//
// Codex writes append-only rollout files at:
//   $CODEX_HOME/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl   (default ~/.codex)
// Each file interleaves several record types; we read the clean, injection-free
// `event_msg` records (`user_message` / `agent_message`) for the conversation,
// and track `cwd` from `session_meta` / `turn_context` for project detection.
//
// Ingest is incremental: we remember how many messages we already emitted per
// file (message count, since rollouts are append-only) and only emit the tail.

import { homedir } from 'os';
import { join, basename } from 'path';
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { sanitize } from './sanitizer.mjs';
import { detectProject } from './project-detector.mjs';
import { formatDate } from './periods.mjs';
import { getRawLogPath, getRawDir } from './vault.mjs';
import { updateIndex } from './index-manager.mjs';

/** @typedef {import('./types.d.ts').StorageAdapter} StorageAdapter */

const STATE_FILENAME = 'codex-ingest-state.json';
const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/** @returns {string} */
export function getCodexSessionsDir() {
  const home = process.env.CODEX_HOME || join(homedir(), '.codex');
  return join(home, 'sessions');
}

/**
 * Parse a Codex rollout file's contents into ordered conversation messages.
 * Pure and streaming-friendly: tracks the current cwd/sessionId as it reads.
 * @param {string} content
 * @returns {{ sessionId: string, messages: Array<{ role: 'user'|'assistant', message: string, cwd: string, timestamp: string }> }}
 */
export function parseCodexRollout(content) {
  let cwd = '';
  let sessionId = '';
  const messages = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try { obj = JSON.parse(trimmed); } catch { continue; }

    if (obj.type === 'session_meta') {
      if (obj.payload?.id) sessionId = obj.payload.id;
      if (obj.payload?.cwd) cwd = obj.payload.cwd;
      continue;
    }
    if (obj.type === 'turn_context') {
      if (obj.payload?.cwd) cwd = obj.payload.cwd;
      continue;
    }
    if (obj.type === 'event_msg') {
      const p = obj.payload || {};
      const ts = obj.timestamp || '';
      if (p.type === 'user_message' && typeof p.message === 'string' && p.message.trim()) {
        messages.push({ role: 'user', message: p.message, cwd, timestamp: ts });
      } else if (p.type === 'agent_message' && typeof p.message === 'string' && p.message.trim()) {
        messages.push({ role: 'assistant', message: p.message, cwd, timestamp: ts });
      }
    }
  }

  return { sessionId, messages };
}

/** @param {string} filePath @returns {string} */
function sessionIdFromFilename(filePath) {
  const m = basename(filePath).match(UUID_RE);
  return m ? m[1] : basename(filePath).replace(/\.jsonl$/, '');
}

/** @param {string} dir @returns {string[]} absolute paths of rollout-*.jsonl files */
function listRolloutFiles(dir) {
  const out = [];
  /** @param {string} d */
  function walk(d) {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.startsWith('rollout-') && e.name.endsWith('.jsonl')) out.push(full);
    }
  }
  walk(dir);
  return out;
}

/** @param {string} dataDir @returns {{ files: Record<string, { count: number }> }} */
function loadState(dataDir) {
  const path = join(dataDir, STATE_FILENAME);
  if (!existsSync(path)) return { files: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    return parsed && typeof parsed === 'object' && parsed.files ? parsed : { files: {} };
  } catch {
    return { files: {} };
  }
}

/** @param {string} dataDir @param {{ files: Record<string, { count: number }> }} state */
function saveState(dataDir, state) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, STATE_FILENAME), JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Scan Codex rollout logs and append any not-yet-ingested messages to the
 * shared raw-log store. Safe to call repeatedly; only the tail of each session
 * is emitted per run. Never throws for missing dirs / unreadable files.
 * @param {StorageAdapter} storage
 * @param {string} dataDir
 * @returns {Promise<{ ingested: number }>}
 */
export async function ingestCodexSessions(storage, dataDir) {
  const sessionsDir = getCodexSessionsDir();
  if (!existsSync(sessionsDir)) return { ingested: 0 };

  const state = loadState(dataDir);
  const projectCache = new Map();
  let ingested = 0;

  for (const file of listRolloutFiles(sessionsDir)) {
    let content;
    try { content = readFileSync(file, 'utf-8'); } catch { continue; }

    const { sessionId, messages } = parseCodexRollout(content);
    const sid = 'codex-' + (sessionId || sessionIdFromFilename(file));
    const prevCount = state.files[file]?.count || 0;

    if (messages.length <= prevCount) {
      state.files[file] = { count: messages.length };
      continue;
    }

    const fresh = messages.slice(prevCount);

    /** @type {Record<string, string>} date -> jsonl lines */
    const linesByDate = {};
    /** @type {Map<string, { date: string, project: string }>} distinct (date, project) pairs */
    const indexPairs = new Map();
    let lastTimestamp = '';

    for (const m of fresh) {
      const ts = m.timestamp || new Date().toISOString();
      const date = formatDate(new Date(ts));
      let project = projectCache.get(m.cwd);
      if (project === undefined) {
        project = detectProject(m.cwd);
        projectCache.set(m.cwd, project);
      }
      const entry = {
        type: m.role,
        message: sanitize(m.message),
        session_id: sid,
        cwd: m.cwd || '',
        project,
        source: 'codex',
        timestamp: ts,
      };
      linesByDate[date] = (linesByDate[date] || '') + JSON.stringify(entry) + '\n';
      indexPairs.set(date + '\t' + project, { date, project });
      lastTimestamp = ts;
      ingested++;
    }

    for (const [date, lines] of Object.entries(linesByDate)) {
      await storage.mkdir(getRawDir(date));
      await storage.append(getRawLogPath(date, sid), lines);
    }
    for (const { date, project } of indexPairs.values()) {
      updateIndex(dataDir, { sessionId: sid, date, project, timestamp: lastTimestamp });
    }

    state.files[file] = { count: messages.length };
  }

  saveState(dataDir, state);
  return { ingested };
}
