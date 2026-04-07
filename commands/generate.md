---
description: Generate reviews from raw conversation logs (supports natural language targeting)
allowed-tools: ["Read", "Write", "Bash"]
---

# Generate Reviews

## Important Rules

- Write all review content in Korean.
- **NEVER show raw error messages or file paths to the user.**
- Use the user's profile to add business context.
- Today's date: use the system date for resolving relative expressions.

## Step 0: Interpret User Request

The user may provide a natural language request as arguments. Parse their intent to determine:

1. **Date scope** — which dates/periods to generate
2. **Period type** — daily, weekly, monthly, quarterly, yearly (or all cascading)
3. **Project filter** — specific project name (optional)
4. **Force regeneration** — whether to regenerate already-generated reviews
5. **Mode** — review, resume, blog, or custom

### Interpretation Examples

| User input | from | to | force | Period type | Project | Mode |
|---|---|---|---|---|---|---|
| (empty) | - | - | no | all missing | all | review |
| "어제 회고" | yesterday | yesterday | yes | daily | all | review |
| "3월 15일 회고" | 2026-03-15 | 2026-03-15 | yes | daily | all | review |
| "지난주 주간 회고" | (week start) | (week end) | yes | weekly | all | review |
| "이번달 회고" | (month start) | today | yes | daily+monthly | all | review |
| "1분기 회고" | Q1 start | Q1 end | yes | quarterly | all | review |
| "my-app 프로젝트 3월 회고" | 03-01 | 03-31 | yes | daily+monthly | my-app | review |
| "올해 회고 다시 만들어줘" | year start | today | yes | all cascade | all | review |
| "3월 1일~15일" | 03-01 | 03-15 | yes | daily | all | review |
| "블로그로 3월 정리" | 03-01 | 03-31 | yes | daily+monthly | all | blog |
| "경력기술서용 1분기 요약" | Q1 start | Q1 end | yes | quarterly | all | resume |
| "팀 주간보고서로 이번주" | (week start) | today | yes | weekly | all | custom |

**Rules:**
- If the user specifies a specific date/period, set `force` to `yes` (they want it regenerated).
- If no input is given, run in default mode (generate only missing reviews, no force).
- For period types like "주간", "월간", "분기", "연간": generate the requested summary AND any prerequisite lower-level reviews needed as input.
- When the user mentions a project name, generate reviews for all dates but only include logs from that project's cwd.

**Mode 판단 규칙:**
- "블로그", "블로그용", "블로그로", "포스트" → `blog` (프리셋 가이드 적용)
- "경력기술서", "이력서", "레쥬메", "resume" → `resume` (프리셋 가이드 적용)
- 위에 해당 안 되면 → `review` (기본값)
- 단, 사용자가 특정 형식/톤을 명시하면 그 지시를 최우선으로 따른다
  예: "팀 주간보고서로" → review 구조 기반이되, 보고서 톤으로 작성
  예: "발표 자료용으로" → 핵심 포인트 중심, 슬라이드 친화적 구조

## Step 1: Collect Data

Based on Step 0 interpretation, build the command:

```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/lib/collect-raw-logs.mjs" --flush [OPTIONS]
```

Options (all optional):
- `--flush` — 로컬 버퍼를 먼저 원격 저장소에 flush (항상 포함)
- `--from YYYY-MM-DD` — start date filter
- `--to YYYY-MM-DD` — end date filter
- `--force` — include dates even if already generated
- `--project <name>` — 특정 프로젝트만 필터링

If no options (other than `--flush`), runs in default incremental mode (only new logs since last generation).

This outputs JSON with:
- `profile`: user's company/role/team/context
- `language`: review language
- `needs.daily`: dates that need daily review generation
- `needs.weekly`: weeks that need weekly summary
- `needs.monthly`: months that need monthly summary
- `needs.quarterly`: quarters that need quarterly summary
- `needs.yearly`: years that need yearly summary
- `logs`: raw conversation logs keyed by date
- `gitActivity`: git commit entries keyed by date (each with `action`, `hash`, `branch`, `message`, `remote`, `ghAccount`, `cwd`)

