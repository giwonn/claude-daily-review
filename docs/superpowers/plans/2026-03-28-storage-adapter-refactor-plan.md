# StorageAdapter Refactor + GitHub Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abstract storage behind a `StorageAdapter` interface, add GitHub as a storage backend with OAuth Device Flow authentication, and refactor all modules to use async adapter injection.

**Architecture:** Define `StorageAdapter` interface with read/write/append/exists/list/mkdir/isDirectory. Implement `LocalStorageAdapter` (fs) and `GitHubStorageAdapter` (Contents API). Refactor vault/raw-logger/merge/on-stop to accept adapter. Config schema changes to support storage type selection. All storage-touching code becomes async.

**Tech Stack:** TypeScript, Node.js fetch (built-in), vitest, tsup, GitHub OAuth Device Flow, GitHub Contents API

---

## File Structure

```
src/
├── core/
│   ├── storage.ts              ← NEW: StorageAdapter interface
│   ├── local-storage.ts        ← NEW: LocalStorageAdapter (wraps fs)
│   ├── github-storage.ts       ← NEW: GitHubStorageAdapter (GitHub API)
│   ├── github-auth.ts          ← NEW: OAuth Device Flow
│   ├── config.ts               ← MODIFY: new schema, migration, adapter factory
│   ├── vault.ts                ← MODIFY: relative paths, async, adapter injection
│   ├── raw-logger.ts           ← MODIFY: async, adapter injection
│   ├── merge.ts                ← MODIFY: async, adapter injection
│   └── periods.ts              ← UNCHANGED
├── hooks/
│   └── on-stop.ts              ← MODIFY: async, adapter creation
└── cli/
    └── storage-cli.ts          ← NEW: CLI for agent prompts to access storage

tests/
├── core/
│   ├── storage.test.ts         ← NEW: LocalStorageAdapter tests
│   ├── github-storage.test.ts  ← NEW: GitHubStorageAdapter tests (fetch mock)
│   ├── github-auth.test.ts     ← NEW: Device Flow tests (fetch mock)
│   ├── config.test.ts          ← MODIFY: new schema tests
│   ├── vault.test.ts           ← MODIFY: relative paths, async
│   ├── raw-logger.test.ts      ← MODIFY: async, adapter injection
│   ├── merge.test.ts           ← MODIFY: async, adapter injection
│   └── periods.test.ts         ← UNCHANGED
├── hooks/
│   └── on-stop.test.ts         ← MODIFY: async
└── integration/
    └── full-flow.test.ts       ← MODIFY: async, adapter injection
```

---

### Task 1: StorageAdapter Interface + LocalStorageAdapter (TDD)

**Files:**
- Create: `src/core/storage.ts`
- Create: `src/core/local-storage.ts`
- Create: `tests/core/storage.test.ts`

- [ ] **Step 1: Write failing tests for StorageAdapter + LocalStorageAdapter**

```typescript
// tests/core/storage.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { LocalStorageAdapter } from "../../src/core/local-storage.js";
import type { StorageAdapter } from "../../src/core/storage.js";

describe("LocalStorageAdapter", () => {
  let tempDir: string;
  let storage: StorageAdapter;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cdr-storage-"));
    storage = new LocalStorageAdapter(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("write + read", () => {
    it("writes and reads a file", async () => {
      await storage.write("test.txt", "hello");
      const content = await storage.read("test.txt");
      expect(content).toBe("hello");
    });

    it("creates parent directories on write", async () => {
      await storage.write("a/b/c.txt", "nested");
      const content = await storage.read("a/b/c.txt");
      expect(content).toBe("nested");
    });

    it("returns null for non-existent file", async () => {
      const content = await storage.read("nope.txt");
      expect(content).toBeNull();
    });
  });

  describe("append", () => {
    it("creates file if not exists", async () => {
      await storage.append("log.txt", "line1\n");
      const content = await storage.read("log.txt");
      expect(content).toBe("line1\n");
    });

    it("appends to existing file", async () => {
      await storage.append("log.txt", "line1\n");
      await storage.append("log.txt", "line2\n");
      const content = await storage.read("log.txt");
      expect(content).toBe("line1\nline2\n");
    });

    it("creates parent directories on append", async () => {
      await storage.append("deep/dir/log.txt", "data\n");
      const content = await storage.read("deep/dir/log.txt");
      expect(content).toBe("data\n");
    });
  });

  describe("exists", () => {
    it("returns false for non-existent path", async () => {
      expect(await storage.exists("nope")).toBe(false);
    });

    it("returns true for existing file", async () => {
      await storage.write("file.txt", "x");
      expect(await storage.exists("file.txt")).toBe(true);
    });

    it("returns true for existing directory", async () => {
      await storage.mkdir("mydir");
      expect(await storage.exists("mydir")).toBe(true);
    });
  });

  describe("list", () => {
    it("returns empty array for non-existent directory", async () => {
      expect(await storage.list("nope")).toEqual([]);
    });

    it("lists entries in directory", async () => {
      await storage.write("dir/a.txt", "a");
      await storage.write("dir/b.txt", "b");
      const entries = await storage.list("dir");
      expect(entries.sort()).toEqual(["a.txt", "b.txt"]);
    });
  });

  describe("mkdir", () => {
    it("creates directory recursively", async () => {
      await storage.mkdir("a/b/c");
      expect(await storage.exists("a/b/c")).toBe(true);
    });

    it("is idempotent", async () => {
      await storage.mkdir("dir");
      await storage.mkdir("dir");
      expect(await storage.exists("dir")).toBe(true);
    });
  });

  describe("isDirectory", () => {
    it("returns true for directory", async () => {
      await storage.mkdir("dir");
      expect(await storage.isDirectory("dir")).toBe(true);
    });

    it("returns false for file", async () => {
      await storage.write("file.txt", "x");
      expect(await storage.isDirectory("file.txt")).toBe(false);
    });

    it("returns false for non-existent path", async () => {
      expect(await storage.isDirectory("nope")).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/storage.test.ts`
Expected: FAIL — cannot resolve modules

- [ ] **Step 3: Create StorageAdapter interface**

```typescript
// src/core/storage.ts
export interface StorageAdapter {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(dir: string): Promise<string[]>;
  mkdir(dir: string): Promise<void>;
  isDirectory(path: string): Promise<boolean>;
}
```

- [ ] **Step 4: Implement LocalStorageAdapter**

