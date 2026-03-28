# No-Build Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert TypeScript + tsup build system to plain .mjs + JSDoc with no build step, matching Claude Code plugin ecosystem conventions.

**Architecture:** Replace src/*.ts with lib/*.mjs (JSDoc typed), replace dist/ with direct execution, add run-hook.cmd polyglot wrapper for Windows support, add CI workflow for marketplace SHA auto-update.

**Tech Stack:** Node.js ESM (.mjs), JSDoc type annotations, bash scripts, GitHub Actions

---

## File Structure

```
claude-daily-review/
├── .claude-plugin/
│   └── marketplace.json           ← MODIFY: SHA auto-update
├── .github/workflows/
│   ├── publish.yml                ← KEEP
│   └── update-marketplace.yml     ← CREATE: SHA auto-update
├── hooks/
│   ├── hooks.json                 ← MODIFY: new paths
│   ├── run-hook.cmd               ← CREATE: polyglot wrapper
│   ├── session-start-check        ← CREATE: bash script
│   └── on-stop.mjs                ← CREATE: raw log append
├── lib/
│   ├── types.d.ts                 ← CREATE: type definitions for JSDoc
│   ├── config.mjs                 ← CREATE: from src/core/config.ts
│   ├── storage.mjs                ← CREATE: from src/core/local-storage.ts
│   ├── github-storage.mjs         ← CREATE: from src/core/github-storage.ts
│   ├── github-auth.mjs            ← CREATE: from src/core/github-auth.ts
│   ├── periods.mjs                ← CREATE: from src/core/periods.ts
│   ├── vault.mjs                  ← CREATE: from src/core/vault.ts
│   ├── raw-logger.mjs             ← CREATE: from src/core/raw-logger.ts
│   ├── merge.mjs                  ← CREATE: from src/core/merge.ts
│   └── storage-cli.mjs            ← CREATE: from src/cli/storage-cli.ts
├── prompts/                       ← KEEP (update paths in content)
├── skills/                        ← KEEP
├── package.json                   ← MODIFY: simplify
├── README.md                      ← KEEP
├── README.ko.md                   ← KEEP
│
├── src/                           ← DELETE entire directory
├── dist/                          ← DELETE entire directory
├── tests/                         ← DELETE entire directory
├── tsconfig.json                  ← DELETE
├── tsup.config.ts                 ← DELETE
└── vitest.config.ts               ← DELETE
```

---

### Task 1: Create lib/ with types and core modules

**Files:**
- Create: `lib/types.d.ts`
- Create: `lib/config.mjs`
- Create: `lib/periods.mjs`
- Create: `lib/storage.mjs`
- Create: `lib/vault.mjs`
- Create: `lib/raw-logger.mjs`
- Create: `lib/merge.mjs`

- [ ] **Step 1: Create lib/types.d.ts**

```typescript
// lib/types.d.ts
export interface Profile {
  company: string;
  role: string;
  team: string;
  context: string;
}

export interface Periods {
  daily: true;
  weekly: boolean;
  monthly: boolean;
  quarterly: boolean;
  yearly: boolean;
}

export interface LocalStorageConfig {
  basePath: string;
}

export interface GitHubStorageConfig {
  owner: string;
  repo: string;
  token: string;
  basePath: string;
}

export interface StorageConfig {
  type: "local" | "github";
  local?: LocalStorageConfig;
  github?: GitHubStorageConfig;
}

export interface Config {
  storage: StorageConfig;
  language: string;
  periods: Periods;
  profile: Profile;
}

export interface StorageAdapter {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(dir: string): Promise<string[]>;
  mkdir(dir: string): Promise<void>;
  isDirectory(path: string): Promise<boolean>;
}

export interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  [key: string]: unknown;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}
```

- [ ] **Step 2: Create lib/config.mjs**

```javascript
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
  };
}

/** @param {string} owner @param {string} repo @param {string} token @returns {Config} */
export function createDefaultGitHubConfig(owner, repo, token) {
  return {
    storage: { type: 'github', github: { owner, repo, token, basePath: 'daily-review' } },
    language: 'ko',
    periods: { daily: true, weekly: true, monthly: true, quarterly: true, yearly: false },
    profile: { company: '', role: '', team: '', context: '' },
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
```

- [ ] **Step 3: Create lib/periods.mjs**

Convert `src/core/periods.ts` to `.mjs` with JSDoc. Remove TypeScript syntax, add JSDoc annotations. Same logic exactly.

```javascript
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
```

- [ ] **Step 4: Create lib/storage.mjs (LocalStorageAdapter)**

```javascript
// @ts-check
/** @typedef {import('./types.d.ts').StorageAdapter} StorageAdapter */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';

/** @implements {StorageAdapter} */
export class LocalStorageAdapter {
  /** @param {string} basePath */
  constructor(basePath) {
    /** @private */
    this.basePath = basePath;
  }

  /** @private @param {string} path @returns {string} */
  resolve(path) {
    return join(this.basePath, path);
  }

  /** @param {string} path @returns {Promise<string | null>} */
  async read(path) {
    const full = this.resolve(path);
    if (!existsSync(full)) return null;
    return readFileSync(full, 'utf-8');
  }

  /** @param {string} path @param {string} content @returns {Promise<void>} */
  async write(path, content) {
    const full = this.resolve(path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf-8');
  }

  /** @param {string} path @param {string} content @returns {Promise<void>} */
  async append(path, content) {
    const full = this.resolve(path);
    mkdirSync(dirname(full), { recursive: true });
    appendFileSync(full, content, 'utf-8');
  }

  /** @param {string} path @returns {Promise<boolean>} */
  async exists(path) {
    return existsSync(this.resolve(path));
  }

  /** @param {string} dir @returns {Promise<string[]>} */
  async list(dir) {
    const full = this.resolve(dir);
    if (!existsSync(full)) return [];
    return readdirSync(full);
  }

  /** @param {string} dir @returns {Promise<void>} */
  async mkdir(dir) {
    mkdirSync(this.resolve(dir), { recursive: true });
  }

  /** @param {string} path @returns {Promise<boolean>} */
  async isDirectory(path) {
    try { return statSync(this.resolve(path)).isDirectory(); }
    catch { return false; }
  }
}
```

- [ ] **Step 5: Create lib/vault.mjs**

```javascript
// @ts-check
/** @typedef {import('./types.d.ts').StorageAdapter} StorageAdapter */
/** @typedef {import('./types.d.ts').Periods} Periods */

/** @param {string} sessionId @returns {string} */
export function getRawDir(sessionId) { return `.raw/${sessionId}`; }

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
  const dirs = ['daily', 'projects', 'uncategorized', '.raw', '.reviews'];
  if (periods.weekly) dirs.push('weekly');
  if (periods.monthly) dirs.push('monthly');
  if (periods.quarterly) dirs.push('quarterly');
  if (periods.yearly) dirs.push('yearly');
  for (const dir of dirs) { await storage.mkdir(dir); }
}
```

- [ ] **Step 6: Create lib/raw-logger.mjs**

```javascript
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
```

- [ ] **Step 7: Create lib/merge.mjs**

```javascript
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
```

- [ ] **Step 8: Verify lib/ modules load**

Run: `node -e "import('./lib/config.mjs').then(m => console.log('OK:', Object.keys(m)))"`
Expected: `OK: [ 'getConfigPath', 'loadConfig', 'saveConfig', ... ]`

- [ ] **Step 9: Commit**

```bash
git add lib/
git commit -m "feat: add lib/ with .mjs + JSDoc modules (no build required)"
```

---

### Task 2: Create GitHub modules (auth + storage)

**Files:**
- Create: `lib/github-auth.mjs`
- Create: `lib/github-storage.mjs`

- [ ] **Step 1: Create lib/github-auth.mjs**

```javascript
// @ts-check
/** @typedef {import('./types.d.ts').DeviceCodeResponse} DeviceCodeResponse */

const GITHUB_CLIENT_ID = 'Ov23lijFU2NkxD93Q2f2';

/** @returns {Promise<DeviceCodeResponse>} */
export async function requestDeviceCode() {
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: 'repo' }),
  });
  if (!res.ok) throw new Error(`GitHub device code request failed: ${res.status}`);
  return /** @type {Promise<DeviceCodeResponse>} */ (res.json());
}

