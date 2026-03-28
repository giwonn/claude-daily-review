# StorageAdapter 추상화 + GitHub 연동 설계 문서

## 1. 개요

기존 claude-daily-review 플러그인의 외부 저장소 의존성(fs)을 `StorageAdapter` 인터페이스로 추상화하고, GitHub를 저장소 백엔드로 추가한다. 사용자는 셋업 시 로컬 파일시스템 또는 GitHub 중 선택할 수 있다.

## 2. 목표

- 외부 저장소 의존성을 인터페이스로 추상화 (DIP)
- GitHub Contents API 기반 저장소 어댑터 추가
- GitHub OAuth Device Flow로 사용자 인증 (우리 OAuth App의 client_id 사용)
- GitHub repo 자동 생성 또는 기존 repo 지정 지원
- 기존 로컬 저장소 기능 유지
- 기존 테스트 async 전환 및 유지

## 3. StorageAdapter 인터페이스

```typescript
export interface StorageAdapter {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(dir: string): Promise<string[]>;
  mkdir(dir: string): Promise<void>;
  isDirectory(path: string): Promise<boolean>;
}
```

모든 경로는 storage root 기준 상대 경로. 예: `daily/2026-03-28.md`, `.raw/sess-1/2026-03-28.jsonl`

## 4. 구현체

### 4.1 LocalStorageAdapter

기존 fs 코드를 StorageAdapter 인터페이스로 감싼다.

```typescript
export class LocalStorageAdapter implements StorageAdapter {
  constructor(private basePath: string) {}
  // fs 함수들을 async wrapper로 구현
}
```

| 메서드 | 구현 |
|--------|------|
| `read(path)` | `readFileSync(resolve(basePath, path))` — 파일 없으면 `null` 반환 |
| `write(path, content)` | `mkdirSync` + `writeFileSync` |
| `append(path, content)` | `mkdirSync` + `appendFileSync` |
| `exists(path)` | `existsSync` |
| `list(dir)` | `readdirSync` — 디렉토리 없으면 `[]` |
| `mkdir(dir)` | `mkdirSync({ recursive: true })` |
| `isDirectory(path)` | `statSync().isDirectory()` — 에러 시 `false` |

### 4.2 GitHubStorageAdapter

GitHub Contents API를 사용한다.

```typescript
export class GitHubStorageAdapter implements StorageAdapter {
  constructor(private owner: string, private repo: string, private token: string, private basePath: string) {}
}
```

| 메서드 | GitHub API |
|--------|------------|
| `read(path)` | `GET /repos/{owner}/{repo}/contents/{basePath}/{path}` — base64 디코드, 404면 `null` |
| `write(path, content)` | `PUT /repos/{owner}/{repo}/contents/{basePath}/{path}` — 기존 파일이면 SHA 포함 |
| `append(path, content)` | `read` → 기존 내용 + content → `write` (SHA 기반 업데이트) |
| `exists(path)` | `GET` 후 200이면 `true`, 404면 `false` |
| `list(dir)` | `GET /repos/{owner}/{repo}/contents/{basePath}/{dir}` — 배열 응답에서 name 추출 |
| `mkdir(dir)` | no-op (GitHub는 디렉토리 개념 없음, 파일 생성 시 자동 생성) |
| `isDirectory(path)` | `GET` 후 응답이 배열이면 `true` |

### SHA 관리

GitHub Contents API는 파일 업데이트 시 현재 SHA가 필요하다. GitHubStorageAdapter 내부에서:
1. `write`/`append` 호출 시 먼저 `GET`으로 현재 SHA 취득
2. SHA와 함께 `PUT` 요청
3. 409 Conflict 발생 시 SHA 재취득 후 재시도 (최대 3회)

### Rate Limit 고려

- GitHub API: 인증된 요청 시간당 5,000회
- Stop 훅은 async라 응답마다 1회 호출 — 하루 수백 회 수준으로 충분
- 주기별 요약은 SessionStart에서 몇 회 호출 — 무시할 수준

## 5. GitHub OAuth Device Flow

### 흐름

```
1. POST https://github.com/login/device/code
   Body: { client_id: "OUR_CLIENT_ID", scope: "repo" }
   Response: { device_code, user_code, verification_uri, interval }

2. 사용자에게 표시:
   "https://github.com/login/device 에 접속해서 코드 ABCD-1234 를 입력하세요"

3. Polling (interval 간격):
   POST https://github.com/login/oauth/access_token
   Body: { client_id, device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }

   - "authorization_pending" → 계속 polling
   - "slow_down" → interval 증가 후 계속
   - 200 + access_token → 완료

4. 토큰을 config에 저장
```

