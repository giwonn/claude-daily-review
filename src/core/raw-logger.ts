// src/core/raw-logger.ts
import type { StorageAdapter } from "./storage.js";

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

export async function appendRawLog(storage: StorageAdapter, sessionDir: string, date: string, entry: HookInput): Promise<void> {
  await storage.mkdir(sessionDir);
  const logPath = `${sessionDir}/${date}.jsonl`;
  const record = {
    ...entry,
    timestamp: new Date().toISOString(),
  };
  await storage.append(logPath, JSON.stringify(record) + "\n");
}
