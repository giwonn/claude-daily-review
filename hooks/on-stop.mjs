#!/usr/bin/env node
// @ts-check
import { loadConfig, createStorageAdapter } from '../lib/config.mjs';
import { parseHookInput, appendRawLog } from '../lib/raw-logger.mjs';
import { getRawDir } from '../lib/vault.mjs';
import { formatDate } from '../lib/periods.mjs';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

async function main() {
  try {
    const config = loadConfig();
    if (!config) return;
    const storage = await createStorageAdapter(config);
    let data = '';
    process.stdin.setEncoding('utf-8');
    for await (const chunk of process.stdin) { data += chunk; }
    const input = parseHookInput(data);
    const sessionDir = getRawDir(input.session_id);
    const date = formatDate(new Date());
    await appendRawLog(storage, sessionDir, date, input);
  } catch (err) {
    // Log errors for debugging
    try {
      const logDir = process.env.CLAUDE_PLUGIN_DATA;
      if (logDir) {
        const logPath = join(logDir, 'error.log');
        mkdirSync(dirname(logPath), { recursive: true });
        writeFileSync(logPath, `${new Date().toISOString()} ${err.message}\n${err.stack}\n`, { flag: 'a' });
      }
    } catch {
      // truly silent
    }
  }
}
main();
