#!/usr/bin/env node
// @ts-check
import { loadConfig, createStorageAdapter } from '../lib/config.mjs';
import { parseHookInput, appendRawLog } from '../lib/raw-logger.mjs';
import { getRawDir } from '../lib/vault.mjs';
import { formatDate } from '../lib/periods.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

/**
 * Read the last user message and its timestamp from transcript file
 * @param {string} transcriptPath
 * @returns {{ message: string, timestamp: string }}
 */
function getLastUserEntry(transcriptPath) {
  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.type !== 'user') continue;
        const msgContent = entry.message?.content;
        const ts = entry.timestamp || '';
        if (typeof msgContent === 'string' && msgContent.trim()) return { message: msgContent, timestamp: ts };
        if (Array.isArray(msgContent)) {
          const textPart = msgContent.find(p => p.type === 'text' && p.text?.trim());
          if (textPart) return { message: textPart.text, timestamp: ts };
        }
      } catch { continue; }
    }
  } catch { /* transcript not accessible */ }
  return { message: '', timestamp: '' };
}

async function main() {
  try {
    const config = loadConfig();
    if (!config) return;
    const storage = await createStorageAdapter(config);
    let data = '';
    process.stdin.setEncoding('utf-8');
    for await (const chunk of process.stdin) { data += chunk; }
    const input = parseHookInput(data);

    // Get user message + timestamp from transcript
    let userMessage = '';
    let userTimestamp = '';
    if (input.transcript_path) {
      const userEntry = getLastUserEntry(input.transcript_path);
      userMessage = userEntry.message;
      userTimestamp = userEntry.timestamp;
    }
    input.last_user_message = userMessage;
    input.user_timestamp = userTimestamp;

    const sessionDir = getRawDir(input.session_id);
    const date = formatDate(new Date());
    await appendRawLog(storage, sessionDir, date, input);

    // Save transcript path for session recovery
    if (input.transcript_path) {
      const metaPath = `${sessionDir}/.meta.json`;
      const meta = JSON.stringify({ transcript_path: input.transcript_path, session_id: input.session_id });
      await storage.write(metaPath, meta);
    }
  } catch (err) {
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
