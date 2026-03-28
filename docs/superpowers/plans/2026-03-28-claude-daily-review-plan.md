# claude-daily-review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin that auto-captures conversations via hooks and generates structured daily/periodic review markdown files in an Obsidian vault.

**Architecture:** Session-isolated file writes (no concurrent conflicts) with deferred merge at session start. Stop hook appends raw logs per-session, SessionEnd agent generates per-session review, SessionStart agent merges reviews into daily files and generates periodic summaries. TDD with vitest.

**Tech Stack:** TypeScript, Node.js, vitest (test), tsup (build), proper-lockfile (merge safety)

---

## File Structure

```
claude-daily-review/
├── hooks/
│   └── hooks.json                    ← Hook definitions
├── skills/
│   └── daily-review-setup.md         ← Setup skill (onboarding)
├── prompts/
│   ├── session-end.md                ← SessionEnd agent prompt
│   └── session-start.md              ← SessionStart agent prompt
├── src/
│   ├── core/
│   │   ├── config.ts                 ← Config CRUD + validation
│   │   ├── periods.ts                ← Date/period utilities
│   │   ├── vault.ts                  ← Vault path generation + directory management
│   │   ├── raw-logger.ts             ← Raw log append (session-isolated)
│   │   └── merge.ts                  ← Review file merge logic
│   └── hooks/
│       └── on-stop.ts                ← Stop hook entry point (stdin → raw log)
├── tests/
│   ├── core/
│   │   ├── config.test.ts
│   │   ├── periods.test.ts
│   │   ├── vault.test.ts
│   │   ├── raw-logger.test.ts
│   │   └── merge.test.ts
│   └── hooks/
│       └── on-stop.test.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Initialize package.json**

```json
{
  "name": "claude-daily-review",
  "version": "0.1.0",
  "description": "Claude Code plugin that auto-captures conversations for daily review and career documentation",
  "type": "module",
  "main": "dist/hooks/on-stop.js",
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "keywords": ["claude-code", "plugin", "daily-review", "obsidian"],
  "license": "MIT",
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^3.0.0",
    "tsup": "^8.0.0",
    "@types/node": "^20.0.0",
    "@types/proper-lockfile": "^4.1.4"
  },
  "dependencies": {
    "proper-lockfile": "^4.1.2"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
```

- [ ] **Step 4: Create tsup.config.ts**

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/hooks/on-stop.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  bundle: true,
});
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` generated

- [ ] **Step 6: Verify setup**

Run: `npx vitest run`
Expected: "No test files found" (no tests yet, but vitest runs)

- [ ] **Step 7: Commit**

```bash
git init
git add package.json package-lock.json tsconfig.json vitest.config.ts tsup.config.ts
git commit -m "chore: scaffold project with TypeScript, vitest, tsup"
```

---

### Task 2: Config Module (TDD)

**Files:**
- Create: `tests/core/config.test.ts`
- Create: `src/core/config.ts`

- [ ] **Step 1: Write failing tests for config**

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
  createDefaultConfig,
} from "../../src/core/config.js";

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
      const result = getConfigPath();
      expect(result).toBe(join(tempDir, "config.json"));
    });

    it("throws when CLAUDE_PLUGIN_DATA is not set", () => {
      delete process.env.CLAUDE_PLUGIN_DATA;
      expect(() => getConfigPath()).toThrow("CLAUDE_PLUGIN_DATA");
    });
  });

  describe("loadConfig", () => {
    it("returns null when config does not exist", () => {
      const result = loadConfig();
      expect(result).toBeNull();
    });

    it("returns parsed config when file exists", () => {
      const config = {
        vaultPath: "/my/vault",
        reviewFolder: "daily-review",
        language: "ko",
        periods: { daily: true, weekly: true, monthly: true, quarterly: true, yearly: false },
        profile: { company: "Test", role: "Dev", team: "A", context: "B" },
      };
      writeFileSync(join(tempDir, "config.json"), JSON.stringify(config));
      const result = loadConfig();
      expect(result).toEqual(config);
    });
  });

  describe("saveConfig", () => {
    it("writes config to disk", () => {
      const config = createDefaultConfig("/my/vault");
      saveConfig(config);
      const raw = readFileSync(join(tempDir, "config.json"), "utf-8");
      expect(JSON.parse(raw)).toEqual(config);
    });

    it("creates parent directories if needed", () => {
      process.env.CLAUDE_PLUGIN_DATA = join(tempDir, "nested", "dir");
      const config = createDefaultConfig("/my/vault");
      saveConfig(config);
      expect(existsSync(join(tempDir, "nested", "dir", "config.json"))).toBe(true);
    });
  });

  describe("validateConfig", () => {
    it("returns true for valid config", () => {
      const config = createDefaultConfig("/my/vault");
      expect(validateConfig(config)).toBe(true);
    });

    it("returns false when vaultPath is missing", () => {
      expect(validateConfig({ reviewFolder: "test" })).toBe(false);
    });

    it("returns false when vaultPath is empty string", () => {
      expect(validateConfig({ vaultPath: "" })).toBe(false);
    });

    it("returns false for null", () => {
      expect(validateConfig(null)).toBe(false);
    });

    it("returns false for non-object", () => {
      expect(validateConfig("string")).toBe(false);
    });
  });

  describe("createDefaultConfig", () => {
    it("creates config with defaults and given vaultPath", () => {
      const config = createDefaultConfig("/my/vault");
      expect(config.vaultPath).toBe("/my/vault");
      expect(config.reviewFolder).toBe("daily-review");
      expect(config.language).toBe("ko");
      expect(config.periods.daily).toBe(true);
      expect(config.periods.weekly).toBe(true);
      expect(config.periods.monthly).toBe(true);
      expect(config.periods.quarterly).toBe(true);
      expect(config.periods.yearly).toBe(false);
      expect(config.profile.company).toBe("");
      expect(config.profile.role).toBe("");
      expect(config.profile.team).toBe("");
      expect(config.profile.context).toBe("");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/config.test.ts`
Expected: FAIL — cannot resolve `../../src/core/config.js`

- [ ] **Step 3: Implement config module**

```typescript
// src/core/config.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

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

export interface Config {
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

export function loadConfig(): Config | null {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return null;
  const raw = readFileSync(configPath, "utf-8");
  return JSON.parse(raw) as Config;
}

export function saveConfig(config: Config): void {
  const configPath = getConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export function validateConfig(config: unknown): config is Config {
  if (!config || typeof config !== "object") return false;
  const c = config as Record<string, unknown>;
  if (typeof c.vaultPath !== "string" || c.vaultPath === "") return false;
  return true;
}

export function createDefaultConfig(vaultPath: string): Config {
  return {
    vaultPath,
    reviewFolder: "daily-review",
    language: "ko",
    periods: { ...DEFAULT_PERIODS },
    profile: { ...DEFAULT_PROFILE },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/config.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/config.ts tests/core/config.test.ts
git commit -m "feat: add config module with load/save/validate/defaults"
```

---

### Task 3: Periods Utility Module (TDD)

**Files:**
- Create: `tests/core/periods.test.ts`
- Create: `src/core/periods.ts`

- [ ] **Step 1: Write failing tests for period utilities**

```typescript
// tests/core/periods.test.ts
import { describe, it, expect } from "vitest";
import {
  getISOWeek,
  getISOWeekYear,
  getQuarter,
  formatDate,
  formatWeek,
  formatMonth,
  formatQuarter,
  formatYear,
  checkPeriodsNeeded,
} from "../../src/core/periods.js";

describe("periods", () => {
  describe("getISOWeek", () => {
    it("returns week 1 for 2026-01-01 (Thursday)", () => {
      expect(getISOWeek(new Date(2026, 0, 1))).toBe(1);
    });

    it("returns week 53 for 2020-12-31 (Thursday of W53)", () => {
      expect(getISOWeek(new Date(2020, 11, 31))).toBe(53);
    });

    it("returns week 13 for 2026-03-28 (Saturday)", () => {
      expect(getISOWeek(new Date(2026, 2, 28))).toBe(13);
    });
  });

  describe("getISOWeekYear", () => {
    it("returns 2026 for 2026-01-01", () => {
      expect(getISOWeekYear(new Date(2026, 0, 1))).toBe(2026);
    });

    it("returns previous year for dates in week 1 belonging to prev year", () => {
      // 2025-12-29 is Monday of W01 of 2026
      expect(getISOWeekYear(new Date(2025, 11, 29))).toBe(2026);
    });
  });

  describe("getQuarter", () => {
    it("returns Q1 for January", () => {
      expect(getQuarter(new Date(2026, 0, 15))).toBe(1);
    });

    it("returns Q1 for March", () => {
      expect(getQuarter(new Date(2026, 2, 28))).toBe(1);
    });

    it("returns Q2 for April", () => {
      expect(getQuarter(new Date(2026, 3, 1))).toBe(2);
    });

    it("returns Q4 for December", () => {
      expect(getQuarter(new Date(2026, 11, 31))).toBe(4);
    });
  });

  describe("formatDate", () => {
    it("formats as YYYY-MM-DD", () => {
      expect(formatDate(new Date(2026, 2, 28))).toBe("2026-03-28");
    });

    it("zero-pads single digit months and days", () => {
      expect(formatDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    });
  });

  describe("formatWeek", () => {
    it("formats as YYYY-Www", () => {
      expect(formatWeek(new Date(2026, 2, 28))).toBe("2026-W13");
    });

    it("zero-pads single digit weeks", () => {
      expect(formatWeek(new Date(2026, 0, 5))).toBe("2026-W02");
    });
  });

  describe("formatMonth", () => {
    it("formats as YYYY-MM", () => {
      expect(formatMonth(new Date(2026, 2, 28))).toBe("2026-03");
    });
  });

  describe("formatQuarter", () => {
    it("formats as YYYY-Qn", () => {
      expect(formatQuarter(new Date(2026, 2, 28))).toBe("2026-Q1");
    });
  });

  describe("formatYear", () => {
    it("formats as YYYY", () => {
      expect(formatYear(new Date(2026, 2, 28))).toBe("2026");
    });
  });

  describe("checkPeriodsNeeded", () => {
    it("returns all false when same day", () => {
      const today = new Date(2026, 2, 28);
      const lastRun = new Date(2026, 2, 28);
      const result = checkPeriodsNeeded(today, lastRun);
      expect(result.needsWeekly).toBe(false);
      expect(result.needsMonthly).toBe(false);
      expect(result.needsQuarterly).toBe(false);
      expect(result.needsYearly).toBe(false);
    });

    it("detects new week", () => {
      const today = new Date(2026, 2, 30); // Monday W14
      const lastRun = new Date(2026, 2, 28); // Saturday W13
      const result = checkPeriodsNeeded(today, lastRun);
      expect(result.needsWeekly).toBe(true);
      expect(result.previousWeek).toBe("2026-W13");
    });

    it("detects new month", () => {
      const today = new Date(2026, 3, 1); // April 1
      const lastRun = new Date(2026, 2, 31); // March 31
      const result = checkPeriodsNeeded(today, lastRun);
      expect(result.needsMonthly).toBe(true);
      expect(result.previousMonth).toBe("2026-03");
    });

    it("detects new quarter", () => {
      const today = new Date(2026, 3, 1); // April 1 = Q2
      const lastRun = new Date(2026, 2, 31); // March 31 = Q1
      const result = checkPeriodsNeeded(today, lastRun);
      expect(result.needsQuarterly).toBe(true);
      expect(result.previousQuarter).toBe("2026-Q1");
    });

    it("detects new year", () => {
      const today = new Date(2027, 0, 1);
      const lastRun = new Date(2026, 11, 31);
      const result = checkPeriodsNeeded(today, lastRun);
      expect(result.needsYearly).toBe(true);
      expect(result.previousYear).toBe("2026");
    });

    it("handles null lastRun (first run ever)", () => {
      const today = new Date(2026, 2, 28);
      const result = checkPeriodsNeeded(today, null);
      expect(result.needsWeekly).toBe(false);
      expect(result.needsMonthly).toBe(false);
      expect(result.needsQuarterly).toBe(false);
      expect(result.needsYearly).toBe(false);
    });

    it("detects multiple periods at once (new year = new month + quarter + year)", () => {
      const today = new Date(2027, 0, 5); // Jan 5 2027 (Monday W02)
      const lastRun = new Date(2026, 11, 28); // Dec 28 2026
      const result = checkPeriodsNeeded(today, lastRun);
      expect(result.needsWeekly).toBe(true);
      expect(result.needsMonthly).toBe(true);
      expect(result.needsQuarterly).toBe(true);
      expect(result.needsYearly).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/periods.test.ts`
Expected: FAIL — cannot resolve `../../src/core/periods.js`

- [ ] **Step 3: Implement periods module**

```typescript
// src/core/periods.ts
export function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function getISOWeekYear(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return d.getUTCFullYear();
}

export function getQuarter(date: Date): number {
  return Math.ceil((date.getMonth() + 1) / 3);
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatWeek(date: Date): string {
  return `${getISOWeekYear(date)}-W${String(getISOWeek(date)).padStart(2, "0")}`;
}

export function formatMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatQuarter(date: Date): string {
  return `${date.getFullYear()}-Q${getQuarter(date)}`;
}

export function formatYear(date: Date): string {
  return `${date.getFullYear()}`;
}

export interface PeriodCheck {
  needsWeekly: boolean;
  needsMonthly: boolean;
  needsQuarterly: boolean;
  needsYearly: boolean;
  previousWeek: string;
  previousMonth: string;
  previousQuarter: string;
  previousYear: string;
}

export function checkPeriodsNeeded(today: Date, lastRun: Date | null): PeriodCheck {
  if (!lastRun) {
    return {
      needsWeekly: false,
      needsMonthly: false,
      needsQuarterly: false,
      needsYearly: false,
      previousWeek: "",
      previousMonth: "",
      previousQuarter: "",
      previousYear: "",
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
    previousWeek: lastWeek,
    previousMonth: lastMonth,
    previousQuarter: lastQuarter,
    previousYear: lastYear,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/periods.test.ts`
Expected: All 17 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/periods.ts tests/core/periods.test.ts
git commit -m "feat: add periods module with date formatting and period detection"
```

---

### Task 4: Vault Module (TDD)

**Files:**
- Create: `tests/core/vault.test.ts`
- Create: `src/core/vault.ts`

- [ ] **Step 1: Write failing tests for vault**

```typescript
// tests/core/vault.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  getReviewBasePath,
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
import type { Config } from "../../src/core/config.js";

describe("vault", () => {
  let tempDir: string;
  let config: Config;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cdr-vault-"));
    config = {
      vaultPath: tempDir,
      reviewFolder: "daily-review",
      language: "ko",
      periods: { daily: true, weekly: true, monthly: true, quarterly: true, yearly: false },
      profile: { company: "", role: "", team: "", context: "" },
    };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("getReviewBasePath", () => {
    it("combines vaultPath and reviewFolder", () => {
      expect(getReviewBasePath(config)).toBe(join(tempDir, "daily-review"));
    });
  });

  describe("path generators", () => {
    it("getRawDir returns .raw/{sessionId}", () => {
      expect(getRawDir(config, "sess-123")).toBe(
        join(tempDir, "daily-review", ".raw", "sess-123")
      );
    });

    it("getReviewsDir returns .reviews", () => {
      expect(getReviewsDir(config)).toBe(join(tempDir, "daily-review", ".reviews"));
    });

    it("getDailyPath returns daily/{date}.md", () => {
      expect(getDailyPath(config, "2026-03-28")).toBe(
        join(tempDir, "daily-review", "daily", "2026-03-28.md")
      );
    });

    it("getWeeklyPath returns weekly/{week}.md", () => {
      expect(getWeeklyPath(config, "2026-W13")).toBe(
        join(tempDir, "daily-review", "weekly", "2026-W13.md")
      );
    });

    it("getMonthlyPath returns monthly/{month}.md", () => {
      expect(getMonthlyPath(config, "2026-03")).toBe(
        join(tempDir, "daily-review", "monthly", "2026-03.md")
      );
    });

    it("getQuarterlyPath returns quarterly/{quarter}.md", () => {
      expect(getQuarterlyPath(config, "2026-Q1")).toBe(
        join(tempDir, "daily-review", "quarterly", "2026-Q1.md")
      );
    });

    it("getYearlyPath returns yearly/{year}.md", () => {
      expect(getYearlyPath(config, "2026")).toBe(
        join(tempDir, "daily-review", "yearly", "2026.md")
      );
    });

    it("getProjectDailyPath returns projects/{name}/{date}.md", () => {
      expect(getProjectDailyPath(config, "my-app", "2026-03-28")).toBe(
        join(tempDir, "daily-review", "projects", "my-app", "2026-03-28.md")
      );
    });

    it("getProjectSummaryPath returns projects/{name}/summary.md", () => {
      expect(getProjectSummaryPath(config, "my-app")).toBe(
        join(tempDir, "daily-review", "projects", "my-app", "summary.md")
      );
    });

    it("getUncategorizedPath returns uncategorized/{date}.md", () => {
      expect(getUncategorizedPath(config, "2026-03-28")).toBe(
        join(tempDir, "daily-review", "uncategorized", "2026-03-28.md")
      );
    });
  });

  describe("ensureVaultDirectories", () => {
    it("creates base directories", () => {
      ensureVaultDirectories(config);
      expect(existsSync(join(tempDir, "daily-review", "daily"))).toBe(true);
      expect(existsSync(join(tempDir, "daily-review", "projects"))).toBe(true);
      expect(existsSync(join(tempDir, "daily-review", "uncategorized"))).toBe(true);
      expect(existsSync(join(tempDir, "daily-review", ".raw"))).toBe(true);
      expect(existsSync(join(tempDir, "daily-review", ".reviews"))).toBe(true);
    });

    it("creates period directories only when enabled", () => {
      ensureVaultDirectories(config);
      expect(existsSync(join(tempDir, "daily-review", "weekly"))).toBe(true);
      expect(existsSync(join(tempDir, "daily-review", "monthly"))).toBe(true);
      expect(existsSync(join(tempDir, "daily-review", "quarterly"))).toBe(true);
      expect(existsSync(join(tempDir, "daily-review", "yearly"))).toBe(false);
    });

    it("is idempotent", () => {
      ensureVaultDirectories(config);
      ensureVaultDirectories(config);
      expect(existsSync(join(tempDir, "daily-review", "daily"))).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/vault.test.ts`
Expected: FAIL — cannot resolve `../../src/core/vault.js`

- [ ] **Step 3: Implement vault module**

```typescript
// src/core/vault.ts
import { mkdirSync } from "fs";
import { join } from "path";
import type { Config } from "./config.js";

export function getReviewBasePath(config: Config): string {
  return join(config.vaultPath, config.reviewFolder);
}

export function getRawDir(config: Config, sessionId: string): string {
  return join(getReviewBasePath(config), ".raw", sessionId);
}

export function getReviewsDir(config: Config): string {
  return join(getReviewBasePath(config), ".reviews");
}

export function getDailyPath(config: Config, date: string): string {
  return join(getReviewBasePath(config), "daily", `${date}.md`);
}

export function getWeeklyPath(config: Config, week: string): string {
  return join(getReviewBasePath(config), "weekly", `${week}.md`);
}

export function getMonthlyPath(config: Config, month: string): string {
  return join(getReviewBasePath(config), "monthly", `${month}.md`);
}

export function getQuarterlyPath(config: Config, quarter: string): string {
  return join(getReviewBasePath(config), "quarterly", `${quarter}.md`);
}

export function getYearlyPath(config: Config, year: string): string {
  return join(getReviewBasePath(config), "yearly", `${year}.md`);
}

export function getProjectDailyPath(config: Config, projectName: string, date: string): string {
  return join(getReviewBasePath(config), "projects", projectName, `${date}.md`);
}

export function getProjectSummaryPath(config: Config, projectName: string): string {
  return join(getReviewBasePath(config), "projects", projectName, "summary.md");
}

export function getUncategorizedPath(config: Config, date: string): string {
  return join(getReviewBasePath(config), "uncategorized", `${date}.md`);
}

export function ensureVaultDirectories(config: Config): void {
  const base = getReviewBasePath(config);
  const dirs = [
    join(base, "daily"),
    join(base, "projects"),
    join(base, "uncategorized"),
    join(base, ".raw"),
    join(base, ".reviews"),
  ];

  if (config.periods.weekly) dirs.push(join(base, "weekly"));
  if (config.periods.monthly) dirs.push(join(base, "monthly"));
  if (config.periods.quarterly) dirs.push(join(base, "quarterly"));
  if (config.periods.yearly) dirs.push(join(base, "yearly"));

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/vault.test.ts`
Expected: All 13 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/vault.ts tests/core/vault.test.ts
git commit -m "feat: add vault module with path generators and directory management"
```

---

### Task 5: Raw Logger Module (TDD)

**Files:**
- Create: `tests/core/raw-logger.test.ts`
- Create: `src/core/raw-logger.ts`

- [ ] **Step 1: Write failing tests for raw-logger**

```typescript
// tests/core/raw-logger.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  parseHookInput,
  appendRawLog,
  type HookInput,
} from "../../src/core/raw-logger.js";

describe("raw-logger", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cdr-raw-"));
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
    it("creates session directory and appends log entry", () => {
      const sessionDir = join(tempDir, "sess-1");
      const entry: HookInput = {
        session_id: "sess-1",
        transcript_path: "/tmp/t.jsonl",
        cwd: "/projects/my-app",
        hook_event_name: "Stop",
      };

      appendRawLog(sessionDir, "2026-03-28", entry);

      const logPath = join(sessionDir, "2026-03-28.jsonl");
      expect(existsSync(logPath)).toBe(true);
      const lines = readFileSync(logPath, "utf-8").trim().split("\n");
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.session_id).toBe("sess-1");
      expect(parsed.cwd).toBe("/projects/my-app");
      expect(typeof parsed.timestamp).toBe("string");
    });

    it("appends multiple entries to same file", () => {
      const sessionDir = join(tempDir, "sess-2");
      const entry: HookInput = {
        session_id: "sess-2",
        transcript_path: "/tmp/t.jsonl",
        cwd: "/projects/my-app",
        hook_event_name: "Stop",
      };

      appendRawLog(sessionDir, "2026-03-28", entry);
      appendRawLog(sessionDir, "2026-03-28", entry);

      const logPath = join(sessionDir, "2026-03-28.jsonl");
      const lines = readFileSync(logPath, "utf-8").trim().split("\n");
      expect(lines).toHaveLength(2);
    });

    it("creates separate files for different dates", () => {
      const sessionDir = join(tempDir, "sess-3");
      const entry: HookInput = {
        session_id: "sess-3",
        transcript_path: "/tmp/t.jsonl",
        cwd: "/projects/my-app",
        hook_event_name: "Stop",
      };

      appendRawLog(sessionDir, "2026-03-28", entry);
      appendRawLog(sessionDir, "2026-03-29", entry);

      expect(existsSync(join(sessionDir, "2026-03-28.jsonl"))).toBe(true);
      expect(existsSync(join(sessionDir, "2026-03-29.jsonl"))).toBe(true);
    });

    it("stores timestamp in each entry", () => {
      const sessionDir = join(tempDir, "sess-4");
      const entry: HookInput = {
        session_id: "sess-4",
        transcript_path: "/tmp/t.jsonl",
        cwd: "/projects/my-app",
        hook_event_name: "Stop",
      };

      appendRawLog(sessionDir, "2026-03-28", entry);

      const logPath = join(sessionDir, "2026-03-28.jsonl");
      const parsed = JSON.parse(readFileSync(logPath, "utf-8").trim());
      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/raw-logger.test.ts`
Expected: FAIL — cannot resolve `../../src/core/raw-logger.js`

- [ ] **Step 3: Implement raw-logger module**

```typescript
// src/core/raw-logger.ts
import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";

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

export function appendRawLog(sessionDir: string, date: string, entry: HookInput): void {
  mkdirSync(sessionDir, { recursive: true });
  const logPath = join(sessionDir, `${date}.jsonl`);
  const record = {
    ...entry,
    timestamp: new Date().toISOString(),
  };
  appendFileSync(logPath, JSON.stringify(record) + "\n", "utf-8");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/raw-logger.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/raw-logger.ts tests/core/raw-logger.test.ts
git commit -m "feat: add raw-logger module with stdin parsing and session-isolated append"
```

---

### Task 6: Merge Module (TDD)

**Files:**
- Create: `tests/core/merge.test.ts`
- Create: `src/core/merge.ts`

- [ ] **Step 1: Write failing tests for merge**

```typescript
// tests/core/merge.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  findUnprocessedSessions,
  findPendingReviews,
  markSessionCompleted,
  isSessionCompleted,
  mergeReviewsIntoDaily,
} from "../../src/core/merge.js";

describe("merge", () => {
  let tempDir: string;
  let rawDir: string;
  let reviewsDir: string;
  let dailyDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cdr-merge-"));
    rawDir = join(tempDir, ".raw");
    reviewsDir = join(tempDir, ".reviews");
    dailyDir = join(tempDir, "daily");
    mkdirSync(rawDir, { recursive: true });
    mkdirSync(reviewsDir, { recursive: true });
    mkdirSync(dailyDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("findUnprocessedSessions", () => {
    it("returns empty array when no sessions exist", () => {
      const result = findUnprocessedSessions(rawDir);
      expect(result).toEqual([]);
    });

    it("returns session dirs without .completed marker", () => {
      mkdirSync(join(rawDir, "sess-1"));
      writeFileSync(join(rawDir, "sess-1", "2026-03-28.jsonl"), "{}");

      mkdirSync(join(rawDir, "sess-2"));
      writeFileSync(join(rawDir, "sess-2", "2026-03-28.jsonl"), "{}");
      writeFileSync(join(rawDir, "sess-2", ".completed"), "");

      const result = findUnprocessedSessions(rawDir);
      expect(result).toEqual(["sess-1"]);
    });

    it("ignores non-directory entries", () => {
      writeFileSync(join(rawDir, "stray-file.txt"), "");
      const result = findUnprocessedSessions(rawDir);
      expect(result).toEqual([]);
    });
  });

  describe("findPendingReviews", () => {
    it("returns empty array when no reviews exist", () => {
      const result = findPendingReviews(reviewsDir);
      expect(result).toEqual([]);
    });

    it("returns .md files in reviews directory", () => {
      writeFileSync(join(reviewsDir, "sess-1.md"), "# Review");
      writeFileSync(join(reviewsDir, "sess-2.md"), "# Review 2");
      const result = findPendingReviews(reviewsDir);
      expect(result.sort()).toEqual(["sess-1.md", "sess-2.md"]);
    });

    it("ignores non-md files", () => {
      writeFileSync(join(reviewsDir, "sess-1.md"), "# Review");
      writeFileSync(join(reviewsDir, "notes.txt"), "text");
      const result = findPendingReviews(reviewsDir);
      expect(result).toEqual(["sess-1.md"]);
    });
  });

  describe("markSessionCompleted / isSessionCompleted", () => {
    it("creates .completed marker", () => {
      const sessDir = join(rawDir, "sess-1");
      mkdirSync(sessDir);
      expect(isSessionCompleted(sessDir)).toBe(false);

      markSessionCompleted(sessDir);
      expect(isSessionCompleted(sessDir)).toBe(true);
      expect(existsSync(join(sessDir, ".completed"))).toBe(true);
    });
  });

  describe("mergeReviewsIntoDaily", () => {
    it("creates daily file from single review", () => {
      const review = "## [my-app] Auth work\n**작업 요약:** JWT 구현\n";
      writeFileSync(join(reviewsDir, "sess-1.md"), review);

      const dailyPath = join(dailyDir, "2026-03-28.md");
      mergeReviewsIntoDaily([join(reviewsDir, "sess-1.md")], dailyPath);

      const content = readFileSync(dailyPath, "utf-8");
      expect(content).toContain("[my-app] Auth work");
    });

    it("appends to existing daily file", () => {
      const existing = "# 2026-03-28 Daily Review\n\n## [blog] SEO work\nDone.\n";
      const dailyPath = join(dailyDir, "2026-03-28.md");
      writeFileSync(dailyPath, existing);

      const newReview = "\n## [my-app] Auth work\n**작업 요약:** JWT 구현\n";
      writeFileSync(join(reviewsDir, "sess-2.md"), newReview);

      mergeReviewsIntoDaily([join(reviewsDir, "sess-2.md")], dailyPath);

      const content = readFileSync(dailyPath, "utf-8");
      expect(content).toContain("[blog] SEO work");
      expect(content).toContain("[my-app] Auth work");
    });

    it("merges multiple reviews", () => {
      writeFileSync(join(reviewsDir, "sess-1.md"), "## Session 1 content\n");
      writeFileSync(join(reviewsDir, "sess-2.md"), "## Session 2 content\n");

      const dailyPath = join(dailyDir, "2026-03-28.md");
      mergeReviewsIntoDaily(
        [join(reviewsDir, "sess-1.md"), join(reviewsDir, "sess-2.md")],
        dailyPath,
      );

      const content = readFileSync(dailyPath, "utf-8");
      expect(content).toContain("Session 1 content");
      expect(content).toContain("Session 2 content");
    });

    it("handles empty review files gracefully", () => {
      writeFileSync(join(reviewsDir, "sess-empty.md"), "");
      const dailyPath = join(dailyDir, "2026-03-28.md");

      expect(() =>
        mergeReviewsIntoDaily([join(reviewsDir, "sess-empty.md")], dailyPath),
      ).not.toThrow();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/merge.test.ts`
Expected: FAIL — cannot resolve `../../src/core/merge.js`

- [ ] **Step 3: Implement merge module**

```typescript
// src/core/merge.ts
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
} from "fs";
import { join } from "path";

export function findUnprocessedSessions(rawDir: string): string[] {
  if (!existsSync(rawDir)) return [];
  return readdirSync(rawDir).filter((entry) => {
    const entryPath = join(rawDir, entry);
    if (!statSync(entryPath).isDirectory()) return false;
    return !existsSync(join(entryPath, ".completed"));
  });
}

export function findPendingReviews(reviewsDir: string): string[] {
  if (!existsSync(reviewsDir)) return [];
  return readdirSync(reviewsDir).filter((f) => f.endsWith(".md"));
}

export function markSessionCompleted(sessionDir: string): void {
  writeFileSync(join(sessionDir, ".completed"), new Date().toISOString(), "utf-8");
}

export function isSessionCompleted(sessionDir: string): boolean {
  return existsSync(join(sessionDir, ".completed"));
}

export function mergeReviewsIntoDaily(reviewPaths: string[], dailyPath: string): void {
  const reviewContents = reviewPaths
    .map((p) => readFileSync(p, "utf-8").trim())
    .filter((c) => c.length > 0);

  if (reviewContents.length === 0) {
    if (!existsSync(dailyPath)) {
      writeFileSync(dailyPath, "", "utf-8");
    }
    return;
  }

  let existing = "";
  if (existsSync(dailyPath)) {
    existing = readFileSync(dailyPath, "utf-8");
  }

  const merged = existing
    ? existing.trimEnd() + "\n\n" + reviewContents.join("\n\n") + "\n"
    : reviewContents.join("\n\n") + "\n";

  writeFileSync(dailyPath, merged, "utf-8");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/merge.test.ts`
Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/merge.ts tests/core/merge.test.ts
git commit -m "feat: add merge module with session recovery and daily file merging"
```

---

### Task 7: On-Stop Hook Entry Point (TDD)

**Files:**
- Create: `tests/hooks/on-stop.test.ts`
- Create: `src/hooks/on-stop.ts`

- [ ] **Step 1: Write failing tests for on-stop hook**

```typescript
// tests/hooks/on-stop.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from "fs";
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
      vaultPath: tempVault,
      reviewFolder: "daily-review",
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

  it("appends raw log for valid input", () => {
    const input = JSON.stringify({
      session_id: "test-sess",
      transcript_path: "/tmp/t.jsonl",
      cwd: "/projects/my-app",
      hook_event_name: "Stop",
    });

    handleStopHook(input);

    const rawDir = join(tempVault, "daily-review", ".raw", "test-sess");
    expect(existsSync(rawDir)).toBe(true);

    const files = require("fs").readdirSync(rawDir);
    expect(files.some((f: string) => f.endsWith(".jsonl"))).toBe(true);
  });

  it("exits silently when config is missing", () => {
    rmSync(join(tempPluginData, "config.json"));
    const input = JSON.stringify({
      session_id: "test-sess",
      transcript_path: "/tmp/t.jsonl",
      cwd: "/projects/my-app",
      hook_event_name: "Stop",
    });

    expect(() => handleStopHook(input)).not.toThrow();
  });

  it("exits silently on invalid JSON input", () => {
    expect(() => handleStopHook("not-json")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/hooks/on-stop.test.ts`
Expected: FAIL — cannot resolve `../../src/hooks/on-stop.js`

- [ ] **Step 3: Implement on-stop hook**

```typescript
// src/hooks/on-stop.ts
import { loadConfig } from "../core/config.js";
import { parseHookInput, appendRawLog } from "../core/raw-logger.js";
import { getRawDir } from "../core/vault.js";
import { formatDate } from "../core/periods.js";

export function handleStopHook(stdinData: string): void {
  try {
    const config = loadConfig();
    if (!config) return;

    const input = parseHookInput(stdinData);
    const sessionDir = getRawDir(config, input.session_id);
    const date = formatDate(new Date());

    appendRawLog(sessionDir, date, input);
  } catch {
    // async hook — fail silently, data will be recovered from transcript
  }
}

// Main execution: read stdin and run
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  let data = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk) => (data += chunk));
  process.stdin.on("end", () => {
    handleStopHook(data);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/hooks/on-stop.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests across all files PASS

- [ ] **Step 6: Commit**

```bash
git add src/hooks/on-stop.ts tests/hooks/on-stop.test.ts
git commit -m "feat: add on-stop hook entry point with silent failure handling"
```

---

### Task 8: Agent Prompts

**Files:**
- Create: `prompts/session-end.md`
- Create: `prompts/session-start.md`

- [ ] **Step 1: Write SessionEnd agent prompt**

```markdown
<!-- prompts/session-end.md -->
# Daily Review — SessionEnd Agent

You are a daily review generator for the claude-daily-review plugin.
Your job is to read the conversation transcript and generate a structured review markdown file.

## Context

The user's profile and config are stored at the path provided in the CLAUDE_PLUGIN_DATA environment variable, in `config.json`. Read it first to understand the user's context.

## Instructions

1. Read `${CLAUDE_PLUGIN_DATA}/config.json` to get:
   - `vaultPath` and `reviewFolder` — where to write files
   - `profile` — user's company, role, team, context (use this to add business context to summaries)
   - `language` — write the review in this language

2. Read the session's hook input from stdin (passed as JSON). Extract `session_id`, `transcript_path`, and `cwd`.

3. Read the transcript file at `transcript_path`. This is a JSONL file with the full conversation.

4. Analyze the conversation and classify interactions into:
   - **Project work**: Based on `cwd`, determine the project name (last segment of the path). Group related Q&A under this project.
   - **Uncategorized**: General questions not tied to a specific project (e.g., "What is Rust ownership?")

5. For each project group, generate:
   - **작업 요약**: What was done (use profile context for business framing)
   - **배운 것**: New knowledge gained
   - **고민한 포인트**: Decisions made and reasoning
   - **질문과 답변**: Key Q&A highlights (not every single message)

6. Write the review to: `{vaultPath}/{reviewFolder}/.reviews/{session_id}.md`
   - Do NOT write to daily/ directly — that happens at merge time.
   - Include frontmatter with date, type, projects, and tags.

7. Update the project summary if applicable:
   - Read existing `{vaultPath}/{reviewFolder}/projects/{project-name}/summary.md`
   - Append new learnings, decisions, and tech stack entries
   - Write updated summary back

8. Mark the raw log session as completed:
   - Write an empty `.completed` file to `{vaultPath}/{reviewFolder}/.raw/{session_id}/`

## Output Format

The .reviews/{session_id}.md file should follow this structure:

```
## [{project-name}] {brief title}
**작업 요약:** {summary with business context from profile}
**배운 것:**
- {learning 1}
- {learning 2}
**고민한 포인트:**
- {decision}: {choice} ({reasoning})
**질문과 답변:**
- Q: {question}
  → A: {concise answer}

## 미분류
**질문과 답변:**
- Q: {question}
  → A: {concise answer}
```

## Important

- Use the language specified in config (default: Korean)
- Keep summaries concise but meaningful — this is for career documentation
- Include Obsidian tags at the bottom: #project-name #technology #concept
- When profile.context exists, frame work summaries in that business context
- Do NOT include raw code blocks or full conversations — extract the insights
```

- [ ] **Step 2: Write SessionStart agent prompt**

```markdown
<!-- prompts/session-start.md -->
# Daily Review — SessionStart Agent

You are a daily review assistant for the claude-daily-review plugin.
Your job is to check configuration, recover unprocessed sessions, merge pending reviews, and generate periodic summaries.

## Instructions

### Step 1: Check Configuration

Read `${CLAUDE_PLUGIN_DATA}/config.json`.

If the file does not exist, output to stderr:
```
daily-review: Vault 경로가 설정되지 않았습니다. /daily-review-setup 을 실행해주세요.
```
Then exit with code 2 to inform the user.

If the file exists, proceed.

### Step 2: Recover Unprocessed Sessions

Scan `{vaultPath}/{reviewFolder}/.raw/` for session directories that do NOT contain a `.completed` file.

For each unprocessed session:
1. Read all `.jsonl` files in the session directory
2. Read the transcript at the `transcript_path` from the log entries (if accessible)
3. Generate a review following the same format as the SessionEnd agent
4. Write to `{vaultPath}/{reviewFolder}/.reviews/{session_id}.md`
5. Mark `.completed`

If the transcript is not accessible (deleted, moved), generate a minimal review from the raw log data only.

### Step 3: Merge Pending Reviews

Scan `{vaultPath}/{reviewFolder}/.reviews/` for `.md` files.

For each review file:
1. Determine the date from the review content or file metadata
2. Read the existing daily file at `{vaultPath}/{reviewFolder}/daily/{date}.md` (if any)
3. Append the review content to the daily file
4. Delete the review file from `.reviews/` after successful merge

Use a lockfile for the daily file to prevent concurrent writes:
- Lock: `{dailyPath}.lock` with stale timeout of 30 seconds
- If lock acquisition fails, skip this merge (will retry next SessionStart)

### Step 4: Generate Periodic Summaries

Read `${CLAUDE_PLUGIN_DATA}/last-run.json` to get the last run date.
Compare with today to determine which summaries are needed.

Check `config.periods` to see which periods are enabled.

Generate summaries in cascading order (each uses the previous level as input):

#### Weekly (if new week started and periods.weekly is true)
- Read all daily files from the previous week
- Generate `{vaultPath}/{reviewFolder}/weekly/{YYYY-Www}.md`

#### Monthly (if new month started and periods.monthly is true)
- Read all weekly files from the previous month
- If weekly is disabled, read daily files from the previous month instead
- Generate `{vaultPath}/{reviewFolder}/monthly/{YYYY-MM}.md`

#### Quarterly (if new quarter started and periods.quarterly is true)
- Read all monthly files from the previous quarter
- If monthly is disabled, read the next available lower-level files
- Generate `{vaultPath}/{reviewFolder}/quarterly/{YYYY-Qn}.md`

#### Yearly (if new year started and periods.yearly is true)
- Read all quarterly files from the previous year
- If quarterly is disabled, read the next available lower-level files
- Generate `{vaultPath}/{reviewFolder}/yearly/{YYYY}.md`

After all summaries are generated, save today's date to `${CLAUDE_PLUGIN_DATA}/last-run.json`:
```json
{ "lastRun": "2026-03-28" }
```

### Summary Template Guidelines

- Use the user's `profile` to frame accomplishments in business context
- Include frontmatter with date, type, period, and projects
- Follow the markdown templates defined in the spec (see design doc section 6)
- Use the configured language

## Important

- If any step fails, continue to the next step — partial recovery is better than none
- Never delete `.raw/` data — only add `.completed` markers
- Only delete `.reviews/` files after confirmed successful merge
- Periodic summaries should be concise — the point is progressive compression
```

- [ ] **Step 3: Commit**

```bash
git add prompts/session-end.md prompts/session-start.md
git commit -m "feat: add agent prompts for SessionEnd and SessionStart hooks"
```

---

### Task 9: Setup Skill

**Files:**
- Create: `skills/daily-review-setup.md`

- [ ] **Step 1: Write setup skill**

```markdown
<!-- skills/daily-review-setup.md -->
---
name: daily-review-setup
description: Configure the daily review plugin — set Obsidian vault path, user profile, and review periods
---

# Daily Review Setup

You are setting up the claude-daily-review plugin for the user.

## Check Existing Config

First, read `${CLAUDE_PLUGIN_DATA}/config.json` to see if a config already exists.

- If it exists, show the current settings and ask what the user wants to change.
- If it does not exist, proceed with the full onboarding flow below.

## Onboarding Flow

### Step 1: Vault Path

Ask the user:
> "Obsidian vault 경로를 알려주세요. (예: C:/Users/name/Documents/MyVault)"

After they provide a path:
- Verify the directory exists using the Bash tool: `test -d "{path}" && echo "OK" || echo "NOT_FOUND"`
- If not found, ask them to check the path
- Normalize the path (resolve ~, remove trailing slashes)

### Step 2: Profile

Ask the user these questions one at a time:
1. "어떤 회사에서 일하고 계신가요? (선택사항, 엔터로 건너뛰기)"
2. "역할/직무가 뭔가요? (예: 프론트엔드 개발자)"
3. "팀이나 담당 도메인이 있다면? (예: 결제플랫폼팀)"
4. "하고 계신 일을 한 줄로 설명하면? (예: B2B SaaS 결제 시스템 개발 및 운영)"

### Step 3: Periods

Show the available periods and defaults:
> "어떤 주기로 회고를 요약할까요? (기본값으로 진행하려면 엔터)"
> - [x] daily (항상 활성화)
> - [x] weekly (주간)
> - [x] monthly (월간)
> - [x] quarterly (분기)
> - [ ] yearly (연간)

### Step 4: Save

Construct the config object and write it to `${CLAUDE_PLUGIN_DATA}/config.json`:

```json
{
  "vaultPath": "{user input}",
  "reviewFolder": "daily-review",
  "language": "ko",
  "periods": {
    "daily": true,
    "weekly": {user choice},
    "monthly": {user choice},
    "quarterly": {user choice},
    "yearly": {user choice}
  },
  "profile": {
    "company": "{user input}",
    "role": "{user input}",
    "team": "{user input}",
    "context": "{user input}"
  }
}
```

Then create the vault directories by running:
```bash
node -e "
const fs = require('fs');
const path = require('path');
const config = JSON.parse(fs.readFileSync('${CLAUDE_PLUGIN_DATA}/config.json', 'utf-8'));
const base = path.join(config.vaultPath, config.reviewFolder);
const dirs = ['daily', 'projects', 'uncategorized', '.raw', '.reviews'];
if (config.periods.weekly) dirs.push('weekly');
if (config.periods.monthly) dirs.push('monthly');
if (config.periods.quarterly) dirs.push('quarterly');
if (config.periods.yearly) dirs.push('yearly');
dirs.forEach(d => fs.mkdirSync(path.join(base, d), { recursive: true }));
console.log('Directories created at: ' + base);
"
```

### Step 5: Confirm

Tell the user:
> "설정 완료! 이제부터 대화 내용이 자동으로 기록됩니다."
> "회고 파일은 `{vaultPath}/{reviewFolder}/` 에서 확인하세요."
> "설정을 변경하려면 `/daily-review-setup`을 다시 실행하세요."
```

- [ ] **Step 2: Commit**

```bash
git add skills/daily-review-setup.md
git commit -m "feat: add setup skill for onboarding with vault path, profile, and periods"
```

---

### Task 10: Hooks Configuration + Build

**Files:**
- Create: `hooks/hooks.json`

- [ ] **Step 1: Write hooks.json**

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/hooks/on-stop.js\"",
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
            "prompt": "Follow the instructions in the file at ${CLAUDE_PLUGIN_ROOT}/prompts/session-end.md exactly. The CLAUDE_PLUGIN_DATA directory is: ${CLAUDE_PLUGIN_DATA}",
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
            "prompt": "Follow the instructions in the file at ${CLAUDE_PLUGIN_ROOT}/prompts/session-start.md exactly. The CLAUDE_PLUGIN_DATA directory is: ${CLAUDE_PLUGIN_DATA}",
            "timeout": 180
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Build the project**

Run: `npm run build`
Expected: `dist/hooks/on-stop.js` created

- [ ] **Step 3: Verify build output exists**

Run: `ls dist/hooks/on-stop.js`
Expected: File listed

- [ ] **Step 4: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat: add hooks.json with Stop, SessionEnd, and SessionStart hooks"
```

---

### Task 11: Integration Test

**Files:**
- Create: `tests/integration/full-flow.test.ts`

- [ ] **Step 1: Write integration test for the full Stop → merge flow**

```typescript
// tests/integration/full-flow.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { handleStopHook } from "../../src/hooks/on-stop.js";
import { findUnprocessedSessions, mergeReviewsIntoDaily, markSessionCompleted } from "../../src/core/merge.js";
import { loadConfig, saveConfig, createDefaultConfig } from "../../src/core/config.js";
import { ensureVaultDirectories } from "../../src/core/vault.js";
import { checkPeriodsNeeded, formatDate } from "../../src/core/periods.js";

describe("integration: full flow", () => {
  let tempVault: string;
  let tempPluginData: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tempVault = mkdtempSync(join(tmpdir(), "cdr-int-vault-"));
    tempPluginData = mkdtempSync(join(tmpdir(), "cdr-int-data-"));
    process.env.CLAUDE_PLUGIN_DATA = tempPluginData;

    const config = createDefaultConfig(tempVault);
    saveConfig(config);
    ensureVaultDirectories(config);
  });

  afterEach(() => {
    rmSync(tempVault, { recursive: true, force: true });
    rmSync(tempPluginData, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it("Stop hook creates raw log, then merge recovers it", () => {
    // 1. Simulate Stop hook
    const input = JSON.stringify({
      session_id: "int-sess-1",
      transcript_path: "/tmp/transcript.jsonl",
      cwd: "/projects/my-app",
      hook_event_name: "Stop",
    });
    handleStopHook(input);

    // 2. Verify raw log exists
    const rawDir = join(tempVault, "daily-review", ".raw", "int-sess-1");
    expect(existsSync(rawDir)).toBe(true);

    // 3. Check it's unprocessed
    const unprocessed = findUnprocessedSessions(
      join(tempVault, "daily-review", ".raw"),
    );
    expect(unprocessed).toContain("int-sess-1");

    // 4. Simulate SessionEnd: write review to .reviews/
    const reviewsDir = join(tempVault, "daily-review", ".reviews");
    writeFileSync(
      join(reviewsDir, "int-sess-1.md"),
      "## [my-app] Auth work\n**작업 요약:** JWT 구현\n",
    );
    markSessionCompleted(rawDir);

    // 5. Simulate SessionStart: merge reviews into daily
    const today = formatDate(new Date());
    const dailyPath = join(tempVault, "daily-review", "daily", `${today}.md`);
    mergeReviewsIntoDaily([join(reviewsDir, "int-sess-1.md")], dailyPath);

    // 6. Verify daily file
    expect(existsSync(dailyPath)).toBe(true);
    const content = readFileSync(dailyPath, "utf-8");
    expect(content).toContain("[my-app] Auth work");
    expect(content).toContain("JWT 구현");
  });

  it("multiple sessions merge into same daily file", () => {
    // Session A
    handleStopHook(
      JSON.stringify({
        session_id: "sess-a",
        transcript_path: "/tmp/a.jsonl",
        cwd: "/projects/app-a",
        hook_event_name: "Stop",
      }),
    );

    // Session B
    handleStopHook(
      JSON.stringify({
        session_id: "sess-b",
        transcript_path: "/tmp/b.jsonl",
        cwd: "/projects/app-b",
        hook_event_name: "Stop",
      }),
    );

    // Both sessions write reviews
    const reviewsDir = join(tempVault, "daily-review", ".reviews");
    writeFileSync(join(reviewsDir, "sess-a.md"), "## [app-a] Feature A\n");
    writeFileSync(join(reviewsDir, "sess-b.md"), "## [app-b] Feature B\n");

    // Merge
    const today = formatDate(new Date());
    const dailyPath = join(tempVault, "daily-review", "daily", `${today}.md`);
    mergeReviewsIntoDaily(
      [join(reviewsDir, "sess-a.md"), join(reviewsDir, "sess-b.md")],
      dailyPath,
    );

    const content = readFileSync(dailyPath, "utf-8");
    expect(content).toContain("[app-a] Feature A");
    expect(content).toContain("[app-b] Feature B");
  });

  it("period detection works correctly for summary triggers", () => {
    const monday = new Date(2026, 2, 30); // Monday W14
    const prevSaturday = new Date(2026, 2, 28); // Saturday W13
    const periods = checkPeriodsNeeded(monday, prevSaturday);
    expect(periods.needsWeekly).toBe(true);
    expect(periods.previousWeek).toBe("2026-W13");
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS (config: 8, periods: 17, vault: 13, raw-logger: 7, merge: 10, on-stop: 3, integration: 3 = ~61 tests)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/full-flow.test.ts
git commit -m "test: add integration tests for full Stop → merge flow"
```

---

### Task 12: README and Package Finalization

**Files:**
- Create: `README.md`
- Modify: `package.json` (add files field)

- [ ] **Step 1: Write README.md**

```markdown
# claude-daily-review

Claude Code plugin that automatically captures your conversations and generates structured daily review markdown files in your Obsidian vault.

Turn your daily AI-assisted development work into career documentation — automatically.

## Features

- **Auto-capture**: Hook-based conversation logging with zero manual effort
- **Structured reviews**: Work summaries, learnings, decisions, and Q&A organized by project
- **Cascading summaries**: Daily → Weekly → Monthly → Quarterly → Yearly
- **Project tracking**: Per-project summaries for resume/portfolio building
- **Obsidian integration**: Direct markdown output with tags and links
- **Concurrency-safe**: Session-isolated writes with deferred merge
- **Crash recovery**: Raw logs preserved even on force-quit

## Installation

```bash
claude plugin add claude-daily-review
```

## Setup

On first run, you'll be prompted to configure the plugin. Or run manually:

```
/daily-review-setup
```

This will ask for:
1. Your Obsidian vault path
2. A brief professional profile (company, role, team)
3. Which summary periods to enable

## How It Works

```
Every response  →  Raw log saved (async, non-blocking)
Session end     →  AI generates structured review
Next session    →  Reviews merged into daily file + periodic summaries generated
```

## Vault Structure

```
vault/daily-review/
├── daily/2026-03-28.md          ← Daily review (all projects)
├── weekly/2026-W13.md           ← Weekly summary
├── monthly/2026-03.md           ← Monthly summary
├── quarterly/2026-Q1.md         ← Quarterly summary
├── yearly/2026.md               ← Yearly summary
├── projects/my-app/
│   ├── 2026-03-28.md            ← Project daily detail
│   └── summary.md               ← Cumulative project summary
└── uncategorized/2026-03-28.md  ← Non-project questions
```

## Configuration

Config is stored at `$CLAUDE_PLUGIN_DATA/config.json`:

```json
{
  "vaultPath": "/path/to/obsidian/vault",
  "reviewFolder": "daily-review",
  "language": "ko",
  "periods": {
    "daily": true,
    "weekly": true,
    "monthly": true,
    "quarterly": true,
    "yearly": false
  },
  "profile": {
    "company": "Your Company",
    "role": "Your Role",
    "team": "Your Team",
    "context": "What you do in one line"
  }
}
```

## License

MIT
```

- [ ] **Step 2: Update package.json with files field**

Add to `package.json`:

```json
{
  "files": [
    "dist",
    "hooks",
    "prompts",
    "skills",
    "README.md"
  ]
}
```

- [ ] **Step 3: Final build and test**

Run: `npm run build && npm test`
Expected: Build succeeds, all tests pass

- [ ] **Step 4: Commit**

```bash
git add README.md package.json
git commit -m "docs: add README and finalize package configuration"
```

---

## Summary

| Task | Module | Tests | Description |
|------|--------|-------|-------------|
| 1 | Scaffolding | - | package.json, tsconfig, vitest, tsup |
| 2 | config.ts | 8 | Config CRUD, validation, defaults |
| 3 | periods.ts | 17 | Date formatting, period detection |
| 4 | vault.ts | 13 | Path generation, directory management |
| 5 | raw-logger.ts | 7 | stdin parsing, session-isolated append |
| 6 | merge.ts | 10 | Session recovery, daily file merging |
| 7 | on-stop.ts | 3 | Hook entry point, silent failure |
| 8 | Agent prompts | - | SessionEnd + SessionStart prompts |
| 9 | Setup skill | - | Onboarding flow |
| 10 | hooks.json | - | Hook definitions + build |
| 11 | Integration | 3 | Full flow test |
| 12 | README | - | Documentation + packaging |
| **Total** | | **~61** | |
