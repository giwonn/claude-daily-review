# Secret Redaction & Security Disclosure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대화 로그 저장 시 API 키, 토큰, 비밀번호 등 시크릿을 자동 마스킹하고, README에 보안 고지를 추가한다.

**Architecture:** 새 모듈 `lib/sanitizer.mjs`가 4개의 탐지 레이어(알려진 키 패턴, 구조적 시크릿, key=value, 고엔트로피)를 순차 적용하여 시크릿을 `[REDACTED:tag]` 형식으로 대체한다. `raw-logger.mjs`와 `recover-sessions.mjs`에서 저장 전에 호출한다.

**Tech Stack:** Node.js ESM, `node:test` (built-in test runner), 외부 의존성 없음

**Spec:** `docs/superpowers/specs/2026-03-30-secret-redaction-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/sanitizer.mjs` | Create | 4-layer 시크릿 탐지 및 마스킹 순수 함수 |
| `lib/sanitizer.test.mjs` | Create | sanitizer 단위 테스트 (node:test) |
| `lib/types.d.ts` | Modify | `PrivacyConfig` 타입 추가, `Config`에 `privacy?` 필드 추가 |
| `lib/config.mjs` | Modify | default config 생성자에 `privacy` 추가 |
| `lib/raw-logger.mjs` | Modify | `appendRawLog`에서 sanitize 호출 |
| `hooks/recover-sessions.mjs` | Modify | 복구 시 sanitize 호출 |
| `commands/daily-review-setup.md` | Modify | 기존 레포 public 체크 + 경고 추가 |
| `README.md` | Modify | Security & Privacy 섹션 추가 |
| `README.ko.md` | Modify | 보안 및 개인정보 섹션 추가 |

---

### Task 1: sanitizer Layer 1 — Known Service Key Patterns

**Files:**
- Create: `lib/sanitizer.mjs`
- Create: `lib/sanitizer.test.mjs`

- [ ] **Step 1: Write failing tests for Layer 1**

```js
// lib/sanitizer.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitize } from './sanitizer.mjs';

describe('Layer 1: Known Service Key Patterns', () => {
  it('redacts OpenAI API key', () => {
    const input = 'my key is sk-proj-abc123def456ghi789jkl012mno';
    const result = sanitize(input);
    assert.ok(!result.includes('sk-proj-'));
    assert.ok(result.includes('[REDACTED:openai_key]'));
  });

  it('redacts OpenAI legacy key', () => {
    const input = 'sk-' + 'a'.repeat(48);
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:openai_key]'));
  });

  it('redacts Anthropic API key', () => {
    const input = 'key: sk-ant-api03-abcdef123456789012345678901234567890';
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:anthropic_key]'));
  });

  it('redacts GitHub PAT', () => {
    const input = 'token: ghp_' + 'A'.repeat(36);
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:github_token]'));
  });

  it('redacts GitHub OAuth token', () => {
    const input = 'gho_' + 'B'.repeat(36);
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:github_token]'));
  });

  it('redacts AWS access key', () => {
    const input = 'aws_access_key_id: AKIAIOSFODNN7EXAMPLE';
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:aws_key]'));
  });

  it('redacts Slack token', () => {
    const input = 'SLACK_TOKEN=' + 'xoxb' + '-1234-5678901234-abcdefghij';
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:slack_token]'));
  });

  it('redacts Stripe key', () => {
    const input = 'sk_' + 'live' + '_' + 'a'.repeat(24);
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:stripe_key]'));
  });

  it('redacts Google API key', () => {
    const input = 'AIzaSyA-abcdefghijklmnopqrstuvwxyz12345';
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:google_api_key]'));
  });

  it('redacts Vercel token', () => {
    const input = 'vercel_abcdefghij1234567890ab';
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:vercel_token]'));
  });

  it('redacts npm token', () => {
    const input = 'npm_' + 'a'.repeat(36);
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:npm_token]'));
  });

  it('redacts SendGrid key', () => {
    const input = 'SG.' + 'a'.repeat(22) + '.' + 'b'.repeat(43);
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:sendgrid_key]'));
  });

  it('redacts Twilio key', () => {
    const input = 'SK' + '0a1b2c3d'.repeat(4);
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:twilio_key]'));
  });

  it('does not redact normal text', () => {
    const input = 'This is a normal message about skating and skills.';
    const result = sanitize(input);
    assert.equal(result, input);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test lib/sanitizer.test.mjs`
