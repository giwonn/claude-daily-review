# claude-daily-review

[![GitHub Release](https://img.shields.io/github/v/release/giwonn/claude-daily-review)](https://github.com/giwonn/claude-daily-review/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://github.com/giwonn/claude-daily-review)

Claude Code 플러그인으로, 대화 내용을 자동으로 캡처하여 Obsidian vault 또는 GitHub 저장소에 구조화된 회고 마크다운 파일을 생성합니다.

AI와 함께하는 일상 개발 업무를 경력 문서로 변환하세요 — 원할 때 바로.

## 주요 기능

- **자동 수집**: 매 턴마다 훅 기반 대화 기록 + 로컬 버퍼링
- **온디맨드 회고 생성**: 원할 때 자연어로 회고 생성 (`/generate`)
- **회고 모드**: 일일 회고, 경력기술서, 블로그, 커스텀 형식으로 생성
- **자연어 타겟팅**: "어제 회고", "1분기 요약", "my-app 프로젝트 3월 회고"
- **프로젝트별 회고**: 특정 프로젝트만 필터하여 회고 생성
- **구조화된 회고**: 프로젝트별 작업 요약, 배운 점, 의사결정, Q&A 정리
- **계단식 요약**: 일간 → 주간 → 월간 → 분기 → 연간
- **Git 커밋 연동**: 세션 중 생성된 커밋을 자동 캡처하여 회고에 링크 포함
- **시크릿 자동 마스킹**: API 키, 토큰, 비밀번호 등을 저장 전 자동으로 마스킹
- **로컬 버퍼 + 인덱스**: 로컬 버퍼링과 인덱스 기반 빠른 조회로 API 호출 최소화
- **Obsidian 연동**: 태그와 링크가 포함된 마크다운 직접 출력
- **GitHub 연동**: OAuth 인증으로 GitHub 저장소에 회고 저장
- **멀티 머신 동기화**: GitHub 저장소를 통해 여러 PC에서 설정 자동 공유
- **회고 알림**: 2주 이상 회고를 생성하지 않으면 세션 시작 시 알림

## 설치

**터미널에서:**
```bash
claude plugin marketplace add giwonn/claude-daily-review
claude plugin install claude-daily-review@giwonn-plugins
```

**Claude Code 내에서:**
```
/plugin marketplace add giwonn/claude-daily-review
/plugin install claude-daily-review@giwonn-plugins
```

## 설정

처음 실행 시 자동으로 설정 안내가 표시됩니다. 또는 수동으로 실행:

```
/daily-review-setup
```

설정 과정:
1. 저장소 선택: **로컬** (Obsidian vault 등) 또는 **GitHub** (원격 저장소)
2. 간단한 자기소개 (회사, 직무, 팀)
3. 요약 주기 선택

## 동작 원리

```
매 턴 (Stop 훅)
  │
  ├─→ 로컬 버퍼에 append + 인덱스 갱신
  │
  └─→ 버퍼 > 10KB? ──yes──→ GitHub에 flush
                      no──→ 대기

세션 시작
  │
  ├─→ 이전 세션의 미flush 버퍼 → GitHub 동기화
  ├─→ 트랜스크립트에서 git activity 파싱
  └─→ 회고 알림 체크 (2주 이상?)

/generate "블로그로 3월 정리"
  │
  ├─→ 의도 파싱 (날짜 / 프로젝트 / 모드)
  ├─→ 로컬 버퍼 전체 flush
  ├─→ 인덱스 조회 → 대상 로그 수집
  ├─→ 모드별 회고 생성 (review / resume / blog / custom)
  └─→ 일괄 저장
```

### 회고 생성

`/generate`에 자연어로 원하는 범위를 지정할 수 있습니다:

```
/generate                              → 누락된 회고 전체 생성
/generate 어제 회고 만들어줘             → 어제 일일 회고
/generate 지난주 주간 회고               → 지난주 주간 요약
/generate 1분기 회고                    → 1분기 분기 요약
/generate my-app 프로젝트 3월 회고       → my-app만 필터한 3월 회고
/generate 3월 1일~15일                  → 날짜 범위 일일 회고
```

인자 없이 실행하면 아직 생성되지 않은 회고를 모두 생성합니다 (증분 모드).

#### 회고 모드

출력 형식을 자연어로 지정할 수 있습니다:

```
/generate 블로그로 3월 정리               → 블로그 형식
/generate 경력기술서용 1분기 요약          → 경력기술서 형식
/generate 팀 주간보고서로 이번주           → 커스텀 형식 (팀 보고서)
```

| 모드 | 톤 | 구조 |
|------|-----|------|
| **review** (기본) | 내부용, 간결 | 작업 요약, 배운 것, 고민, Q&A |
| **resume** | 공식적, 성과 중심 | 문제 → 대안 → 선택 근거 → 성과 → 개선 방향 |
| **blog** | 대화체, 스토리텔링 | 도입 → 시도 → 해결 → 인사이트 |
| **custom** | 사용자 지정 | 사용자의 형식/톤 지시를 따름 |

### Git 커밋 연동

세션 중 git 커밋을 하면 플러그인이 자동으로:
1. 트랜스크립트에서 커밋 해시, 브랜치, 메시지를 추출
2. 리모트 URL과 GitHub 계정 정보를 확인
3. 일일 회고에 GitHub 링크가 포함된 커밋 내역을 추가

## 업그레이드

v0.5.x에서 업그레이드하는 경우, 마이그레이션 커맨드를 실행하여 인덱스를 생성하세요:

```
/daily-review-migrate
```

기존 raw 로그를 스캔하여 빠른 조회를 위한 로컬 인덱스를 생성합니다. 인덱스가 없으면 플러그인이 자동으로 안내합니다.

## GitHub 저장소

GitHub를 저장소 백엔드로 선택하면, **OAuth Device Flow**로 인증합니다 — 개인 액세스 토큰이 필요 없습니다.

### 인증

1. 플러그인이 GitHub에 디바이스 코드를 요청합니다
2. `https://github.com/login/device`에 접속하여 표시된 코드를 입력합니다
3. 승인하면 플러그인이 OAuth 토큰을 자동으로 수신하여 저장합니다

### 저장소 설정

인증 후 선택할 수 있습니다:
- **새 저장소 생성** — 계정에 비공개 저장소를 자동 생성
- **기존 저장소 사용** — owner/repo 형식으로 입력

### 동작 방식

파일은 **GitHub Contents API**를 통해 읽고 쓰여집니다. 각 회고 파일은 마크다운 파일로 저장소에 직접 커밋되며, 로컬 저장소와 동일한 폴더 구조를 사용합니다. 로컬 git 설치가 필요 없습니다.

프로필, 언어, 주기 설정은 저장소의 `.config.json`에 저장되어 다른 PC에서 인증만 하면 자동으로 복원됩니다.

## 폴더 구조

```
daily-review/
├── raw/2026-03-28/              ← 원시 대화 로그 (날짜별)
│   └── {session-id}.jsonl
├── daily/2026-03-28.md          ← 일일 회고 (모든 프로젝트)
├── weekly/2026-W13.md           ← 주간 요약
├── monthly/2026-03.md           ← 월간 요약
├── quarterly/2026-Q1.md         ← 분기 요약
├── yearly/2026.md               ← 연간 요약
├── resume/                      ← 경력기술서 모드 출력
│   ├── daily/2026-03-28.md
│   └── quarterly/2026-Q1.md
├── blog/                        ← 블로그 모드 출력
│   ├── daily/2026-03-28.md
│   └── monthly/2026-03.md
├── projects/my-app/
│   ├── 2026-03-28.md            ← 프로젝트별 일일 상세
│   └── summary.md               ← 프로젝트 누적 요약
└── uncategorized/2026-03-28.md  ← 프로젝트와 무관한 질문
```

## 설정 파일

설정은 `$CLAUDE_PLUGIN_DATA/config.json`에 저장됩니다.

### 로컬 저장소 예시

```json
{
  "storage": {
    "type": "local",
    "local": {
      "basePath": "/path/to/obsidian/vault/daily-review"
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
    "company": "회사명",
    "role": "직무",
    "team": "팀명",
    "context": "하는 일 한 줄 설명"
  }
}
```

### GitHub 저장소 예시

```json
{
  "storage": {
    "type": "github",
    "github": {
      "owner": "github-username",
      "repo": "daily-review",
      "token": "<OAuth flow가 자동 저장>",
      "basePath": ""
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
    "company": "회사명",
    "role": "직무",
    "team": "팀명",
    "context": "하는 일 한 줄 설명"
  }
}
```

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

## 라이선스

MIT