/** @param {number} ms @returns {Promise<void>} */
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

/** @param {DeviceCodeResponse} deviceCode @param {number} [maxAttempts=180] @returns {Promise<string>} */
export async function pollForToken(deviceCode, maxAttempts = 180) {
  let interval = deviceCode.interval * 1000;
  for (let i = 0; i < maxAttempts; i++) {
    if (interval > 0) await sleep(interval);
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });
    /** @type {Record<string, unknown>} */
    let data;
    try { data = /** @type {Record<string, unknown>} */ (await res.json()); }
    catch { continue; }
    if (data.access_token) return /** @type {string} */ (data.access_token);
    if (data.error === 'slow_down') { interval += 5000; continue; }
    if (data.error === 'authorization_pending') continue;
    throw new Error(`GitHub auth error: ${data.error}`);
  }
  throw new Error('GitHub auth timed out waiting for authorization');
}
```

- [ ] **Step 2: Create lib/github-storage.mjs**

```javascript
// @ts-check
/** @typedef {import('./types.d.ts').StorageAdapter} StorageAdapter */

/** @implements {StorageAdapter} */
export class GitHubStorageAdapter {
  /** @param {string} owner @param {string} repo @param {string} token @param {string} basePath */
  constructor(owner, repo, token, basePath) {
    /** @private */ this.baseUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
    /** @private */ this.basePath = basePath;
    /** @private */ this.headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
  }