Expected: FAIL — `Cannot find module './sanitizer.mjs'`

- [ ] **Step 3: Implement Layer 1 in sanitizer**

```js
// lib/sanitizer.mjs
// @ts-check

/**
 * Layer 1: Known service API key patterns.
 * Each entry: [RegExp, replacement tag]
 * @type {Array<[RegExp, string]>}
 */
const KNOWN_KEY_PATTERNS = [
  [/sk-proj-[A-Za-z0-9_-]{20,}/g, '[REDACTED:openai_key]'],
  [/sk-[A-Za-z0-9]{40,}/g, '[REDACTED:openai_key]'],
  [/sk-ant-[A-Za-z0-9_-]{20,}/g, '[REDACTED:anthropic_key]'],
  [/gh[pous]_[A-Za-z0-9]{36,}/g, '[REDACTED:github_token]'],
  [/AKIA[0-9A-Z]{16}/g, '[REDACTED:aws_key]'],
  [/(?:aws_secret_access_key|secret_key)\s*[=:]\s*[A-Za-z0-9/+=]{40}/gi, '[REDACTED:aws_secret]'],
  [/xox[bpra]-[A-Za-z0-9-]{10,}/g, '[REDACTED:slack_token]'],
  [/[sr]k_(live|test)_[A-Za-z0-9]{20,}/g, '[REDACTED:stripe_key]'],
  [/AIza[0-9A-Za-z_-]{35}/g, '[REDACTED:google_api_key]'],
  [/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{50,}/g, '[REDACTED:supabase_key]'],
  [/vercel_[A-Za-z0-9_-]{20,}/g, '[REDACTED:vercel_token]'],
  [/npm_[A-Za-z0-9]{36,}/g, '[REDACTED:npm_token]'],
  [/SG\.[A-Za-z0-9_-]{22,}\.[A-Za-z0-9_-]{43,}/g, '[REDACTED:sendgrid_key]'],
  [/SK[0-9a-fA-F]{32}/g, '[REDACTED:twilio_key]'],
];

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
    result = result.replace(pattern, tag);
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test lib/sanitizer.test.mjs`
Expected: All 14 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/sanitizer.mjs lib/sanitizer.test.mjs
git commit -m "feat: add sanitizer Layer 1 — known service key patterns"
```

---

### Task 2: sanitizer Layer 2 — Structural Secret Patterns

**Files:**
- Modify: `lib/sanitizer.mjs`
- Modify: `lib/sanitizer.test.mjs`

- [ ] **Step 1: Write failing tests for Layer 2**

Append to `lib/sanitizer.test.mjs`:

```js
describe('Layer 2: Structural Secret Patterns', () => {
  it('redacts PEM private key', () => {
    const input = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIB...\n-----END RSA PRIVATE KEY-----';
    const result = sanitize(input);
    assert.ok(!result.includes('MIIEpAIB'));
    assert.ok(result.includes('[REDACTED:private_key]'));
  });

  it('redacts EC private key', () => {
    const input = '-----BEGIN EC PRIVATE KEY-----\ndata\n-----END EC PRIVATE KEY-----';
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:private_key]'));
  });

  it('redacts postgres connection string', () => {
    const input = 'DB_URL: postgres://admin:p@ssw0rd@db.internal.com:5432/mydb';
    const result = sanitize(input);
    assert.ok(!result.includes('p@ssw0rd'));
    assert.ok(result.includes('[REDACTED:connection_string]'));
  });

  it('redacts mongodb+srv connection string', () => {
    const input = 'mongodb+srv://user:pass@cluster0.abc123.mongodb.net/db';
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:connection_string]'));
  });

  it('redacts mysql connection string', () => {
    const input = 'mysql://root:secret@localhost:3306/app';
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:connection_string]'));
  });

  it('redacts redis connection string', () => {
    const input = 'redis://default:mypassword@redis.example.com:6379';
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:connection_string]'));
  });

  it('redacts Bearer token', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9abc123';
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:bearer_token]'));
  });

  it('redacts generic Authorization header', () => {
    const input = 'Authorization: Basic dXNlcjpwYXNzd29yZDEyMzQ1';
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:auth_header]'));
  });

  it('redacts JWT token', () => {
    const input = 'token: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiYWRtaW4iOnRydWV9.signature123abc';
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:jwt]'));
  });

  it('does not redact normal URLs', () => {
    const input = 'Visit https://example.com/docs for more info';
    const result = sanitize(input);
    assert.equal(result, input);
  });
});
```

- [ ] **Step 2: Run tests to verify Layer 2 tests fail**

Run: `node --test lib/sanitizer.test.mjs`
Expected: Layer 2 tests FAIL (no redaction yet), Layer 1 tests still PASS

- [ ] **Step 3: Implement Layer 2**

Add to `lib/sanitizer.mjs` — add patterns array after KNOWN_KEY_PATTERNS:

```js
/**
 * Layer 2: Structural secret patterns.
 * @type {Array<[RegExp, string]>}
 */
