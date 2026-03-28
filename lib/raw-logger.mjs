// @ts-check
/** @typedef {import('./types.d.ts').StorageAdapter} StorageAdapter */
/** @typedef {import('./types.d.ts').HookInput} HookInput */

/** @param {string} raw @returns {HookInput} */
export function parseHookInput(raw) {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid hook input: expected object');
  if (typeof parsed.session_id !== 'string' || !parsed.session_id) throw new Error('Invalid hook input: missing session_id');
  return /** @type {HookInput} */ (parsed);
}

/** @param {StorageAdapter} storage @param {string} sessionDir @param {string} date @param {HookInput} entry @returns {Promise<void>} */
export async function appendRawLog(storage, sessionDir, date, entry) {
  await storage.mkdir(sessionDir);
  const logPath = `${sessionDir}/${date}.jsonl`;
  const now = new Date().toISOString();
  let lines = '';

  // User message row (with original question timestamp)
  if (entry.last_user_message) {
    lines += JSON.stringify({ type: 'user', message: entry.last_user_message, session_id: entry.session_id, cwd: entry.cwd, timestamp: entry.user_timestamp || now }) + '\n';
  }

  // Assistant message row (with response completion timestamp)
  if (entry.last_assistant_message) {
    lines += JSON.stringify({ type: 'assistant', message: entry.last_assistant_message, session_id: entry.session_id, cwd: entry.cwd, timestamp: now }) + '\n';
  }

  if (lines) {
    await storage.append(logPath, lines);
  }
}
