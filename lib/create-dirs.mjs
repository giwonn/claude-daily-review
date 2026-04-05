#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
const configPath = path.join(process.env.CLAUDE_PLUGIN_DATA, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const base = config.storage.local.basePath;
const dirs = ['daily', 'projects', 'uncategorized', 'raw', '.reviews'];
if (config.periods.weekly) dirs.push('weekly');
if (config.periods.monthly) dirs.push('monthly');
if (config.periods.quarterly) dirs.push('quarterly');
if (config.periods.yearly) dirs.push('yearly');
dirs.forEach(d => fs.mkdirSync(path.join(base, d), { recursive: true }));
console.log('Directories created at: ' + base);
