// @ts-check
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const INDEX_FILENAME = 'index.json';

function getIndexPath(dataDir) {
  return join(dataDir, INDEX_FILENAME);
}

export function loadIndex(dataDir) {
  const indexPath = getIndexPath(dataDir);
  if (!existsSync(indexPath)) {
    return { byDate: {}, byProject: {}, sessions: {}, lastUpdated: '' };
  }
  try {
    return JSON.parse(readFileSync(indexPath, 'utf-8'));
  } catch {
    return { byDate: {}, byProject: {}, sessions: {}, lastUpdated: '' };
  }
}

export function indexExists(dataDir) {
  return existsSync(getIndexPath(dataDir));
}

function saveIndex(dataDir, index) {
  const indexPath = getIndexPath(dataDir);
  mkdirSync(dirname(indexPath), { recursive: true });
  index.lastUpdated = new Date().toISOString();
  writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

function addUnique(arr, value) {
  if (!arr.includes(value)) arr.push(value);
}

export function updateIndex(dataDir, entry) {
  const index = loadIndex(dataDir);
  const { sessionId, date, project, timestamp } = entry;

  if (!index.byDate[date]) index.byDate[date] = [];
  addUnique(index.byDate[date], sessionId);

  if (!index.byProject[project]) index.byProject[project] = [];
  addUnique(index.byProject[project], date);

  if (!index.sessions[sessionId]) {
    index.sessions[sessionId] = { dates: [], projects: [], lastTimestamp: '' };
  }
  addUnique(index.sessions[sessionId].dates, date);
  addUnique(index.sessions[sessionId].projects, project);
  if (timestamp) index.sessions[sessionId].lastTimestamp = timestamp;

  saveIndex(dataDir, index);
}

export function getDatesByProject(dataDir, project) {
  const index = loadIndex(dataDir);
  return index.byProject[project] || [];
}

export function getFilesByDateRange(dataDir, from, to) {
  const index = loadIndex(dataDir);
  return Object.entries(index.byDate)
    .filter(([date]) => date >= from && date <= to)
    .map(([date, sessions]) => ({ date, sessions }));
}
