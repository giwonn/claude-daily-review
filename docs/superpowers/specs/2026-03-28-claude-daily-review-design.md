# claude-daily-review 설계 문서

## 1. 개요

Claude Code 플러그인으로, 사용자의 Claude 대화를 자동 수집하여 Obsidian vault에 일별/프로젝트별 회고 마크다운을 생성한다. 계단식 주기 요약(daily → weekly → monthly → quarterly → yearly)을 통해 경력기술서 및 이력서 작성에 활용할 수 있는 구조화된 기록을 자동으로 쌓는다.

## 2. 핵심 목표

- **자동 수집:** hook 기반으로 사용자 개입 없이 대화 기록 수집
- **구조화된 회고:** 작업 단위로 분류된 회고 마크다운 생성
- **계단식 요약:** daily → weekly → monthly → quarterly → yearly 단계별 압축
- **프로젝트별 추적:** cwd 기반 프로젝트 자동 분류 + 누적 요약
- **동시성 안전:** 여러 세션 동시 실행 시 데이터 무결성 보장
- **강제종료 복구:** raw 로그 기반 복구로 데이터 유실 방지
- **Obsidian 통합:** vault에 직접 마크다운 파일 생성, 태그/링크 활용
- **오픈소스 배포:** npm 패키지, 범용 설정, 크로스 플랫폼

## 3. 아키텍처

```
claude-daily-review (Claude Code Plugin)
├── hooks/hooks.json              ← 훅 정의
├── src/
│   ├── core/
│   │   ├── config.ts             ← 설정 관리
│   │   ├── raw-logger.ts         ← raw 로그 append (동시성 처리)
│   │   ├── reviewer.ts           ← 회고 마크다운 생성 로직
│   │   ├── summarizer.ts         ← 주기별 요약 생성
│   │   └── vault.ts              ← Obsidian vault 파일 구조 관리
│   ├── hooks/
│   │   ├── on-stop.ts            ← Stop 훅: raw 로그 append (async)
│   │   ├── on-session-start.ts   ← SessionStart 훅: 복구 + 주기 요약 + 설정 안내
│   │   └── on-session-end.ts     ← SessionEnd 훅: AI 요약 생성 (agent)
│   └── commands/
│       └── setup.ts              ← /daily-review-setup 명령어
├── package.json
└── README.md
```

### 모듈 책임

| 모듈 | 역할 |
|------|------|
| `config.ts` | `$CLAUDE_PLUGIN_DATA/config.json` 읽기/쓰기, 기본값 제공, 유효성 검증 |
| `raw-logger.ts` | stdin JSON 파싱, lockfile 기반 동시성 처리, JSONL append |
| `reviewer.ts` | transcript/raw 로그 → 작업 분류 → 구조화된 회고 마크다운 생성 |
| `summarizer.ts` | 하위 주기 문서들을 읽어 상위 주기 요약 생성 (계단식) |
| `vault.ts` | 디렉토리 생성, 파일 존재 여부 확인, 기존 파일 merge |

## 4. 데이터 플로우

### 4.1 매 응답 완료 (Stop 훅, async)

```
Stop 이벤트 발생
→ stdin에서 JSON 수신 (session_id, transcript_path, cwd)
→ raw-logger가 lockfile 획득
→ .raw/{session-id}/{date}.jsonl에 append
→ lockfile 해제
```

- async로 실행되어 사용자 작업 흐름 차단 없음
- 강제종료 시에도 마지막 Stop 시점까지 데이터 보존

### 4.2 세션 종료 (SessionEnd 훅, agent)

```
SessionEnd 이벤트 발생
→ agent 훅이 transcript_path로 전체 대화 읽기
→ cwd 기반 프로젝트 분류
→ 작업 단위로 그룹핑 (같은 프로젝트 내 주제 분리)
→ 회고 마크다운 생성:
   - daily/{date}.md (통합)
   - projects/{project-name}/{date}.md (프로젝트별)
   - uncategorized/{date}.md (미분류)
→ projects/{project-name}/summary.md 누적 갱신
→ raw 로그에 처리 완료 마킹
```

### 4.3 세션 시작 (SessionStart 훅, agent)

