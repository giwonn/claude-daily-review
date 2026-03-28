#!/usr/bin/env node
// @ts-check
import { loadConfig, createStorageAdapter } from '../lib/config.mjs';
import { parseHookInput, appendRawLog } from '../lib/raw-logger.mjs';
import { getRawDir } from '../lib/vault.mjs';
import { formatDate } from '../lib/periods.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

/**
 * Read the last user message from transcript file
 * @param {string} transcriptPath
 * @returns {string}
 */
function getLastUserMessage(transcriptPath) {
  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');
    // Walk backwards to find the last real user text message (not tool_result)
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.type !== 'user') continue;
        const msgContent = entry.message?.content;
        // String content = direct user message
        if (typeof msgContent === 'string' && msgContent.trim()) return msgContent;
        // Array content = check for text parts (skip tool_result entries)
        if (Array.isArray(msgContent)) {
          const textPart = msgContent.find(p => p.type === 'text' && p.text?.trim());
          if (textPart) return textPart.text;
        }
      } catch { continue; }
    }
  } catch { /* transcript not accessible */ }
  return '';
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

    // Add last user message from transcript
    if (input.transcript_path) {
      input.last_user_message = getLastUserMessage(input.transcript_path);
    }

    const sessionDir = getRawDir(input.session_id);
    const date = formatDate(new Date());
    await appendRawLog(storage, sessionDir, date, input);
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
