import { loadConfig } from "../core/config.js";
import { parseHookInput, appendRawLog } from "../core/raw-logger.js";
import { getRawDir } from "../core/vault.js";
import { formatDate } from "../core/periods.js";

export function handleStopHook(stdinData: string): void {
  try {
    const config = loadConfig();
    if (!config) return;

    const input = parseHookInput(stdinData);
    const sessionDir = getRawDir(config, input.session_id);
    const date = formatDate(new Date());

    appendRawLog(sessionDir, date, input);
  } catch {
    // async hook — fail silently, data will be recovered from transcript
  }
}

// Main execution: read stdin and run
const scriptUrl = import.meta.url;
const isMainModule = process.argv[1] && scriptUrl.endsWith(process.argv[1].replace(/\\/g, "/"));

if (isMainModule) {
  let data = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk) => (data += chunk));
  process.stdin.on("end", () => {
    handleStopHook(data);
  });
}
