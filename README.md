# claude-daily-review

Claude Code plugin that automatically captures your conversations and generates structured daily review markdown files in your Obsidian vault.

Turn your daily AI-assisted development work into career documentation — automatically.

## Features

- **Auto-capture**: Hook-based conversation logging with zero manual effort
- **Structured reviews**: Work summaries, learnings, decisions, and Q&A organized by project
- **Cascading summaries**: Daily → Weekly → Monthly → Quarterly → Yearly
- **Project tracking**: Per-project summaries for resume/portfolio building
- **Obsidian integration**: Direct markdown output with tags and links
- **Concurrency-safe**: Session-isolated writes with deferred merge
- **Crash recovery**: Raw logs preserved even on force-quit

## Installation

```bash
claude plugin add claude-daily-review
```

## Setup

On first run, you'll be prompted to configure the plugin. Or run manually:

```
/daily-review-setup
```

This will ask for:
1. Your Obsidian vault path
2. A brief professional profile (company, role, team)
3. Which summary periods to enable

## How It Works

```
Every response  →  Raw log saved (async, non-blocking)
Session end     →  AI generates structured review
Next session    →  Reviews merged into daily file + periodic summaries generated
```

## Vault Structure

```
vault/daily-review/
├── daily/2026-03-28.md          ← Daily review (all projects)
├── weekly/2026-W13.md           ← Weekly summary
├── monthly/2026-03.md           ← Monthly summary
├── quarterly/2026-Q1.md         ← Quarterly summary
├── yearly/2026.md               ← Yearly summary
├── projects/my-app/
│   ├── 2026-03-28.md            ← Project daily detail
│   └── summary.md               ← Cumulative project summary
└── uncategorized/2026-03-28.md  ← Non-project questions
```

## Configuration

Config is stored at `$CLAUDE_PLUGIN_DATA/config.json`:

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
    "company": "Your Company",
    "role": "Your Role",
    "team": "Your Team",
    "context": "What you do in one line"
  }
}
```

## License

MIT