If `needs` is all empty, tell the user "해당 기간에 생성할 회고가 없습니다." and stop.

## Step 1.5: Git Account Access Check

If `gitActivity` has entries, verify account access before generating reviews:

1. Collect unique `ghAccount` values from all git entries
2. Run `gh auth status` to get the list of currently authenticated accounts
3. For each `ghAccount` NOT in the authenticated list, ask the user via AskUserQuestion:
   > "다음 GitHub 계정의 커밋 이력이 있지만, 현재 gh에 로그인되어 있지 않습니다: `{account}`"
   - option 1: label: "로그인하기", description: "gh auth login으로 인증합니다"
   - option 2: label: "해당 커밋 무시", description: "이 계정의 커밋 정보 없이 진행합니다"
   - If "로그인하기": Tell the user to run `! gh auth login` in their terminal, then verify with `gh auth status`
   - If "해당 커밋 무시": Remove that account's entries from `gitActivity`
4. Remember the original active account (`gh auth status --active`) so you can restore it later

## Step 2: Apply Filters

- **Project filter**: If the user requested a specific project, filter `logs[date]` entries to only include those where the last path segment of `cwd` matches the project name.
- **Period type filter**: If the user only requested a specific period type (e.g., "주간 회고"), only generate that type and its prerequisites. For example, if weekly is requested, generate daily reviews first (as input), then the weekly summary.

## Step 3: Generate Daily Reviews

For each date in `needs.daily`:

1. Take all log entries from `logs[date]`
2. Group by `cwd` (last path segment = project name)
3. For each project, analyze user/assistant pairs and extract:
   - **작업 요약**: What was accomplished (use profile for business context)
   - **배운 것**: New things learned
   - **고민한 포인트**: Decisions and reasoning
   - **질문과 답변**: Key Q&A (summarized)
   - **커밋 내역**: If `gitActivity[date]` has entries for this project's cwd (see below)
4. General questions go under "미분류"

### Using Git Activity in Daily Reviews

If `gitActivity[date]` has entries matching a project (by `cwd`):

1. Switch gh account if needed: `gh auth switch --user <ghAccount>`
2. Parse `remote` to extract `owner/repo`:
   - SSH format `git@github.com:owner/repo.git` → `owner/repo`
   - HTTPS format `https://github.com/owner/repo.git` → `owner/repo`
3. Fetch commit details: `gh api repos/{owner}/{repo}/commits/{hash} --jq '.files[].filename'` to see changed files
4. Use the conversation context + commit info to describe what was actually implemented
5. After all lookups for a given account, switch back to the original account

Include in the review:
```markdown
**커밋 내역:**
- [`{short_hash}`](https://github.com/{owner}/{repo}/commit/{hash}) — {message}
```

### Writing Guide by Mode

#### Mode: review (기본 회고)
현재 포맷 그대로 유지:
- **작업 요약**: 무엇을 했는지
- **배운 것**: 새로 알게 된 것
- **고민한 포인트**: 의사결정과 근거
- **질문과 답변**: 주요 Q&A
- **커밋 내역**: git 활동

#### Mode: resume (경력기술서)
톤: 공식적, 성과 중심. 독자는 채용 담당자.
각 프로젝트/작업 단위로 다음 구조:
- **문제/배경**: 어떤 상황에서 어떤 문제를 마주했는지
- **대안 검토**: 어떤 해결책들을 고민했는지 (raw 데이터에 있는 경우만)
- **선택 근거**: 왜 이 방법을 택했는지 (raw 데이터에 있는 경우만)
- **시행착오/트러블슈팅**: 과정에서 겪은 어려움과 해결
- **성과/임팩트**: 최종적으로 어떤 결과를 냈는지
- **추가 개선 방향**: 더 발전시킨다면 어떻게 할 것인지

raw 데이터에 고민 과정이나 대안 비교가 없으면 해당 섹션은 생략한다.
각 섹션은 raw 데이터에 있는 것만으로 작성하며, 추측하거나 꾸며내지 않는다.

