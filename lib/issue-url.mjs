// @ts-check
import { sanitize } from './sanitizer.mjs';
import { readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = 'giwonn/claude-daily-review';
const MAX_URL_LENGTH = 8192;

/**
 * @returns {string}
 */
function getPluginVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * @param {{ version: string, platform: string, nodeVersion: string, context: string, message: string, stack: string }} opts
 * @returns {string}
 */
function buildBody({ version, platform, nodeVersion, context, message, stack }) {
  return `## 환경
- Plugin: v${version}
- OS: ${platform}
- Node: ${nodeVersion}

## 에러
- 위치: ${context}
- 메시지: ${message}

<details>
<summary>Stack Trace</summary>

\`\`\`
${stack}
\`\`\`

</details>

## 재현 방법
<!-- 어떤 상황에서 이 에러가 발생했는지 알려주세요 -->
1.
`;
}

/**
 * @param {{ title: string, body: string, labels: string }} p
 * @returns {string}
 */
function buildQuery(p) {
  return `title=${encodeURIComponent(p.title)}&body=${encodeURIComponent(p.body)}&labels=${encodeURIComponent(p.labels)}`;
}

/**
 * @param {{ context: string, error: Error }} opts
 * @returns {string}
 */
export function buildIssueUrl({ context, error }) {
  const version = getPluginVersion();
  const platform = `${process.platform} ${process.arch}`;
  const nodeVersion = process.version;

  const sanitizedMessage = sanitize(error.message || 'Unknown error');
  const sanitizedStack = error.stack ? sanitize(error.stack) : '';

  const title = `[Bug] ${context}: ${sanitizedMessage.slice(0, 80)}`;
  const env = { version, platform, nodeVersion, context };

  const body = buildBody({ ...env, message: sanitizedMessage, stack: sanitizedStack });
  let url = `https://github.com/${REPO}/issues/new?${buildQuery({ title, body, labels: 'bug' })}`;

  if (url.length > MAX_URL_LENGTH) {
    const truncatedBody = buildBody({
      ...env,
      message: sanitizedMessage.slice(0, 200),
      stack: sanitizedStack.slice(0, 500) + '\n... (truncated)',
    });
    url = `https://github.com/${REPO}/issues/new?${buildQuery({ title, body: truncatedBody, labels: 'bug' })}`;
  }

  // 최종 안전장치: percent-encoding 후에도 길이 초과 시 hard cutoff
  if (url.length > MAX_URL_LENGTH) {
    url = url.slice(0, MAX_URL_LENGTH);
  }

  return url;
}

// CLI entrypoint: node issue-url.mjs --context <ctx> --message <msg> --stack <stack>
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : '';
  };
  const context = getArg('context') || 'unknown';
  const message = getArg('message') || 'Unknown error';
  const stack = getArg('stack') || '';
  const err = new Error(message);
  err.stack = stack || `Error: ${message}`;
  console.log(buildIssueUrl({ context, error: err }));
}
