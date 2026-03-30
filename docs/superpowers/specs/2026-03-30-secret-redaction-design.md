# Secret Redaction & Security Disclosure

**Date:** 2026-03-30
**Status:** Draft

## Problem

claude-daily-review는 사용자의 대화 내용을 자동으로 캡처하여 로컬 또는 GitHub에 저장한다. 회사 내에서 사용할 경우:

1. **시크릿 유출** — API 키, 토큰, 비밀번호, 연결 문자열 등이 대화에 포함되어 raw 로그에 그대로 저장될 수 있음
2. **정보 유출 인식 부족** — 사용자가 대화 내용이 저장된다는 사실을 인지하지 못할 수 있음
3. **원격 저장소 노출** — GitHub public 레포에 저장 시 누구나 접근 가능

## Scope

### In Scope

- 저장 시점에서 시크릿 자동 마스킹 (`lib/sanitizer.mjs`)
- Config에 `privacy.redactSecrets` 옵션 추가 (기본값 `true`)
- 기존 사용자 하위 호환 (config에 `privacy` 필드 없으면 기본값 적용)
- README 영문/한국어에 Security & Privacy 섹션 추가
- 셋업 시 기존 레포가 public이면 경고

### Out of Scope

- 코드블록 필터링 (이번 스코프에서 제외 — 시크릿 마스킹으로 충분)
- 자연어로 기술된 비즈니스 로직 필터링 (기술적으로 불가)
- 대화 내용 암호화

## Architecture

### New Module: `lib/sanitizer.mjs`

```
메시지 원문 (string)
  → sanitize(text) → 마스킹된 string
```

단일 함수 `sanitize(text: string): string`을 export한다. 4개의 탐지 레이어를 순차 적용하여 매칭된 부분을 `[REDACTED:tag]` 형식으로 대체한다. config 의존성 없이 순수 문자열 변환 함수로 구현한다. `redactSecrets` 설정 체크는 호출자(raw-logger, recover-sessions)에서 수행한다.

### Integration Points

두 곳에서 호출:

1. **`lib/raw-logger.mjs` → `appendRawLog()`**
   - `entry.last_user_message`와 `entry.last_assistant_message`에 sanitize 적용
   - 저장 전에 마스킹하므로 raw 로그에 시크릿이 기록되지 않음

2. **`hooks/recover-sessions.mjs`**
   - 크래시 복구 시 트랜스크립트에서 메시지를 복원할 때 sanitize 적용
   - 복구 경로에서도 시크릿이 누락되지 않도록 보장

### Flow

```
[Session Stop]
  transcript → on-stop.mjs → last_user/assistant_message
    → sanitize() → appendRawLog() → .raw/{session}/{date}.jsonl

[Session Start - Recovery]
  transcript → recover-sessions.mjs → parseTranscript()
    → sanitize() each entry → storage.append()
```

## Detection Layers

### Layer 1: Known Service Key Patterns

알려진 서비스별 키 형식을 정규식으로 탐지한다. 가장 정확도가 높고 false positive이 낮다.

| Service | Pattern | Tag |
|---|---|---|
| OpenAI | `sk-proj-[A-Za-z0-9_-]{20,}` | `openai_key` |
| OpenAI (legacy) | `sk-[A-Za-z0-9]{40,}` | `openai_key` |
| Anthropic | `sk-ant-[A-Za-z0-9_-]{20,}` | `anthropic_key` |
| GitHub PAT | `gh[pous]_[A-Za-z0-9]{36,}` | `github_token` |
| AWS Access Key | `AKIA[0-9A-Z]{16}` | `aws_key` |
| AWS Secret Key | `(?:aws_secret_access_key\|secret_key)\s*[=:]\s*[A-Za-z0-9/+=]{40}` | `aws_secret` |
| Slack | `xox[bpra]-[A-Za-z0-9-]{10,}` | `slack_token` |
| Stripe | `[sr]k_(live\|test)_[A-Za-z0-9]{20,}` | `stripe_key` |
| Google API | `AIza[0-9A-Za-z_-]{35}` | `google_api_key` |
| Supabase | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{50,}` | `supabase_key` |
| Vercel | `vercel_[A-Za-z0-9_-]{20,}` | `vercel_token` |
| npm | `npm_[A-Za-z0-9]{36,}` | `npm_token` |
| SendGrid | `SG\.[A-Za-z0-9_-]{22,}\.[A-Za-z0-9_-]{43,}` | `sendgrid_key` |
| Twilio | `SK[0-9a-fA-F]{32}` | `twilio_key` |

### Layer 2: Structural Secret Patterns

구조적으로 시크릿임이 명확한 패턴을 탐지한다.

| Pattern | Tag |
|---|---|
| `-----BEGIN [\w\s]* PRIVATE KEY-----[\s\S]*?-----END [\w\s]* PRIVATE KEY-----` | `private_key` |
| `(postgres\|mysql\|mongodb(\+srv)?\|redis\|amqp\|mssql)://[^\s"']+` | `connection_string` |
| `Bearer\s+[A-Za-z0-9_-]{20,}` | `bearer_token` |
| `Authorization:\s*\S{20,}` | `auth_header` |
| JWT: `eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+` | `jwt` |

