#!/usr/bin/env node
// Reads all raw logs and outputs a summary JSON for the review generator
import { loadConfig, createStorageAdapter } from './config.mjs';

async function main() {
  const config = loadConfig();
  if (!config) { console.log('{}'); return; }
  const storage = await createStorageAdapter(config);

  const sessions = await storage.list('.raw');
  /** @type {Record<string, Array<{type: string, message: string, cwd: string, timestamp: string}>>} */
  const byDate = {};

  for (const sess of sessions) {
    const files = await storage.list('.raw/' + sess);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const date = file.replace('.jsonl', '');
      const content = await storage.read('.raw/' + sess + '/' + file);
      if (!content) continue;
      if (!byDate[date]) byDate[date] = [];
      for (const line of content.trim().split('\n')) {
        try {
          const entry = JSON.parse(line);
          byDate[date].push({
            type: entry.type || 'unknown',
            message: entry.message || '',
            cwd: entry.cwd || '',
            timestamp: entry.timestamp || '',
          });
        } catch {}
      }
    }
  }

  // Check which dates already have daily reviews
  const existingDailies = await storage.list('daily');
  const existingDates = new Set(existingDailies.map(f => f.replace('.md', '')));

  const result = {
    dates: Object.keys(byDate).sort(),
    existingDailies: [...existingDates],
    logs: byDate,
  };

  console.log(JSON.stringify(result));
}

main().catch(() => console.log('{}'));
