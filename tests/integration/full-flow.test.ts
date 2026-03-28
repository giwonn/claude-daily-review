// tests/integration/full-flow.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { handleStopHook } from "../../src/hooks/on-stop.js";
import { findUnprocessedSessions, mergeReviewsIntoDaily, markSessionCompleted } from "../../src/core/merge.js";
import { saveConfig, createDefaultLocalConfig } from "../../src/core/config.js";
import { ensureVaultDirectories, getDailyPath } from "../../src/core/vault.js";
import { LocalStorageAdapter } from "../../src/core/local-storage.js";
import { checkPeriodsNeeded, formatDate } from "../../src/core/periods.js";

describe("integration: full flow", () => {
  let tempVault: string;
  let tempPluginData: string;
  let storage: LocalStorageAdapter;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    tempVault = mkdtempSync(join(tmpdir(), "cdr-int-vault-"));
    tempPluginData = mkdtempSync(join(tmpdir(), "cdr-int-data-"));
    process.env.CLAUDE_PLUGIN_DATA = tempPluginData;

    const basePath = join(tempVault, "daily-review");
    const config = createDefaultLocalConfig(basePath);
    saveConfig(config);
    storage = new LocalStorageAdapter(basePath);
    await ensureVaultDirectories(storage, config.periods);
  });

  afterEach(() => {
    rmSync(tempVault, { recursive: true, force: true });
    rmSync(tempPluginData, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it("Stop hook creates raw log, then merge recovers it", async () => {
    const input = JSON.stringify({
      session_id: "int-sess-1",
      transcript_path: "/tmp/transcript.jsonl",
      cwd: "/projects/my-app",
      hook_event_name: "Stop",
    });
    await handleStopHook(input);

    expect(await storage.exists(".raw/int-sess-1")).toBe(true);

    const unprocessed = await findUnprocessedSessions(storage, ".raw");
    expect(unprocessed).toContain("int-sess-1");

    await storage.write(".reviews/int-sess-1.md", "## [my-app] Auth work\n**작업 요약:** JWT 구현\n");
    await markSessionCompleted(storage, ".raw/int-sess-1");

    const today = formatDate(new Date());
    const dailyPath = getDailyPath(today);
    await mergeReviewsIntoDaily(storage, [".reviews/int-sess-1.md"], dailyPath);

    const content = await storage.read(dailyPath);
    expect(content).toContain("[my-app] Auth work");
    expect(content).toContain("JWT 구현");
  });

  it("multiple sessions merge into same daily file", async () => {
    await handleStopHook(JSON.stringify({
      session_id: "sess-a", transcript_path: "/tmp/a.jsonl",
      cwd: "/projects/app-a", hook_event_name: "Stop",
    }));
    await handleStopHook(JSON.stringify({
      session_id: "sess-b", transcript_path: "/tmp/b.jsonl",
      cwd: "/projects/app-b", hook_event_name: "Stop",
    }));

    await storage.write(".reviews/sess-a.md", "## [app-a] Feature A\n");
    await storage.write(".reviews/sess-b.md", "## [app-b] Feature B\n");

    const today = formatDate(new Date());
    const dailyPath = getDailyPath(today);
    await mergeReviewsIntoDaily(storage, [".reviews/sess-a.md", ".reviews/sess-b.md"], dailyPath);

    const content = await storage.read(dailyPath);
    expect(content).toContain("[app-a] Feature A");
    expect(content).toContain("[app-b] Feature B");
  });

  it("period detection works correctly for summary triggers", () => {
    const monday = new Date(2026, 2, 30);
    const prevSaturday = new Date(2026, 2, 28);
    const periods = checkPeriodsNeeded(monday, prevSaturday);
    expect(periods.needsWeekly).toBe(true);
    expect(periods.previousWeek).toBe("2026-W13");
  });
});
