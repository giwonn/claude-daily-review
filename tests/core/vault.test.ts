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
