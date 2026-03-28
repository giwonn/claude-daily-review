// tests/hooks/on-stop.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { handleStopHook } from "../../src/hooks/on-stop.js";

describe("on-stop hook", () => {
  let tempVault: string;
  let tempPluginData: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tempVault = mkdtempSync(join(tmpdir(), "cdr-stop-vault-"));
    tempPluginData = mkdtempSync(join(tmpdir(), "cdr-stop-data-"));
    process.env.CLAUDE_PLUGIN_DATA = tempPluginData;

    const config = {
      storage: { type: "local", local: { basePath: join(tempVault, "daily-review") } },
      language: "ko",
      periods: { daily: true, weekly: true, monthly: true, quarterly: true, yearly: false },
      profile: { company: "", role: "", team: "", context: "" },
    };
    writeFileSync(join(tempPluginData, "config.json"), JSON.stringify(config));
  });

  afterEach(() => {
    rmSync(tempVault, { recursive: true, force: true });
    rmSync(tempPluginData, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it("appends raw log for valid input", async () => {
    const input = JSON.stringify({
      session_id: "test-sess",
      transcript_path: "/tmp/t.jsonl",
      cwd: "/projects/my-app",
      hook_event_name: "Stop",
    });

    await handleStopHook(input);

    const rawDir = join(tempVault, "daily-review", ".raw", "test-sess");
    expect(existsSync(rawDir)).toBe(true);
    const files = readdirSync(rawDir);
    expect(files.some((f: string) => f.endsWith(".jsonl"))).toBe(true);
  });

  it("exits silently when config is missing", async () => {
    rmSync(join(tempPluginData, "config.json"));
    const input = JSON.stringify({
      session_id: "test-sess",
      transcript_path: "/tmp/t.jsonl",
      cwd: "/projects/my-app",
      hook_event_name: "Stop",
    });
    await expect(handleStopHook(input)).resolves.not.toThrow();
  });

  it("exits silently on invalid JSON input", async () => {
    await expect(handleStopHook("not-json")).resolves.not.toThrow();
  });
});
