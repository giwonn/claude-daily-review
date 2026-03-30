// @ts-check
/** @typedef {import('./types.d.ts').Config} Config */
/** @typedef {import('./types.d.ts').StorageAdapter} StorageAdapter */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { LocalStorageAdapter } from './storage.mjs';

/** @returns {string} */
export function getConfigPath() {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dataDir) {
    throw new Error('CLAUDE_PLUGIN_DATA environment variable is not set');
  }
  return join(dataDir, 'config.json');
}

/**
 * @param {unknown} raw
 * @returns {raw is { vaultPath: string; reviewFolder: string; language: string; periods: any; profile: any }}
 */
function isOldConfig(raw) {
  if (!raw || typeof raw !== 'object') return false;
  return 'vaultPath' in raw && 'reviewFolder' in raw;
}

/**
 * @param {{ vaultPath: string; reviewFolder: string; language: string; periods: any; profile: any }} old
 * @returns {Config}
 */
function migrateOldConfig(old) {
  return {
    storage: {
      type: 'local',
      local: { basePath: join(old.vaultPath, old.reviewFolder) },
    },
    language: old.language,
    periods: old.periods,
    profile: old.profile,
    privacy: { redactSecrets: true },
  };
}

/** @returns {Config | null} */
export function loadConfig() {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return null;
  const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
  if (isOldConfig(raw)) {
    const migrated = migrateOldConfig(raw);
    saveConfig(migrated);
    return migrated;
  }
  return /** @type {Config} */ (raw);
}

/** @param {Config} config */
export function saveConfig(config) {
  const configPath = getConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * @param {unknown} config
 * @returns {config is Config}
 */
export function validateConfig(config) {
  if (!config || typeof config !== 'object') return false;
  const c = /** @type {Record<string, unknown>} */ (config);
  if (!c.storage || typeof c.storage !== 'object') return false;
  const s = /** @type {Record<string, unknown>} */ (c.storage);
  if (s.type !== 'local' && s.type !== 'github') return false;
  if (s.type === 'local') {
    if (!s.local || typeof s.local !== 'object') return false;
    const l = /** @type {Record<string, unknown>} */ (s.local);
    if (typeof l.basePath !== 'string' || l.basePath === '') return false;
  }
  if (s.type === 'github') {
    if (!s.github || typeof s.github !== 'object') return false;
    const g = /** @type {Record<string, unknown>} */ (s.github);
    if (typeof g.owner !== 'string' || !g.owner) return false;
    if (typeof g.repo !== 'string' || !g.repo) return false;
    if (typeof g.token !== 'string' || !g.token) return false;
  }
  return true;
}

/** @param {string} basePath @returns {Config} */
export function createDefaultLocalConfig(basePath) {
  return {
    storage: { type: 'local', local: { basePath } },
    language: 'ko',
    periods: { daily: true, weekly: true, monthly: true, quarterly: true, yearly: false },
    profile: { company: '', role: '', team: '', context: '' },
    privacy: { redactSecrets: true },
  };
}

/** @param {string} owner @param {string} repo @param {string} token @returns {Config} */
export function createDefaultGitHubConfig(owner, repo, token) {
  return {
    storage: { type: 'github', github: { owner, repo, token, basePath: '' } },
    language: 'ko',
    periods: { daily: true, weekly: true, monthly: true, quarterly: true, yearly: false },
    profile: { company: '', role: '', team: '', context: '' },
    privacy: { redactSecrets: true },
  };
}

/**
 * @param {Config} config
 * @returns {Promise<StorageAdapter>}
 */
export async function createStorageAdapter(config) {
  if (config.storage.type === 'local') {
    return new LocalStorageAdapter(config.storage.local.basePath);
  }
  if (config.storage.type === 'github') {
    const { GitHubStorageAdapter } = await import('./github-storage.mjs');
    const g = config.storage.github;
    return new GitHubStorageAdapter(g.owner, g.repo, g.token, g.basePath);
  }
  throw new Error(`Unknown storage type: ${config.storage.type}`);
}
