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
