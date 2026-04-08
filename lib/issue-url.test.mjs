// @ts-check
import { strict as assert } from 'assert';
import { buildIssueUrl } from './issue-url.mjs';

// Test 1: 기본 URL 생성
{
  const url = buildIssueUrl({
    context: 'on-session-start',
    error: new Error('Config not found'),
  });
  assert.ok(url.startsWith('https://github.com/giwonn/claude-daily-review/issues/new?'));
  assert.ok(url.includes('title='));
  assert.ok(url.includes('body='));
  assert.ok(url.includes('labels=bug'));
  console.log('PASS: 기본 URL 생성');
}

// Test 2: title 포맷 확인
{
  const url = buildIssueUrl({
    context: 'on-stop',
    error: new Error('ENOENT: no such file'),
  });
  const titleMatch = url.match(/title=([^&]*)/);
  assert.ok(titleMatch);
  const title = decodeURIComponent(titleMatch[1]);
  assert.ok(title.includes('[Bug]'));
  assert.ok(title.includes('on-stop'));
  console.log('PASS: title 포맷');
}

// Test 3: body에 스택트레이스 포함
{
  const err = new Error('Something broke');
  const url = buildIssueUrl({
    context: 'flush',
    error: err,
  });
  const bodyMatch = url.match(/body=([^&]*)/);
  assert.ok(bodyMatch);
  const body = decodeURIComponent(bodyMatch[1]);
  assert.ok(body.includes('Stack Trace'));
  assert.ok(body.includes('Something broke'));
  console.log('PASS: body 스택트레이스 포함');
}

// Test 4: 민감 정보 sanitize
{
  const err = new Error('Auth failed with token ghp_abc123def456ghi789jkl012mno345pqr678');
  err.stack = `Error: Auth failed with token ghp_abc123def456ghi789jkl012mno345pqr678
    at Object.<anonymous> (/Users/allen/.claude/plugins/data/claude-daily-review/config.mjs:10:5)`;
  const url = buildIssueUrl({
    context: 'setup',
    error: err,
  });
  const body = decodeURIComponent(url.match(/body=([^&]*)/)[1]);
  assert.ok(!body.includes('ghp_abc123def456ghi789jkl012mno345pqr678'));
  assert.ok(body.includes('[REDACTED'));
  console.log('PASS: 민감 정보 sanitize');
}

// Test 5: 버전 정보 포함
{
  const url = buildIssueUrl({
    context: 'generate',
    error: new Error('test'),
  });
  const body = decodeURIComponent(url.match(/body=([^&]*)/)[1]);
  assert.ok(body.includes('Plugin:'));
  assert.ok(body.includes('OS:'));
  console.log('PASS: 환경 정보 포함');
}

// Test 6: URL 길이 제한 (브라우저 호환)
{
  const longMessage = 'x'.repeat(10000);
  const err = new Error(longMessage);
  err.stack = longMessage;
  const url = buildIssueUrl({
    context: 'test',
    error: err,
  });
  assert.ok(url.length <= 8192, `URL too long: ${url.length}`);
  console.log('PASS: URL 길이 제한');
}

console.log('\nAll tests passed!');
