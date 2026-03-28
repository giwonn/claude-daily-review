---
description: Generate daily reviews and periodic summaries from raw conversation logs
allowed-tools: ["Read", "Write", "Bash"]
---

# Daily Review Generate

## Important Rules

- Write all review content in Korean.
- **NEVER show raw error messages or file paths to the user.**
- Use the user's profile to add business context.

## Step 1: Collect Data

Run:
```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/lib/collect-raw-logs.mjs"
```

This outputs JSON with:
- `profile`: user's company/role/team/context
- `language`: review language
- `needs.daily`: dates that need daily review generation
- `needs.weekly`: weeks that need weekly summary (e.g. "2026-W13")
- `needs.monthly`: months that need monthly summary
- `needs.quarterly`: quarters that need quarterly summary
- `needs.yearly`: years that need yearly summary
- `logs`: raw conversation logs keyed by date

If `needs` is all empty, tell the user "모든 회고가 최신 상태입니다!" and stop.

## Step 2: Generate Daily Reviews

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

## Step 3: Generate Weekly Summaries

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

## Step 4: Generate Monthly Summaries

For each month in `needs.monthly`:

1. Read weekly reviews for that month (or daily reviews if weekly is empty)
2. Summarize into monthly review with:
   - 프로젝트별 진행 요약
   - 이번 달 핵심 성장
   - 기술 스택
   - 주요 의사결정 기록

Write to `monthly/{month}.md`.

## Step 5: Generate Quarterly Summaries

For each quarter in `needs.quarterly`:

1. Read monthly reviews for that quarter
2. Summarize with:
   - 분기 성과 요약
   - 핵심 역량 성장
   - 기술 스택 총괄
   - 경력기술서 하이라이트

Write to `quarterly/{quarter}.md`.

## Step 6: Generate Yearly Summaries

For each year in `needs.yearly`:

1. Read quarterly reviews for that year
2. Summarize with:
   - 연간 프로젝트 총괄
   - 핵심 역량 맵
   - 이력서용 요약
   - 경력기술서용 상세

Write to `yearly/{year}.md`.

## Step 7: Report

Tell the user:
> "회고 생성 완료!"
> - 일일 회고: {count}개
> - 주간 요약: {count}개
> - 월간 요약: {count}개
> - 분기 요약: {count}개
> - 연간 요약: {count}개