```
SessionStart 이벤트 발생
→ config.json 존재 확인
   → 없으면: 설정 안내 메시지 반환 (exit code 2)
→ 미처리 raw 로그 확인
   → 있으면: 해당 raw 로그 기반 회고 생성 (복구)
→ 주기별 요약 필요 여부 확인:
   → 새로운 주 시작 && weekly 활성화 → 지난주 weekly 생성
   → 새로운 달 시작 && monthly 활성화 → 지난달 monthly 생성
   → 새로운 분기 시작 && quarterly 활성화 → 지난 분기 quarterly 생성
   → 새로운 해 시작 && yearly 활성화 → 지난해 yearly 생성
```

## 5. Obsidian Vault 파일 구조

```
{vaultPath}/{reviewFolder}/
├── daily/
│   └── 2026-03-28.md
├── weekly/                       ← 설정에서 활성화 시
│   └── 2026-W13.md
├── monthly/                      ← 설정에서 활성화 시
│   └── 2026-03.md
├── quarterly/                    ← 설정에서 활성화 시
│   └── 2026-Q1.md
├── yearly/                       ← 설정에서 활성화 시
│   └── 2026.md
├── projects/
│   └── {project-name}/
│       ├── 2026-03-28.md         ← 프로젝트 일별 상세
│       └── summary.md            ← 프로젝트 누적 요약 (이력서/경력기술서용)
├── uncategorized/
│   └── 2026-03-28.md             ← 프로젝트와 무관한 일반 질문
└── .raw/
    └── {session-id}/
        └── 2026-03-28.jsonl      ← raw 로그 (Obsidian에서 숨김)
```

## 6. 마크다운 템플릿

### 6.1 Daily (daily/2026-03-28.md)

```markdown
---
date: 2026-03-28
type: daily-review
projects: [my-app, blog]
tags: [인증, jwt, seo, next-auth]
---

# 2026-03-28 Daily Review

## [my-app] 인증 시스템 리팩토링
**작업 요약:** JWT 기반 인증으로 전환
**배운 것:**
- next-auth v5의 session 전략 차이
- middleware에서 JWT 검증 패턴
**고민한 포인트:**
- JWT vs Session → JWT 선택 (stateless, 스케일링 유리)
**질문과 답변:**
- Q: refresh token rotation 구현 방법?
  → A: ...

## [blog] SEO 메타태그 추가
**작업 요약:** 동적 OG 이미지 생성
**배운 것:**
- next/og의 ImageResponse API
**고민한 포인트:**
- (없음)
**질문과 답변:**
- Q: OG 이미지 캐싱 전략?
  → A: ...

## 미분류
**질문과 답변:**
- Q: TypeScript 5.4의 NoInfer 유틸리티 타입이 뭐야?
  → A: 제네릭 타입 추론을 특정 위치에서 차단하는 유틸리티 타입...

## Tags
#my-app #인증 #jwt #blog #seo #typescript
```

### 6.2 Weekly (weekly/2026-W13.md)

```markdown
---
date: 2026-W13
type: weekly-review
period: 2026-03-24 ~ 2026-03-30
projects: [my-app, blog]
---

# 2026-W13 주간 회고

## 주요 성과
- [my-app] 인증 시스템 JWT 전환 완료
- [blog] SEO 메타태그 전면 적용

## 기술 스택 활용
- TypeScript, Next.js, Prisma, JWT, next-auth v5

## 핵심 의사결정
- JWT vs Session → JWT 선택 (확장성, stateless)

## 성장 포인트
- next-auth v5 심화 학습
- OG 이미지 동적 생성 패턴 습득

## 다음 주 이어갈 것
- 인증 시스템 테스트 보강
```

### 6.3 Monthly (monthly/2026-03.md)

```markdown
---
date: 2026-03
type: monthly-review
projects: [my-app, blog, api-server]
---

# 2026년 3월 월간 회고

## 프로젝트별 진행 요약
### my-app
- 인증 시스템 전면 리팩토링 (JWT 전환)
- 사용자 프로필 페이지 구현
### blog
- SEO 최적화 완료
- 댓글 시스템 연동

## 이번 달 핵심 성장
- 인증/보안 도메인 역량 강화
- Next.js App Router 심화

## 기술 스택
- TypeScript, Next.js, Prisma, JWT, PostgreSQL

## 주요 의사결정 기록
- JWT vs Session (W13)
- SSR vs SSG for blog (W14)
```

