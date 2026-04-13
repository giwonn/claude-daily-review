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
- **에러 발생 시 이슈 보고 제안:** Bash 명령이 실패하면, 한국어로 에러를 설명한 뒤 다음을 실행:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/lib/issue-url.mjs" --context "generate" --message "<에러 메시지>" --stack "<스택트레이스>"
  ```
  출력된 URL을 사용자에게 보여주며: "이 문제를 GitHub 이슈로 보고하시겠습니까? [이슈 생성](<URL>)"

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
- When the user mentions a project name, generate reviews for all dates but only include logs matching that project (by `project` field, which is `owner/repo` for git repos or directory basename for non-git).

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

- **Project filter**: If the user requested a specific project, filter `logs[date]` entries to only include those whose `project` field matches. Match against both `owner/repo` format and the repo name alone (e.g., "claude-daily-review" matches "giwonn/claude-daily-review").
- **Period type filter**: If the user only requested a specific period type (e.g., "주간 회고"), only generate that type and its prerequisites. For example, if weekly is requested, generate daily reviews first (as input), then the weekly summary.

## Step 3: Generate Daily Reviews

For each date in `needs.daily`:

1. Take all log entries from `logs[date]`
2. Group by `project` field (format: `owner/repo` for git repos, directory basename otherwise). Use the repo name (after `/`) as display name.
3. For each project, further group by **topic** (feature, bug, task) based on conversation content. If a session covers multiple distinct features/topics within the same project, split them into separate sections. If only one topic exists, use a single section.
4. For each project-topic group, analyze user/assistant pairs and extract:
   - **작업 요약**: What was accomplished (use profile for business context)
   - **배운 것**: New things learned — include code snippets or configurations if present in the conversation
   - **고민한 포인트**: Decisions and reasoning — preserve the alternatives considered and why each was chosen/rejected
   - **질문과 답변**: Preserve Q&A close to the original wording. Do not over-summarize — the daily review is the closest record to the raw conversation.
   - **커밋 내역**: If `gitActivity[date]` has entries for this project's cwd (see below)
5. General questions go under "미분류"

### Using Git Activity in Daily Reviews

If `gitActivity[date]` has entries matching a project (by `project` field or `cwd`):

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

### Summarization Level by Period

| 주기 | 수준 | 설명 |
|------|------|------|
| **Daily** | 거의 원문 보존 | Q&A 원문 유지, 코드 스니펫 포함, 대화 맥락 보존. 압축보다는 정리 위주. |
| **Weekly** | 핵심 + 맥락 보존 | 왜 그런 결정을 했는지, 시행착오 과정은 유지. 반복적인 세부사항은 생략. |
| **Monthly~** | 핵심 + 맥락 보존 | Weekly와 동일 수준. 프로젝트별 진행 흐름과 의사결정 맥락 유지. |

**프로젝트 단위 요약은 항상 "핵심 + 맥락 보존" 수준을 유지한다.** 결정의 배경, 시행착오, 대안 비교는 포함하되 반복적인 디테일은 생략.

### Writing Guide by Mode

#### Mode: review (기본 회고)
현재 포맷 그대로 유지:
- **작업 요약**: 무엇을 했는지
- **배운 것**: 새로 알게 된 것
- **고민한 포인트**: 의사결정과 근거
- **질문과 답변**: 주요 Q&A (일일 회고에서는 원문에 가깝게 유지)
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

## [{project}] {topic-title}
**작업 요약:** {summary}

<!-- 같은 프로젝트에서 여러 토픽이 있으면 섹션을 반복 -->
## [{project}] {another-topic-title}
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

2. **Daily 리뷰는 "원재료"다 — 요약 대상이 아니라 복원 원본으로 다뤄라.** Daily에 기록된 구체 사건·결정·시행착오·질문 원문을 주간 내러티브에 복원해야 한다. 단순히 daily들을 4개 bullet로 눌러담는 주간 회고는 금지. Mode별 가이드는 아래 참조.

### Writing Guide by Mode (Weekly)

#### Mode: review (기본 회고) — 깊이 있는 주간 회고

다음 구조로 작성. 각 섹션은 **구체 사건 없이 일반론으로 채우지 말 것**:

```markdown
---
week: {YYYY-WNN}
type: weekly-review
period: {start} ~ {end}
projects: [{names}]
---

