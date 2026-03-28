// src/core/config.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
function getConfigPath() {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dataDir) {
    throw new Error("CLAUDE_PLUGIN_DATA environment variable is not set");
  }
  return join(dataDir, "config.json");
}
function isOldConfig(raw) {
  if (!raw || typeof raw !== "object") return false;
  return "vaultPath" in raw && "reviewFolder" in raw;
}
function migrateOldConfig(old) {
  return {
    storage: {
      type: "local",
      local: {
        basePath: join(old.vaultPath, old.reviewFolder)
      }
    },
    language: old.language,
    periods: old.periods,
    profile: old.profile
  };
}
function loadConfig() {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return null;
  const raw = JSON.parse(readFileSync(configPath, "utf-8"));
  if (isOldConfig(raw)) {
    const migrated = migrateOldConfig(raw);
    saveConfig(migrated);
    return migrated;
  }
  return raw;
}
function saveConfig(config) {
  const configPath = getConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

// src/hooks/on-session-start-check.ts
try {
  const config = loadConfig();
  if (!config) {
    process.stderr.write("daily-review \uD50C\uB7EC\uADF8\uC778\uC774 \uC544\uC9C1 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. /daily-review-setup \uC744 \uC2E4\uD589\uD574\uC8FC\uC138\uC694.");
    process.exit(2);
  }
} catch {
  process.stderr.write("daily-review \uD50C\uB7EC\uADF8\uC778\uC774 \uC544\uC9C1 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. /daily-review-setup \uC744 \uC2E4\uD589\uD574\uC8FC\uC138\uC694.");
  process.exit(2);
}
//# sourceMappingURL=on-session-start-check.js.map