#!/usr/bin/env node
// @ts-check
import { loadConfig, createStorageAdapter } from '../lib/config.mjs';
import { listUnflushedSessions, getUnflushedContent, markFlushed, cleanupBuffer } from '../lib/buffer.mjs';
import { parseGitActivity } from '../lib/git-parser.mjs';
import { appendGitLogs } from '../lib/raw-logger.mjs';
import { formatDate } from '../lib/periods.mjs';
import { getRawLogPath, getRawDir } from '../lib/vault.mjs';
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';

const REVIEW_REMIND_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks

async function main() {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dataDir) return;

  try {
    const config = loadConfig();
    if (!config) return;

    let data = '';
    process.stdin.setEncoding('utf-8');
    for await (const chunk of process.stdin) { data += chunk; }

    let currentSessionId = '';
    try {
      const input = JSON.parse(data);
      currentSessionId = input.session_id || '';
    } catch {}

    const storage = await createStorageAdapter(config);

    // 1. Flush unflushed buffers from other sessions
    const unflushedSessions = listUnflushedSessions(dataDir, currentSessionId);
    for (const sessionId of unflushedSessions) {
      const unflushed = getUnflushedContent(dataDir, sessionId);
      if (!unflushed) continue;

      const byDate = {};
      for (const line of unflushed.trim().split('\n')) {
        try {
          const entry = JSON.parse(line);
          const date = entry.timestamp ? formatDate(new Date(entry.timestamp)) : formatDate(new Date());
          if (!byDate[date]) byDate[date] = '';
          byDate[date] += line + '\n';
        } catch { continue; }
      }

      for (const [date, lines] of Object.entries(byDate)) {
        const dir = getRawDir(date);
        await storage.mkdir(dir);
        const logPath = getRawLogPath(date, sessionId);
        await storage.append(logPath, lines);
      }

      markFlushed(dataDir, sessionId);

      // 2. Parse git activity from the session's transcript
      const metaPath = join(dataDir, 'session-meta', sessionId, 'meta.json');
      if (existsSync(metaPath)) {
        try {
          const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
          if (meta.transcript_path && existsSync(meta.transcript_path)) {
            const gitEntries = parseGitActivity(meta.transcript_path);
            if (gitEntries.length > 0) {
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

              let ghAccount = '';
              try {
                const status = execSync('gh auth status 2>&1', { encoding: 'utf-8', timeout: 5000 });
                const match = status.match(/Logged in to github\.com account (\S+)/);
                if (match) ghAccount = match[1];
              } catch {}

              const gitDate = gitEntries[0]?.timestamp ? formatDate(new Date(gitEntries[0].timestamp)) : formatDate(new Date());
              await appendGitLogs(storage, gitDate, gitEntries, sessionId, ghAccount);
            }
          }
        } catch {}
      }

      // Clean up session meta
      const sessionMetaDir = join(dataDir, 'session-meta', sessionId);
      try { rmSync(sessionMetaDir, { recursive: true, force: true }); } catch {}
    }

    // 3. Review reminder (2+ weeks since last generation)
    try {
      const lastGenPath = join(dataDir, 'last-generated.json');
      if (existsSync(lastGenPath)) {
        const lastGen = JSON.parse(readFileSync(lastGenPath, 'utf-8'));
        if (lastGen.timestamp) {
          const elapsed = Date.now() - new Date(lastGen.timestamp).getTime();
          if (elapsed > REVIEW_REMIND_MS) {
            const msg = '2주 이상 회고가 생성되지 않았습니다. /generate 로 회고를 작성해보세요.';
            process.stdout.write(JSON.stringify({
              hookSpecificOutput: {
                hookEventName: 'SessionStart',
                additionalContext: `<important-reminder>IN YOUR FIRST REPLY YOU MUST TELL THE USER: ${msg}</important-reminder>`,
              },
            }) + '\n');
          }
        }
      }
    } catch {}

  } catch (err) {
    try {
      const logPath = join(dataDir, 'error.log');
      mkdirSync(dirname(logPath), { recursive: true });
      writeFileSync(logPath, `${new Date().toISOString()} session-start: ${err.message}\n${err.stack}\n`, { flag: 'a' });
    } catch {}
    try {
      const { buildIssueUrl } = await import('../lib/issue-url.mjs');
      const issueUrl = buildIssueUrl({ context: 'on-session-start', error: err });
      process.stdout.write(`daily-review 플러그인 오류가 발생했습니다. 이슈로 보고하려면: ${issueUrl}\n`);
    } catch {}
  }
}
main();
