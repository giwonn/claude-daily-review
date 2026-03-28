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
    throw new Error("GitHub storage not yet implemented");
  }
  throw new Error(`Unknown storage type: ${(config.storage as any).type}`);
}