  /** @private @param {string} path @returns {string} */
  getUrl(path) { return `${this.baseUrl}/${this.basePath}/${path}`; }

  /** @private @param {string} path @returns {Promise<string | null>} */
  async getSha(path) {
    const res = await fetch(this.getUrl(path), { method: 'GET', headers: this.headers });
    if (res.status === 404) return null;
    const data = /** @type {Record<string, unknown>} */ (await res.json());
    return /** @type {string | null} */ (data.sha || null);
  }

  /** @param {string} path @returns {Promise<string | null>} */
  async read(path) {
    const res = await fetch(this.getUrl(path), { method: 'GET', headers: this.headers });
    if (res.status === 404) return null;
    const data = /** @type {Record<string, unknown>} */ (await res.json());
    return Buffer.from(/** @type {string} */ (data.content), 'base64').toString('utf-8');
  }

  /** @param {string} path @param {string} content @returns {Promise<void>} */
  async write(path, content) {
    const sha = await this.getSha(path);
    /** @type {Record<string, unknown>} */
    const body = { message: `update ${path}`, content: Buffer.from(content).toString('base64') };
    if (sha) body.sha = sha;
    const res = await fetch(this.getUrl(path), { method: 'PUT', headers: this.headers, body: JSON.stringify(body) });
    if (!res.ok && res.status === 409) {
      const freshSha = await this.getSha(path);
      if (freshSha) body.sha = freshSha;
      await fetch(this.getUrl(path), { method: 'PUT', headers: this.headers, body: JSON.stringify(body) });
    }
  }

  /** @param {string} path @param {string} content @returns {Promise<void>} */
  async append(path, content) {
    const existing = await this.read(path);
    await this.write(path, existing ? existing + content : content);
  }

  /** @param {string} path @returns {Promise<boolean>} */
  async exists(path) {
    const res = await fetch(this.getUrl(path), { method: 'GET', headers: this.headers });
    return res.status !== 404;
  }

  /** @param {string} dir @returns {Promise<string[]>} */
  async list(dir) {
    const res = await fetch(this.getUrl(dir), { method: 'GET', headers: this.headers });
    if (res.status === 404) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((/** @type {{ name: string }} */ entry) => entry.name);
  }

  /** @param {string} _dir @returns {Promise<void>} */
  async mkdir(_dir) { /* GitHub creates directories implicitly */ }