#### Mode: blog (블로그)
톤: 대화체, 스토리텔링. 독자는 개발자 커뮤니티.
다음 흐름으로 작성:
- **도입**: 어떤 문제/과제를 만났는지 (독자의 공감을 유도)
- **시도와 과정**: 어떻게 접근했는지, 시행착오 포함
- **해결**: 최종 해결책과 핵심 코드/설정 (있으면)
- **인사이트**: 이 경험에서 독자가 가져갈 수 있는 것
- **마무리**: 앞으로의 방향이나 관련 주제 언급

코드 블록이나 설정 예시가 raw 데이터에 있으면 적극 활용한다.

#### Mode: custom (사용자 지정)
사용자가 명시한 형식/톤 지시를 최우선으로 따른다.
review 구조를 기본 베이스로 하되, 사용자의 요구에 맞게 조정한다.

모든 일일 리뷰를 생성한 후 한 번에 저장:
```bash
echo '<JSON array of {path, content} objects>' | CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/lib/storage-cli.mjs" batch-write
```

저장 경로는 mode에 따라 분기한다:
- review: `daily/{date}.md`
- resume: `resume/daily/{date}.md`
- blog: `blog/daily/{date}.md`
- custom: 사용자가 지정하지 않으면 review와 동일 경로 사용

Format:
```markdown
---
date: {date}
type: daily-review
projects: [{names}]
---

# {date} Daily Review

## [{project}] {title}
**작업 요약:** {summary}
**배운 것:**
- {item}
**고민한 포인트:**
- {decision} → {choice} ({reason})
**질문과 답변:**
- Q: {question}
  → A: {answer}

## 미분류
- Q: {question}
  → A: {answer}
```

## Step 4: Generate Weekly Summaries

For each week in `needs.weekly`:

1. 해당 기간의 하위 리뷰를 한 번에 읽기:
```bash
echo '<JSON array of paths>' | CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/lib/storage-cli.mjs" batch-read
```
2. Summarize into weekly review with:
   - 주요 성과
   - 기술 스택 활용
   - 핵심 의사결정
   - 성장 포인트

계단식 요약은 mode에 따라 톤과 구조를 유지한다:
- **review**: 현재 포맷 (주요 성과, 기술 스택, 핵심 의사결정, 성장 포인트)
- **resume**: 기간별 성과 요약, 핵심 역량, 주요 기술 결정, 추가 개선 방향
- **blog**: 기간별 시리즈 요약, 주요 토픽 정리, 다음 글 예고
- **custom**: 사용자 지정 톤 유지

저장 경로는 mode에 따라 분기한다:
- review: `weekly/{week}.md`
- resume: `resume/weekly/{week}.md`
- blog: `blog/weekly/{week}.md`
- custom: 사용자가 지정하지 않으면 review와 동일 경로 사용

모든 주간 요약을 생성한 후 한 번에 저장:
```bash
echo '<JSON array of {path, content} objects>' | CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/lib/storage-cli.mjs" batch-write
```

## Step 5: Generate Monthly Summaries

For each month in `needs.monthly`:

1. 해당 기간의 하위 리뷰를 한 번에 읽기:
```bash
echo '<JSON array of paths>' | CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/lib/storage-cli.mjs" batch-read
```
2. Summarize into monthly review with:
   - 프로젝트별 진행 요약
   - 이번 달 핵심 성장
   - 기술 스택
   - 주요 의사결정 기록

계단식 요약은 mode에 따라 톤과 구조를 유지한다:
- **review**: 현재 포맷 (주요 성과, 기술 스택, 핵심 의사결정, 성장 포인트)
- **resume**: 기간별 성과 요약, 핵심 역량, 주요 기술 결정, 추가 개선 방향
- **blog**: 기간별 시리즈 요약, 주요 토픽 정리, 다음 글 예고
- **custom**: 사용자 지정 톤 유지