const STRUCTURAL_PATTERNS = [
  [/-----BEGIN [\w\s]*PRIVATE KEY-----[\s\S]*?-----END [\w\s]*PRIVATE KEY-----/g, '[REDACTED:private_key]'],
  [/(postgres|mysql|mongodb(?:\+srv)?|redis|amqp|mssql):\/\/[^\s"']+/g, '[REDACTED:connection_string]'],
  [/Bearer\s+[A-Za-z0-9_.-]{20,}/g, '[REDACTED:bearer_token]'],
  [/Authorization:\s*\S{20,}/gi, '[REDACTED:auth_header]'],
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_.-]+/g, '[REDACTED:jwt]'],
];
```

Update the `sanitize` function to apply Layer 2 after Layer 1:

```js
  // Layer 2: Structural secret patterns
  for (const [pattern, tag] of STRUCTURAL_PATTERNS) {
    result = result.replace(pattern, tag);
  }
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `node --test lib/sanitizer.test.mjs`
Expected: All Layer 1 + Layer 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/sanitizer.mjs lib/sanitizer.test.mjs
git commit -m "feat: add sanitizer Layer 2 — structural secret patterns"
```

---

### Task 3: sanitizer Layer 3 — Key=Value Secrets

**Files:**
- Modify: `lib/sanitizer.mjs`
- Modify: `lib/sanitizer.test.mjs`

- [ ] **Step 1: Write failing tests for Layer 3**

Append to `lib/sanitizer.test.mjs`:

```js
describe('Layer 3: Key=Value Secrets', () => {
  it('redacts password=value keeping key name', () => {
    const input = 'password=mysecretpassword123';
    const result = sanitize(input);
    assert.equal(result, 'password=[REDACTED:secret_value]');
  });

  it('redacts PASSWORD: value (case insensitive)', () => {
    const input = 'PASSWORD: hunter2';
    const result = sanitize(input);
    assert.equal(result, 'PASSWORD: [REDACTED:secret_value]');
  });

  it('redacts api_key=value', () => {
    const input = 'api_key=abc123xyz';
    const result = sanitize(input);
    assert.equal(result, 'api_key=[REDACTED:secret_value]');
  });

  it('redacts client_secret: value', () => {
    const input = 'client_secret: my-super-secret';
    const result = sanitize(input);
    assert.equal(result, 'client_secret: [REDACTED:secret_value]');
  });

  it('redacts database_url=value', () => {
    const input = 'database_url=sqlite:///app.db';
    const result = sanitize(input);
    assert.equal(result, 'database_url=[REDACTED:secret_value]');
  });

  it('redacts .env block (3+ consecutive KEY=value lines)', () => {
    const input = 'DATABASE_URL=postgres://host/db\nSECRET_KEY=abc123\nAPI_TOKEN=xyz789\nPORT=3000';
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:env_block'));
    assert.ok(result.includes('4개'));
    assert.ok(!result.includes('abc123'));
  });

  it('does not treat 2 consecutive lines as env block', () => {
    const input = 'NODE_ENV=production\nPORT=3000';
    const result = sanitize(input);
    assert.ok(!result.includes('env_block'));
    // individual key=value check — these aren't secret key names so should pass through
    assert.ok(result.includes('NODE_ENV=production'));
  });

  it('env block takes priority over individual key=value', () => {
    const input = 'PASSWORD=secret\nAPI_KEY=abc123\nTOKEN=xyz\nSECRET=test';
    const result = sanitize(input);
    // Should be one env_block, not 4 individual redactions
    assert.ok(result.includes('[REDACTED:env_block'));
    assert.ok(!result.includes('[REDACTED:secret_value]'));
  });

  it('does not redact normal key=value that is not secret-named', () => {
    const input = 'name=John\nage=30';
    const result = sanitize(input);
    assert.equal(result, input);
  });
});
```

- [ ] **Step 2: Run tests to verify Layer 3 tests fail**

Run: `node --test lib/sanitizer.test.mjs`
Expected: Layer 3 tests FAIL, Layer 1+2 still PASS

- [ ] **Step 3: Implement Layer 3**

Add to `lib/sanitizer.mjs`:

```js
/**
 * Layer 3 secret key names — case insensitive match.
 */