```typescript
// src/core/local-storage.ts
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "fs";
import { dirname, join } from "path";
import type { StorageAdapter } from "./storage.js";

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private basePath: string) {}

  private resolve(path: string): string {
    return join(this.basePath, path);
  }

  async read(path: string): Promise<string | null> {
    const full = this.resolve(path);
    if (!existsSync(full)) return null;
    return readFileSync(full, "utf-8");
  }

  async write(path: string, content: string): Promise<void> {
    const full = this.resolve(path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf-8");
  }

  async append(path: string, content: string): Promise<void> {
    const full = this.resolve(path);
    mkdirSync(dirname(full), { recursive: true });
    appendFileSync(full, content, "utf-8");
  }

  async exists(path: string): Promise<boolean> {
    return existsSync(this.resolve(path));
  }

  async list(dir: string): Promise<string[]> {
    const full = this.resolve(dir);
    if (!existsSync(full)) return [];
    return readdirSync(full);
  }

  async mkdir(dir: string): Promise<void> {
    mkdirSync(this.resolve(dir), { recursive: true });
  }

  async isDirectory(path: string): Promise<boolean> {
    try {
      return statSync(this.resolve(path)).isDirectory();
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/core/storage.test.ts`
Expected: All 14 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/storage.ts src/core/local-storage.ts tests/core/storage.test.ts
git commit -m "feat: add StorageAdapter interface and LocalStorageAdapter"
```

---

### Task 2: Config Schema Refactor (TDD)

**Files:**
- Modify: `src/core/config.ts`
- Modify: `tests/core/config.test.ts`

- [ ] **Step 1: Rewrite config tests for new schema**

```typescript
// tests/core/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  getConfigPath,
  loadConfig,
  saveConfig,
  validateConfig,
  createDefaultLocalConfig,
  createDefaultGitHubConfig,
  createStorageAdapter,
} from "../../src/core/config.js";
import { LocalStorageAdapter } from "../../src/core/local-storage.js";

