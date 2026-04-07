# Changelog

## 0.8.0

- Added `/flush` command for manual buffer flush to remote storage on demand
- Added `SessionEnd` hook to automatically flush remaining buffers on normal session exit
- Added shared `flush.mjs` script used by both the slash command and the hook

## 0.7.0

- Added topic-level grouping in daily reviews — same-project logs are now split by feature/topic for clearer per-feature retrospectives
- Updated generate prompt to automatically classify conversation content into distinct topics within each project

## 0.6.0

- Added mode system to `/generate` command — supports `review` (default), `resume`, and `blog` presets with distinct tone and structure
- Added local buffer module with 10KB size-based flush threshold, replacing direct remote append on every turn
- Added index manager for fast date/project-based lookup (`index.json` with `byDate`, `byProject`, `sessions` maps)
- Added `batch-read` and `batch-write` commands to `storage-cli` for efficient bulk operations
- Replaced `recover-sessions` with `on-session-start` hook that handles buffer flush, git activity parsing, and review generation reminders
- Added migration command to build index from existing raw logs
- Added automatic detection of missing index with migration prompt on config check

## 0.5.1

- Fixed `check-config` to output OK status and optimized `recover-sessions` to check only relevant dates

## 0.5.0

- Changed raw log directory structure from `.raw/{session}/{date}` to `raw/{date}/{session}` for date-first access patterns
- Added `/daily-review-migrate` command for manual migration from old directory structure
- Added migration notice on session start when legacy `.raw` directory is detected
- Made secret redaction always-on instead of configurable

## 0.4.1

- Added secret redaction to sanitize API keys, tokens, and passwords from captured logs
- Added security disclosure documentation

## 0.4.0

- Added git commit activity capture from session transcripts — commits are parsed and included in daily reviews with GitHub links

## 0.3.12

- Fixed session `.meta.json` to be stored locally instead of remote storage
- Fixed GitHub storage to use empty `basePath` by default (repo root)

## 0.3.10

- Fixed `CLAUDE_PLUGIN_DATA` env var not being passed to `storage-cli` during setup

## 0.3.9

- Fixed incomplete config detection to correctly trigger setup flow

## 0.3.8

- Fixed config initialization to save temp config before reading shared config from remote repo

## 0.3.7

- Switched marketplace source from SHA pinning to tag ref (`v{version}`)
- Removed redundant version field from `marketplace.json`

## 0.3.5

- Consolidated release, publish, and marketplace CI workflows into a single workflow

## 0.3.3

- Added `/generate` command (renamed from `/daily-review-generate`) with natural language date/period parsing
- Added cascading review generation: daily → weekly → monthly → quarterly → yearly
- Added incremental generation based on `last-generated.json` timestamp
- Added `collect-raw-logs` helper script to simplify data collection
- Split raw log format into separate user/assistant rows with single API call
- Added `UserPromptSubmit` hook for capturing user questions, then replaced it with transcript-based capture in Stop hook
- Added `AskUserQuestion` UI for profile setup and shared config sync via GitHub repo
- Fixed hook script execute permissions on macOS
- Fixed Windows compatibility by replacing all `node -e` calls with `.mjs` scripts

## 0.3.2

- Moved setup flow to `commands/` with `AskUserQuestion` interactive UI support

## 0.3.1

- Fixed skill structure to `folder/SKILL.md` format for Claude Code plugin compatibility

## 0.3.0

- Removed TypeScript build system — migrated to `.mjs` + JSDoc for zero-build plugin distribution
- Added marketplace manifest for plugin discovery

## 0.2.1

- Renamed package to `@giwonn/claude-daily-review` scoped package
- Fixed SessionStart to split into config check + agent-based session recovery

## 0.1.1

- Initial release with full daily review pipeline
- Implemented `StorageAdapter` interface with `LocalStorageAdapter` and `GitHubStorageAdapter`
- Implemented GitHub OAuth Device Flow for authentication
- Added On-Stop hook to capture user/assistant conversations per turn
- Added SessionStart and SessionEnd agent hooks for session lifecycle
- Added `/daily-review-setup` skill for interactive plugin onboarding
- Implemented core modules: Config, Vault, Periods, Raw Logger, Merge
- Added dual storage backend support (local filesystem and GitHub repo)