### 6.4 Quarterly (quarterly/2026-Q1.md)

```markdown
---
date: 2026-Q1
type: quarterly-review
period: 2026-01 ~ 2026-03
---

# 2026 Q1 분기 회고

## 분기 성과 요약
- my-app: MVP 완성 (인증, 프로필, 대시보드)
- blog: 런칭 및 SEO 최적화
- api-server: REST → GraphQL 마이그레이션

## 핵심 역량 성장
- 인증/보안 설계
- Next.js 풀스택 개발
- GraphQL 스키마 설계

## 기술 스택 총괄
- TypeScript, Next.js, Prisma, JWT, GraphQL, PostgreSQL

## 경력기술서 하이라이트
- JWT 기반 인증 시스템 설계 및 구현
- 블로그 플랫폼 SEO 최적화로 검색 노출 기반 마련
- REST API를 GraphQL로 마이그레이션하여 프론트엔드 쿼리 효율화
```

### 6.5 Yearly (yearly/2026.md)

```markdown
---
date: 2026
type: yearly-review
---

# 2026 연간 회고

## 연간 프로젝트 총괄
- my-app: 기획 → MVP → 런칭 → 운영
- blog: 구축 및 성장
- api-server: 아키텍처 전환

## 핵심 역량 맵
- **프론트엔드:** Next.js, React, TypeScript
- **백엔드:** Node.js, GraphQL, PostgreSQL
- **인프라:** Docker, AWS, CI/CD
- **설계:** 인증 시스템, API 설계, 데이터 모델링

## 이력서용 요약
- ...

## 경력기술서용 상세
- ...
```

### 6.6 Project Summary (projects/{name}/summary.md)

```markdown
---
project: my-app
type: project-summary
started: 2026-01-15
last-updated: 2026-03-28
tags: [next.js, typescript, prisma, jwt]
---

# my-app 프로젝트 요약

## 프로젝트 개요
개인 대시보드 웹 애플리케이션

## 기술 스택
- Next.js 14, TypeScript, Prisma, PostgreSQL, JWT

## 주요 구현 사항
- JWT 기반 인증 시스템 설계 및 구현
- 사용자 프로필/대시보드 페이지
- ...

## 핵심 의사결정 로그
- 2026-02-10: ORM 선택 → Prisma (type-safety)
- 2026-03-25: JWT vs Session → JWT (scalability)

## 배운 것 (누적)
- next-auth v5 심화
- Prisma interactive transaction
- ...
```

## 7. 주기별 요약 생성 체계

### 계단식 요약 구조

```
daily (raw 로그 + transcript)
  ↓ 입력으로 사용
weekly (해당 주의 daily들)
  ↓ 입력으로 사용
monthly (해당 월의 weekly들)
  ↓ 입력으로 사용
quarterly (해당 분기의 monthly들)
  ↓ 입력으로 사용
yearly (해당 년의 quarterly들)
```

각 단계가 이전 단계의 요약을 입력으로 사용하므로 토큰 비용이 효율적이다.

### 트리거 조건

| 주기 | 트리거 시점 | 조건 | 입력 |
|------|------------|------|------|
| daily | SessionEnd, SessionStart(복구) | 항상 | raw 로그 + transcript |
| weekly | SessionStart | 새로운 주 시작 감지 | 지난주 daily 파일들 |
| monthly | SessionStart | 새로운 달 시작 감지 | 해당 월 weekly 파일들 |
| quarterly | SessionStart | 새로운 분기 시작 감지 | 해당 분기 monthly 파일들 |
| yearly | SessionStart | 새로운 해 시작 감지 | 해당 년 quarterly 파일들 |
| project summary | SessionEnd | 항상 | 기존 summary + 오늘 기록 |

### 활성화 설정

사용자가 config에서 원하는 주기만 활성화할 수 있다. daily는 항상 활성화 (필수).

## 8. 동시성 처리

### 설계 원칙: 쓰기 충돌 자체를 제거한다

lockfile 기반 동시성 처리는 stale lock, contention timeout, 네트워크 드라이브 비호환 등 실패 시나리오가 많다. 대신 **세션별 독립 파일 쓰기 + 단일 시점 merge** 전략을 사용한다.

