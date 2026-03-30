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

  it('redacts Supabase JWT key', () => {
    const input = 'SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + 'a'.repeat(60);
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:supabase_key]'));
    assert.ok(!result.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
  });

  it('redacts AWS secret access key', () => {
    const input = 'aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:aws_secret]'));
    assert.ok(!result.includes('wJalrXUtnFEMI'));
  });

  it('redacts Stripe rk_test_ key', () => {
    const input = 'rk_test_abc123def456ghi789jkl0123456';
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:stripe_key]'));
    assert.ok(!result.includes('rk_test_'));
  });

  it('returns null for null input', () => {
    assert.equal(sanitize(null), null);
  });

  it('returns empty string for empty input', () => {
    assert.equal(sanitize(''), '');
  });

  it('returns undefined for undefined input', () => {
    assert.equal(sanitize(undefined), undefined);
  });

  it('does not redact normal text', () => {
    const input = 'This is a normal message about skating and skills.';
    const result = sanitize(input);
    assert.equal(result, input);
  });
});

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
    assert.ok(result.includes('4'));
    assert.ok(!result.includes('abc123'));
  });

  it('does not treat 2 consecutive lines as env block', () => {
    const input = 'NODE_ENV=production\nPORT=3000';
    const result = sanitize(input);
    assert.ok(!result.includes('env_block'));
    assert.ok(result.includes('NODE_ENV=production'));
  });

  it('env block takes priority over individual key=value', () => {
    const input = 'PASSWORD=secret\nAPI_KEY=abc123\nTOKEN=xyz\nSECRET=test';
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:env_block'));
    assert.ok(!result.includes('[REDACTED:secret_value]'));
  });

  it('does not redact normal key=value that is not secret-named', () => {
    const input = 'name=John\nage=30';
    const result = sanitize(input);
    assert.equal(result, input);
  });
});

describe('Layer 4: High-Entropy Strings', () => {
  it('redacts a high-entropy 32+ char string', () => {
    const input = 'secret: aB3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW';
    const result = sanitize(input);
    assert.ok(result.includes('[REDACTED:high_entropy_string]'));
  });

  it('does not redact a normal English word sequence', () => {
    const input = 'this is a longvariablenamethatismorethan32characters';
    const result = sanitize(input);
    assert.ok(!result.includes('[REDACTED'));
  });

  it('does not redact file paths (Windows)', () => {
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
    assert.ok(!result.includes('high_entropy'));
  });
});

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
    assert.ok(result.includes('이 API 키'));
    assert.ok(result.includes('로 접속하고'));
    // password= key-value redaction consumes the rest of the value after '='
    assert.ok(result.includes('password=[REDACTED:secret_value]'));
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
