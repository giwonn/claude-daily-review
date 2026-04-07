#!/usr/bin/env node
// Reads raw logs since last generation, determines what reviews need updating
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { loadConfig, createStorageAdapter } from './config.mjs';
import { getISOWeek, getISOWeekYear, getQuarter } from './periods.mjs';
import { indexExists, loadIndex, getDatesByProject } from './index-manager.mjs';
import { listAllUnflushedSessions, getUnflushedContent, markFlushed } from './buffer.mjs';
import { getRawLogPath, getRawDir } from './vault.mjs';

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

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { from: null, to: null, force: false, project: null, flushFirst: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) opts.from = args[++i];
    else if (args[i] === '--to' && args[i + 1]) opts.to = args[++i];
    else if (args[i] === '--project' && args[i + 1]) opts.project = args[++i];
    else if (args[i] === '--force') opts.force = true;
    else if (args[i] === '--flush') opts.flushFirst = true;
  }
  return opts;
}

async function main() {
  const config = loadConfig();
  if (!config) { console.log('{}'); return; }
  const storage = await createStorageAdapter(config);
  const opts = parseArgs();
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;

  // --flush: flush all local buffers to remote first
  if (opts.flushFirst && dataDir) {
    const sessions = listAllUnflushedSessions(dataDir);
    for (const sessionId of sessions) {
      const unflushed = getUnflushedContent(dataDir, sessionId);
      if (!unflushed) continue;

      const byDate = {};
      for (const line of unflushed.trim().split('\n')) {
        try {
          const entry = JSON.parse(line);
          const date = entry.timestamp ? entry.timestamp.slice(0, 10) : new Date().toISOString().slice(0, 10);
          if (!byDate[date]) byDate[date] = '';
          byDate[date] += line + '\n';
        } catch { continue; }
      }

      for (const [date, lines] of Object.entries(byDate)) {
        const dir = getRawDir(date);
        await storage.mkdir(dir);
        const logPath = getRawLogPath(date, sessionId);
        await storage.append(logPath, lines);
      }
      markFlushed(dataDir, sessionId);
    }
  }

  const lastGenerated = opts.force ? null : getLastGenerated();

  // Determine dates to scan (index-based or fallback)
  let datesToScan = [];

  if (dataDir && indexExists(dataDir)) {
    const index = loadIndex(dataDir);

    if (opts.project) {
      datesToScan = getDatesByProject(dataDir, opts.project);
    } else {
      datesToScan = Object.keys(index.byDate);
    }

    if (opts.from) datesToScan = datesToScan.filter(d => d >= opts.from);
    if (opts.to) datesToScan = datesToScan.filter(d => d <= opts.to);

    datesToScan.sort();
  } else {
    // No index: fallback to full scan
    datesToScan = await storage.list('raw');
    if (opts.from) datesToScan = datesToScan.filter(d => d >= opts.from);
    if (opts.to) datesToScan = datesToScan.filter(d => d <= opts.to);
  }

  // Collect raw logs
  const logsByDate = {};
  const gitByDate = {};
  const affectedDates = new Set();

  for (const date of datesToScan) {
    const files = await storage.list('raw/' + date);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const content = await storage.read('raw/' + date + '/' + file);
      if (!content) continue;

      for (const line of content.trim().split('\n')) {
        try {
          const entry = JSON.parse(line);

          if (entry.type === 'git') {
            if (!gitByDate[date]) gitByDate[date] = [];
            gitByDate[date].push({
              action: entry.action || '',
              hash: entry.hash || '',
              branch: entry.branch || '',
              message: entry.message || '',
              remote: entry.remote || '',
              ghAccount: entry.ghAccount || '',
              cwd: entry.cwd || '',
              timestamp: entry.timestamp || '',
            });
            if (!lastGenerated || entry.timestamp > lastGenerated) {
              affectedDates.add(date);
            }
            continue;
          }

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

  if (affectedDates.size === 0) {
    console.log(JSON.stringify({ needs: { daily: [], weekly: [], monthly: [], quarterly: [], yearly: [] }, logs: {}, gitActivity: {} }));
    return;
  }

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

  const filteredLogs = {};
  const filteredGit = {};
  for (const date of affectedDates) {
    if (logsByDate[date]) filteredLogs[date] = logsByDate[date];
    if (gitByDate[date]) filteredGit[date] = gitByDate[date];
  }

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
    gitActivity: filteredGit,
  };

  console.log(JSON.stringify(result));
}

main().catch(() => console.log('{}'));
