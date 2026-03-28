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
