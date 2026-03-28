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
  const record = { ...entry, timestamp: new Date().toISOString() };
  await storage.append(logPath, JSON.stringify(record) + '\n');
}
