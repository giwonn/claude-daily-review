import { loadConfig } from "../core/config.js";

try {
  const config = loadConfig();
  if (!config) {
    process.stderr.write("daily-review 플러그인이 아직 설정되지 않았습니다. /daily-review-setup 을 실행해주세요.");
    process.exit(2);
  }
} catch {
  process.stderr.write("daily-review 플러그인이 아직 설정되지 않았습니다. /daily-review-setup 을 실행해주세요.");
  process.exit(2);
}
