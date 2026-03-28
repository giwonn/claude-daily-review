// src/hooks/on-stop.ts
import { fileURLToPath } from "url";
import { resolve } from "path";
import { loadConfig, createStorageAdapter } from "../core/config.js";
import { parseHookInput, appendRawLog } from "../core/raw-logger.js";
import { getRawDir } from "../core/vault.js";
import { formatDate } from "../core/periods.js";

export async function handleStopHook(stdinData: string): Promise<void> {
  try {
    const config = loadConfig();
    if (!config) return;

    const storage = await createStorageAdapter(config);
    const input = parseHookInput(stdinData);
    const sessionDir = getRawDir(input.session_id);
    const date = formatDate(new Date());

    await appendRawLog(storage, sessionDir, date, input);
  } catch {
    // async hook — fail silently
  }
}

// Main execution
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
  let data = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk) => (data += chunk));
  process.stdin.on("end", () => {
    handleStopHook(data);
  });
}
