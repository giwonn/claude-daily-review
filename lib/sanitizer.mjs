// @ts-check

/**
 * Layer 1: Known service API key patterns.
 * Each entry: [RegExp, replacement tag]
 * @type {Array<[RegExp, string]>}
 */
const KNOWN_KEY_PATTERNS = [
  [/sk-proj-[A-Za-z0-9_-]{20,}/g, '[REDACTED:openai_key]'],
  [/sk-ant-[A-Za-z0-9_-]{20,}/g, '[REDACTED:anthropic_key]'],
  [/gh[pous]_[A-Za-z0-9]{36,}/g, '[REDACTED:github_token]'],
  [/[sr]k_(live|test)_[A-Za-z0-9]{20,}/g, '[REDACTED:stripe_key]'],
  [/sk-[A-Za-z0-9]{40,}/g, '[REDACTED:openai_key]'],
  [/AKIA[0-9A-Z]{16}/g, '[REDACTED:aws_key]'],
  [/(?:aws_secret_access_key|secret_key)\s*[=:]\s*[A-Za-z0-9/+=]{40}/gi, '[REDACTED:aws_secret]'],
  [/xox[bpra]-[A-Za-z0-9-]{10,}/g, '[REDACTED:slack_token]'],
  [/AIza[0-9A-Za-z_-]{35}/g, '[REDACTED:google_api_key]'],
  [/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{50,}/g, '[REDACTED:supabase_key]'],
  [/vercel_[A-Za-z0-9_-]{20,}/g, '[REDACTED:vercel_token]'],
  [/npm_[A-Za-z0-9]{36,}/g, '[REDACTED:npm_token]'],
  [/SG\.[A-Za-z0-9_-]{22,}\.[A-Za-z0-9_-]{43,}/g, '[REDACTED:sendgrid_key]'],
  [/SK[0-9a-fA-F]{32}/g, '[REDACTED:twilio_key]'],
];

/**
 * Layer 2: Structural secret patterns.
 * Each entry: [RegExp, replacement tag]
 * @type {Array<[RegExp, string]>}
 */
const STRUCTURAL_PATTERNS = [
  [/-----BEGIN [\w\s]*PRIVATE KEY-----[\s\S]*?-----END [\w\s]*PRIVATE KEY-----/g, '[REDACTED:private_key]'],
  [/(postgres|mysql|mongodb(?:\+srv)?|redis|amqp|mssql):\/\/[^\s"']+/g, '[REDACTED:connection_string]'],
  [/Bearer\s+[A-Za-z0-9_.-]{20,}/g, '[REDACTED:bearer_token]'],
  [/Authorization:\s*(?!Bearer\s)\S+\s+\S{20,}/gi, '[REDACTED:auth_header]'],
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_.-]+/g, '[REDACTED:jwt]'],
];

/**
 * Layer 3: Key=Value secret patterns.
 */
const SECRET_KEY_NAMES = /(?:password|passwd|pwd|secret_key|secret_token|token|api_key|apikey|api-key|access_key|access_token|private_key|client_secret|auth_token|refresh_token|database_url|db_password|encryption_key|signing_key|master_key)/i;

const ENV_LINE = /^[A-Z_]{3,}=\S+$/;

/**
 * Redact key=value secrets and .env blocks.
 * @param {string} text
 * @returns {string}
 */
function redactKeyValueSecrets(text) {
  const lines = text.split('\n');
  const redactedByBlock = new Array(lines.length).fill(false);

  // Pass 1: Find .env blocks (3+ consecutive KEY=value lines)
  let blockStart = -1;
  for (let i = 0; i <= lines.length; i++) {
    const isEnvLine = i < lines.length && ENV_LINE.test(lines[i].trim());
    if (isEnvLine) {
      if (blockStart === -1) blockStart = i;
    } else {
      if (blockStart !== -1) {
        const blockLen = i - blockStart;
        if (blockLen >= 3) {
          const replacement = `[REDACTED:env_block - ${blockLen}개 환경변수]`;
          lines[blockStart] = replacement;
          for (let j = blockStart + 1; j < i; j++) {
            lines[j] = null;
          }
          for (let j = blockStart; j < i; j++) {
            redactedByBlock[j] = true;
          }
        }
      }
      blockStart = -1;
    }
  }

  // Pass 2: Individual key=value redaction (skip lines already in env blocks)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === null || redactedByBlock[i]) continue;
    lines[i] = lines[i].replace(
      new RegExp(`(${SECRET_KEY_NAMES.source})(\\s*[=:]\\s*)(.+)`, 'gi'),
      (match, keyName, separator, value) => {
        // Don't re-redact values already processed by Layer 1/2
        if (value.startsWith('[REDACTED:')) return match;
        return `${keyName}${separator}[REDACTED:secret_value]`;
      }
    );
  }

  return lines.filter(l => l !== null).join('\n');
}

/**
 * Check if a string has high entropy (diverse character classes, no dominant character).
 * @param {string} str
 * @returns {boolean}
 */
function isHighEntropy(str) {
  let hasUpper = false, hasLower = false, hasDigit = false, hasSpecial = false;
  const freq = new Map();

  for (const ch of str) {
    freq.set(ch, (freq.get(ch) || 0) + 1);
    if (/[A-Z]/.test(ch)) hasUpper = true;
    else if (/[a-z]/.test(ch)) hasLower = true;
    else if (/[0-9]/.test(ch)) hasDigit = true;
    else hasSpecial = true;
  }

  const classCount = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;
  if (classCount < 3) return false;

  // Low unique character ratio indicates repeated patterns, not secrets
  if (freq.size / str.length < 0.2) return false;

  for (const count of freq.values()) {
    if (count / str.length > 0.3) return false;
  }

  return true;
}

const HIGH_ENTROPY_RE = /[A-Za-z0-9+/=_-]{32,}/g;

/**
 * Redact high-entropy strings that may be secrets.
 * @param {string} text
 * @returns {string}
 */
function redactHighEntropy(text) {
  HIGH_ENTROPY_RE.lastIndex = 0;
  return text.replace(HIGH_ENTROPY_RE, (match, offset) => {
    if (match.includes('REDACTED')) return match;

    // Skip file paths
    const before = text.slice(Math.max(0, offset - 5), offset);
    if (/[A-Za-z]:\\/.test(before + match.slice(0, 3))) return match;
    if (/\//.test(before) && match.includes('/')) return match;

    // Skip URLs
    if (/https?:\/\//.test(text.slice(Math.max(0, offset - 10), offset + 10))) return match;
    if (match.split('/').length > 2) return match;

    // Skip purely alphabetical strings
    if (/^[a-zA-Z]+$/.test(match)) return match;

    if (!isHighEntropy(match)) return match;

    return '[REDACTED:high_entropy_string]';
  });
}

/**
 * Sanitize text by redacting known secret patterns.
 * Pure function — no config dependency. Caller checks redactSecrets setting.
 * @param {string} text
 * @returns {string}
 */
export function sanitize(text) {
  if (!text) return text;
  let result = text;

  // Layer 1: Known service key patterns
  for (const [pattern, tag] of KNOWN_KEY_PATTERNS) {
    // Reset lastIndex to avoid stateful regex issues with the g flag
    pattern.lastIndex = 0;
    result = result.replace(pattern, tag);
  }

  // Layer 2: Structural secret patterns
  for (const [pattern, tag] of STRUCTURAL_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, tag);
  }

  // Layer 3: Key=Value secrets
  result = redactKeyValueSecrets(result);

  // Layer 4: High-entropy strings
  result = redactHighEntropy(result);

  return result;
}
