// @ts-check
/** @typedef {import('./types.d.ts').StorageAdapter} StorageAdapter */

/** @param {StorageAdapter} storage @param {string} rawDir @returns {Promise<string[]>} */
export async function findUnprocessedSessions(storage, rawDir) {
  if (!(await storage.exists(rawDir))) return [];
  const entries = await storage.list(rawDir);
  const results = [];
  for (const entry of entries) {
    const entryPath = `${rawDir}/${entry}`;
    if (!(await storage.isDirectory(entryPath))) continue;
    if (await storage.exists(`${entryPath}/.completed`)) continue;
    results.push(entry);
  }
  return results;
}

/** @param {StorageAdapter} storage @param {string} reviewsDir @returns {Promise<string[]>} */
export async function findPendingReviews(storage, reviewsDir) {
  if (!(await storage.exists(reviewsDir))) return [];
  const entries = await storage.list(reviewsDir);
  return entries.filter((f) => f.endsWith('.md'));
}

/** @param {StorageAdapter} storage @param {string} sessionDir @returns {Promise<void>} */
export async function markSessionCompleted(storage, sessionDir) {
  await storage.write(`${sessionDir}/.completed`, new Date().toISOString());
}

/** @param {StorageAdapter} storage @param {string} sessionDir @returns {Promise<boolean>} */
export async function isSessionCompleted(storage, sessionDir) {
  return storage.exists(`${sessionDir}/.completed`);
}

/** @param {StorageAdapter} storage @param {string[]} reviewPaths @param {string} dailyPath @returns {Promise<void>} */
export async function mergeReviewsIntoDaily(storage, reviewPaths, dailyPath) {
  const reviewContents = [];
  for (const p of reviewPaths) {
    const content = await storage.read(p);
    if (content && content.trim().length > 0) reviewContents.push(content.trim());
  }
  if (reviewContents.length === 0) {
    if (!(await storage.exists(dailyPath))) await storage.write(dailyPath, '');
    return;
  }
  const existing = await storage.read(dailyPath);
  const merged = existing
    ? existing.trimEnd() + '\n\n' + reviewContents.join('\n\n') + '\n'
    : reviewContents.join('\n\n') + '\n';
  await storage.write(dailyPath, merged);
}
