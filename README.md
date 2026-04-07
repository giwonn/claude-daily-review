# claude-daily-review

[![GitHub Release](https://img.shields.io/github/v/release/giwonn/claude-daily-review)](https://github.com/giwonn/claude-daily-review/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://github.com/giwonn/claude-daily-review)

[한국어](README.ko.md)

Claude Code plugin that automatically captures your conversations and generates structured review markdown files in your Obsidian vault or GitHub repository.

Turn your daily AI-assisted development work into career documentation — on demand.

## Features

- **Auto-capture**: Hook-based conversation logging on every turn with local buffering
- **On-demand reviews**: Generate reviews when you want with natural language (`/generate`)
- **Review modes**: Generate as daily retrospective, career resume, blog post, or custom format
- **Natural language targeting**: "yesterday's review", "Q1 summary", "my-app project March review"
- **Project-based reviews**: Filter and generate reviews for specific projects
- **Structured reviews**: Work summaries, learnings, decisions, and Q&A organized by project
- **Cascading summaries**: Daily → Weekly → Monthly → Quarterly → Yearly
- **Git commit integration**: Automatically captures git commits from sessions and links them in reviews
- **Secret redaction**: API keys, tokens, and passwords are automatically masked before storage
- **Local buffer + index**: Minimized API calls with local buffering and index-based fast lookups
- **Obsidian integration**: Direct markdown output with tags and links
- **GitHub integration**: Store reviews in a GitHub repo with OAuth authentication
- **Multi-machine sync**: GitHub storage shares config across machines automatically
- **Review reminder**: Notifies when reviews haven't been generated in 2+ weeks

## Installation

**From terminal:**
```bash
claude plugin marketplace add giwonn/claude-daily-review
claude plugin install claude-daily-review@giwonn-plugins
```

**From Claude Code:**
```
/plugin marketplace add giwonn/claude-daily-review
/plugin install claude-daily-review@giwonn-plugins
```

## Setup

On first run, you'll be prompted to configure the plugin. Or run manually:

```
/daily-review-setup
```

This will ask for:
1. Your storage choice: **local** (Obsidian vault or any directory) or **GitHub** (remote repository)
2. A brief professional profile (company, role, team)
3. Which summary periods to enable

## How It Works

```
Every Turn (Stop hook)
  │
  ├─→ Local buffer append + index update
  │
  └─→ Buffer > 10KB? ──yes──→ Flush to GitHub
                       no──→ Wait

Session Start
  │
  ├─→ Flush previous sessions' buffers → GitHub
  ├─→ Parse git activity from transcripts
  └─→ Review reminder check (2+ weeks?)

/generate "blog post for March"
  │
  ├─→ Parse intent (date / project / mode)
  ├─→ Flush all local buffers
  ├─→ Index lookup → collect target logs
  ├─→ Generate reviews (review / resume / blog / custom)
  └─→ Batch write to storage
```

### Generating Reviews

Use `/generate` with natural language to control what gets generated:

```
/generate                                → Generate all missing reviews
/generate yesterday's review             → Daily review for yesterday
/generate last week's weekly summary     → Weekly summary for last week
/generate Q1 review                      → Quarterly summary for Q1
/generate my-app project March review    → March review filtered to my-app
/generate March 1-15                     → Daily reviews for date range
```

#### Review Modes

You can specify the output format with natural language:

```
/generate 블로그로 3월 정리               → Blog post format
/generate 경력기술서용 1분기 요약          → Career resume format
/generate 팀 주간보고서로 이번주           → Custom format (team report)
```

| Mode | Tone | Structure |
|------|------|-----------|
| **review** (default) | Internal, concise | Work summary, learnings, decisions, Q&A |
| **resume** | Formal, outcome-focused | Problem → alternatives → decision → impact → improvements |
| **blog** | Conversational, storytelling | Introduction → attempts → solution → insights |
| **custom** | User-specified | Follows user's format/tone instructions |

### Git Commit Integration

When you make git commits during a session, the plugin automatically:
1. Extracts commit hashes, branches, and messages from the transcript
2. Resolves remote URLs and GitHub account info
3. Includes commit details in daily reviews with links to GitHub

## Upgrading

If you're upgrading from v0.5.x, run the migration command to build the index:

```
/daily-review-migrate
```

This scans existing raw logs and creates a local index for fast lookups. The plugin will prompt you automatically if the index is missing.

## GitHub Storage

When you choose GitHub as your storage backend, the plugin authenticates using the **OAuth Device Flow** — no personal access tokens required.

### Authentication

1. The plugin requests a device code from GitHub
2. You visit `https://github.com/login/device` and enter the code
3. After you authorize, the plugin receives and stores an OAuth token automatically

### Repository Setup

After authenticating, you can either:
- **Create a new repository** — the plugin creates a private repo on your account
- **Use an existing repository** — enter the owner and repo name to use a repo you already have

### How It Works

Files are read and written via the **GitHub Contents API**. Each review file is committed directly to the repository as a markdown file, using the same folder structure as local storage. No local git installation is required.

Profile, language, and period settings are saved as `.config.json` in the repo, so other machines can restore them automatically after authentication.

## Vault Structure

```
daily-review/
├── raw/2026-03-28/              ← Raw conversation logs (per date)
│   └── {session-id}.jsonl
├── daily/2026-03-28.md          ← Daily review (all projects)
├── weekly/2026-W13.md           ← Weekly summary
├── monthly/2026-03.md           ← Monthly summary
├── quarterly/2026-Q1.md         ← Quarterly summary
├── yearly/2026.md               ← Yearly summary
├── resume/                      ← Career resume mode output
│   ├── daily/2026-03-28.md
│   └── quarterly/2026-Q1.md
├── blog/                        ← Blog mode output
│   ├── daily/2026-03-28.md
│   └── monthly/2026-03.md
├── projects/my-app/
│   ├── 2026-03-28.md            ← Project daily detail
│   └── summary.md               ← Cumulative project summary
└── uncategorized/2026-03-28.md  ← Non-project questions
```

## Configuration

Config is stored at `$CLAUDE_PLUGIN_DATA/config.json`.

### Local storage example

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
    "company": "Your Company",
    "role": "Your Role",
    "team": "Your Team",
    "context": "What you do in one line"
  }
}
```

### GitHub storage example

```json
{
  "storage": {
    "type": "github",
    "github": {
      "owner": "your-github-username",
      "repo": "daily-review",
      "token": "<stored by OAuth flow>",
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
    "company": "Your Company",
    "role": "Your Role",
    "team": "Your Team",
    "context": "What you do in one line"
  }
}
```

## Security & Privacy

### What Gets Collected

This plugin automatically captures and stores **all conversations** with Claude Code:
- Full user messages and AI responses
- Working directory paths and project names
- Git commit messages, branch names, and remote URLs

### Corporate / Organizational Use

When using this plugin for work, the following may be recorded:

- Source code and business logic descriptions
- Internal system/service names and architecture details
- Colleague names, client information, and project specifics
- Internal URLs, IP addresses, and infrastructure configurations

**You are solely responsible for managing this information.**
Please review your organization's security policies before use.

### Automatic Secret Redaction

Known secret patterns (API keys, tokens, passwords, etc.) are automatically redacted to `[REDACTED]` before storage. However, this is a best-effort mechanism and **does not guarantee complete protection of all sensitive data.**

### GitHub Storage

If storing reviews on GitHub, **always use a private repository.** Storing to a public repository exposes your conversations and reviews to the internet. Since secret redaction cannot cover all cases, keeping the repository private is the most fundamental security measure.

## License

MIT
