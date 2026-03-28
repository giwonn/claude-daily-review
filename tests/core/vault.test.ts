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