### Layer 3: Key=Value Secrets

설정 파일이나 .env 내용이 대화에 포함된 경우를 탐지한다.

**개별 key=value:**
대소문자 무시하여 다음 키 이름 뒤의 값을 마스킹:
```
(password|passwd|pwd|secret|token|api_key|apikey|api-key|
 access_key|access_token|private_key|client_secret|
 auth_token|refresh_token|database_url|db_password|
 encryption_key|signing_key|master_key)\s*[=:]\s*\S+
```
- Tag: `secret_value`
- 키 이름은 유지하고 값만 마스킹: `API_KEY=[REDACTED:secret_value]`

**.env 블록 탐지:**
`[A-Z_]{3,}=\S+` 패턴이 3줄 이상 연속되면 블록 전체를 마스킹:
- Tag: `env_block`
- 출력: `[REDACTED:env_block - {N}개 환경변수]`
- **.env 블록이 개별 key=value보다 우선 적용됨** — 블록으로 감지되면 개별 매칭을 건너뜀

### Layer 4: High-Entropy Strings

알려지지 않은 시크릿을 잡기 위한 휴리스틱 레이어.

**조건:** 32자 이상의 연속된 `[A-Za-z0-9+/=_-]` 문자열 중:
- 영문 단어로만 구성되지 않은 것 (camelCase/snake_case 허용하면 코드 변수명이 걸리므로, 숫자+특수문자가 섞인 경우만)
- URL 경로가 아닌 것 (`/`가 2개 이상이면 제외)
- 파일 경로가 아닌 것 (`C:\` 또는 `/home/` 등으로 시작하면 제외)
- 이미 레이어 1~3에서 매칭되지 않은 것

**휴리스틱:**
- 문자열의 문자 종류 분포(대문자, 소문자, 숫자, 특수문자)가 3종류 이상이고
- 같은 문자가 전체의 30% 이상을 차지하지 않을 때 (반복 패턴 제외)
- Tag: `high_entropy_string`

## Masking Format

```
// 원문
export const API_KEY = "sk-proj-abc123def456ghi789";
연결은 postgres://admin:p@ssw0rd@db.internal.com:5432/mydb 로 하면 됩니다.

// 마스킹 후
export const API_KEY = "[REDACTED:openai_key]";
연결은 [REDACTED:connection_string] 로 하면 됩니다.
```

레이어 3의 key=value는 키 이름을 보존:
```
// 원문
DATABASE_URL=postgres://user:pass@host/db
SECRET_KEY=abc123...
API_TOKEN=ghp_xxxx...

// 마스킹 후
[REDACTED:env_block - 3개 환경변수]
```

## Config & Migration

### Type Definition

```ts
// types.d.ts 추가
interface PrivacyConfig {
  redactSecrets: boolean;  // default: true
}

interface Config {
  storage: StorageConfig;
  language: string;
  periods: Periods;
  profile: Profile;
  privacy?: PrivacyConfig;  // optional for backward compatibility
}
```

### Backward Compatibility

- `privacy` 필드가 없는 기존 config → 코드에서 `config.privacy?.redactSecrets ?? true`로 기본값 적용
- config 파일을 자동 마이그레이션하지 않음 — 필드 부재 시 기본값으로 동작
- `createDefaultLocalConfig`, `createDefaultGitHubConfig`에 `privacy: { redactSecrets: true }` 추가 (신규 사용자)

### Config Example

```json
{
  "storage": { "type": "local", "local": { "basePath": "..." } },
  "language": "ko",
  "periods": { ... },
  "profile": { ... },
  "privacy": {
    "redactSecrets": true
  }
}
```

## Setup Flow Changes

### GitHub 기존 레포 선택 시 public 체크

`daily-review-setup.md`의 "기존 저장소 사용" 분기에서:

```bash
MSYS_NO_PATHCONV=1 gh api "repos/{owner}/{repo}" --jq '.private'
```

결과가 `false`이면 경고 메시지 표시:

> "이 저장소는 public입니다. 대화 내용과 회고 파일이 누구나 볼 수 있는 상태가 됩니다. private 저장소 사용을 강력히 권장합니다. 그래도 계속하시겠습니까?"

AskUserQuestion으로 확인:
- "private으로 변경 후 계속" (가능하면 API로 변경)
- "그대로 사용 (위험 인지)"
- "다른 저장소 선택"

## README Security & Privacy Section

영문 README와 한국어 README에 각각 추가.

### Content (한국어)

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

**이러한 정보의 관리 책임은 전적으로 사용자에게 있습니다.**
사용 전 소속 조직의 보안 정책을 확인하시기 바랍니다.

### 시크릿 자동 마스킹

API 키, 토큰, 비밀번호 등 알려진 시크릿 패턴은 저장 전에 자동으로
`[REDACTED]` 처리됩니다. 단, 이는 best-effort 방식이며
**모든 민감 정보의 완전한 차단을 보장하지 않습니다.**

### GitHub 저장소 사용 시

GitHub에 회고를 저장하는 경우, **반드시 private 저장소를 사용하세요.**
public 저장소에 저장할 경우 대화 내용과 회고 파일이 인터넷에 공개됩니다.
시크릿 마스킹이 모든 경우를 커버하지 못하므로, private 저장소 유지는
가장 기본적인 보안 조치입니다.
```

### Content (English)

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

Known secret patterns (API keys, tokens, passwords, etc.) are automatically
redacted to `[REDACTED]` before storage. However, this is a best-effort
mechanism and **does not guarantee complete protection of all sensitive data.**

### GitHub Storage

If storing reviews on GitHub, **always use a private repository.**
Storing to a public repository exposes your conversations and reviews
to the internet. Since secret redaction cannot cover all cases, keeping
the repository private is the most fundamental security measure.
```

## Files to Create/Modify

| File | Action | Description |
|---|---|---|
| `lib/sanitizer.mjs` | **Create** | 시크릿 탐지 및 마스킹 모듈 |
| `lib/sanitizer.test.mjs` | **Create** | sanitizer 테스트 |
| `lib/types.d.ts` | **Modify** | `PrivacyConfig` 인터페이스 추가, `Config`에 `privacy?` 필드 추가 |
| `lib/config.mjs` | **Modify** | `createDefaultLocalConfig`, `createDefaultGitHubConfig`에 privacy 기본값 추가 |
| `lib/raw-logger.mjs` | **Modify** | `appendRawLog`에서 sanitize 호출 |
| `hooks/recover-sessions.mjs` | **Modify** | 복구 시 sanitize 호출 |
| `commands/daily-review-setup.md` | **Modify** | 기존 레포 public 체크 + 경고 추가 |
| `README.md` | **Modify** | Security & Privacy 섹션 추가 (English) |
| `README.ko.md` | **Modify** | 보안 및 개인정보 섹션 추가 (Korean) |

## Testing Strategy

`lib/sanitizer.test.mjs`에서 각 레이어별 테스트:

1. **Layer 1** — 각 서비스 키 패턴이 올바르게 마스킹되는지
2. **Layer 2** — PEM 키, 연결 문자열, Bearer 토큰, JWT
3. **Layer 3** — key=value 개별 매칭, .env 블록 탐지
4. **Layer 4** — 고엔트로피 문자열 탐지, false positive 제외 (URL, 파일경로, 일반 단어)
5. **통합** — 여러 시크릿이 섞인 메시지에서 모두 마스킹되는지
6. **비활성화** — `redactSecrets: false`일 때 원문 유지
7. **하위 호환** — config에 `privacy` 필드 없을 때 기본 마스킹 동작