describe("config", () => {
  let tempDir: string;
  const originalEnv = process.env.CLAUDE_PLUGIN_DATA;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cdr-test-"));
    process.env.CLAUDE_PLUGIN_DATA = tempDir;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    process.env.CLAUDE_PLUGIN_DATA = originalEnv;
  });

  describe("getConfigPath", () => {
    it("returns path under CLAUDE_PLUGIN_DATA", () => {
      expect(getConfigPath()).toBe(join(tempDir, "config.json"));
    });

    it("throws when CLAUDE_PLUGIN_DATA is not set", () => {
      delete process.env.CLAUDE_PLUGIN_DATA;
      expect(() => getConfigPath()).toThrow("CLAUDE_PLUGIN_DATA");
    });
  });

  describe("loadConfig", () => {
    it("returns null when config does not exist", () => {
      expect(loadConfig()).toBeNull();
    });

    it("returns parsed config with local storage", () => {
      const config = createDefaultLocalConfig("/my/vault/daily-review");
      saveConfig(config);
      const result = loadConfig();
      expect(result).toEqual(config);
    });

    it("migrates old config format", () => {
      const oldConfig = {
        vaultPath: "/my/vault",
        reviewFolder: "daily-review",
        language: "ko",
        periods: { daily: true, weekly: true, monthly: true, quarterly: true, yearly: false },
        profile: { company: "Test", role: "Dev", team: "A", context: "B" },
      };
      writeFileSync(join(tempDir, "config.json"), JSON.stringify(oldConfig));
      const result = loadConfig();
      expect(result!.storage.type).toBe("local");
      expect(result!.storage.local!.basePath).toBe("/my/vault/daily-review");
      expect(result!.language).toBe("ko");
      expect(result!.profile.company).toBe("Test");
    });
  });

  describe("saveConfig", () => {
    it("writes config to disk", () => {
      const config = createDefaultLocalConfig("/my/vault");
      saveConfig(config);
      const raw = readFileSync(join(tempDir, "config.json"), "utf-8");
      expect(JSON.parse(raw)).toEqual(config);
    });

    it("creates parent directories if needed", () => {
      process.env.CLAUDE_PLUGIN_DATA = join(tempDir, "nested", "dir");
      const config = createDefaultLocalConfig("/my/vault");
      saveConfig(config);
      expect(existsSync(join(tempDir, "nested", "dir", "config.json"))).toBe(true);
    });
  });

  describe("validateConfig", () => {
    it("returns true for valid local config", () => {
      const config = createDefaultLocalConfig("/my/vault");
      expect(validateConfig(config)).toBe(true);
    });

    it("returns true for valid github config", () => {
      const config = createDefaultGitHubConfig("user", "repo", "token123");
      expect(validateConfig(config)).toBe(true);
    });

    it("returns false when storage is missing", () => {
      expect(validateConfig({ language: "ko" })).toBe(false);
    });

    it("returns false for null", () => {
      expect(validateConfig(null)).toBe(false);
    });

    it("returns false for non-object", () => {
      expect(validateConfig("string")).toBe(false);
    });
  });

  describe("createDefaultLocalConfig", () => {
    it("creates config with local storage", () => {
      const config = createDefaultLocalConfig("/my/vault");
      expect(config.storage.type).toBe("local");
      expect(config.storage.local!.basePath).toBe("/my/vault");
      expect(config.language).toBe("ko");
      expect(config.periods.daily).toBe(true);
      expect(config.profile.company).toBe("");
    });
  });

  describe("createDefaultGitHubConfig", () => {
    it("creates config with github storage", () => {
      const config = createDefaultGitHubConfig("user", "repo", "tok");
      expect(config.storage.type).toBe("github");
      expect(config.storage.github!.owner).toBe("user");
      expect(config.storage.github!.repo).toBe("repo");
      expect(config.storage.github!.token).toBe("tok");
      expect(config.storage.github!.basePath).toBe("daily-review");
    });
  });

  describe("createStorageAdapter", () => {
    it("returns LocalStorageAdapter for local config", () => {
      const config = createDefaultLocalConfig("/my/vault");
      const adapter = createStorageAdapter(config);
      expect(adapter).toBeInstanceOf(LocalStorageAdapter);
    });

    it("throws for unknown storage type", () => {
      const config = createDefaultLocalConfig("/my/vault");
      (config.storage as any).type = "unknown";
      expect(() => createStorageAdapter(config)).toThrow("Unknown storage type");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/config.test.ts`
Expected: FAIL — old exports not matching

- [ ] **Step 3: Rewrite config.ts with new schema**

```typescript
// src/core/config.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import type { StorageAdapter } from "./storage.js";
import { LocalStorageAdapter } from "./local-storage.js";

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

interface OldConfig {
  vaultPath: string;
  reviewFolder: string;
  language: string;
  periods: Periods;
  profile: Profile;
}

const DEFAULT_PERIODS: Periods = {
  daily: true,
  weekly: true,
  monthly: true,
  quarterly: true,
  yearly: false,
};

const DEFAULT_PROFILE: Profile = {
  company: "",
  role: "",
  team: "",
  context: "",
};

export function getConfigPath(): string {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dataDir) {
    throw new Error("CLAUDE_PLUGIN_DATA environment variable is not set");
  }
  return join(dataDir, "config.json");
}

function isOldConfig(raw: unknown): raw is OldConfig {
  if (!raw || typeof raw !== "object") return false;
  return "vaultPath" in raw && "reviewFolder" in raw;
}

function migrateOldConfig(old: OldConfig): Config {
  return {
    storage: {
      type: "local",
      local: {
        basePath: join(old.vaultPath, old.reviewFolder),
      },
    },
    language: old.language,
    periods: old.periods,
    profile: old.profile,
  };
}

export function loadConfig(): Config | null {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return null;
  const raw = JSON.parse(readFileSync(configPath, "utf-8"));
  if (isOldConfig(raw)) {
    const migrated = migrateOldConfig(raw);
    saveConfig(migrated);
    return migrated;
  }
  return raw as Config;
}

export function saveConfig(config: Config): void {
  const configPath = getConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export function validateConfig(config: unknown): config is Config {
  if (!config || typeof config !== "object") return false;
  const c = config as Record<string, unknown>;
  if (!c.storage || typeof c.storage !== "object") return false;
  const s = c.storage as Record<string, unknown>;
  if (s.type !== "local" && s.type !== "github") return false;
  if (s.type === "local") {
    if (!s.local || typeof s.local !== "object") return false;
    const l = s.local as Record<string, unknown>;
    if (typeof l.basePath !== "string" || l.basePath === "") return false;
  }
  if (s.type === "github") {
    if (!s.github || typeof s.github !== "object") return false;
    const g = s.github as Record<string, unknown>;
    if (typeof g.owner !== "string" || !g.owner) return false;
    if (typeof g.repo !== "string" || !g.repo) return false;
    if (typeof g.token !== "string" || !g.token) return false;
  }
  return true;
}

export function createDefaultLocalConfig(basePath: string): Config {
  return {
    storage: { type: "local", local: { basePath } },
    language: "ko",
    periods: { ...DEFAULT_PERIODS },
    profile: { ...DEFAULT_PROFILE },
  };
}

export function createDefaultGitHubConfig(owner: string, repo: string, token: string): Config {
  return {
    storage: { type: "github", github: { owner, repo, token, basePath: "daily-review" } },
    language: "ko",
    periods: { ...DEFAULT_PERIODS },
    profile: { ...DEFAULT_PROFILE },
  };
}

export function createStorageAdapter(config: Config): StorageAdapter {
  if (config.storage.type === "local") {
    return new LocalStorageAdapter(config.storage.local!.basePath);
  }
  if (config.storage.type === "github") {
    // GitHubStorageAdapter will be imported dynamically in a later task
    throw new Error("GitHub storage not yet implemented");
  }
  throw new Error(`Unknown storage type: ${(config.storage as any).type}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/config.test.ts`
Expected: All 13 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/config.ts tests/core/config.test.ts
git commit -m "refactor: config schema with storage type, migration from old format"
```

---

### Task 3: Vault Module Refactor (TDD)

**Files:**
- Modify: `src/core/vault.ts`
- Modify: `tests/core/vault.test.ts`

Vault path generators become pure functions returning relative paths (no config needed). `ensureVaultDirectories` takes StorageAdapter + Periods.

- [ ] **Step 1: Rewrite vault tests**

```typescript
// tests/core/vault.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  getRawDir,
  getReviewsDir,
  getDailyPath,
  getWeeklyPath,
  getMonthlyPath,
  getQuarterlyPath,
  getYearlyPath,
  getProjectDailyPath,
  getProjectSummaryPath,
  getUncategorizedPath,
  ensureVaultDirectories,
} from "../../src/core/vault.js";
import { LocalStorageAdapter } from "../../src/core/local-storage.js";
import type { Periods } from "../../src/core/config.js";

describe("vault", () => {
  describe("path generators (pure, relative)", () => {
    it("getRawDir returns .raw/{sessionId}", () => {
      expect(getRawDir("sess-123")).toBe(".raw/sess-123");
    });

    it("getReviewsDir returns .reviews", () => {
      expect(getReviewsDir()).toBe(".reviews");
    });

    it("getDailyPath returns daily/{date}.md", () => {
      expect(getDailyPath("2026-03-28")).toBe("daily/2026-03-28.md");
    });

    it("getWeeklyPath returns weekly/{week}.md", () => {
      expect(getWeeklyPath("2026-W13")).toBe("weekly/2026-W13.md");
    });

    it("getMonthlyPath returns monthly/{month}.md", () => {
      expect(getMonthlyPath("2026-03")).toBe("monthly/2026-03.md");
    });

    it("getQuarterlyPath returns quarterly/{quarter}.md", () => {
      expect(getQuarterlyPath("2026-Q1")).toBe("quarterly/2026-Q1.md");
    });

    it("getYearlyPath returns yearly/{year}.md", () => {
      expect(getYearlyPath("2026")).toBe("yearly/2026.md");
    });

    it("getProjectDailyPath returns projects/{name}/{date}.md", () => {
      expect(getProjectDailyPath("my-app", "2026-03-28")).toBe("projects/my-app/2026-03-28.md");
    });

    it("getProjectSummaryPath returns projects/{name}/summary.md", () => {
      expect(getProjectSummaryPath("my-app")).toBe("projects/my-app/summary.md");
    });

    it("getUncategorizedPath returns uncategorized/{date}.md", () => {
      expect(getUncategorizedPath("2026-03-28")).toBe("uncategorized/2026-03-28.md");
    });
  });

  describe("ensureVaultDirectories", () => {
    let tempDir: string;
    let storage: LocalStorageAdapter;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "cdr-vault-"));
      storage = new LocalStorageAdapter(tempDir);
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("creates base directories", async () => {
      const periods: Periods = { daily: true, weekly: true, monthly: true, quarterly: true, yearly: false };
      await ensureVaultDirectories(storage, periods);
      expect(existsSync(join(tempDir, "daily"))).toBe(true);
      expect(existsSync(join(tempDir, "projects"))).toBe(true);
      expect(existsSync(join(tempDir, "uncategorized"))).toBe(true);
      expect(existsSync(join(tempDir, ".raw"))).toBe(true);
      expect(existsSync(join(tempDir, ".reviews"))).toBe(true);
    });

    it("creates period directories only when enabled", async () => {
      const periods: Periods = { daily: true, weekly: true, monthly: true, quarterly: true, yearly: false };
      await ensureVaultDirectories(storage, periods);
      expect(existsSync(join(tempDir, "weekly"))).toBe(true);
      expect(existsSync(join(tempDir, "monthly"))).toBe(true);
      expect(existsSync(join(tempDir, "quarterly"))).toBe(true);
      expect(existsSync(join(tempDir, "yearly"))).toBe(false);
    });

    it("is idempotent", async () => {
      const periods: Periods = { daily: true, weekly: true, monthly: true, quarterly: true, yearly: false };
      await ensureVaultDirectories(storage, periods);
      await ensureVaultDirectories(storage, periods);
      expect(existsSync(join(tempDir, "daily"))).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/vault.test.ts`
Expected: FAIL — old signatures don't match

- [ ] **Step 3: Rewrite vault.ts**

```typescript
// src/core/vault.ts
import type { StorageAdapter } from "./storage.js";
import type { Periods } from "./config.js";

export function getRawDir(sessionId: string): string {
  return `.raw/${sessionId}`;
}

export function getReviewsDir(): string {
  return ".reviews";
}

export function getDailyPath(date: string): string {
  return `daily/${date}.md`;
}

export function getWeeklyPath(week: string): string {
  return `weekly/${week}.md`;
}

export function getMonthlyPath(month: string): string {
  return `monthly/${month}.md`;
}

export function getQuarterlyPath(quarter: string): string {
  return `quarterly/${quarter}.md`;
}

export function getYearlyPath(year: string): string {
  return `yearly/${year}.md`;
}

export function getProjectDailyPath(projectName: string, date: string): string {
  return `projects/${projectName}/${date}.md`;
}

export function getProjectSummaryPath(projectName: string): string {
  return `projects/${projectName}/summary.md`;
}

export function getUncategorizedPath(date: string): string {
  return `uncategorized/${date}.md`;
}

export async function ensureVaultDirectories(storage: StorageAdapter, periods: Periods): Promise<void> {
  const dirs = ["daily", "projects", "uncategorized", ".raw", ".reviews"];
  if (periods.weekly) dirs.push("weekly");
  if (periods.monthly) dirs.push("monthly");
  if (periods.quarterly) dirs.push("quarterly");
  if (periods.yearly) dirs.push("yearly");

  for (const dir of dirs) {
    await storage.mkdir(dir);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/vault.test.ts`
Expected: All 13 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/vault.ts tests/core/vault.test.ts
git commit -m "refactor: vault to relative paths and async StorageAdapter injection"
```

---

### Task 4: Raw Logger Refactor (TDD)

**Files:**
- Modify: `src/core/raw-logger.ts`
- Modify: `tests/core/raw-logger.test.ts`

- [ ] **Step 1: Rewrite raw-logger tests with StorageAdapter**

```typescript
// tests/core/raw-logger.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { LocalStorageAdapter } from "../../src/core/local-storage.js";
import {
  parseHookInput,
  appendRawLog,
  type HookInput,
} from "../../src/core/raw-logger.js";

describe("raw-logger", () => {
  let tempDir: string;
  let storage: LocalStorageAdapter;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cdr-raw-"));
    storage = new LocalStorageAdapter(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("parseHookInput", () => {
    it("parses valid JSON from stdin", () => {
      const input = JSON.stringify({
        session_id: "abc-123",
        transcript_path: "/tmp/transcript.jsonl",
        cwd: "/projects/my-app",
        hook_event_name: "Stop",
      });
      const result = parseHookInput(input);
      expect(result.session_id).toBe("abc-123");
      expect(result.transcript_path).toBe("/tmp/transcript.jsonl");
      expect(result.cwd).toBe("/projects/my-app");
      expect(result.hook_event_name).toBe("Stop");
    });

    it("throws on invalid JSON", () => {
      expect(() => parseHookInput("not json")).toThrow();
    });

    it("throws when session_id is missing", () => {
      const input = JSON.stringify({ cwd: "/tmp" });
      expect(() => parseHookInput(input)).toThrow("session_id");
    });
  });

  describe("appendRawLog", () => {
    it("creates session directory and appends log entry", async () => {
      const entry: HookInput = {
        session_id: "sess-1",
        transcript_path: "/tmp/t.jsonl",
        cwd: "/projects/my-app",
        hook_event_name: "Stop",
      };

      await appendRawLog(storage, ".raw/sess-1", "2026-03-28", entry);

      const content = await storage.read(".raw/sess-1/2026-03-28.jsonl");
      expect(content).not.toBeNull();
      const lines = content!.trim().split("\n");
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.session_id).toBe("sess-1");
      expect(parsed.cwd).toBe("/projects/my-app");
      expect(typeof parsed.timestamp).toBe("string");
    });

    it("appends multiple entries to same file", async () => {
      const entry: HookInput = {
        session_id: "sess-2",
        transcript_path: "/tmp/t.jsonl",
        cwd: "/projects/my-app",
        hook_event_name: "Stop",
      };

      await appendRawLog(storage, ".raw/sess-2", "2026-03-28", entry);
      await appendRawLog(storage, ".raw/sess-2", "2026-03-28", entry);

      const content = await storage.read(".raw/sess-2/2026-03-28.jsonl");
      const lines = content!.trim().split("\n");
      expect(lines).toHaveLength(2);
    });

    it("creates separate files for different dates", async () => {
      const entry: HookInput = {
        session_id: "sess-3",
        transcript_path: "/tmp/t.jsonl",
        cwd: "/projects/my-app",
        hook_event_name: "Stop",
      };

      await appendRawLog(storage, ".raw/sess-3", "2026-03-28", entry);
      await appendRawLog(storage, ".raw/sess-3", "2026-03-29", entry);

      expect(await storage.exists(".raw/sess-3/2026-03-28.jsonl")).toBe(true);
      expect(await storage.exists(".raw/sess-3/2026-03-29.jsonl")).toBe(true);
    });

    it("stores timestamp in each entry", async () => {
      const entry: HookInput = {
        session_id: "sess-4",
        transcript_path: "/tmp/t.jsonl",
        cwd: "/projects/my-app",
        hook_event_name: "Stop",
      };

      await appendRawLog(storage, ".raw/sess-4", "2026-03-28", entry);

      const content = await storage.read(".raw/sess-4/2026-03-28.jsonl");
      const parsed = JSON.parse(content!.trim());
      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
```

- [ ] **Step 2: Rewrite raw-logger.ts**

```typescript
// src/core/raw-logger.ts
import type { StorageAdapter } from "./storage.js";

export interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  [key: string]: unknown;
}

export function parseHookInput(raw: string): HookInput {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid hook input: expected object");
  }
  if (typeof parsed.session_id !== "string" || !parsed.session_id) {
    throw new Error("Invalid hook input: missing session_id");
  }
  return parsed as HookInput;
}

export async function appendRawLog(storage: StorageAdapter, sessionDir: string, date: string, entry: HookInput): Promise<void> {
  await storage.mkdir(sessionDir);
  const logPath = `${sessionDir}/${date}.jsonl`;
  const record = {
    ...entry,
    timestamp: new Date().toISOString(),
  };
  await storage.append(logPath, JSON.stringify(record) + "\n");
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/core/raw-logger.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/core/raw-logger.ts tests/core/raw-logger.test.ts
git commit -m "refactor: raw-logger to async StorageAdapter injection"
```

---

### Task 5: Merge Module Refactor (TDD)

**Files:**
- Modify: `src/core/merge.ts`
- Modify: `tests/core/merge.test.ts`

- [ ] **Step 1: Rewrite merge tests with StorageAdapter**

```typescript
// tests/core/merge.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { LocalStorageAdapter } from "../../src/core/local-storage.js";
import {
  findUnprocessedSessions,
  findPendingReviews,
  markSessionCompleted,
  isSessionCompleted,
  mergeReviewsIntoDaily,
} from "../../src/core/merge.js";

describe("merge", () => {
  let tempDir: string;
  let storage: LocalStorageAdapter;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "cdr-merge-"));
    storage = new LocalStorageAdapter(tempDir);
    await storage.mkdir(".raw");
    await storage.mkdir(".reviews");
    await storage.mkdir("daily");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("findUnprocessedSessions", () => {
    it("returns empty array when no sessions exist", async () => {
      const result = await findUnprocessedSessions(storage, ".raw");
      expect(result).toEqual([]);
    });

    it("returns session dirs without .completed marker", async () => {
      await storage.write(".raw/sess-1/2026-03-28.jsonl", "{}");
      await storage.write(".raw/sess-2/2026-03-28.jsonl", "{}");
      await storage.write(".raw/sess-2/.completed", "");

      const result = await findUnprocessedSessions(storage, ".raw");
      expect(result).toEqual(["sess-1"]);
    });

    it("ignores non-directory entries", async () => {
      await storage.write(".raw/stray-file.txt", "");
      const result = await findUnprocessedSessions(storage, ".raw");
      expect(result).toEqual([]);
    });
  });

  describe("findPendingReviews", () => {
    it("returns empty array when no reviews exist", async () => {
      const result = await findPendingReviews(storage, ".reviews");
      expect(result).toEqual([]);
    });

    it("returns .md files in reviews directory", async () => {
      await storage.write(".reviews/sess-1.md", "# Review");
      await storage.write(".reviews/sess-2.md", "# Review 2");
      const result = await findPendingReviews(storage, ".reviews");
      expect(result.sort()).toEqual(["sess-1.md", "sess-2.md"]);
    });

    it("ignores non-md files", async () => {
      await storage.write(".reviews/sess-1.md", "# Review");
      await storage.write(".reviews/notes.txt", "text");
      const result = await findPendingReviews(storage, ".reviews");
      expect(result).toEqual(["sess-1.md"]);
    });
  });

  describe("markSessionCompleted / isSessionCompleted", () => {
    it("creates .completed marker", async () => {
      await storage.mkdir(".raw/sess-1");
      expect(await isSessionCompleted(storage, ".raw/sess-1")).toBe(false);

      await markSessionCompleted(storage, ".raw/sess-1");
      expect(await isSessionCompleted(storage, ".raw/sess-1")).toBe(true);
    });
  });

  describe("mergeReviewsIntoDaily", () => {
    it("creates daily file from single review", async () => {
      await storage.write(".reviews/sess-1.md", "## [my-app] Auth work\n**작업 요약:** JWT 구현\n");

      await mergeReviewsIntoDaily(storage, [".reviews/sess-1.md"], "daily/2026-03-28.md");

      const content = await storage.read("daily/2026-03-28.md");
      expect(content).toContain("[my-app] Auth work");
    });

    it("appends to existing daily file", async () => {
      await storage.write("daily/2026-03-28.md", "# 2026-03-28 Daily Review\n\n## [blog] SEO work\nDone.\n");
      await storage.write(".reviews/sess-2.md", "\n## [my-app] Auth work\n**작업 요약:** JWT 구현\n");

      await mergeReviewsIntoDaily(storage, [".reviews/sess-2.md"], "daily/2026-03-28.md");

      const content = await storage.read("daily/2026-03-28.md");
      expect(content).toContain("[blog] SEO work");
      expect(content).toContain("[my-app] Auth work");
    });

    it("merges multiple reviews", async () => {
      await storage.write(".reviews/sess-1.md", "## Session 1 content\n");
      await storage.write(".reviews/sess-2.md", "## Session 2 content\n");

      await mergeReviewsIntoDaily(storage, [".reviews/sess-1.md", ".reviews/sess-2.md"], "daily/2026-03-28.md");

      const content = await storage.read("daily/2026-03-28.md");
      expect(content).toContain("Session 1 content");
      expect(content).toContain("Session 2 content");
    });

    it("handles empty review files gracefully", async () => {
      await storage.write(".reviews/sess-empty.md", "");
      await expect(
        mergeReviewsIntoDaily(storage, [".reviews/sess-empty.md"], "daily/2026-03-28.md"),
      ).resolves.not.toThrow();
    });
  });
});
```

- [ ] **Step 2: Rewrite merge.ts**

```typescript
// src/core/merge.ts
import type { StorageAdapter } from "./storage.js";

export async function findUnprocessedSessions(storage: StorageAdapter, rawDir: string): Promise<string[]> {
  if (!(await storage.exists(rawDir))) return [];
  const entries = await storage.list(rawDir);
  const results: string[] = [];
  for (const entry of entries) {
    const entryPath = `${rawDir}/${entry}`;
    if (!(await storage.isDirectory(entryPath))) continue;
    if (await storage.exists(`${entryPath}/.completed`)) continue;
    results.push(entry);
  }
  return results;
}

export async function findPendingReviews(storage: StorageAdapter, reviewsDir: string): Promise<string[]> {
  if (!(await storage.exists(reviewsDir))) return [];
  const entries = await storage.list(reviewsDir);
  return entries.filter((f) => f.endsWith(".md"));
}

export async function markSessionCompleted(storage: StorageAdapter, sessionDir: string): Promise<void> {
  await storage.write(`${sessionDir}/.completed`, new Date().toISOString());
}

export async function isSessionCompleted(storage: StorageAdapter, sessionDir: string): Promise<boolean> {
  return storage.exists(`${sessionDir}/.completed`);
}

export async function mergeReviewsIntoDaily(storage: StorageAdapter, reviewPaths: string[], dailyPath: string): Promise<void> {
  const reviewContents: string[] = [];
  for (const p of reviewPaths) {
    const content = await storage.read(p);
    if (content && content.trim().length > 0) {
      reviewContents.push(content.trim());
    }
  }

  if (reviewContents.length === 0) {
    if (!(await storage.exists(dailyPath))) {
      await storage.write(dailyPath, "");
    }
    return;
  }

  const existing = await storage.read(dailyPath);
  const merged = existing
    ? existing.trimEnd() + "\n\n" + reviewContents.join("\n\n") + "\n"
    : reviewContents.join("\n\n") + "\n";

  await storage.write(dailyPath, merged);
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/core/merge.test.ts`
Expected: All 10 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/core/merge.ts tests/core/merge.test.ts
git commit -m "refactor: merge module to async StorageAdapter injection"
```

---

### Task 6: On-Stop Hook + Integration Test Refactor (TDD)

**Files:**
- Modify: `src/hooks/on-stop.ts`
- Modify: `tests/hooks/on-stop.test.ts`
- Modify: `tests/integration/full-flow.test.ts`

- [ ] **Step 1: Rewrite on-stop tests**

```typescript
// tests/hooks/on-stop.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { handleStopHook } from "../../src/hooks/on-stop.js";

describe("on-stop hook", () => {
  let tempVault: string;
  let tempPluginData: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tempVault = mkdtempSync(join(tmpdir(), "cdr-stop-vault-"));
    tempPluginData = mkdtempSync(join(tmpdir(), "cdr-stop-data-"));
    process.env.CLAUDE_PLUGIN_DATA = tempPluginData;

    const config = {
      storage: { type: "local", local: { basePath: join(tempVault, "daily-review") } },
      language: "ko",
      periods: { daily: true, weekly: true, monthly: true, quarterly: true, yearly: false },
      profile: { company: "", role: "", team: "", context: "" },
    };
    writeFileSync(join(tempPluginData, "config.json"), JSON.stringify(config));
  });

  afterEach(() => {
    rmSync(tempVault, { recursive: true, force: true });
    rmSync(tempPluginData, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it("appends raw log for valid input", async () => {
    const input = JSON.stringify({
      session_id: "test-sess",
      transcript_path: "/tmp/t.jsonl",
      cwd: "/projects/my-app",
      hook_event_name: "Stop",
    });

    await handleStopHook(input);

    const rawDir = join(tempVault, "daily-review", ".raw", "test-sess");
    expect(existsSync(rawDir)).toBe(true);
    const files = readdirSync(rawDir);
    expect(files.some((f: string) => f.endsWith(".jsonl"))).toBe(true);
  });

  it("exits silently when config is missing", async () => {
    rmSync(join(tempPluginData, "config.json"));
    const input = JSON.stringify({
      session_id: "test-sess",
      transcript_path: "/tmp/t.jsonl",
      cwd: "/projects/my-app",
      hook_event_name: "Stop",
    });
    await expect(handleStopHook(input)).resolves.not.toThrow();
  });

  it("exits silently on invalid JSON input", async () => {
    await expect(handleStopHook("not-json")).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Rewrite on-stop.ts**

```typescript
// src/hooks/on-stop.ts
import { fileURLToPath } from "url";
import { resolve } from "path";
import { loadConfig, createStorageAdapter } from "../core/config.js";
import { parseHookInput, appendRawLog } from "../core/raw-logger.js";
import { getRawDir } from "../core/vault.js";
import { formatDate } from "../core/periods.js";

export async function handleStopHook(stdinData: string): Promise<void> {
  try {
    const config = loadConfig();
    if (!config) return;

    const storage = createStorageAdapter(config);
    const input = parseHookInput(stdinData);
    const sessionDir = getRawDir(input.session_id);
    const date = formatDate(new Date());

    await appendRawLog(storage, sessionDir, date, input);
  } catch {
    // async hook — fail silently
  }
}

// Main execution
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
  let data = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk) => (data += chunk));
  process.stdin.on("end", () => {
    handleStopHook(data);
  });
}
```

- [ ] **Step 3: Rewrite integration test**

```typescript
// tests/integration/full-flow.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { handleStopHook } from "../../src/hooks/on-stop.js";
import { findUnprocessedSessions, mergeReviewsIntoDaily, markSessionCompleted } from "../../src/core/merge.js";
import { saveConfig, createDefaultLocalConfig } from "../../src/core/config.js";
import { ensureVaultDirectories, getDailyPath } from "../../src/core/vault.js";
import { LocalStorageAdapter } from "../../src/core/local-storage.js";
import { checkPeriodsNeeded, formatDate } from "../../src/core/periods.js";

describe("integration: full flow", () => {
  let tempVault: string;
  let tempPluginData: string;
  let storage: LocalStorageAdapter;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    tempVault = mkdtempSync(join(tmpdir(), "cdr-int-vault-"));
    tempPluginData = mkdtempSync(join(tmpdir(), "cdr-int-data-"));
    process.env.CLAUDE_PLUGIN_DATA = tempPluginData;

    const basePath = join(tempVault, "daily-review");
    const config = createDefaultLocalConfig(basePath);
    saveConfig(config);
    storage = new LocalStorageAdapter(basePath);
    await ensureVaultDirectories(storage, config.periods);
  });

  afterEach(() => {
    rmSync(tempVault, { recursive: true, force: true });
    rmSync(tempPluginData, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it("Stop hook creates raw log, then merge recovers it", async () => {
    const input = JSON.stringify({
      session_id: "int-sess-1",
      transcript_path: "/tmp/transcript.jsonl",
      cwd: "/projects/my-app",
      hook_event_name: "Stop",
    });
    await handleStopHook(input);

    expect(await storage.exists(".raw/int-sess-1")).toBe(true);

    const unprocessed = await findUnprocessedSessions(storage, ".raw");
    expect(unprocessed).toContain("int-sess-1");

    await storage.write(".reviews/int-sess-1.md", "## [my-app] Auth work\n**작업 요약:** JWT 구현\n");
    await markSessionCompleted(storage, ".raw/int-sess-1");

    const today = formatDate(new Date());
    const dailyPath = getDailyPath(today);
    await mergeReviewsIntoDaily(storage, [".reviews/int-sess-1.md"], dailyPath);

    const content = await storage.read(dailyPath);
    expect(content).toContain("[my-app] Auth work");
    expect(content).toContain("JWT 구현");
  });

  it("multiple sessions merge into same daily file", async () => {
    await handleStopHook(JSON.stringify({
      session_id: "sess-a", transcript_path: "/tmp/a.jsonl",
      cwd: "/projects/app-a", hook_event_name: "Stop",
    }));
    await handleStopHook(JSON.stringify({
      session_id: "sess-b", transcript_path: "/tmp/b.jsonl",
      cwd: "/projects/app-b", hook_event_name: "Stop",
    }));

    await storage.write(".reviews/sess-a.md", "## [app-a] Feature A\n");
    await storage.write(".reviews/sess-b.md", "## [app-b] Feature B\n");

    const today = formatDate(new Date());
    const dailyPath = getDailyPath(today);
    await mergeReviewsIntoDaily(storage, [".reviews/sess-a.md", ".reviews/sess-b.md"], dailyPath);

    const content = await storage.read(dailyPath);
    expect(content).toContain("[app-a] Feature A");
    expect(content).toContain("[app-b] Feature B");
  });

  it("period detection works correctly for summary triggers", () => {
    const monday = new Date(2026, 2, 30);
    const prevSaturday = new Date(2026, 2, 28);
    const periods = checkPeriodsNeeded(monday, prevSaturday);
    expect(periods.needsWeekly).toBe(true);
    expect(periods.previousWeek).toBe("2026-W13");
  });
});
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/on-stop.ts tests/hooks/on-stop.test.ts tests/integration/full-flow.test.ts
git commit -m "refactor: on-stop hook and integration tests to async StorageAdapter"
```

---

### Task 7: GitHub Auth — Device Flow (TDD)

**Files:**
- Create: `src/core/github-auth.ts`
- Create: `tests/core/github-auth.test.ts`

- [ ] **Step 1: Write failing tests for Device Flow**

```typescript
// tests/core/github-auth.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { requestDeviceCode, pollForToken, type DeviceCodeResponse } from "../../src/core/github-auth.js";

describe("github-auth", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("requestDeviceCode", () => {
    it("returns device code response", async () => {
      const mockResponse = {
        device_code: "dc_123",
        user_code: "ABCD-1234",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
        interval: 5,
      };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await requestDeviceCode();
      expect(result.user_code).toBe("ABCD-1234");
      expect(result.device_code).toBe("dc_123");
      expect(result.verification_uri).toBe("https://github.com/login/device");
    });

    it("throws on API error", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("error", { status: 500 }),
      );
      await expect(requestDeviceCode()).rejects.toThrow();
    });
  });

  describe("pollForToken", () => {
    it("returns token on success", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "gho_abc123", token_type: "bearer" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const deviceCode: DeviceCodeResponse = {
        device_code: "dc_123",
        user_code: "ABCD-1234",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
        interval: 0,
      };

      const token = await pollForToken(deviceCode, 1);
      expect(token).toBe("gho_abc123");
    });

    it("retries on authorization_pending", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: "authorization_pending" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: "gho_abc123", token_type: "bearer" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );

      const deviceCode: DeviceCodeResponse = {
        device_code: "dc_123",
        user_code: "ABCD-1234",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
        interval: 0,
      };

      const token = await pollForToken(deviceCode, 5);
      expect(token).toBe("gho_abc123");
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("throws on timeout (max attempts)", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ error: "authorization_pending" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const deviceCode: DeviceCodeResponse = {
        device_code: "dc_123",
        user_code: "ABCD-1234",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
        interval: 0,
      };

      await expect(pollForToken(deviceCode, 2)).rejects.toThrow("timed out");
    });
  });
});
```

- [ ] **Step 2: Implement github-auth.ts**

```typescript
// src/core/github-auth.ts
const GITHUB_CLIENT_ID = "PLACEHOLDER_CLIENT_ID"; // Replace after OAuth App registration

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: "repo",
    }),
  });

  if (!res.ok) {
    throw new Error(`GitHub device code request failed: ${res.status}`);
  }

  return res.json() as Promise<DeviceCodeResponse>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollForToken(deviceCode: DeviceCodeResponse, maxAttempts: number = 180): Promise<string> {
  let interval = deviceCode.interval * 1000;

  for (let i = 0; i < maxAttempts; i++) {
    if (interval > 0) await sleep(interval);

    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    const data = await res.json() as Record<string, unknown>;

    if (data.access_token) {
      return data.access_token as string;
    }

    if (data.error === "slow_down") {
      interval += 5000;
      continue;
    }

    if (data.error === "authorization_pending") {
      continue;
    }

    throw new Error(`GitHub auth error: ${data.error}`);
  }

  throw new Error("GitHub auth timed out waiting for authorization");
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/core/github-auth.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/core/github-auth.ts tests/core/github-auth.test.ts
git commit -m "feat: add GitHub OAuth Device Flow authentication"
```

---

### Task 8: GitHubStorageAdapter (TDD)

**Files:**
- Create: `src/core/github-storage.ts`
- Create: `tests/core/github-storage.test.ts`

- [ ] **Step 1: Write failing tests with fetch mocks**

```typescript
// tests/core/github-storage.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitHubStorageAdapter } from "../../src/core/github-storage.js";

describe("GitHubStorageAdapter", () => {
  let storage: GitHubStorageAdapter;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    storage = new GitHubStorageAdapter("testowner", "testrepo", "tok_123", "daily-review");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("read", () => {
    it("returns decoded content for existing file", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          content: Buffer.from("hello world").toString("base64"),
          sha: "abc123",
        }), { status: 200, headers: { "Content-Type": "application/json" } }),
      );

      const result = await storage.read("test.txt");
      expect(result).toBe("hello world");
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "https://api.github.com/repos/testowner/testrepo/contents/daily-review/test.txt",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("returns null for 404", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("", { status: 404 }),
      );
      const result = await storage.read("nope.txt");
      expect(result).toBeNull();
    });
  });

  describe("write", () => {
    it("creates new file without SHA", async () => {
      // First GET returns 404 (file doesn't exist)
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("", { status: 404 }),
      );
      // PUT creates file
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ content: { sha: "new123" } }), { status: 201 }),
      );

      await storage.write("new.txt", "content");

      const putCall = vi.mocked(fetch).mock.calls[1];
      expect(putCall[0]).toContain("daily-review/new.txt");
      const body = JSON.parse(putCall[1]!.body as string);
      expect(body.content).toBe(Buffer.from("content").toString("base64"));
      expect(body.sha).toBeUndefined();
    });

    it("updates existing file with SHA", async () => {
      // First GET returns existing file
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          content: Buffer.from("old").toString("base64"),
          sha: "old123",
        }), { status: 200, headers: { "Content-Type": "application/json" } }),
      );
      // PUT updates file
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ content: { sha: "new123" } }), { status: 200 }),
      );

      await storage.write("existing.txt", "new content");

      const putCall = vi.mocked(fetch).mock.calls[1];
      const body = JSON.parse(putCall[1]!.body as string);
      expect(body.sha).toBe("old123");
    });
  });

  describe("append", () => {
    it("creates file if not exists", async () => {
      // read returns null
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("", { status: 404 }),
      );
      // write: GET 404 + PUT 201
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("", { status: 404 }),
      );
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ content: { sha: "new123" } }), { status: 201 }),
      );

      await storage.append("log.txt", "line1\n");
    });

    it("appends to existing file", async () => {
      // read returns existing content
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          content: Buffer.from("line1\n").toString("base64"),
          sha: "sha1",
        }), { status: 200, headers: { "Content-Type": "application/json" } }),
      );
      // write: GET existing + PUT update
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          content: Buffer.from("line1\n").toString("base64"),
          sha: "sha1",
        }), { status: 200, headers: { "Content-Type": "application/json" } }),
      );
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ content: { sha: "sha2" } }), { status: 200 }),
      );

      await storage.append("log.txt", "line2\n");
    });
  });

  describe("exists", () => {
    it("returns true for 200", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ sha: "abc" }), { status: 200, headers: { "Content-Type": "application/json" } }),
      );
      expect(await storage.exists("file.txt")).toBe(true);
    });

    it("returns false for 404", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("", { status: 404 }),
      );
      expect(await storage.exists("nope.txt")).toBe(false);
    });
  });

  describe("list", () => {
    it("returns file names from directory listing", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify([
          { name: "a.txt", type: "file" },
          { name: "b.md", type: "file" },
          { name: "subdir", type: "dir" },
        ]), { status: 200, headers: { "Content-Type": "application/json" } }),
      );

      const result = await storage.list("mydir");
      expect(result).toEqual(["a.txt", "b.md", "subdir"]);
    });

    it("returns empty array for 404", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("", { status: 404 }),
      );
      expect(await storage.list("nope")).toEqual([]);
    });
  });

  describe("mkdir", () => {
    it("is a no-op (GitHub creates dirs implicitly)", async () => {
      await storage.mkdir("some/dir");
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("isDirectory", () => {
    it("returns true when API returns array", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify([{ name: "file.txt" }]), { status: 200, headers: { "Content-Type": "application/json" } }),
      );
      expect(await storage.isDirectory("mydir")).toBe(true);
    });

    it("returns false when API returns object (file)", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ type: "file", sha: "abc" }), { status: 200, headers: { "Content-Type": "application/json" } }),
      );
      expect(await storage.isDirectory("file.txt")).toBe(false);
    });

    it("returns false for 404", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("", { status: 404 }),
      );
      expect(await storage.isDirectory("nope")).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Implement GitHubStorageAdapter**

```typescript
// src/core/github-storage.ts
import type { StorageAdapter } from "./storage.js";

export class GitHubStorageAdapter implements StorageAdapter {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(
    private owner: string,
    private repo: string,
    private token: string,
    private basePath: string,
  ) {
    this.baseUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
    this.headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    };
  }

  private getUrl(path: string): string {
    return `${this.baseUrl}/${this.basePath}/${path}`;
  }

  private async getSha(path: string): Promise<string | null> {
    const res = await fetch(this.getUrl(path), { method: "GET", headers: this.headers });
    if (res.status === 404) return null;
    const data = await res.json() as Record<string, unknown>;
    return (data.sha as string) || null;
  }

  async read(path: string): Promise<string | null> {
    const res = await fetch(this.getUrl(path), { method: "GET", headers: this.headers });
    if (res.status === 404) return null;
    const data = await res.json() as Record<string, unknown>;
    const content = data.content as string;
    return Buffer.from(content, "base64").toString("utf-8");
  }

  async write(path: string, content: string): Promise<void> {
    const sha = await this.getSha(path);
    const body: Record<string, unknown> = {
      message: `update ${path}`,
      content: Buffer.from(content).toString("base64"),
    };
    if (sha) body.sha = sha;

    const res = await fetch(this.getUrl(path), {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok && res.status === 409) {
      // Conflict — retry once with fresh SHA
      const freshSha = await this.getSha(path);
      if (freshSha) body.sha = freshSha;
      await fetch(this.getUrl(path), {
        method: "PUT",
        headers: this.headers,
        body: JSON.stringify(body),
      });
    }
  }

  async append(path: string, content: string): Promise<void> {
    const existing = await this.read(path);
    const newContent = existing ? existing + content : content;
    await this.write(path, newContent);
  }

  async exists(path: string): Promise<boolean> {
    const res = await fetch(this.getUrl(path), { method: "GET", headers: this.headers });
    return res.status !== 404;
  }

  async list(dir: string): Promise<string[]> {
    const res = await fetch(this.getUrl(dir), { method: "GET", headers: this.headers });
    if (res.status === 404) return [];
    const data = await res.json() as Array<{ name: string }>;
    if (!Array.isArray(data)) return [];
    return data.map((entry) => entry.name);
  }

  async mkdir(_dir: string): Promise<void> {
    // GitHub creates directories implicitly when files are created
  }

  async isDirectory(path: string): Promise<boolean> {
    const res = await fetch(this.getUrl(path), { method: "GET", headers: this.headers });
    if (res.status === 404) return false;
    const data = await res.json();
    return Array.isArray(data);
  }
}
```

- [ ] **Step 3: Wire GitHubStorageAdapter into config.ts**

Update `createStorageAdapter` in `src/core/config.ts`:

Replace the `"github"` case:
```typescript
  if (config.storage.type === "github") {
    const { GitHubStorageAdapter } = await import("./github-storage.js");
    const g = config.storage.github!;
    return new GitHubStorageAdapter(g.owner, g.repo, g.token, g.basePath);
  }
```

Note: `createStorageAdapter` becomes async:
```typescript
export async function createStorageAdapter(config: Config): Promise<StorageAdapter> {
```

Update all callers (on-stop.ts, tests) to `await createStorageAdapter(config)`.

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/github-storage.ts tests/core/github-storage.test.ts src/core/config.ts
git commit -m "feat: add GitHubStorageAdapter with Contents API"
```

---

### Task 9: CLI Storage Scripts for Agent Prompts

**Files:**
- Create: `src/cli/storage-cli.ts`

- [ ] **Step 1: Implement storage CLI**

```typescript
// src/cli/storage-cli.ts
import { loadConfig, createStorageAdapter } from "../core/config.js";

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const config = loadConfig();
  if (!config) {
    process.stderr.write("config not found\n");
    process.exit(1);
  }

  const storage = await createStorageAdapter(config);

  switch (command) {
    case "read": {
      const content = await storage.read(args[0]);
      if (content !== null) process.stdout.write(content);
      break;
    }
    case "write": {
      let data = "";
      process.stdin.setEncoding("utf-8");
      for await (const chunk of process.stdin) {
        data += chunk;
      }
      await storage.write(args[0], data);
      break;
    }
    case "append": {
      let data = "";
      process.stdin.setEncoding("utf-8");
      for await (const chunk of process.stdin) {
        data += chunk;
      }
      await storage.append(args[0], data);
      break;
    }
    case "list": {
      const entries = await storage.list(args[0]);
      process.stdout.write(entries.join("\n") + "\n");
      break;
    }
    case "exists": {
      const exists = await storage.exists(args[0]);
      process.stdout.write(exists ? "true\n" : "false\n");
      process.exit(exists ? 0 : 1);
      break;
    }
    default:
      process.stderr.write(`Unknown command: ${command}\nUsage: storage-cli <read|write|append|list|exists> <path>\n`);
      process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Update tsup.config.ts to include new entry points**

```typescript
// tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/hooks/on-stop.ts", "src/cli/storage-cli.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  bundle: true,
});
```

Note: outDir changes from `dist/hooks` to `dist` since we now have multiple entry points. Update `hooks/hooks.json` to reference `dist/on-stop.js` instead of `dist/hooks/on-stop.js`.

- [ ] **Step 3: Update hooks.json**

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/on-stop.js\"",
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
        "hooks": [
          {
            "type": "agent",
            "prompt": "Follow the instructions in the file at ${CLAUDE_PLUGIN_ROOT}/prompts/session-start.md exactly. The CLAUDE_PLUGIN_DATA directory is: ${CLAUDE_PLUGIN_DATA}. The plugin root is: ${CLAUDE_PLUGIN_ROOT}",
            "timeout": 180
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: `dist/on-stop.js` and `dist/storage-cli.js` created

- [ ] **Step 5: Commit**

```bash
git add src/cli/storage-cli.ts tsup.config.ts hooks/hooks.json
git commit -m "feat: add storage CLI for agent prompts, update build config"
```

---

### Task 10: Setup Skill + Agent Prompts Update

**Files:**
- Modify: `skills/daily-review-setup.md`
- Modify: `prompts/session-end.md`
- Modify: `prompts/session-start.md`

- [ ] **Step 1: Update setup skill with storage selection + GitHub auth**

Rewrite `skills/daily-review-setup.md` to add:
- Step 0: "저장소를 어디에 둘까요? (1) 로컬 폴더 (2) GitHub 저장소"
- If local: existing vault path flow
- If github: Device Flow auth → repo selection (existing or new) → done
- Keep profile and periods steps

The setup skill must instruct the agent to use `node dist/storage-cli.js` for GitHub operations when verifying connectivity.

- [ ] **Step 2: Update session-end prompt**

Update `prompts/session-end.md` to:
- Read config and check `storage.type`
- If `local`: use Read/Write tools directly
- If `github`: use `node "${CLAUDE_PLUGIN_ROOT}/dist/storage-cli.js" <command> <path>` via Bash

- [ ] **Step 3: Update session-start prompt**

Update `prompts/session-start.md` similarly to use storage-cli for GitHub storage.

- [ ] **Step 4: Commit**

```bash
git add skills/daily-review-setup.md prompts/session-end.md prompts/session-start.md
git commit -m "feat: update setup skill and agent prompts for storage selection"
```

---

### Task 11: README Update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

Add GitHub storage section:
- New setup option for GitHub
- Device Flow auth description
- Configuration example for GitHub
- Note about `client_id` placeholder

- [ ] **Step 2: Final build and test**

Run: `npm run build && npm test`
Expected: Build succeeds, all tests pass

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README with GitHub storage option"
```

---

## Summary

| Task | Module | Tests | Description |
|------|--------|-------|-------------|
| 1 | StorageAdapter + LocalStorageAdapter | 14 | Interface + fs wrapper |
| 2 | Config refactor | 13 | New schema, migration, adapter factory |
| 3 | Vault refactor | 13 | Relative paths, async, adapter |
| 4 | Raw Logger refactor | 7 | Async, adapter injection |
| 5 | Merge refactor | 10 | Async, adapter injection |
| 6 | On-Stop + Integration refactor | 6 | Async entry point + full flow |
| 7 | GitHub Auth | 5 | OAuth Device Flow |
| 8 | GitHubStorageAdapter | 12 | GitHub Contents API |
| 9 | CLI + Build | - | storage-cli, tsup, hooks.json |
| 10 | Setup + Prompts | - | Storage selection, agent instructions |
| 11 | README | - | Documentation update |
| **Total** | | **~80** | |