  /** @param {string} path @returns {Promise<boolean>} */
  async isDirectory(path) {
    const res = await fetch(this.getUrl(path), { method: 'GET', headers: this.headers });
    if (res.status === 404) return false;
    const data = await res.json();
    return Array.isArray(data);
  }
}
```

- [ ] **Step 3: Verify imports work**

Run: `node -e "import('./lib/github-auth.mjs').then(m => console.log('OK:', Object.keys(m)))"`
Expected: `OK: [ 'requestDeviceCode', 'pollForToken' ]`

- [ ] **Step 4: Commit**

```bash
git add lib/github-auth.mjs lib/github-storage.mjs
git commit -m "feat: add GitHub auth and storage modules as .mjs"
```

---

### Task 3: Create hook scripts + storage CLI

**Files:**
- Create: `hooks/on-stop.mjs`
- Create: `hooks/session-start-check`
- Create: `hooks/run-hook.cmd`
- Create: `lib/storage-cli.mjs`

- [ ] **Step 1: Create hooks/on-stop.mjs**

```javascript
#!/usr/bin/env node
// @ts-check
import { loadConfig, createStorageAdapter } from '../lib/config.mjs';
import { parseHookInput, appendRawLog } from '../lib/raw-logger.mjs';
import { getRawDir } from '../lib/vault.mjs';
import { formatDate } from '../lib/periods.mjs';

async function main() {
  try {
    const config = loadConfig();
    if (!config) return;
    const storage = await createStorageAdapter(config);
    let data = '';
    process.stdin.setEncoding('utf-8');
    for await (const chunk of process.stdin) { data += chunk; }
    const input = parseHookInput(data);
    const sessionDir = getRawDir(input.session_id);
    const date = formatDate(new Date());
    await appendRawLog(storage, sessionDir, date, input);
  } catch {
    // async hook — fail silently
  }
}
main();
```

- [ ] **Step 2: Create hooks/session-start-check**

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

result=$(node -e "
import { loadConfig } from '${PLUGIN_ROOT}/lib/config.mjs';
try {
  const config = loadConfig();
  if (!config) process.stdout.write('NEEDS_SETUP');
} catch {
  process.stdout.write('NEEDS_SETUP');
}
" 2>/dev/null || echo "NEEDS_SETUP")

if [ "$result" = "NEEDS_SETUP" ]; then
  msg='<important-reminder>IN YOUR FIRST REPLY YOU MUST TELL THE USER: daily-review 플러그인이 아직 설정되지 않았습니다. /daily-review-setup 을 실행해주세요.</important-reminder>'

  if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
    printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$msg"
  else
    printf '{"additional_context":"%s"}\n' "$msg"
  fi
fi

exit 0
```

- [ ] **Step 3: Create hooks/run-hook.cmd**

Copy the superpowers polyglot wrapper exactly:

```cmd
: << 'CMDBLOCK'
@echo off
if "%~1"=="" (
    echo run-hook.cmd: missing script name >&2
    exit /b 1
)
set "HOOK_DIR=%~dp0"
if exist "C:\Program Files\Git\bin\bash.exe" (
    "C:\Program Files\Git\bin\bash.exe" "%HOOK_DIR%%~1" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)
if exist "C:\Program Files (x86)\Git\bin\bash.exe" (
    "C:\Program Files (x86)\Git\bin\bash.exe" "%HOOK_DIR%%~1" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)
where bash >nul 2>nul
if %ERRORLEVEL% equ 0 (
    bash "%HOOK_DIR%%~1" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)
exit /b 0
CMDBLOCK

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_NAME="$1"
shift
exec bash "${SCRIPT_DIR}/${SCRIPT_NAME}" "$@"
```

- [ ] **Step 4: Create lib/storage-cli.mjs**

