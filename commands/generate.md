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

### Interpretation Examples

| User input | from | to | force | Period type | Project |
|---|---|---|---|---|---|
| (empty) | - | - | no | all missing | all |
| "어제 회고" | yesterday | yesterday | yes | daily | all |
| "3월 15일 회고" | 2026-03-15 | 2026-03-15 | yes | daily | all |
| "지난주 주간 회고" | (week start) | (week end) | yes | weekly | all |
| "이번달 회고" | (month start) | today | yes | daily+monthly | all |
| "1분기 회고" | Q1 start | Q1 end | yes | quarterly | all |
| "my-app 프로젝트 3월 회고" | 03-01 | 03-31 | yes | daily+monthly | my-app |
| "올해 회고 다시 만들어줘" | year start | today | yes | all cascade | all |
| "3월 1일~15일" | 03-01 | 03-15 | yes | daily | all |

**Rules:**
- If the user specifies a specific date/period, set `force` to `yes` (they want it regenerated).
- If no input is given, run in default mode (generate only missing reviews, no force).
- For period types like "주간", "월간", "분기", "연간": generate the requested summary AND any prerequisite lower-level reviews needed as input.
- When the user mentions a project name, generate reviews for all dates but only include logs from that project's cwd.

## Step 1: Collect Data

Based on Step 0 interpretation, build the command:

```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/lib/collect-raw-logs.mjs" [OPTIONS]
```

Options (all optional):
- `--from YYYY-MM-DD` — start date filter
- `--to YYYY-MM-DD` — end date filter
- `--force` — include dates even if already generated

If no options, runs in default incremental mode (only new logs since last generation).

This outputs JSON with:
- `profile`: user's company/role/team/context
- `language`: review language
- `needs.daily`: dates that need daily review generation
- `needs.weekly`: weeks that need weekly summary
- `needs.monthly`: months that need monthly summary
- `needs.quarterly`: quarters that need quarterly summary
- `needs.yearly`: years that need yearly summary
- `logs`: raw conversation logs keyed by date

If `needs` is all empty, tell the user "해당 기간에 생성할 회고가 없습니다." and stop.

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
4. General questions go under "미분류"

Write via:
```bash
echo '<content>' | CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/lib/storage-cli.mjs" write "daily/{date}.md"
```

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

1. Read the daily reviews that belong to this week using:
```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/lib/storage-cli.mjs" read "daily/{date}.md"
```
2. Summarize into weekly review with:
   - 주요 성과
   - 기술 스택 활용
   - 핵심 의사결정
   - 성장 포인트

Write to `weekly/{week}.md`.

## Step 5: Generate Monthly Summaries

For each month in `needs.monthly`:

1. Read weekly reviews for that month (or daily reviews if weekly is empty)
2. Summarize into monthly review with:
   - 프로젝트별 진행 요약
   - 이번 달 핵심 성장
   - 기술 스택
   - 주요 의사결정 기록

Write to `monthly/{month}.md`.

## Step 6: Generate Quarterly Summaries

For each quarter in `needs.quarterly`:

1. Read monthly reviews for that quarter
2. Summarize with:
   - 분기 성과 요약
   - 핵심 역량 성장
   - 기술 스택 총괄
   - 경력기술서 하이라이트

Write to `quarterly/{quarter}.md`.

## Step 7: Generate Yearly Summaries

For each year in `needs.yearly`:

1. Read quarterly reviews for that year
2. Summarize with:
   - 연간 프로젝트 총괄
   - 핵심 역량 맵
   - 이력서용 요약
   - 경력기술서용 상세

Write to `yearly/{year}.md`.

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
