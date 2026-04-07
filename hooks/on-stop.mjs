#!/usr/bin/env node
// @ts-check
import { loadConfig, createStorageAdapter } from '../lib/config.mjs';
import { parseHookInput } from '../lib/raw-logger.mjs';
import { sanitize } from '../lib/sanitizer.mjs';
import { formatDate } from '../lib/periods.mjs';
import { getRawLogPath, getRawDir } from '../lib/vault.mjs';
import { appendToBuffer, getUnflushedBytes, getUnflushedContent, markFlushed } from '../lib/buffer.mjs';
import { updateIndex } from '../lib/index-manager.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join, basename } from 'path';

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
  } catch {}
  return { message: '', timestamp: '' };
}

async function main() {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dataDir) return;

  try {
    const config = loadConfig();
    if (!config) return;

    let data = '';
    process.stdin.setEncoding('utf-8');
    for await (const chunk of process.stdin) { data += chunk; }
    const input = parseHookInput(data);

    // Extract last user message from transcript
    let userMessage = '';
    let userTimestamp = '';
    if (input.transcript_path) {
      const userEntry = getLastUserEntry(input.transcript_path);
      userMessage = userEntry.message;
      userTimestamp = userEntry.timestamp;
    }

    const now = new Date().toISOString();
    const date = formatDate(new Date());
    let lines = '';

    if (userMessage) {
      lines += JSON.stringify({
        type: 'user',
        message: sanitize(userMessage),
        session_id: input.session_id,
        cwd: input.cwd,
        timestamp: userTimestamp || now,
      }) + '\n';
    }

    if (input.last_assistant_message) {
      lines += JSON.stringify({
        type: 'assistant',
        message: sanitize(input.last_assistant_message),
        session_id: input.session_id,
        cwd: input.cwd,
        timestamp: now,
      }) + '\n';
    }

    if (lines) {
      // Append to local buffer
      appendToBuffer(dataDir, input.session_id, lines);

      // Update index
      const project = input.cwd ? basename(input.cwd) : 'unknown';
      updateIndex(dataDir, {
        sessionId: input.session_id,
        date,
        project,
        timestamp: now,
      });

      // Flush based on storage strategy (local: immediate, github: threshold)
      const storage = await createStorageAdapter(config);
      if (storage.shouldFlush(getUnflushedBytes(dataDir, input.session_id))) {
        const unflushed = getUnflushedContent(dataDir, input.session_id);
        if (unflushed) {
          const logPath = getRawLogPath(date, input.session_id);
          const dir = getRawDir(date);
          await storage.mkdir(dir);
          await storage.append(logPath, unflushed);
          markFlushed(dataDir, input.session_id);
        }
      }
    }

    // Save transcript path locally for git activity parsing at SessionStart
    if (input.transcript_path) {
      const metaDir = join(dataDir, 'session-meta', input.session_id);
      mkdirSync(metaDir, { recursive: true });
      writeFileSync(
        join(metaDir, 'meta.json'),
        JSON.stringify({ transcript_path: input.transcript_path, session_id: input.session_id }),
      );
    }
  } catch (err) {
    try {
      const logPath = join(dataDir, 'error.log');
      mkdirSync(dirname(logPath), { recursive: true });
      writeFileSync(logPath, `${new Date().toISOString()} on-stop: ${err.message}\n${err.stack}\n`, { flag: 'a' });
    } catch {}
  }
}
main();
