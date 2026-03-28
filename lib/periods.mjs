// @ts-check

/** @param {Date} date @returns {number} */
export function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** @param {Date} date @returns {number} */
export function getISOWeekYear(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return d.getUTCFullYear();
}

/** @param {Date} date @returns {number} */
export function getQuarter(date) {
  return Math.ceil((date.getMonth() + 1) / 3);
}

/** @param {Date} date @returns {string} */
export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** @param {Date} date @returns {string} */
export function formatWeek(date) {
  return `${getISOWeekYear(date)}-W${String(getISOWeek(date)).padStart(2, '0')}`;
}

/** @param {Date} date @returns {string} */
export function formatMonth(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** @param {Date} date @returns {string} */
export function formatQuarter(date) {
  return `${date.getFullYear()}-Q${getQuarter(date)}`;
}

/** @param {Date} date @returns {string} */
export function formatYear(date) {
  return `${date.getFullYear()}`;
}

/**
 * @param {Date} today
 * @param {Date | null} lastRun
 * @returns {{ needsWeekly: boolean, needsMonthly: boolean, needsQuarterly: boolean, needsYearly: boolean, previousWeek: string, previousMonth: string, previousQuarter: string, previousYear: string }}
 */
export function checkPeriodsNeeded(today, lastRun) {
  if (!lastRun) {
    return {
      needsWeekly: false, needsMonthly: false, needsQuarterly: false, needsYearly: false,
      previousWeek: '', previousMonth: '', previousQuarter: '', previousYear: '',
    };
  }
  const todayWeek = formatWeek(today);
  const lastWeek = formatWeek(lastRun);
  const todayMonth = formatMonth(today);
  const lastMonth = formatMonth(lastRun);
  const todayQuarter = formatQuarter(today);
  const lastQuarter = formatQuarter(lastRun);
  const todayYear = formatYear(today);
  const lastYear = formatYear(lastRun);

  return {
    needsWeekly: todayWeek !== lastWeek,
    needsMonthly: todayMonth !== lastMonth,
    needsQuarterly: todayQuarter !== lastQuarter,
    needsYearly: todayYear !== lastYear,
    previousWeek: lastWeek, previousMonth: lastMonth,
    previousQuarter: lastQuarter, previousYear: lastYear,
  };
}