저장 경로는 mode에 따라 분기한다:
- review: `monthly/{month}.md`
- resume: `resume/monthly/{month}.md`
- blog: `blog/monthly/{month}.md`
- custom: 사용자가 지정하지 않으면 review와 동일 경로 사용

모든 월간 요약을 생성한 후 한 번에 저장:
```bash
echo '<JSON array of {path, content} objects>' | CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/lib/storage-cli.mjs" batch-write
```

## Step 6: Generate Quarterly Summaries

For each quarter in `needs.quarterly`:

1. 해당 기간의 하위 리뷰를 한 번에 읽기:
```bash
echo '<JSON array of paths>' | CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/lib/storage-cli.mjs" batch-read
```
2. Summarize with:
   - 분기 성과 요약
   - 핵심 역량 성장
   - 기술 스택 총괄
   - 경력기술서 하이라이트

계단식 요약은 mode에 따라 톤과 구조를 유지한다:
- **review**: 현재 포맷 (주요 성과, 기술 스택, 핵심 의사결정, 성장 포인트)
- **resume**: 기간별 성과 요약, 핵심 역량, 주요 기술 결정, 추가 개선 방향
- **blog**: 기간별 시리즈 요약, 주요 토픽 정리, 다음 글 예고
- **custom**: 사용자 지정 톤 유지

저장 경로는 mode에 따라 분기한다:
- review: `quarterly/{quarter}.md`
- resume: `resume/quarterly/{quarter}.md`
- blog: `blog/quarterly/{quarter}.md`
- custom: 사용자가 지정하지 않으면 review와 동일 경로 사용

모든 분기 요약을 생성한 후 한 번에 저장:
```bash
echo '<JSON array of {path, content} objects>' | CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/lib/storage-cli.mjs" batch-write
```

## Step 7: Generate Yearly Summaries

For each year in `needs.yearly`:

1. 해당 기간의 하위 리뷰를 한 번에 읽기:
```bash
echo '<JSON array of paths>' | CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/lib/storage-cli.mjs" batch-read
```
2. Summarize with:
   - 연간 프로젝트 총괄
   - 핵심 역량 맵
   - 이력서용 요약
   - 경력기술서용 상세

계단식 요약은 mode에 따라 톤과 구조를 유지한다:
- **review**: 현재 포맷 (주요 성과, 기술 스택, 핵심 의사결정, 성장 포인트)
- **resume**: 기간별 성과 요약, 핵심 역량, 주요 기술 결정, 추가 개선 방향
- **blog**: 기간별 시리즈 요약, 주요 토픽 정리, 다음 글 예고
- **custom**: 사용자 지정 톤 유지

저장 경로는 mode에 따라 분기한다:
- review: `yearly/{year}.md`
- resume: `resume/yearly/{year}.md`
- blog: `blog/yearly/{year}.md`
- custom: 사용자가 지정하지 않으면 review와 동일 경로 사용

모든 연간 요약을 생성한 후 한 번에 저장:
```bash
echo '<JSON array of {path, content} objects>' | CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/lib/storage-cli.mjs" batch-write
```

## Step 8: Update last-generated timestamp

**Only update if running in default mode (no user-specified scope).**

If the user requested a specific date/period/project, do NOT update `last-generated.json` — the incremental tracking should remain unchanged.

If running in default mode, save the `newTimestamp` from Step 1:
```bash
echo '{"timestamp":"NEW_TIMESTAMP_VALUE"}' > "${CLAUDE_PLUGIN_DATA}/last-generated.json"
```

## Step 9: Report

Tell the user what was generated:
> "회고 생성 완료!"
> - 일일 회고: {count}개
> - 주간 요약: {count}개
> - 월간 요약: {count}개
> - 분기 요약: {count}개
> - 연간 요약: {count}개

Only show lines where count > 0.

If git activity was included, also report:
> - 커밋 연동: {count}개 커밋 반영

If any git entries were skipped (account not logged in), note:
> - ⚠ 일부 커밋은 GitHub 계정 미연동으로 제외됨
