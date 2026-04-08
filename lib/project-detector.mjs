// @ts-check
import { execSync } from 'child_process';
import { basename } from 'path';

/**
 * Extract "owner/repo" from a git remote URL.
 * Supports both HTTPS and SSH formats.
 * @param {string} url
 * @returns {string | null}
 */
function parseRemoteUrl(url) {
  // SSH: git@github.com:owner/repo.git
  const sshMatch = url.match(/:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];
  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = url.match(/\/([^/]+\/[^/]+?)(?:\.git)?$/);
  if (httpsMatch) return httpsMatch[1];
  return null;
}

/**
 * Detect project name from a working directory.
 * Uses git remote origin if available, falls back to basename.
 * @param {string | undefined} cwd
 * @returns {string}
 */
export function detectProject(cwd) {
  if (!cwd) return 'unknown';
  try {
    const remote = execSync('git remote get-url origin', {
      cwd,
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const parsed = parseRemoteUrl(remote);
    if (parsed) return parsed;
  } catch {}
  return basename(cwd);
}