const SECRET_KEY_NAMES = /\b(password|passwd|pwd|secret|token|api_key|apikey|api-key|access_key|access_token|private_key|client_secret|auth_token|refresh_token|database_url|db_password|encryption_key|signing_key|master_key)/i;

/**
 * Layer 3: .env block pattern — 3+ consecutive lines matching KEY=value.
 */
const ENV_LINE = /^[A-Z_]{3,}=\S+$/;

/**
 * Apply Layer 3: Key=Value secret redaction.
 * .env blocks (3+ consecutive KEY=value lines) take priority.
 * @param {string} text
 * @returns {string}
 */
function redactKeyValueSecrets(text) {
  const lines = text.split('\n');
  /** @type {boolean[]} */
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
            lines[j] = null; // mark for removal
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
      new RegExp(`(${SECRET_KEY_NAMES.source})\\s*([=:])\\s*(\\S+)`, 'gi'),
      (_, keyName, sep, _value) => `${keyName}${sep}${sep === ':' ? ' ' : ''}[REDACTED:secret_value]`
    );
  }

  return lines.filter(l => l !== null).join('\n');
}
```

Update the `sanitize` function to apply Layer 3:

```js
  // Layer 3: Key=Value secrets (.env blocks, then individual key=value)
  result = redactKeyValueSecrets(result);
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `node --test lib/sanitizer.test.mjs`
Expected: All Layer 1 + 2 + 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/sanitizer.mjs lib/sanitizer.test.mjs
git commit -m "feat: add sanitizer Layer 3 — key=value and .env block detection"
```

---

### Task 4: sanitizer Layer 4 — High-Entropy Strings

**Files:**
- Modify: `lib/sanitizer.mjs`
- Modify: `lib/sanitizer.test.mjs`

- [ ] **Step 1: Write failing tests for Layer 4**

Append to `lib/sanitizer.test.mjs`:

```js
describe('Layer 4: High-Entropy Strings', () => {
  it('redacts a high-entropy 32+ char string', () => {
    const input = 'secret: aB3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW';
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:high_entropy_string]'));
  });

  it('does not redact a normal English word sequence', () => {
    const input = 'this is a longvariablenamethatismorethan32characters';
    const result = sanitize(input);
    // All lowercase letters only — should not be redacted
    assert.ok(!result.includes('[REDACTED'));
  });

  it('does not redact file paths', () => {
    const input = 'C:\\Users\\admin\\Documents\\projects\\myapp\\src\\components\\Header.tsx';
    const result = sanitize(input);
    assert.ok(!result.includes('[REDACTED'));
  });

  it('does not redact unix file paths', () => {
    const input = '/home/user/projects/myapp/src/components/Header.tsx';
    const result = sanitize(input);
    assert.ok(!result.includes('[REDACTED'));
  });

  it('does not redact URLs', () => {
    const input = 'https://api.example.com/v2/users/profiles/settings/notifications';
    const result = sanitize(input);
    assert.ok(!result.includes('[REDACTED'));
  });

  it('does not redact strings already caught by earlier layers', () => {
    // ghp_ token should be caught by Layer 1, not Layer 4
    const input = 'ghp_' + 'A'.repeat(36);
    const result = sanitize(input);
    assert.equal(result, '[REDACTED:github_token]');
    assert.ok(!result.includes('high_entropy'));
  });

  it('redacts base64-like secrets', () => {
    const input = 'key=dGhpcyBpcyBhIHNlY3JldCBrZXkgdGhhdCBzaG91bGQgYmUgcmVkYWN0ZWQ=';
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED'));
  });

  it('does not redact repeated character strings', () => {
    const input = 'aaaaaaaaAAAAAAAA0000000011111111bbbb';
    const result = sanitize(input);
    // High repetition — likely not a secret
    assert.ok(!result.includes('high_entropy'));
  });
});
```

- [ ] **Step 2: Run tests to verify Layer 4 tests fail**

Run: `node --test lib/sanitizer.test.mjs`
Expected: Layer 4 tests FAIL, Layer 1+2+3 still PASS

- [ ] **Step 3: Implement Layer 4**

Add to `lib/sanitizer.mjs`:

```js
/**
 * Check if a string has high entropy (likely a secret).
 * Requires 3+ character classes and no single char > 30% of total.
 * @param {string} str
 * @returns {boolean}
 */
