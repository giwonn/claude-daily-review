import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { handleStopHook } from "../../src/hooks/on-stop.js";
import { findUnprocessedSessions, mergeReviewsIntoDaily, markSessionCompleted } from "../../src/core/merge.js";
import { saveConfig, createDefaultConfig } from "../../src/core/config.js";
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
