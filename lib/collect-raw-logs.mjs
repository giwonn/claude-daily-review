#!/usr/bin/env node
// Reads raw logs, checks existing reviews, determines what needs to be generated
import { loadConfig, createStorageAdapter } from './config.mjs';
import { getISOWeek, getISOWeekYear, getQuarter } from './periods.mjs';

/**
 * @param {Date} date
 * @returns {string}
 */
function toWeekKey(date) {
  return `${getISOWeekYear(date)}-W${String(getISOWeek(date)).padStart(2, '0')}`;
}

/**
 * @param {Date} date
 * @returns {string}
 */
function toMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * @param {Date} date
 * @returns {string}
 */
function toQuarterKey(date) {
  return `${date.getFullYear()}-Q${getQuarter(date)}`;
}

/**
 * @param {Date} date
 * @returns {string}
 */
function toYearKey(date) {
  return `${date.getFullYear()}`;
}

async function main() {
  const config = loadConfig();
  if (!config) { console.log('{}'); return; }
  const storage = await createStorageAdapter(config);

  // 1. Collect raw logs by date
  const sessions = await storage.list('.raw');
  /** @type {Record<string, Array<{type: string, message: string, cwd: string, timestamp: string}>>} */
  const logsByDate = {};

  for (const sess of sessions) {
    const files = await storage.list('.raw/' + sess);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const date = file.replace('.jsonl', '');
      const content = await storage.read('.raw/' + sess + '/' + file);
      if (!content) continue;
      if (!logsByDate[date]) logsByDate[date] = [];
      for (const line of content.trim().split('\n')) {
        try {
          const entry = JSON.parse(line);
          logsByDate[date].push({
            type: entry.type || 'unknown',
            message: entry.message || '',
            cwd: entry.cwd || '',
            timestamp: entry.timestamp || '',
          });
        } catch {}
      }
    }
  }

  // 2. Check existing reviews
  const existingDaily = new Set((await storage.list('daily')).map(f => f.replace('.md', '')));
  const existingWeekly = new Set((await storage.list('weekly')).map(f => f.replace('.md', '')));
  const existingMonthly = new Set((await storage.list('monthly')).map(f => f.replace('.md', '')));
  const existingQuarterly = new Set((await storage.list('quarterly')).map(f => f.replace('.md', '')));
  const existingYearly = new Set((await storage.list('yearly')).map(f => f.replace('.md', '')));

  // 3. All dates with raw logs need daily generation (re-generate if new logs exist)
  const allDates = Object.keys(logsByDate).sort();
  const needsDaily = allDates;

  // 4. Determine which periodic summaries are needed
  // Collect all date objects (existing + to-be-created dailies)
  const allDailyDates = [...new Set([...existingDaily, ...allDates])].sort();
  const periods = config.periods;

  // Group dates by period
  const weeksSeen = new Set();
  const monthsSeen = new Set();
  const quartersSeen = new Set();
  const yearsSeen = new Set();

  for (const dateStr of allDailyDates) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    weeksSeen.add(toWeekKey(date));
    monthsSeen.add(toMonthKey(date));
    quartersSeen.add(toQuarterKey(date));
    yearsSeen.add(toYearKey(date));
  }

  const needsWeekly = periods.weekly ? [...weeksSeen].sort() : [];
  const needsMonthly = periods.monthly ? [...monthsSeen].sort() : [];
  const needsQuarterly = periods.quarterly ? [...quartersSeen].sort() : [];
  const needsYearly = periods.yearly ? [...yearsSeen].sort() : [];

  // 5. Output
  const result = {
    profile: config.profile,
    language: config.language,
    needs: {
      daily: needsDaily,
      weekly: needsWeekly,
      monthly: needsMonthly,
      quarterly: needsQuarterly,
      yearly: needsYearly,
    },
    logs: logsByDate,
  };

  console.log(JSON.stringify(result));
}

main().catch(() => console.log('{}'));