### 문제 시나리오

여러 터미널에서 동시에 Claude Code 세션을 실행할 수 있다:
- 세션 A: my-app 작업 중
- 세션 B: blog 작업 중
- 둘 다 동시에 Stop 훅이 발생

### 해결 전략: 세션 격리 + 지연 merge

```
Stop (async):      .raw/{session-id}/{date}.jsonl에 append    ← 세션별 파일, 충돌 없음
SessionEnd:        .reviews/{session-id}.md 생성               ← 세션별 파일, 충돌 없음
SessionStart:      .reviews/*.md → daily.md로 merge            ← 단일 프로세스
```

1. **raw 로그:** 세션별 독립 파일 (`.raw/{session-id}/{date}.jsonl`) → 충돌 불가
2. **세션별 회고:** 세션별 독립 파일 (`.reviews/{session-id}.md`) → 충돌 불가
3. **daily/project merge:** SessionStart에서만 수행 → 동시 실행 확률 극히 낮음
4. **주기별 요약:** SessionStart에서만 생성 → merge와 동일

### merge 시 최소한의 안전장치

SessionStart에서 merge할 때만 `proper-lockfile`을 사용하되, 실패에 안전하게 설계:

```
merge 플로우:
1. lock 획득 시도 (stale: 30초 — 30초 지난 lock은 자동 해제)
2. lock 실패 시 → merge 건너뜀 (다음 SessionStart에서 재시도, 데이터 유실 없음)
3. lock 성공 시 → .reviews/*.md 읽기 → daily.md에 merge → .reviews/ 정리 → lock 해제
4. merge 중 크래시 → stale lock은 다음 세션에서 자동 해제, .reviews/ 원본은 유지
```

### 파일 구조

```
{vaultPath}/{reviewFolder}/
├── .raw/{session-id}/{date}.jsonl     ← Stop 훅이 append (세션별)
├── .reviews/{session-id}.md           ← SessionEnd가 생성 (세션별)
├── daily/2026-03-28.md                ← SessionStart에서 merge
└── ...
```

### 핵심: 데이터는 항상 안전하다

어떤 시나리오에서도 `.raw/`와 `.reviews/`의 원본 데이터는 유실되지 않는다. merge는 "있으면 좋은 것"이고, 실패해도 다음 기회에 재시도된다.

## 9. 강제종료 복구

### 복구 판단 기준

각 raw 로그 세션 디렉토리에 `.completed` 마커 파일 존재 여부로 판단:
- SessionEnd 훅에서 세션별 회고 생성 완료 후 `.completed` 생성
- SessionStart에서 `.completed` 없는 세션 디렉토리 → 미처리로 간주 → 복구
- `.reviews/`에 남아있는 파일 → 미merge로 간주 → merge 실행

### 복구 플로우

```
SessionStart
→ 1) .raw/ 스캔: .completed 없는 세션 발견 → raw 로그 기반 회고 생성 → .reviews/에 저장
→ 2) .reviews/ 스캔: 미merge 파일 발견 → daily.md에 merge
→ 3) 주기별 요약 필요 여부 확인 → 생성
```

### 실패 시나리오별 보장

| 시나리오 | raw 로그 | 세션 회고 | daily merge | 복구 방법 |
|----------|----------|-----------|-------------|-----------|
| 정상 종료 | O | O | O | - |
| 강제종료 (Stop까지 실행됨) | O | X | X | 다음 SessionStart에서 raw → 회고 → merge |
| 강제종료 (Stop도 안 됨) | 직전 Stop까지 O | X | X | 다음 SessionStart에서 부분 복구 |
| SessionEnd 중 크래시 | O | 부분 | X | 다음 SessionStart에서 재생성 |
| SessionStart merge 중 크래시 | O | O (.reviews/) | X | 다음 SessionStart에서 재merge |
| lockfile stale | O | O (.reviews/) | X | stale 자동 해제 후 재시도 |

## 10. 설정

### 설정 파일 위치

`$CLAUDE_PLUGIN_DATA/config.json`

### 설정 스키마

