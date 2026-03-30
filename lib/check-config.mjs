#!/usr/bin/env node
import { loadConfig, validateConfig } from './config.mjs';
try {
  const config = loadConfig();
  if (!config || !validateConfig(config) || !config.profile) process.stdout.write('NEEDS_SETUP');
} catch {
  process.stdout.write('NEEDS_SETUP');
}
