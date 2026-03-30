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

If it **does not exist**, proceed to the full onboarding flow below.

If it **exists**, show the current storage type and profile summary, then ask using AskUserQuestion:
- question: "이미 설정이 되어 있습니다. 어떻게 할까요?"
- options:
  1. label: "현재 설정 유지", description: "변경 없이 그대로 사용합니다"
  2. label: "저장소 변경", description: "다른 저장소로 변경합니다"
  3. label: "프로필/주기 변경", description: "프로필이나 요약 주기만 변경합니다"
  4. label: "처음부터 다시 설정", description: "모든 설정을 초기화합니다"

- "현재 설정 유지": exit with "현재 설정을 유지합니다."
- "저장소 변경": go to Step 0 (Storage Selection), keep existing profile/periods
- "프로필/주기 변경": go to Step 2 (Profile), keep existing storage
- "처음부터 다시 설정": delete existing config and proceed to full onboarding flow

## Onboarding Flow

### Step 0: Storage Selection

Ask the user using AskUserQuestion:
- question: "회고를 어디에 저장할까요?"
- options:
  1. label: "GitHub 저장소", description: "원격 저장소에 저장. 여러 PC에서 공유 가능"
  2. label: "로컬 폴더", description: "Obsidian vault 등 로컬 디렉토리에 저장"

#### Option 1: GitHub Storage

**1a. Authenticate with GitHub OAuth Device Flow:**

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

**1b. Select or create a repository:**

Ask using AskUserQuestion:
- question: "GitHub 저장소를 어떻게 할까요?"
- options:
  1. label: "새 저장소 만들기", description: "비공개 저장소를 자동 생성합니다"
  2. label: "기존 저장소 사용", description: "이미 있는 저장소를 지정합니다"

- **New:** Ask for a repo name. Create it via Bash:
  ```bash
  MSYS_NO_PATHCONV=1 gh api /user/repos -X POST -f name=<name> -f private=true
  ```
  If `gh` is not available, tell the user to create the repo at https://github.com/new and then provide the `owner/repo`.
- **Existing:** Ask for the repository in `owner/repo` format. Parse into `owner` and `repo`.

  After parsing owner/repo, check if the repository is public:
  ```bash
  MSYS_NO_PATHCONV=1 gh api "repos/{owner}/{repo}" --jq '.private'
  ```
  If the result is `false` (public repository), warn the user using AskUserQuestion:
  - question: "⚠️ 이 저장소는 **public**입니다. 대화 내용과 회고 파일이 인터넷에 공개됩니다. private 저장소 사용을 강력히 권장합니다."
  - options:
    1. label: "private으로 변경 후 계속", description: "저장소를 비공개로 변경합니다"
    2. label: "그대로 사용 (위험 인지)", description: "public 상태로 계속 진행합니다"
    3. label: "다른 저장소 선택", description: "다른 저장소를 지정합니다"

  - "private으로 변경 후 계속":
    ```bash
    MSYS_NO_PATHCONV=1 gh api "repos/{owner}/{repo}" -X PATCH -f private=true
    ```
    If successful: "저장소를 private으로 변경했습니다." and continue.
    If failed: "권한이 없어 변경할 수 없습니다. 저장소 관리자에게 요청하세요." and ask again.
  - "그대로 사용 (위험 인지)": continue with the public repo.
  - "다른 저장소 선택": go back to 1b repo selection.

**1c. Check for shared config in repo:**

After repo is selected/created, **save a minimal config first** so `storage-cli.mjs` can connect to the repo:
```bash
cat > "${CLAUDE_PLUGIN_DATA}/config.json" << 'TMPEOF'
{"storage":{"type":"github","github":{"owner":"<owner>","repo":"<repo>","token":"<access_token>","basePath":""}}}
TMPEOF
```
(Replace `<owner>`, `<repo>`, `<access_token>` with actual values.)

