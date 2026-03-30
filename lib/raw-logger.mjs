// @ts-check
import { sanitize } from './sanitizer.mjs';
/** @typedef {import('./types.d.ts').StorageAdapter} StorageAdapter */
/** @typedef {import('./types.d.ts').HookInput} HookInput */

/** @param {string} raw @returns {HookInput} */
export function parseHookInput(raw) {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid hook input: expected object');
  if (typeof parsed.session_id !== 'string' || !parsed.session_id) throw new Error('Invalid hook input: missing session_id');
  return /** @type {HookInput} */ (parsed);
}

/** @typedef {import('./types.d.ts').GitEntry} GitEntry */

/** @param {StorageAdapter} storage @param {string} sessionDir @param {string} date @param {HookInput} entry @returns {Promise<void>} */
export async function appendRawLog(storage, sessionDir, date, entry) {
  await storage.mkdir(sessionDir);
  const logPath = `${sessionDir}/${date}.jsonl`;
  const now = new Date().toISOString();
  let lines = '';

  const userMsg = entry.last_user_message ? sanitize(entry.last_user_message) : entry.last_user_message;
  const assistantMsg = entry.last_assistant_message ? sanitize(entry.last_assistant_message) : entry.last_assistant_message;

  // User message row (with original question timestamp)
  if (entry.last_user_message) {
    lines += JSON.stringify({ type: 'user', message: userMsg, session_id: entry.session_id, cwd: entry.cwd, timestamp: entry.user_timestamp || now }) + '\n';
  }

  // Assistant message row (with response completion timestamp)
  if (entry.last_assistant_message) {
    lines += JSON.stringify({ type: 'assistant', message: assistantMsg, session_id: entry.session_id, cwd: entry.cwd, timestamp: now }) + '\n';
  }

  if (lines) {
    await storage.append(logPath, lines);
  }
}

/**
 * Append git activity entries to raw log.
 * @param {StorageAdapter} storage
 * @param {string} sessionDir
 * @param {string} date
 * @param {Array<GitEntry>} gitEntries
 * @param {string} sessionId
 * @param {string} ghAccount
 * @returns {Promise<void>}
 */
export async function appendGitLogs(storage, sessionDir, date, gitEntries, sessionId, ghAccount) {
  if (gitEntries.length === 0) return;
  await storage.mkdir(sessionDir);
  const logPath = `${sessionDir}/${date}.jsonl`;
  const lines = gitEntries.map(e =>
    JSON.stringify({ type: 'git', action: e.action, hash: e.hash, branch: e.branch, message: e.message, remote: e.remote, cwd: e.cwd, ghAccount, session_id: sessionId, timestamp: e.timestamp })
  ).join('\n') + '\n';
  await storage.append(logPath, lines);
}
