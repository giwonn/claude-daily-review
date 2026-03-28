import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  parseHookInput,
  appendRawLog,
  type HookInput,
} from "../../src/core/raw-logger.js";

describe("raw-logger", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cdr-raw-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("parseHookInput", () => {
    it("parses valid JSON from stdin", () => {
      const input = JSON.stringify({
        session_id: "abc-123",
        transcript_path: "/tmp/transcript.jsonl",
        cwd: "/projects/my-app",
        hook_event_name: "Stop",
      });
      const result = parseHookInput(input);
      expect(result.session_id).toBe("abc-123");
      expect(result.transcript_path).toBe("/tmp/transcript.jsonl");
      expect(result.cwd).toBe("/projects/my-app");
      expect(result.hook_event_name).toBe("Stop");
    });

    it("throws on invalid JSON", () => {
      expect(() => parseHookInput("not json")).toThrow();
    });

    it("throws when session_id is missing", () => {
      const input = JSON.stringify({ cwd: "/tmp" });
      expect(() => parseHookInput(input)).toThrow("session_id");
    });
  });

  describe("appendRawLog", () => {
    it("creates session directory and appends log entry", () => {
      const sessionDir = join(tempDir, "sess-1");
      const entry: HookInput = {
        session_id: "sess-1",
        transcript_path: "/tmp/t.jsonl",
        cwd: "/projects/my-app",
        hook_event_name: "Stop",
      };

      appendRawLog(sessionDir, "2026-03-28", entry);

      const logPath = join(sessionDir, "2026-03-28.jsonl");
      expect(existsSync(logPath)).toBe(true);
      const lines = readFileSync(logPath, "utf-8").trim().split("\n");
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.session_id).toBe("sess-1");
      expect(parsed.cwd).toBe("/projects/my-app");
      expect(typeof parsed.timestamp).toBe("string");
    });

    it("appends multiple entries to same file", () => {
      const sessionDir = join(tempDir, "sess-2");
      const entry: HookInput = {
        session_id: "sess-2",
        transcript_path: "/tmp/t.jsonl",
        cwd: "/projects/my-app",
        hook_event_name: "Stop",
      };

      appendRawLog(sessionDir, "2026-03-28", entry);
      appendRawLog(sessionDir, "2026-03-28", entry);

      const logPath = join(sessionDir, "2026-03-28.jsonl");
      const lines = readFileSync(logPath, "utf-8").trim().split("\n");
      expect(lines).toHaveLength(2);
    });

    it("creates separate files for different dates", () => {
      const sessionDir = join(tempDir, "sess-3");
      const entry: HookInput = {
        session_id: "sess-3",
        transcript_path: "/tmp/t.jsonl",
        cwd: "/projects/my-app",
        hook_event_name: "Stop",
      };

      appendRawLog(sessionDir, "2026-03-28", entry);
      appendRawLog(sessionDir, "2026-03-29", entry);

      expect(existsSync(join(sessionDir, "2026-03-28.jsonl"))).toBe(true);
      expect(existsSync(join(sessionDir, "2026-03-29.jsonl"))).toBe(true);
    });

    it("stores timestamp in each entry", () => {
      const sessionDir = join(tempDir, "sess-4");
      const entry: HookInput = {
        session_id: "sess-4",
        transcript_path: "/tmp/t.jsonl",
        cwd: "/projects/my-app",
        hook_event_name: "Stop",
      };

      appendRawLog(sessionDir, "2026-03-28", entry);

      const logPath = join(sessionDir, "2026-03-28.jsonl");
      const parsed = JSON.parse(readFileSync(logPath, "utf-8").trim());
      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