### client_id

코드에 상수로 포함. OAuth App은 GitHub에 "claude-daily-review"로 등록.

```typescript
const GITHUB_CLIENT_ID = "Ov23li..."; // 실제 등록 후 값
```

참고: Device Flow는 public client이므로 client_secret 불필요.

### Scope

`repo` — private repo 접근 필요. public repo만 지원하려면 `public_repo`로 축소 가능하나, 사용자 편의를 위해 `repo` 사용.

## 6. GitHub Repo 설정

### 셋업 플로우

```
/daily-review-setup
→ storage 선택: "local" / "github"

[github 선택 시]
→ OAuth Device Flow 인증
→ "기존 repo를 사용할까요, 새로 만들까요?"
  → 기존: repo 이름 입력 (owner/repo)
  → 새로: repo 이름 입력 → POST /user/repos로 생성 (private)
→ basePath 설정 (기본: "daily-review")
→ 완료
```

### Repo 생성 API

```
POST /user/repos
Body: {
  name: "daily-review",
  private: true,
  description: "Auto-generated daily review by claude-daily-review"
}
```

## 7. 설정 스키마 변경

### 기존

```json
{
  "vaultPath": "/path/to/vault",
  "reviewFolder": "daily-review",
  ...
}
```

### 변경 후

```json
{
  "storage": {
    "type": "local",
    "local": {
      "basePath": "/path/to/vault/daily-review"
    }
  },
  "language": "ko",
  "periods": {
    "daily": true,
    "weekly": true,
    "monthly": true,
    "quarterly": true,
    "yearly": false
  },
  "profile": {
    "company": "ABC Corp",
    "role": "프론트엔드 개발자",
    "team": "결제플랫폼팀",
    "context": "B2B SaaS 결제 시스템 개발 및 운영"
  }
}
```

또는 GitHub:

```json
{
  "storage": {
    "type": "github",
    "github": {
      "owner": "username",
      "repo": "daily-review",
      "token": "gho_xxx",
      "basePath": "daily-review"
    }
  },
  "language": "ko",
  "periods": { ... },
  "profile": { ... }
}
```

`vaultPath`와 `reviewFolder`는 `storage.local.basePath`로 통합. 기존 config가 있으면 마이그레이션 지원.

## 8. 변경 대상 모듈

### 변경 필요

| 모듈 | 변경 내용 |
|------|-----------|
| `src/core/storage.ts` | **신규.** StorageAdapter 인터페이스 정의 |
| `src/core/local-storage.ts` | **신규.** LocalStorageAdapter 구현 |
| `src/core/github-storage.ts` | **신규.** GitHubStorageAdapter 구현 |
| `src/core/github-auth.ts` | **신규.** OAuth Device Flow 구현 |
| `src/core/config.ts` | 설정 스키마 변경 + 어댑터 팩토리 함수 |
| `src/core/vault.ts` | fs 직접 사용 → StorageAdapter 주입, async 전환 |
| `src/core/raw-logger.ts` | fs 직접 사용 → StorageAdapter 주입, async 전환 |
| `src/core/merge.ts` | fs 직접 사용 → StorageAdapter 주입, async 전환 |
| `src/hooks/on-stop.ts` | adapter 생성 후 주입, async 전환 |
| `prompts/session-end.md` | 에이전트가 storage type에 따라 다르게 동작하도록 안내 |
| `prompts/session-start.md` | 동일 |
| `skills/daily-review-setup.md` | storage 선택 + GitHub 인증 플로우 추가 |

### 변경 없음

| 모듈 | 이유 |
|------|------|
| `src/core/periods.ts` | 순수 계산, 외부 의존 없음 |
| `hooks/hooks.json` | 훅 설정 자체는 동일 |

## 9. async 전환

StorageAdapter의 모든 메서드가 `Promise`를 반환하므로, 이를 사용하는 모든 함수가 async로 전환된다.

### 영향 범위

```typescript
// Before (sync)
export function appendRawLog(sessionDir: string, date: string, entry: HookInput): void

// After (async)
export async function appendRawLog(storage: StorageAdapter, sessionDir: string, date: string, entry: HookInput): Promise<void>
```