```javascript
#!/usr/bin/env node
// @ts-check
import { loadConfig, createStorageAdapter } from './config.mjs';

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const config = loadConfig();
  if (!config) { process.stderr.write('config not found\n'); process.exit(1); }

  const storage = await createStorageAdapter(config);

  switch (command) {
    case 'read': {
      const content = await storage.read(args[0]);
      if (content !== null) process.stdout.write(content);
      break;
    }
    case 'write': {
      let data = '';
      process.stdin.setEncoding('utf-8');
      for await (const chunk of process.stdin) { data += chunk; }
      await storage.write(args[0], data);
      break;
    }
    case 'append': {
      let data = '';
      process.stdin.setEncoding('utf-8');
      for await (const chunk of process.stdin) { data += chunk; }
      await storage.append(args[0], data);
      break;
    }
    case 'list': {
      const entries = await storage.list(args[0]);
      process.stdout.write(entries.join('\n') + '\n');
      break;
    }
    case 'exists': {
      const exists = await storage.exists(args[0]);
      process.stdout.write(exists ? 'true\n' : 'false\n');
      process.exit(exists ? 0 : 1);
      break;
    }
    default:
      process.stderr.write(`Unknown command: ${command}\nUsage: storage-cli <read|write|append|list|exists> <path>\n`);
      process.exit(1);
  }
}
main().catch((err) => { process.stderr.write(`Error: ${err.message}\n`); process.exit(1); });
```

- [ ] **Step 5: Commit**

```bash
git add hooks/on-stop.mjs hooks/session-start-check hooks/run-hook.cmd lib/storage-cli.mjs
git commit -m "feat: add hook scripts and storage CLI as direct-run .mjs/bash"
```

---

### Task 4: Update hooks.json + prompts

**Files:**
- Modify: `hooks/hooks.json`
- Modify: `prompts/session-end.md`
- Modify: `prompts/session-start.md`

- [ ] **Step 1: Update hooks.json**

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/on-stop.mjs\"",
            "async": true,
            "timeout": 10
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "agent",
            "prompt": "Follow the instructions in the file at ${CLAUDE_PLUGIN_ROOT}/prompts/session-end.md exactly. The CLAUDE_PLUGIN_DATA directory is: ${CLAUDE_PLUGIN_DATA}. The plugin root is: ${CLAUDE_PLUGIN_ROOT}",
            "timeout": 120
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" session-start-check",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Update prompts to reference lib/storage-cli.mjs**

In `prompts/session-end.md` and `prompts/session-start.md`, replace all references to:
- `${CLAUDE_PLUGIN_ROOT}/dist/storage-cli.js` → `${CLAUDE_PLUGIN_ROOT}/lib/storage-cli.mjs`

- [ ] **Step 3: Commit**

```bash
git add hooks/hooks.json prompts/
git commit -m "feat: update hooks.json and prompts for no-build structure"
```

---

### Task 5: Clean up old files + update package.json

**Files:**
- Delete: `src/` (entire directory)
- Delete: `dist/` (entire directory)
- Delete: `tests/` (entire directory)
- Delete: `tsconfig.json`
- Delete: `tsup.config.ts`
- Delete: `vitest.config.ts`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Simplify package.json**

```json
{
  "name": "@giwonn/claude-daily-review",
  "version": "0.3.0",
  "type": "module",
  "description": "Claude Code plugin that auto-captures conversations for daily review and career documentation",
  "repository": {
    "type": "git",
    "url": "https://github.com/giwonn/claude-daily-review"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Update .gitignore**

```
node_modules/
.idea/
.claude/
*.tgz
```

(Remove `dist/` line — no longer exists)

- [ ] **Step 3: Delete old files**

```bash
rm -rf src/ dist/ tests/ tsconfig.json tsup.config.ts vitest.config.ts package-lock.json node_modules/
```

- [ ] **Step 4: Verify the plugin works locally**

```bash
CLAUDE_PLUGIN_DATA=/tmp/cdr-test node hooks/on-stop.mjs <<< '{"session_id":"test","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"Stop"}'
```
Expected: No error, raw log created at `/tmp/cdr-test/...`

Actually, since on-stop reads config first:
```bash
mkdir -p /tmp/cdr-test && echo '{"storage":{"type":"local","local":{"basePath":"/tmp/cdr-vault"}},"language":"ko","periods":{"daily":true,"weekly":false,"monthly":false,"quarterly":false,"yearly":false},"profile":{"company":"","role":"","team":"","context":""}}' > /tmp/cdr-test/config.json && CLAUDE_PLUGIN_DATA=/tmp/cdr-test node hooks/on-stop.mjs <<< '{"session_id":"test-sess","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"Stop"}'
```
Then verify: `ls /tmp/cdr-vault/.raw/test-sess/`
Expected: A `.jsonl` file exists.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove TypeScript build system, use .mjs + JSDoc directly"
```

