import { loadConfig } from "../core/config.js";

let config = null;
try {
  config = loadConfig();
} catch {
  // ignore
}

if (!config) {
  const message = "daily-review 플러그인이 아직 설정되지 않았습니다. /daily-review-setup 을 실행해주세요.";
  const escaped = message.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: escaped,
    },
  }));
}

process.exit(0);