```json
{
  "vaultPath": "/path/to/obsidian/vault",
  "reviewFolder": "daily-review",
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

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `vaultPath` | string | (필수) | Obsidian vault 절대 경로 |
| `reviewFolder` | string | `"daily-review"` | vault 내 회고 저장 폴더명 |
| `language` | string | `"ko"` | 회고 생성 언어 (ko, en, ja 등) |
| `periods.daily` | boolean | `true` | 일별 회고 (항상 true, 변경 불가) |
| `periods.weekly` | boolean | `true` | 주간 요약 활성화 |
| `periods.monthly` | boolean | `true` | 월간 요약 활성화 |
| `periods.quarterly` | boolean | `true` | 분기 요약 활성화 |
| `periods.yearly` | boolean | `false` | 연간 요약 활성화 |
| `profile.company` | string | `""` | 회사명 |
| `profile.role` | string | `""` | 직무/역할 |
| `profile.team` | string | `""` | 팀명 또는 담당 도메인 |
| `profile.context` | string | `""` | 하는 일 한 줄 설명 |

### profile의 활용

profile 정보는 agent 훅이 요약을 생성할 때 프롬프트에 포함된다. 이를 통해:
- 작업 요약에 비즈니스 맥락이 반영됨 (예: "JWT 구현" → "B2B SaaS 멀티테넌트 환경에서 JWT 기반 인증 설계")
- 경력기술서/이력서에 바로 쓸 수 있는 수준의 표현 생성
- 프로젝트 summary에 도메인 맥락 포함

## 11. 설치 및 설정 플로우

```
1. 설치
   $ claude plugin add claude-daily-review

2. 첫 세션 시작
   → SessionStart 훅 실행
   → config.json 없음 감지
   → Claude에게 피드백: "daily-review: vault 경로가 설정되지 않았습니다.
     /daily-review-setup 을 실행해주세요."

3. 설정 (온보딩)
   사용자: /daily-review-setup
   → 1단계: "Obsidian vault 경로를 알려주세요"
     → 경로 입력 → 유효성 검증 (디렉토리 존재 여부)
   → 2단계: 간단한 자기소개 (profile)
     → "어떤 회사에서 일하고 계신가요?"
     → "역할/직무가 뭔가요?"
     → "팀이나 담당 도메인이 있다면?"
     → "하고 계신 일을 한 줄로 설명하면?"
   → 3단계: 주기 설정 (기본값 제안)
   → config.json 저장
   → 필요한 하위 디렉토리 자동 생성

4. 재설정
   사용자: /daily-review-setup
   → 기존 설정 표시 → 변경할 항목 선택 → 저장
```

## 12. hooks/hooks.json

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/hooks/on-stop.js\"",
            "async": true,
            "timeout": 10
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "agent",
            "prompt": "You are a daily review generator. Read the transcript at the given path and generate structured review markdown files. Follow the instructions in ${CLAUDE_PLUGIN_ROOT}/dist/hooks/on-session-end-prompt.md",
            "timeout": 120
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "agent",
            "prompt": "You are a daily review assistant. Check config, recover unprocessed logs, and generate periodic summaries if needed. Follow the instructions in ${CLAUDE_PLUGIN_ROOT}/dist/hooks/on-session-start-prompt.md",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

## 13. 기술 스택

- **런타임:** Node.js (Claude Code 환경에서 보장)
- **언어:** TypeScript
- **빌드:** tsup 또는 esbuild (dist/ 출력)
- **동시성:** 세션 격리 패턴 + proper-lockfile (merge 시에만 최소 사용)
- **패키지 매니저:** npm
- **배포:** npm registry (claude plugin add로 설치)

## 14. 스코프 정의

### 1차 스코프 (MVP)

- Stop 훅으로 raw 로그 수집
- SessionEnd 훅으로 daily 회고 생성 (agent)
- SessionStart 훅으로 복구 + 주기별 요약 생성
- /daily-review-setup 온보딩 (vault 경로 + profile + 주기 설정)
- profile 기반 맥락 있는 요약 생성
- 동시성 처리 (lockfile)
- 프로젝트별 분류 + 미분류 처리
- 설정 가능한 주기 (daily/weekly/monthly/quarterly/yearly)

### 2차 스코프 (향후)

- MCP 서버 어댑터 (Claude Desktop 지원)
- 조회 도구 ("오늘 회고 보여줘", "이번 주 요약")
- 커스텀 마크다운 템플릿
- Obsidian 태그/링크 자동 연결 강화
