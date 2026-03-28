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
