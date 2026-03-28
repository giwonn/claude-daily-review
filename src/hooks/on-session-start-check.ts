import { loadConfig } from "../core/config.js";

const config = loadConfig();
if (!config) {
  process.stderr.write("daily-review: 설정이 없습니다. /daily-review-setup 을 실행해주세요.\n");
  process.exit(2);
}
