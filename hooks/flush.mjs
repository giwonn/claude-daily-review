#!/usr/bin/env node
// @ts-check
import { loadConfig, createStorageAdapter } from '../lib/config.mjs';
import { listAllUnflushedSessions, getUnflushedContent, markFlushed, cleanupBuffer } from '../lib/buffer.mjs';
import { formatDate } from '../lib/periods.mjs';
import { getRawLogPath, getRawDir } from '../lib/vault.mjs';

async function main() {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dataDir) {
    console.log('NO_DATA_DIR');
    return;
  }

  try {
    const config = loadConfig();
    if (!config) {
      console.log('NO_CONFIG');
      return;
    }

    const sessions = listAllUnflushedSessions(dataDir);
    if (sessions.length === 0) {
      console.log('FLUSHED:0');
      return;
    }

    const storage = await createStorageAdapter(config);
    let flushed = 0;

    for (const sessionId of sessions) {
      const unflushed = getUnflushedContent(dataDir, sessionId);
      if (!unflushed) continue;

      const byDate = {};
      for (const line of unflushed.trim().split('\n')) {
        try {
          const entry = JSON.parse(line);
          const date = entry.timestamp ? formatDate(new Date(entry.timestamp)) : formatDate(new Date());
          if (!byDate[date]) byDate[date] = '';
          byDate[date] += line + '\n';
        } catch { continue; }
      }

      for (const [date, lines] of Object.entries(byDate)) {
        const dir = getRawDir(date);
        await storage.mkdir(dir);
        const logPath = getRawLogPath(date, sessionId);
        await storage.append(logPath, lines);
      }

      markFlushed(dataDir, sessionId);
      flushed++;
    }

    console.log(`FLUSHED:${flushed}`);
  } catch (err) {
    console.error(`ERROR:${err.message}`);
    try {
      const { buildIssueUrl } = await import('../lib/issue-url.mjs');
      const issueUrl = buildIssueUrl({ context: 'flush', error: err });
      console.error(`이슈로 보고하려면: ${issueUrl}`);
    } catch {}
    process.exit(1);
  }
}
main();
