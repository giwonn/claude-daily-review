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
      expect(result!.storage.local!.basePath).toContain("daily-review");
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
      expect(validateConfig(createDefaultLocalConfig("/my/vault"))).toBe(true);
    });

    it("returns true for valid github config", () => {
      expect(validateConfig(createDefaultGitHubConfig("user", "repo", "token123"))).toBe(true);
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
    it("returns LocalStorageAdapter for local config", async () => {
      const config = createDefaultLocalConfig("/my/vault");
      const adapter = await createStorageAdapter(config);
      expect(adapter).toBeInstanceOf(LocalStorageAdapter);
    });

    it("throws for unknown storage type", async () => {
      const config = createDefaultLocalConfig("/my/vault");
      (config.storage as any).type = "unknown";
      await expect(createStorageAdapter(config)).rejects.toThrow("Unknown storage type");
    });
  });
});