# {YYYY-WNN} 주간 회고 ({start} ~ {end})

## 이번 주 아크
주 초의 상태 → 중반의 전환점 → 주 말의 도달점을 한두 단락의 서사로 기술. 날짜 흐름("월요일에...수요일에...금요일에...")이 보여야 한다. 프로젝트가 여럿이면 프로젝트별 아크를 간단히 나열해도 된다.

## Keep — 잘 작동한 패턴
잘 굴러간 작업 방식·습관·의사결정. 각 항목은 **배경 + 왜 효과적이었는지** 한 문장 이상.

- **[{날짜 or 프로젝트}]** {구체 사건}: {왜 잘 됐는지}
- ...

## Problem — 어려웠던 것과 시행착오
**이 섹션이 가장 중요하다.** Daily에 기록된 막힘·재시도·잘못된 가정·되돌림·에러 디버깅·대안 비교를 주간 맥락에서 재구성. 결과만 나열하지 말고 **"왜 그 방향으로 갔는지 → 뭐가 막았는지 → 어떻게 넘어갔는지(혹은 못 넘어갔는지)"** 흐름으로 서술. 최소 2개 주제.

### {구체 주제 1}
{날짜·맥락·시도·막힘·해결/미해결. 파일명·결정·질문 원문·에러 메시지 중 최소 1개 구체 앵커 포함}

### {구체 주제 2}
...

## Try — 다음 주 시도할 것
이번 주 문제·발견에서 도출된 **검증 가능한** 행동 항목. "~할 것이다"가 아니라 "{언제·뭘·어떻게}" 구조. 최소 2개.

- [ ] {행동} (관련: {이번 주 어느 문제에서 나왔는지})
- [ ] {행동}
- ...

## Insight — 이번 주의 배움
이번 주 경험에서 추출한 일반화 가능한 패턴·원칙. "~가 중요하다" 같은 일반론 금지. **"{상황}에선 {이렇게} 해야 {결과가 나오더라}"** 형태의 구체적 통찰.

- {인사이트 1}
- ...
```

**작성 강제 요구사항**:

1. **구체 앵커 의무**: Keep·Problem·Try 각 항목은 파일명·날짜·결정 이름·질문 원문·커밋 해시·에러 메시지 중 **최소 1개** 포함.

2. **시행착오 복원**: Daily에 "X 시도 → Y 문제 → Z 전환" 흐름이 기록돼 있으면 주간에도 그 흐름이 살아야 한다. Daily가 상세하니 못 찾을 핑계 없음.

3. **길이 자유**: 주간 회고는 그 주의 맥락이 필요한 만큼 충분히 길게 써라. **상한 없음.** 활동이 많은 주는 길어지는 게 자연스럽고, 평온한 주는 짧아도 된다. 기준은 **"앞으로 본인이 이 파일을 다시 열었을 때 그 주의 맥락이 복원되는가"** — 압축을 위해 맥락을 버리지 말 것. 하한만 지킬 것.

4. **하한 요구사항**:
   - Problem: 최소 2개 주제, 각 주제는 서사 형태 (bullet 한 줄 금지)
   - Keep: 최소 1개 구체 사건
   - Try: 최소 2개 검증 가능한 행동 항목

5. **금지 표현** (나오면 해당 섹션을 구체로 다시 써라):
   - "열심히 했다"
   - "많이 배웠다"
   - "다음엔 더 잘하자"
   - "전반적으로 성공적이었다"
   - "간단히 정리하면..."

6. **톤**: bullet 나열보다 내러티브 우선. Bullet이 필요한 곳(Keep, Try)에만 bullet.

#### Mode: resume
기존 포맷 유지 (기간별 성과 요약, 핵심 역량, 주요 기술 결정, 추가 개선 방향).

#### Mode: blog
기존 포맷 유지 (기간별 시리즈 요약, 주요 토픽 정리, 다음 글 예고).

#### Mode: custom
사용자 지정 톤 유지.

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
