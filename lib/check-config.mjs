#!/usr/bin/env node
import { loadConfig, validateConfig, createStorageAdapter } from './config.mjs';
import { indexExists } from './index-manager.mjs';
try {
  const config = loadConfig();
  if (!config || !validateConfig(config) || !config.profile) {
    process.stdout.write('NEEDS_SETUP');
  } else {
    const storage = await createStorageAdapter(config);
    const hasOldRaw = await storage.exists('.raw');
    if (hasOldRaw) {
      process.stdout.write('NEEDS_MIGRATE');
    } else {
      const dataDir = process.env.CLAUDE_PLUGIN_DATA;
      if (dataDir && !indexExists(dataDir)) {
        process.stdout.write('NEEDS_INDEX');
      } else {
        process.stdout.write('OK');
      }
    }
  }
} catch {
  process.stdout.write('NEEDS_SETUP');
}
