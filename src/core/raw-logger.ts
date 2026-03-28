import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";

export interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  [key: string]: unknown;
}

export function parseHookInput(raw: string): HookInput {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid hook input: expected object");
  }
  if (typeof parsed.session_id !== "string" || !parsed.session_id) {
    throw new Error("Invalid hook input: missing session_id");
  }
  return parsed as HookInput;
}

export function appendRawLog(sessionDir: string, date: string, entry: HookInput): void {
  mkdirSync(sessionDir, { recursive: true });
  const logPath = join(sessionDir, `${date}.jsonl`);
  const record = {
    ...entry,
    timestamp: new Date().toISOString(),
  };
  appendFileSync(logPath, JSON.stringify(record) + "\n", "utf-8");
}
