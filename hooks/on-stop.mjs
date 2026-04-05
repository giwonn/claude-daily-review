#!/usr/bin/env node
// @ts-check
import { loadConfig, createStorageAdapter } from '../lib/config.mjs';
import { parseHookInput, appendRawLog, appendGitLogs } from '../lib/raw-logger.mjs';
import { parseGitActivity } from '../lib/git-parser.mjs';
import { formatDate } from '../lib/periods.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
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

    const date = formatDate(new Date());
    await appendRawLog(storage, date, input);

    // Extract and save git activity from transcript
    if (input.transcript_path) {
      const gitEntries = parseGitActivity(input.transcript_path);
      if (gitEntries.length > 0) {
        // Resolve remote URL for each unique cwd
        /** @type {Map<string, string>} */
        const remoteByDir = new Map();
        for (const entry of gitEntries) {
          if (!entry.cwd || remoteByDir.has(entry.cwd)) continue;
          try {
            const remote = execSync('git remote get-url origin', { cwd: entry.cwd, encoding: 'utf-8', timeout: 5000 }).trim();
            remoteByDir.set(entry.cwd, remote);
          } catch { remoteByDir.set(entry.cwd, ''); }
        }
        for (const entry of gitEntries) {
          entry.remote = remoteByDir.get(entry.cwd) || '';
        }

        // Get current gh account
        let ghAccount = '';
        try {
          const status = execSync('gh auth status 2>&1', { encoding: 'utf-8', timeout: 5000 });
          const match = status.match(/Logged in to github\.com account (\S+)/);
          if (match) ghAccount = match[1];
        } catch { /* gh not available or not logged in */ }

        await appendGitLogs(storage, date, gitEntries, input.session_id, ghAccount);
      }
    }

    // Save transcript path locally for session recovery (not to remote storage)
    if (input.transcript_path) {
      const dataDir = process.env.CLAUDE_PLUGIN_DATA;
      if (dataDir) {
        const metaDir = join(dataDir, 'session-meta', input.session_id);
        mkdirSync(metaDir, { recursive: true });
        writeFileSync(join(metaDir, 'meta.json'), JSON.stringify({ transcript_path: input.transcript_path, session_id: input.session_id }));
      }
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
