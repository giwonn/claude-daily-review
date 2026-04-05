#!/usr/bin/env node
import { loadConfig, validateConfig, createStorageAdapter } from './config.mjs';
try {
  const config = loadConfig();
  if (!config || !validateConfig(config) || !config.profile) {
    process.stdout.write('NEEDS_SETUP');
  } else {
    const storage = await createStorageAdapter(config);
    const hasOldRaw = await storage.exists('.raw');
    if (hasOldRaw) process.stdout.write('NEEDS_MIGRATE');
    else process.stdout.write('OK');
  }
} catch {
  process.stdout.write('NEEDS_SETUP');
}
