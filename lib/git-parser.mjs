// @ts-check
/** @typedef {import('./types.d.ts').GitEntry} GitEntry */

import { readFileSync } from 'fs';

/** @param {string} content @returns {Array<GitEntry>} */
function extractGitEntries(content) {
  const lines = content.trim().split('\n');

  /** @type {Map<string, {command: string, cwd: string, timestamp: string}>} */
  const gitToolUses = new Map();
  /** @type {Array<GitEntry>} */
  const entries = [];

  for (const line of lines) {
    let parsed;
    try { parsed = JSON.parse(line); } catch { continue; }
    if (parsed.type !== 'assistant' || !parsed.message?.content) continue;

    const contents = Array.isArray(parsed.message.content) ? parsed.message.content : [];
    const timestamp = parsed.timestamp || '';
    const cwd = parsed.cwd || '';

    for (const block of contents) {
      if (block.type === 'tool_use' && block.name === 'Bash' && block.input?.command) {
        const cmd = block.input.command;
        if (/\bgit\s+commit\b/.test(cmd)) {
          gitToolUses.set(block.id, { command: cmd, cwd, timestamp });
        }
      }

      if (block.type === 'tool_result' && block.tool_use_id && gitToolUses.has(block.tool_use_id)) {
        if (block.is_error) continue;
        const toolUse = /** @type {{command: string, cwd: string, timestamp: string}} */ (gitToolUses.get(block.tool_use_id));
        const output = typeof block.content === 'string' ? block.content : '';
        if (!output) continue;

        const commitInfo = parseCommitOutput(output);
        if (commitInfo) {
          entries.push({
            action: 'commit',
            hash: commitInfo.hash,
            branch: commitInfo.branch,
            message: commitInfo.message,
            cwd: cwd || toolUse.cwd,
            timestamp: timestamp || toolUse.timestamp,
          });
        }
      }
    }
  }

  return entries;
}

/**
 * Parse git commit output: "[branch hash] message"
 * @param {string} output
 * @returns {{hash: string, branch: string, message: string} | null}
 */
function parseCommitOutput(output) {
  // Matches: [main abc1234] commit message
  // Also: [main (root-commit) abc1234] first commit
  const match = output.match(/\[([^\s\]]+)(?:\s+\([^)]+\))?\s+([a-f0-9]+)\]\s+(.+)/);
  if (!match) return null;
  return { branch: match[1], hash: match[2], message: match[3].trim() };
}

/**
 * Parse transcript file for git commit activity.
 * @param {string} transcriptPath
 * @returns {Array<GitEntry>}
 */
export function parseGitActivity(transcriptPath) {
  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    return extractGitEntries(content);
  } catch { return []; }
}
