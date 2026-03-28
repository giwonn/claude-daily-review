---
description: Generate daily reviews and periodic summaries from raw conversation logs
allowed-tools: ["Read", "Write", "Bash"]
---

# Daily Review Generate

## Important Rules

- Write all review content in Korean.
- **NEVER show raw error messages or file paths to the user.**
- Use the user's profile to add business context.

## Step 1: Read Config and Collect Logs

Run this command to get config and raw logs:
```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/lib/collect-raw-logs.mjs"
```

This outputs a JSON with:
- `dates`: array of dates that have raw logs
- `existingDailies`: array of dates that already have daily reviews
- `logs`: object keyed by date, each containing array of `{type, message, cwd, timestamp}` entries

Also read the config for profile info:
```bash
cat "${CLAUDE_PLUGIN_DATA}/config.json"
```

## Step 2: Generate Daily Reviews

For each date in `dates` that is NOT in `existingDailies`:

1. Take all log entries for that date
2. Group by `cwd` — the last path segment is the project name
3. For each project, analyze the user/assistant conversation pairs and extract:
   - **작업 요약**: What was accomplished
   - **배운 것**: New things learned
   - **고민한 포인트**: Decisions and reasoning
   - **질문과 답변**: Key Q&A (summarized, not raw)
4. General questions (not project-specific) go under "미분류"

Write the review using storage-cli:
```bash
echo '<review content>' | CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/lib/storage-cli.mjs" write "daily/{date}.md"
```

Use this markdown format:
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

## Step 3: Report

Tell the user:
> "회고 생성 완료! 일일 회고 {count}개 생성됨."
