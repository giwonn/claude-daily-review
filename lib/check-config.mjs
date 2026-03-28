#!/usr/bin/env node
import { loadConfig } from './config.mjs';
try {
  const config = loadConfig();
  if (!config) process.stdout.write('NEEDS_SETUP');
} catch {
  process.stdout.write('NEEDS_SETUP');
}
