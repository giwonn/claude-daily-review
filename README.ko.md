# claude-daily-review

Claude Code 플러그인으로, 대화 내용을 자동으로 캡처하여 Obsidian vault 또는 GitHub 저장소에 구조화된 일일 회고 마크다운 파일을 생성합니다.

AI와 함께하는 일상 개발 업무를 경력 문서로 자동 변환하세요.

## 주요 기능

- **자동 수집**: 훅 기반 대화 기록으로 수동 작업 제로
- **구조화된 회고**: 프로젝트별 작업 요약, 배운 점, 의사결정, Q&A 정리
- **계단식 요약**: 일간 → 주간 → 월간 → 분기 → 연간
- **프로젝트 추적**: 이력서/경력기술서용 프로젝트별 누적 요약
- **Obsidian 연동**: 태그와 링크가 포함된 마크다운 직접 출력
- **GitHub 연동**: OAuth 인증으로 GitHub 저장소에 회고 저장
- **동시성 안전**: 세션 격리 쓰기 + 지연 병합으로 데이터 무결성 보장
- **강제종료 복구**: 강제 종료 시에도 원시 로그 보존

## 설치

```bash
claude plugin add claude-daily-review
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

## 동작 원리

```
매 응답 완료  →  원시 로그 저장 (비동기, 논블로킹)
세션 종료     →  AI가 구조화된 회고 생성
다음 세션     →  회고를 일일 파일에 병합 + 주기별 요약 생성
```

## 폴더 구조

```
daily-review/
├── daily/2026-03-28.md          ← 일일 회고 (모든 프로젝트)
├── weekly/2026-W13.md           ← 주간 요약
├── monthly/2026-03.md           ← 월간 요약
├── quarterly/2026-Q1.md         ← 분기 요약
├── yearly/2026.md               ← 연간 요약
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
      "basePath": "daily-review"
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

## 라이선스

MIT
