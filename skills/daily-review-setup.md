---
name: daily-review-setup
description: Configure the daily review plugin — set Obsidian vault path, user profile, and review periods
---

# Daily Review Setup

You are setting up the claude-daily-review plugin for the user.

## Check Existing Config

First, read `${CLAUDE_PLUGIN_DATA}/config.json` to see if a config already exists.

- If it exists, show the current settings and ask what the user wants to change.
- If it does not exist, proceed with the full onboarding flow below.

## Onboarding Flow

### Step 1: Vault Path

Ask the user:
> "Obsidian vault 경로를 알려주세요. (예: C:/Users/name/Documents/MyVault)"

After they provide a path:
- Verify the directory exists using the Bash tool: `test -d "{path}" && echo "OK" || echo "NOT_FOUND"`
- If not found, ask them to check the path
- Normalize the path (resolve ~, remove trailing slashes)

### Step 2: Profile

Ask the user these questions one at a time:
1. "어떤 회사에서 일하고 계신가요? (선택사항, 엔터로 건너뛰기)"
2. "역할/직무가 뭔가요? (예: 프론트엔드 개발자)"
3. "팀이나 담당 도메인이 있다면? (예: 결제플랫폼팀)"
4. "하고 계신 일을 한 줄로 설명하면? (예: B2B SaaS 결제 시스템 개발 및 운영)"

### Step 3: Periods

Show the available periods and defaults:
> "어떤 주기로 회고를 요약할까요? (기본값으로 진행하려면 엔터)"
> - [x] daily (항상 활성화)
> - [x] weekly (주간)
> - [x] monthly (월간)
> - [x] quarterly (분기)
> - [ ] yearly (연간)

### Step 4: Save

Construct the config JSON and write it to `${CLAUDE_PLUGIN_DATA}/config.json` using the Write tool.

Then create the vault directories by running via Bash:
```bash
node -e "
const fs = require('fs');
const path = require('path');
const config = JSON.parse(fs.readFileSync('${CLAUDE_PLUGIN_DATA}/config.json', 'utf-8'));
const base = path.join(config.vaultPath, config.reviewFolder);
const dirs = ['daily', 'projects', 'uncategorized', '.raw', '.reviews'];
if (config.periods.weekly) dirs.push('weekly');
if (config.periods.monthly) dirs.push('monthly');
if (config.periods.quarterly) dirs.push('quarterly');
if (config.periods.yearly) dirs.push('yearly');
dirs.forEach(d => fs.mkdirSync(path.join(base, d), { recursive: true }));
console.log('Directories created at: ' + base);
"
```

### Step 5: Confirm

Tell the user:
> "설정 완료! 이제부터 대화 내용이 자동으로 기록됩니다."
> "회고 파일은 `{vaultPath}/{reviewFolder}/` 에서 확인하세요."
> "설정을 변경하려면 `/daily-review-setup`을 다시 실행하세요."
