// @ts-check
/** @typedef {import('./types.d.ts').StorageAdapter} StorageAdapter */
/** @typedef {import('./types.d.ts').Periods} Periods */

/** @param {string} date @returns {string} */
export function getRawDir(date) { return `raw/${date}`; }

/** @param {string} date @param {string} sessionId @returns {string} */
export function getRawLogPath(date, sessionId) { return `raw/${date}/${sessionId}.jsonl`; }

/** @returns {string} */
export function getReviewsDir() { return '.reviews'; }

/** @param {string} date @returns {string} */
export function getDailyPath(date) { return `daily/${date}.md`; }

/** @param {string} week @returns {string} */
export function getWeeklyPath(week) { return `weekly/${week}.md`; }

/** @param {string} month @returns {string} */
export function getMonthlyPath(month) { return `monthly/${month}.md`; }

/** @param {string} quarter @returns {string} */
export function getQuarterlyPath(quarter) { return `quarterly/${quarter}.md`; }

/** @param {string} year @returns {string} */
export function getYearlyPath(year) { return `yearly/${year}.md`; }

/** @param {string} projectName @param {string} date @returns {string} */
export function getProjectDailyPath(projectName, date) { return `projects/${projectName}/${date}.md`; }

/** @param {string} projectName @returns {string} */
export function getProjectSummaryPath(projectName) { return `projects/${projectName}/summary.md`; }

/** @param {string} date @returns {string} */
export function getUncategorizedPath(date) { return `uncategorized/${date}.md`; }

/** @param {StorageAdapter} storage @param {Periods} periods @returns {Promise<void>} */
export async function ensureVaultDirectories(storage, periods) {
  const dirs = ['daily', 'projects', 'uncategorized', 'raw', '.reviews'];
  if (periods.weekly) dirs.push('weekly');
  if (periods.monthly) dirs.push('monthly');
  if (periods.quarterly) dirs.push('quarterly');
  if (periods.yearly) dirs.push('yearly');
  for (const dir of dirs) { await storage.mkdir(dir); }
}
