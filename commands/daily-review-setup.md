---
description: Configure the daily review plugin — set storage backend, user profile, and review periods
allowed-tools: ["AskUserQuestion", "Read", "Write", "Bash"]
---

# Daily Review Setup

You are setting up the claude-daily-review plugin for the user.

## Important Rules

- **NEVER show raw error messages, stack traces, or file paths to the user.** If a Bash command fails, interpret the error and explain it in plain Korean.
- When a command fails, tell the user what went wrong and what to do next — not the technical details.
- Example: Instead of showing "Error: GitHub auth timed out waiting for authorization" with a stack trace, say "GitHub 인증이 시간 초과되었습니다. 다시 시도해주세요."

## Check Existing Config

First, read `${CLAUDE_PLUGIN_DATA}/config.json` to see if a config already exists.

- If it exists, show the current settings and ask what the user wants to change.
- If it does not exist, proceed with the full onboarding flow below.

## Onboarding Flow

### Step 0: Storage Selection

Ask the user:
> "회고를 어디에 저장할까요?"
> 1. GitHub 저장소
> 2. 로컬 폴더 (Obsidian vault 등)

#### Option 1: GitHub Storage

**2a. Authenticate with GitHub OAuth Device Flow:**

Run via Bash:
```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/request-device-code.mjs"
```

Show the user:
> "GitHub 인증이 필요합니다. 아래 링크를 브라우저에서 열고 코드를 입력해주세요."
> - URL: https://github.com/login/device
> - 코드: `{user_code}`

Then poll for the token (pass the full device code response as JSON argument):
```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/poll-token.mjs" '{"device_code":"{device_code}","interval":{interval},"user_code":"{user_code}","verification_uri":"https://github.com/login/device","expires_in":900}'
```

Wait for the user to complete authorization. Store the returned token string.

**2b. Select or create a repository:**

Ask:
> "기존 GitHub 저장소를 사용할까요, 새로 만들까요?"
> 1. 기존 저장소 사용
> 2. 새 저장소 만들기

- **Existing:** Ask for the repository in `owner/repo` format. Parse into `owner` and `repo`.
- **New:** Ask for a repo name. Create it via Bash:
  ```bash
  MSYS_NO_PATHCONV=1 gh api /user/repos -X POST -f name=<name> -f private=true
  ```
  If `gh` is not available, tell the user to create the repo at https://github.com/new and then provide the `owner/repo`.

The storage config will be:
```json
{
  "storage": {
    "type": "github",
    "github": {
      "owner": "<owner>",
      "repo": "<repo>",
      "token": "<access_token>",
      "basePath": "daily-review"
    }
  }
}
```

After storage selection, proceed to Step 2 (Profile). Skip Step 1 (Vault Path) for GitHub storage.

#### Option 2: Local Storage

Proceed to Step 1 (Vault Path) below. The storage config will be:
```json
{
  "storage": {
    "type": "local",
    "local": {
      "basePath": "<path>/daily-review"
    }
  }
}
```

### Step 1: Vault Path (Local storage only)

Ask the user:
> "Obsidian vault 경로를 알려주세요. (예: C:/Users/name/Documents/MyVault)"

After they provide a path:
- Verify the directory exists using the Bash tool: `test -d "{path}" && echo "OK" || echo "NOT_FOUND"`
- If not found, ask them to check the path
- Normalize the path (resolve ~, remove trailing slashes)
- Set the `basePath` in the storage config to `{path}/daily-review`

### Step 2: Profile

Ask the user all profile questions at once using AskUserQuestion with these fields:
- "회사명" (text input, optional — leave empty to skip)
- "역할/직무" (text input, e.g. "프론트엔드 개발자")
- "팀/담당 도메인" (text input, optional, e.g. "결제플랫폼팀")
- "하는 일 한 줄 설명" (text input, e.g. "B2B SaaS 결제 시스템 개발 및 운영")

If the user leaves a field empty, store it as an empty string.

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

The config format is:

```json
{
  "storage": { ... },
  "language": "ko",
  "periods": { "daily": true, "weekly": true, "monthly": true, "quarterly": true, "yearly": false },
  "profile": {
    "company": "...",
    "role": "...",
    "team": "...",
    "context": "..."
  }
}
```

**If local storage:** Create the vault directories by running via Bash:
```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/create-dirs.mjs"
```

**If GitHub storage:** Skip directory creation. Directories are created implicitly when files are written to the GitHub repository.

### Step 5: Confirm

Tell the user:

**For local storage:**
> "설정 완료! 이제부터 대화 내용이 자동으로 기록됩니다."
> "회고 파일은 `{basePath}/` 에서 확인하세요."
> "설정을 변경하려면 `/daily-review-setup`을 다시 실행하세요."

**For GitHub storage:**
> "설정 완료! 이제부터 대화 내용이 자동으로 GitHub에 기록됩니다."
> "회고 파일은 `https://github.com/{owner}/{repo}` 에서 확인하세요."
> "설정을 변경하려면 `/daily-review-setup`을 다시 실행하세요."
