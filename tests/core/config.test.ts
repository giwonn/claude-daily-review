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