Then try to read the shared config:
```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/lib/storage-cli.mjs" read .config.json
```

If `.config.json` exists in the repo, parse it and **skip Steps 2-3** (Profile and Periods). Use the values from the shared config. Tell the user:
> "이전에 저장된 설정을 찾았습니다! 프로필과 주기 설정을 자동으로 복원합니다."

If `.config.json` does not exist, proceed to Step 2 (Profile).

The local config will be:
```json
{
  "storage": {
    "type": "github",
    "github": {
      "owner": "<owner>",
      "repo": "<repo>",
      "token": "<access_token>",
      "basePath": ""
    }
  }
}
```

The profile/periods/language go into the **shared config** (saved in Step 4).

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

Ask each profile field one at a time using AskUserQuestion.

**회사명:**
- question: "어떤 회사에서 일하고 계신가요?"
- options:
  1. label: "직접 입력", description: ""
  2. label: "건너뛰기", description: "나중에 설정할 수 있습니다"
- If "직접 입력" selected: ask "회사명을 입력해주세요" in the next message and wait for text response.
- If "건너뛰기" selected: store as empty string.

**역할/직무:**
- question: "역할/직무가 뭔가요?"
- options:
  1. label: "직접 입력", description: "예: 프론트엔드 개발자"
  2. label: "건너뛰기", description: "나중에 설정할 수 있습니다"

**팀/도메인:**
- question: "팀이나 담당 도메인이 있다면?"
- options:
  1. label: "직접 입력", description: "예: 결제플랫폼팀"
  2. label: "건너뛰기", description: "나중에 설정할 수 있습니다"

**하는 일 설명:**
- question: "하고 계신 일을 한 줄로 설명하면?"
- options:
  1. label: "직접 입력", description: "예: B2B SaaS 결제 시스템 개발 및 운영"
  2. label: "건너뛰기", description: "나중에 설정할 수 있습니다"

### Step 3: Periods

Ask using AskUserQuestion with multiSelect:
- question: "어떤 주기로 회고를 요약할까요? (daily는 항상 활성화)"
- multiSelect: true
- options:
  1. label: "weekly (주간)", description: "매주 요약"
  2. label: "monthly (월간)", description: "매월 요약"
  3. label: "quarterly (분기)", description: "분기별 요약"
  4. label: "yearly (연간)", description: "연간 요약"

Selected items are enabled. daily is always true.

### Step 4: Save

**Save local config** to `${CLAUDE_PLUGIN_DATA}/config.json` using the Write tool.

For **local storage**, the config includes everything:
```json
{
  "storage": { "type": "local", "local": { "basePath": "..." } },
  "language": "ko",
  "periods": { "daily": true, "weekly": true, "monthly": true, "quarterly": true, "yearly": false },
  "profile": { "company": "...", "role": "...", "team": "...", "context": "..." }
}
```

For **GitHub storage**, the local config only has storage credentials:
```json
{
  "storage": { "type": "github", "github": { "owner": "...", "repo": "...", "token": "...", "basePath": "" } },
  "language": "ko",
  "periods": { "daily": true, "weekly": true, "monthly": true, "quarterly": true, "yearly": false },
  "profile": { "company": "...", "role": "...", "team": "...", "context": "..." }
}
```

Additionally, **save shared config to the repo** so other machines can restore it:
```bash
echo '<shared_config_json>' | CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/lib/storage-cli.mjs" write .config.json
```

The shared config contains only profile, periods, and language (NO storage credentials):
```json
{
  "language": "ko",
  "periods": { "daily": true, "weekly": true, "monthly": true, "quarterly": true, "yearly": false },
  "profile": { "company": "...", "role": "...", "team": "...", "context": "..." }
}
```

**If local storage:** Create the vault directories:
```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/create-dirs.mjs"
```

**If GitHub storage:** Skip directory creation.

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
> "다른 PC에서도 GitHub 인증만 하면 설정이 자동으로 복원됩니다."