---

### Task 6: Update CI workflows + marketplace SHA

**Files:**
- Modify: `.github/workflows/publish.yml`
- Create: `.github/workflows/update-marketplace.yml`
- Modify: `.claude-plugin/marketplace.json`

- [ ] **Step 1: Simplify publish.yml (no build step)**

```yaml
name: Publish to npm

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    environment: npm
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          registry-url: "https://registry.npmjs.org"

      - run: npm install -g npm@latest

      - run: npm publish --access public --provenance
```

Note: No `npm ci`, `npm run build`, or `npm test` — there's nothing to build or test.

- [ ] **Step 2: Create update-marketplace.yml**

```yaml
name: Update Marketplace SHA

on:
  release:
    types: [published]

jobs:
  update-sha:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: master

      - name: Update SHA in marketplace.json
        run: |
          SHA=$(git rev-parse HEAD)
          sed -i "s/\"sha\": \"[a-f0-9]*\"/\"sha\": \"$SHA\"/" .claude-plugin/marketplace.json
          cat .claude-plugin/marketplace.json

      - name: Commit and push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add .claude-plugin/marketplace.json
          git diff --cached --quiet && echo "No changes" || (git commit -m "chore: update marketplace SHA [skip ci]" && git push)
```

- [ ] **Step 3: Update marketplace.json version**

Update the `version` field to `0.3.0` and SHA to current HEAD.

- [ ] **Step 4: Commit**

```bash
git add .github/ .claude-plugin/marketplace.json
git commit -m "ci: simplify publish workflow, add marketplace SHA auto-update"
```

---

### Task 7: Final verification + release

- [ ] **Step 1: Verify all files are correct**

```bash
ls lib/ hooks/ prompts/ skills/ .claude-plugin/
```
Expected: All .mjs, .md, hooks.json, run-hook.cmd, session-start-check present.

- [ ] **Step 2: Verify no build artifacts remain**

```bash
test ! -d src && test ! -d dist && test ! -d tests && test ! -f tsconfig.json && echo "CLEAN"
```
Expected: `CLEAN`

- [ ] **Step 3: Test on-stop hook**

```bash
mkdir -p /tmp/cdr-test && echo '{"storage":{"type":"local","local":{"basePath":"/tmp/cdr-vault"}},"language":"ko","periods":{"daily":true,"weekly":false,"monthly":false,"quarterly":false,"yearly":false},"profile":{"company":"","role":"","team":"","context":""}}' > /tmp/cdr-test/config.json && CLAUDE_PLUGIN_DATA=/tmp/cdr-test node hooks/on-stop.mjs <<< '{"session_id":"final-test","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"Stop"}' && ls /tmp/cdr-vault/.raw/final-test/
```
Expected: `.jsonl` file listed.

- [ ] **Step 4: Test session-start-check**

```bash
CLAUDE_PLUGIN_ROOT=$(pwd) CLAUDE_PLUGIN_DATA=/tmp/nonexistent bash hooks/session-start-check
```
Expected: JSON with `additionalContext` containing setup message.

- [ ] **Step 5: Push and create release**

```bash
git push
```

Then create release v0.3.0 to trigger both npm publish and marketplace SHA update.

- [ ] **Step 6: Verify plugin installation**

```bash
claude plugin marketplace update giwonn-plugins
claude plugin uninstall claude-daily-review
claude plugin install claude-daily-review@giwonn-plugins
```

Start new session and verify setup message appears.

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Core lib/ modules (.mjs + JSDoc) | 7 files created |
| 2 | GitHub modules (auth + storage) | 2 files created |
| 3 | Hook scripts + storage CLI | 4 files created |
| 4 | hooks.json + prompts update | 3 files modified |
| 5 | Delete old TS/build files | ~15 files deleted |
| 6 | CI workflows + marketplace SHA | 3 files |
| 7 | Final verification + release | - |