| 함수 | 변경 |
|------|------|
| `vault.ensureVaultDirectories(config)` | `ensureVaultDirectories(storage, config)` async |
| `rawLogger.appendRawLog(dir, date, entry)` | `appendRawLog(storage, dir, date, entry)` async |
| `merge.findUnprocessedSessions(dir)` | `findUnprocessedSessions(storage, dir)` async |
| `merge.findPendingReviews(dir)` | `findPendingReviews(storage, dir)` async |
| `merge.markSessionCompleted(dir)` | `markSessionCompleted(storage, dir)` async |
| `merge.isSessionCompleted(dir)` | `isSessionCompleted(storage, dir)` async |
| `merge.mergeReviewsIntoDaily(paths, daily)` | `mergeReviewsIntoDaily(storage, paths, daily)` async |
| `onStop.handleStopHook(stdin)` | `handleStopHook(stdin)` async |

vault의 경로 생성 함수들(getDailyPath 등)은 순수 문자열 연산이므로 변경 없음.

## 10. 테스트 전략

### LocalStorageAdapter 테스트

기존 테스트를 async로 전환 + StorageAdapter를 통해 호출하도록 수정. 실질적 동작은 동일.

### GitHubStorageAdapter 테스트

GitHub API를 직접 호출하지 않고, HTTP 요청을 mock하여 테스트.

```typescript
// fetch를 mock하여 GitHub API 응답 시뮬레이션
vi.spyOn(globalThis, "fetch").mockImplementation(...)
```

테스트 케이스:
- read: 정상 응답 (base64 디코드), 404 → null
- write: 새 파일 생성 (SHA 없음), 기존 파일 업데이트 (SHA 포함)
- append: read + write 조합
- exists: 200 → true, 404 → false
- list: 배열 응답에서 name 추출
- write 409 conflict → SHA 재취득 후 재시도

### GitHub Auth 테스트

Device Flow의 각 단계를 fetch mock으로 테스트:
- device code 요청 성공
- polling: authorization_pending → 재시도
- polling: slow_down → interval 증가
- polling: 성공 → 토큰 반환
- polling: 타임아웃

### 코어 모듈 테스트

vault, raw-logger, merge 테스트는 StorageAdapter mock을 주입하여 테스트. 실제 fs 의존 없이 순수 로직만 검증.

추가로 LocalStorageAdapter를 사용한 통합 테스트도 유지.

## 11. 에이전트 프롬프트 변경

SessionEnd/SessionStart 에이전트는 파일을 직접 Read/Write 도구로 조작한다. GitHub storage인 경우:
- 에이전트가 config에서 storage type 확인
- `type: "local"` → 기존대로 Read/Write 도구 사용
- `type: "github"` → Bash 도구로 `node` 스크립트 호출하여 GitHub API 사용

이를 위해 에이전트가 호출할 수 있는 CLI 유틸리티 스크립트를 추가:

```bash
# 파일 읽기
node dist/cli/storage-read.js <path>

# 파일 쓰기 (stdin으로 content)
echo "content" | node dist/cli/storage-write.js <path>

# 파일 목록
node dist/cli/storage-list.js <dir>
```

이 스크립트들은 config에서 storage type을 읽고 적절한 어댑터를 사용한다.

## 12. Config 마이그레이션

기존 config 형식(`vaultPath` + `reviewFolder`)이 감지되면 자동 마이그레이션:

```typescript
function migrateConfig(old: OldConfig): Config {
  return {
    storage: {
      type: "local",
      local: {
        basePath: join(old.vaultPath, old.reviewFolder),
      },
    },
    language: old.language,
    periods: old.periods,
    profile: old.profile,
  };
}
```

## 13. 스코프

### 이번 스코프

- StorageAdapter 인터페이스 정의
- LocalStorageAdapter 구현
- GitHubStorageAdapter 구현
- GitHub OAuth Device Flow 구현
- 코어 모듈 리팩토링 (StorageAdapter 주입, async 전환)
- 에이전트용 CLI 스크립트 (storage-read, storage-write, storage-list)
- 설정 스키마 변경 + 마이그레이션
- 셋업 스킬 업데이트 (storage 선택 + GitHub 인증)
- 에이전트 프롬프트 업데이트
- 테스트 전면 수정

### 제외

- GitHub App 서버 사이드 (불필요 — Device Flow는 serverless)
- 실제 OAuth App 등록 (구현 후 별도 진행)
- GitHub Pages 연동
