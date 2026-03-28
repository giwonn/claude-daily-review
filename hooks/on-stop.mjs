#!/usr/bin/env node
// @ts-check
import { loadConfig, createStorageAdapter } from '../lib/config.mjs';
import { parseHookInput, appendRawLog } from '../lib/raw-logger.mjs';
import { getRawDir } from '../lib/vault.mjs';
import { formatDate } from '../lib/periods.mjs';

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
  } catch {
    // async hook — fail silently
  }
}
main();