function isHighEntropy(str) {
  let hasUpper = false, hasLower = false, hasDigit = false, hasSpecial = false;
  /** @type {Map<string, number>} */
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

  // Reject if any single character is > 30% of the string
  for (const count of freq.values()) {
    if (count / str.length > 0.3) return false;
  }

  return true;
}

/** Matches 32+ char alphanumeric-ish tokens */
const HIGH_ENTROPY_RE = /[A-Za-z0-9+/=_-]{32,}/g;

/**
 * Apply Layer 4: High-entropy string detection.
 * Skips file paths, URLs, and strings already redacted.
 * @param {string} text
 * @returns {string}
 */
function redactHighEntropy(text) {
  return text.replace(HIGH_ENTROPY_RE, (match, offset) => {
    // Skip if already redacted by earlier layers
    if (match.includes('REDACTED')) return match;

    // Skip file paths (C:\... or /home/... or /usr/...)
    const before = text.slice(Math.max(0, offset - 5), offset);
    if (/[A-Za-z]:\\/.test(before + match.slice(0, 3))) return match;
    if (/\//.test(before) && match.includes('/')) return match;

    // Skip URLs
    if (/https?:\/\//.test(text.slice(Math.max(0, offset - 10), offset + 10))) return match;
    if (match.split('/').length > 2) return match;

    // Skip if purely alphabetical (likely a variable or word)
    if (/^[a-zA-Z]+$/.test(match)) return match;

    // Entropy check
    if (!isHighEntropy(match)) return match;

    return '[REDACTED:high_entropy_string]';
  });
}
```

Update the `sanitize` function to apply Layer 4:

```js
  // Layer 4: High-entropy strings
  result = redactHighEntropy(result);
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `node --test lib/sanitizer.test.mjs`
Expected: All Layer 1 + 2 + 3 + 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/sanitizer.mjs lib/sanitizer.test.mjs
git commit -m "feat: add sanitizer Layer 4 — high-entropy string detection"
```

---

### Task 5: Integration Tests for sanitizer

**Files:**
- Modify: `lib/sanitizer.test.mjs`

- [ ] **Step 1: Write integration tests**

Append to `lib/sanitizer.test.mjs`:

```js
describe('Integration: mixed secrets in one message', () => {
  it('redacts multiple different secrets in a single message', () => {
    const input = [
      '이 API 키 sk-proj-abc123def456ghi789jkl012mno 로 접속하고',
      'DB는 postgres://admin:secret@db.company.com:5432/prod 이고',
      'password=hunter2 로 로그인해',
    ].join('\n');
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:openai_key]'));
    assert.ok(result.includes('[REDACTED:connection_string]'));
    assert.ok(result.includes('[REDACTED:secret_value]'));
    assert.ok(!result.includes('hunter2'));
    assert.ok(!result.includes('sk-proj-'));
    assert.ok(!result.includes('admin:secret'));
    // Non-secret text preserved
    assert.ok(result.includes('이 API 키'));
    assert.ok(result.includes('로 접속하고'));
    assert.ok(result.includes('로 로그인해'));
  });

  it('handles empty string', () => {
    assert.equal(sanitize(''), '');
  });

  it('handles null/undefined gracefully', () => {
    assert.equal(sanitize(null), null);
    assert.equal(sanitize(undefined), undefined);
  });

  it('preserves message with no secrets', () => {
    const input = 'React 컴포넌트에서 useState 훅을 사용하는 방법을 알려줘.\n상태 관리 패턴에 대해 고민하고 있어.';
    assert.equal(sanitize(input), input);
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `node --test lib/sanitizer.test.mjs`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add lib/sanitizer.test.mjs
git commit -m "test: add integration tests for sanitizer"
```

---

### Task 6: Config — PrivacyConfig type and defaults

**Files:**
- Modify: `lib/types.d.ts`
- Modify: `lib/config.mjs`

- [ ] **Step 1: Add PrivacyConfig to types.d.ts**

In `lib/types.d.ts`, add `PrivacyConfig` interface after `Profile` and update `Config`:

```ts
export interface PrivacyConfig {
  redactSecrets: boolean;
}
```

Update `Config` to add optional `privacy` field:

```ts
export interface Config {
  storage: StorageConfig;
  language: string;
  periods: Periods;
  profile: Profile;
  privacy?: PrivacyConfig;
}
```

- [ ] **Step 2: Update default config creators in config.mjs**

In `lib/config.mjs`, update `createDefaultLocalConfig`:

```js
/** @param {string} basePath @returns {Config} */
export function createDefaultLocalConfig(basePath) {
  return {
    storage: { type: 'local', local: { basePath } },
    language: 'ko',
    periods: { daily: true, weekly: true, monthly: true, quarterly: true, yearly: false },
    profile: { company: '', role: '', team: '', context: '' },
    privacy: { redactSecrets: true },
  };
}
```

Update `createDefaultGitHubConfig`:

```js
/** @param {string} owner @param {string} repo @param {string} token @returns {Config} */
export function createDefaultGitHubConfig(owner, repo, token) {
  return {
    storage: { type: 'github', github: { owner, repo, token, basePath: '' } },
    language: 'ko',
    periods: { daily: true, weekly: true, monthly: true, quarterly: true, yearly: false },
    profile: { company: '', role: '', team: '', context: '' },
    privacy: { redactSecrets: true },
  };
}
```

Also update `migrateOldConfig` to include privacy:

```js
function migrateOldConfig(old) {
  return {
    storage: {
      type: 'local',
      local: { basePath: join(old.vaultPath, old.reviewFolder) },
    },
    language: old.language,
    periods: old.periods,
    profile: old.profile,
    privacy: { redactSecrets: true },
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/types.d.ts lib/config.mjs
git commit -m "feat: add PrivacyConfig type and defaults for redactSecrets"
```

---

### Task 7: Integrate sanitizer into raw-logger.mjs

**Files:**
- Modify: `lib/raw-logger.mjs`

- [ ] **Step 1: Import sanitize and apply in appendRawLog**

At the top of `lib/raw-logger.mjs`, add import:

```js
import { sanitize } from './sanitizer.mjs';
```

Update `appendRawLog` to accept a `redact` boolean parameter and apply sanitize. Change the function signature:

```js
/** @param {StorageAdapter} storage @param {string} sessionDir @param {string} date @param {HookInput} entry @param {boolean} [redact=true] @returns {Promise<void>} */
export async function appendRawLog(storage, sessionDir, date, entry, redact = true) {
  await storage.mkdir(sessionDir);
  const logPath = `${sessionDir}/${date}.jsonl`;
  const now = new Date().toISOString();
  let lines = '';

  const userMsg = redact && entry.last_user_message ? sanitize(entry.last_user_message) : entry.last_user_message;
  const assistantMsg = redact && entry.last_assistant_message ? sanitize(entry.last_assistant_message) : entry.last_assistant_message;

  // User message row (with original question timestamp)
  if (userMsg) {
    lines += JSON.stringify({ type: 'user', message: userMsg, session_id: entry.session_id, cwd: entry.cwd, timestamp: entry.user_timestamp || now }) + '\n';
  }

  // Assistant message row (with response completion timestamp)
  if (assistantMsg) {
    lines += JSON.stringify({ type: 'assistant', message: assistantMsg, session_id: entry.session_id, cwd: entry.cwd, timestamp: now }) + '\n';
  }

  if (lines) {
    await storage.append(logPath, lines);
  }
}
```

- [ ] **Step 2: Update on-stop.mjs to pass redact flag**

In `hooks/on-stop.mjs`, update the `appendRawLog` call to pass the config-based redact flag:

```js
const redact = config.privacy?.redactSecrets ?? true;
await appendRawLog(storage, sessionDir, date, input, redact);
```

- [ ] **Step 3: Commit**

```bash
git add lib/raw-logger.mjs hooks/on-stop.mjs
git commit -m "feat: integrate sanitizer into raw-logger for secret redaction on save"
```

---

### Task 8: Integrate sanitizer into recover-sessions.mjs

**Files:**
- Modify: `hooks/recover-sessions.mjs`

- [ ] **Step 1: Import sanitize and apply during recovery**

At the top of `hooks/recover-sessions.mjs`, add import:

```js
import { sanitize } from '../lib/sanitizer.mjs';
```

In the `main()` function, after `const config = loadConfig();`, read the redact setting:

```js
const redact = config.privacy?.redactSecrets ?? true;
```

In the section that appends missing entries (around the `for (const [date, entries] of Object.entries(missingByDate))` loop), apply sanitize to each entry's message:

```js
      for (const [date, entries] of Object.entries(missingByDate)) {
        const logPath = `${sessionDir}/${date}.jsonl`;
        const lines = entries.map(e =>
          JSON.stringify({ type: e.type, message: redact ? sanitize(e.message) : e.message, session_id: sessionId, cwd: e.cwd, timestamp: e.timestamp })
        ).join('\n') + '\n';
        await storage.append(logPath, lines);
      }
```

- [ ] **Step 2: Commit**

```bash
git add hooks/recover-sessions.mjs
git commit -m "feat: integrate sanitizer into session recovery"
```

---

### Task 9: Setup flow — public repo warning

**Files:**
- Modify: `commands/daily-review-setup.md`

- [ ] **Step 1: Add public repo check to the setup command**

In `commands/daily-review-setup.md`, find the "기존 저장소 사용" section (under **1b. Select or create a repository**, the "Existing" bullet). After the user provides `owner/repo`, add a public repo check before proceeding:

Insert after `- **Existing:** Ask for the repository in \`owner/repo\` format. Parse into \`owner\` and \`repo\`.`:

```markdown
  After parsing owner/repo, check if the repository is public:
  ```bash
  MSYS_NO_PATHCONV=1 gh api "repos/{owner}/{repo}" --jq '.private'
  ```
  If the result is `false` (public repository), warn the user using AskUserQuestion:
  - question: "⚠️ 이 저장소는 **public**입니다. 대화 내용과 회고 파일이 인터넷에 공개됩니다. private 저장소 사용을 강력히 권장합니다."
  - options:
    1. label: "private으로 변경 후 계속", description: "저장소를 비공개로 변경합니다"
    2. label: "그대로 사용 (위험 인지)", description: "public 상태로 계속 진행합니다"
    3. label: "다른 저장소 선택", description: "다른 저장소를 지정합니다"

  - "private으로 변경 후 계속":
    ```bash
    MSYS_NO_PATHCONV=1 gh api "repos/{owner}/{repo}" -X PATCH -f private=true
    ```
    If successful: "저장소를 private으로 변경했습니다." and continue.
    If failed: "권한이 없어 변경할 수 없습니다. 저장소 관리자에게 요청하세요." and ask again.
  - "그대로 사용 (위험 인지)": continue with the public repo.
  - "다른 저장소 선택": go back to 1b repo selection.
```

- [ ] **Step 2: Commit**

```bash
git add commands/daily-review-setup.md
git commit -m "feat: warn when using public GitHub repo in setup"
```

---

### Task 10: README Security & Privacy sections

**Files:**
- Modify: `README.md`
- Modify: `README.ko.md`

- [ ] **Step 1: Add Security & Privacy section to English README**

In `README.md`, insert before the `## License` section:

```markdown
## Security & Privacy

### What Gets Collected

This plugin automatically captures and stores **all conversations** with Claude Code:
- Full user messages and AI responses
- Working directory paths and project names
- Git commit messages, branch names, and remote URLs

### Corporate / Organizational Use

When using this plugin for work, the following may be recorded:

- Source code and business logic descriptions
- Internal system/service names and architecture details
- Colleague names, client information, and project specifics
- Internal URLs, IP addresses, and infrastructure configurations

**You are solely responsible for managing this information.**
Please review your organization's security policies before use.

### Automatic Secret Redaction

Known secret patterns (API keys, tokens, passwords, etc.) are automatically redacted to `[REDACTED]` before storage. However, this is a best-effort mechanism and **does not guarantee complete protection of all sensitive data.**

### GitHub Storage

If storing reviews on GitHub, **always use a private repository.** Storing to a public repository exposes your conversations and reviews to the internet. Since secret redaction cannot cover all cases, keeping the repository private is the most fundamental security measure.
```

- [ ] **Step 2: Add 보안 및 개인정보 section to Korean README**

In `README.ko.md`, insert before the `## 라이선스` section:

```markdown
## 보안 및 개인정보

### 자동 수집되는 정보

이 플러그인은 Claude Code와의 **모든 대화 내용**을 자동으로 캡처하여 저장합니다:
- 사용자 메시지 및 AI 응답 전문
- 작업 디렉토리 경로 및 프로젝트명
- Git 커밋 메시지, 브랜치명, 리모트 URL

### 회사/조직 내 사용 시 주의사항

회사 업무에 이 플러그인을 사용하면, 다음 정보가 저장소에 기록될 수 있습니다:

- 소스 코드 및 비즈니스 로직 설명
- 내부 시스템/서비스 이름 및 아키텍처
- 동료 이름, 고객 정보, 프로젝트 세부사항
- 내부 URL, IP 주소, 인프라 구성 정보

**이러한 정보의 관리 책임은 전적으로 사용자에게 있습니다.** 사용 전 소속 조직의 보안 정책을 확인하시기 바랍니다.

### 시크릿 자동 마스킹

API 키, 토큰, 비밀번호 등 알려진 시크릿 패턴은 저장 전에 자동으로 `[REDACTED]` 처리됩니다. 단, 이는 best-effort 방식이며 **모든 민감 정보의 완전한 차단을 보장하지 않습니다.**

### GitHub 저장소 사용 시

GitHub에 회고를 저장하는 경우, **반드시 private 저장소를 사용하세요.** public 저장소에 저장할 경우 대화 내용과 회고 파일이 인터넷에 공개됩니다. 시크릿 마스킹이 모든 경우를 커버하지 못하므로, private 저장소 유지는 가장 기본적인 보안 조치입니다.
```

- [ ] **Step 3: Also update config examples in both READMEs**

In both `README.md` and `README.ko.md`, add the `privacy` field to the JSON config examples. In the local storage config example, after the `profile` block:

```json
  "privacy": {
    "redactSecrets": true
  }
```

And in the GitHub storage config example, same location.

- [ ] **Step 4: Commit**

```bash
git add README.md README.ko.md
git commit -m "docs: add Security & Privacy section and privacy config to READMEs"
```

---

## Task Dependency Summary

```
Task 1 (Layer 1) → Task 2 (Layer 2) → Task 3 (Layer 3) → Task 4 (Layer 4) → Task 5 (Integration tests)
                                                                                        ↓
Task 6 (Config types) ──────────────────────────────────────────────────────────→ Task 7 (raw-logger integration)
                                                                                        ↓
                                                                                 Task 8 (recover-sessions integration)

Task 9 (Setup public check) — independent
Task 10 (README) — independent
```

Tasks 1-5 are sequential (each layer builds on previous). Task 6 can be done in parallel with Tasks 1-5. Tasks 7-8 depend on both Task 5 and Task 6. Tasks 9 and 10 are independent and can be done at any time.
