# 변경 이력

## 0.7.0

- 일간 회고에 토픽 단위 그룹핑 추가 — 같은 프로젝트 내 로그를 기능/토픽별로 분리하여 더 명확한 회고 생성
- generate 프롬프트에 대화 내용 기반 토픽 자동 분류 지시 추가

## 0.6.0

- `/generate` 커맨드에 모드 시스템 추가 — `review`(기본), `resume`, `blog` 프리셋별 톤과 구조 지원
- 로컬 버퍼 모듈 추가 — 매 턴마다 원격 저장이 아닌 10KB 임계값 기반 flush 방식으로 변경
- 인덱스 매니저 추가 — `index.json`으로 날짜/프로젝트별 빠른 조회 (`byDate`, `byProject`, `sessions` 맵)
- `storage-cli`에 `batch-read`, `batch-write` 커맨드 추가
- `recover-sessions`를 `on-session-start` 훅으로 대체 — 버퍼 flush, git 활동 파싱, 회고 생성 리마인더 통합
- 기존 raw 로그에서 인덱스를 빌드하는 마이그레이션 커맨드 추가
- 인덱스 누락 시 자동 감지 및 마이그레이션 안내 추가

## 0.5.1

- `check-config`에 OK 출력 추가 및 `recover-sessions`가 관련 날짜만 확인하도록 최적화

## 0.5.0

- raw 로그 디렉토리 구조를 `.raw/{session}/{date}`에서 `raw/{date}/{session}`으로 변경 — 날짜 우선 접근 패턴
- 기존 디렉토리 구조에서 수동 마이그레이션을 위한 `/daily-review-migrate` 커맨드 추가
- 레거시 `.raw` 디렉토리 감지 시 세션 시작에서 마이그레이션 안내 표시
- 시크릿 삭제를 설정 가능 옵션에서 항상 활성으로 변경

## 0.4.1

- 캡처된 로그에서 API 키, 토큰, 비밀번호를 삭제하는 시크릿 삭제 기능 추가
- 보안 공개 문서 추가

## 0.4.0

- 세션 트랜스크립트에서 git 커밋 활동 캡처 추가 — 커밋이 파싱되어 GitHub 링크와 함께 일간 회고에 포함

## 0.3.12

- 세션 `.meta.json`을 원격이 아닌 로컬에 저장하도록 수정
- GitHub 저장소의 `basePath` 기본값을 빈 문자열(저장소 루트)로 수정

## 0.3.10

- 셋업 중 `storage-cli`에 `CLAUDE_PLUGIN_DATA` 환경변수가 전달되지 않던 문제 수정

## 0.3.9

- 불완전한 설정을 올바르게 감지하여 셋업 플로우를 트리거하도록 수정

## 0.3.8

- 원격 저장소에서 공유 설정을 읽기 전에 임시 설정을 먼저 저장하도록 수정

## 0.3.7

- 마켓플레이스 소스를 SHA 고정에서 태그 ref(`v{version}`)로 전환
- `marketplace.json`에서 중복 version 필드 제거

## 0.3.5

- 릴리즈, 퍼블리시, 마켓플레이스 CI 워크플로우를 단일 워크플로우로 통합

## 0.3.3

- `/generate` 커맨드 추가 (`/daily-review-generate`에서 이름 변경) — 자연어 날짜/기간 파싱 지원
- 계단식 회고 생성 추가: daily → weekly → monthly → quarterly → yearly
- `last-generated.json` 타임스탬프 기반 증분 생성 추가
- 데이터 수집을 단순화하는 `collect-raw-logs` 헬퍼 스크립트 추가
- raw 로그 포맷을 user/assistant 별도 행으로 분리, 단일 API 호출로 변경
- 사용자 질문 캡처를 위한 `UserPromptSubmit` 훅 추가 후, Stop 훅의 트랜스크립트 기반 캡처로 대체
- 프로필 설정 및 GitHub 저장소를 통한 공유 설정 동기화용 `AskUserQuestion` UI 추가
- macOS에서 훅 스크립트 실행 권한 수정
- Windows 호환성을 위해 모든 `node -e` 호출을 `.mjs` 스크립트로 교체

## 0.3.2

- 셋업 플로우를 `commands/`로 이동 — `AskUserQuestion` 인터랙티브 UI 지원

## 0.3.1

- Claude Code 플러그인 호환을 위해 스킬 구조를 `folder/SKILL.md` 형식으로 수정

## 0.3.0

- TypeScript 빌드 시스템 제거 — `.mjs` + JSDoc 기반 무빌드 플러그인 배포로 전환
- 플러그인 검색을 위한 마켓플레이스 매니페스트 추가

## 0.2.1

- 패키지명을 `@giwonn/claude-daily-review` 스코프 패키지로 변경
- SessionStart를 설정 체크 + 에이전트 기반 세션 복구로 분리

## 0.1.1

- 전체 일간 회고 파이프라인을 갖춘 최초 릴리즈
- `StorageAdapter` 인터페이스와 `LocalStorageAdapter`, `GitHubStorageAdapter` 구현
- GitHub OAuth Device Flow 인증 구현
- 매 턴마다 user/assistant 대화를 캡처하는 On-Stop 훅 추가
- 세션 생명주기를 위한 SessionStart, SessionEnd 에이전트 훅 추가
- 플러그인 온보딩을 위한 `/daily-review-setup` 스킬 추가
- 핵심 모듈 구현: Config, Vault, Periods, Raw Logger, Merge
- 이중 저장소 백엔드 지원 (로컬 파일시스템 및 GitHub 저장소)
