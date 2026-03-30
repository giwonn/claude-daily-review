#!/usr/bin/env node
// Reads raw logs since last generation, determines what reviews need updating
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { loadConfig, createStorageAdapter } from './config.mjs';
import { getISOWeek, getISOWeekYear, getQuarter } from './periods.mjs';

/** @param {Date} date @returns {string} */
function toWeekKey(date) {
  return `${getISOWeekYear(date)}-W${String(getISOWeek(date)).padStart(2, '0')}`;
}

/** @param {Date} date @returns {string} */
function toMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** @param {Date} date @returns {string} */
function toQuarterKey(date) {
  return `${date.getFullYear()}-Q${getQuarter(date)}`;
}

/** @param {Date} date @returns {string} */
function toYearKey(date) {
  return `${date.getFullYear()}`;
}

function getLastGenerated() {
  try {
    const dataDir = process.env.CLAUDE_PLUGIN_DATA;
    if (!dataDir) return null;
    const path = join(dataDir, 'last-generated.json');
    if (!existsSync(path)) return null;
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    return data.timestamp || null;
  } catch { return null; }
}

function saveLastGenerated(timestamp) {
  try {
    const dataDir = process.env.CLAUDE_PLUGIN_DATA;
    if (!dataDir) return;
    const path = join(dataDir, 'last-generated.json');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ timestamp }), 'utf-8');
  } catch {}
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { from: null, to: null, force: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) opts.from = args[++i];
    else if (args[i] === '--to' && args[i + 1]) opts.to = args[++i];
    else if (args[i] === '--force') opts.force = true;
  }
  return opts;
}

async function main() {
  const config = loadConfig();
  if (!config) { console.log('{}'); return; }
  const storage = await createStorageAdapter(config);
  const opts = parseArgs();

  const lastGenerated = opts.force ? null : getLastGenerated();

  // 1. Collect raw logs, filter by lastGenerated timestamp
  const sessions = await storage.list('.raw');
  /** @type {Record<string, Array<{type: string, message: string, cwd: string, timestamp: string}>>} */
  const logsByDate = {};
  const affectedDates = new Set();

  for (const sess of sessions) {
    const files = await storage.list('.raw/' + sess);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const date = file.replace('.jsonl', '');
      const content = await storage.read('.raw/' + sess + '/' + file);
      if (!content) continue;

      // Apply date range filter
      if (opts.from && date < opts.from) continue;
      if (opts.to && date > opts.to) continue;

      for (const line of content.trim().split('\n')) {
        try {
          const entry = JSON.parse(line);
          if (!logsByDate[date]) logsByDate[date] = [];
          logsByDate[date].push({
            type: entry.type || 'unknown',
            message: entry.message || '',
            cwd: entry.cwd || '',
            timestamp: entry.timestamp || '',
          });

          if (!lastGenerated || entry.timestamp > lastGenerated) {
            affectedDates.add(date);
          }
        } catch {}
      }
    }
  }

  // 2. If no new entries, nothing to do
  if (affectedDates.size === 0) {
    console.log(JSON.stringify({ needs: { daily: [], weekly: [], monthly: [], quarterly: [], yearly: [] }, logs: {} }));
    return;
  }

  // 3. Determine which periods are affected by the changed dates
  const periods = config.periods;
  const affectedWeeks = new Set();
  const affectedMonths = new Set();
  const affectedQuarters = new Set();
  const affectedYears = new Set();

  for (const dateStr of affectedDates) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (periods.weekly) affectedWeeks.add(toWeekKey(date));
    if (periods.monthly) affectedMonths.add(toMonthKey(date));
    if (periods.quarterly) affectedQuarters.add(toQuarterKey(date));
    if (periods.yearly) affectedYears.add(toYearKey(date));
  }

  // 4. Only include logs for affected dates
  const filteredLogs = {};
  for (const date of affectedDates) {
    filteredLogs[date] = logsByDate[date];
  }

  // 5. Output
  const now = new Date().toISOString();
  const result = {
    profile: config.profile,
    language: config.language,
    lastGenerated: lastGenerated,
    newTimestamp: now,
    needs: {
      daily: [...affectedDates].sort(),
      weekly: [...affectedWeeks].sort(),
      monthly: [...affectedMonths].sort(),
      quarterly: [...affectedQuarters].sort(),
      yearly: [...affectedYears].sort(),
    },
    logs: filteredLogs,
  };

  console.log(JSON.stringify(result));
}

main().catch(() => console.log('{}'));
