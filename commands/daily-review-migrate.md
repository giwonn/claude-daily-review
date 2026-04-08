---
description: Migrate raw logs from old .raw/{session}/{date} format to new raw/{date}/{session} format
allowed-tools: ["Bash", "Read"]
---

# Daily Review Migration

기존 `.raw/{session_id}/{date}.jsonl` 구조를 `raw/{date}/{session_id}.jsonl` 구조로 마이그레이션합니다.

## Important Rules

- **반드시 모든 Claude Code 세션을 종료한 뒤 실행하세요.**
- 에러 메시지나 스택 트레이스를 그대로 보여주지 마세요. 한국어로 상황을 설명하세요.
- **에러 발생 시 이슈 보고 제안:** Bash 명령이 실패하면, 한국어로 에러를 설명한 뒤 다음을 실행:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/lib/issue-url.mjs" --context "migrate" --message "<에러 메시지>" --stack "<스택트레이스>"
  ```
  출력된 URL을 사용자에게 보여주며: "이 문제를 GitHub 이슈로 보고하시겠습니까? [이슈 생성](<URL>)"

## Steps

### Step 1: 설정 확인

config를 읽어서 storage adapter를 확인합니다:

```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node -e "
const { loadConfig, createStorageAdapter } = await import('${CLAUDE_PLUGIN_ROOT}/lib/config.mjs');
const config = loadConfig();
if (!config) { console.log('NO_CONFIG'); process.exit(0); }
console.log(config.storage.type);
"
```

config가 없으면: "설정이 없습니다. `/daily-review-setup`을 먼저 실행해주세요."

### Step 2: .raw 존재 확인

**Local storage인 경우:**

```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node -e "
const { loadConfig, createStorageAdapter } = await import('${CLAUDE_PLUGIN_ROOT}/lib/config.mjs');
const config = loadConfig();
const storage = await createStorageAdapter(config);
const exists = await storage.exists('.raw');
console.log(exists ? 'EXISTS' : 'NOT_FOUND');
"
```

**GitHub storage인 경우:**

```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/lib/storage-cli.mjs" list .raw
```

`.raw`가 없고 인덱스도 이미 존재하면: "이미 마이그레이션이 완료되었거나, 마이그레이션할 데이터가 없습니다."
`.raw`가 없지만 인덱스가 없으면: Step 3-5를 건너뛰고 Step 6 (인덱스 빌드)로 진행합니다.

### Step 3: 마이그레이션 실행

**Local storage인 경우:**

```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node -e "
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { loadConfig } from '${CLAUDE_PLUGIN_ROOT}/lib/config.mjs';

const config = loadConfig();
const base = config.storage.local.basePath;
const oldRaw = join(base, '.raw');
const newRaw = join(base, 'raw');

if (!existsSync(oldRaw)) { console.log('NOT_FOUND'); process.exit(0); }

let migrated = 0;
const sessions = readdirSync(oldRaw);
for (const sessionId of sessions) {
  const sessionDir = join(oldRaw, sessionId);
  try {
    const files = readdirSync(sessionDir);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const date = file.replace('.jsonl', '');
      const destDir = join(newRaw, date);
      mkdirSync(destDir, { recursive: true });
      const content = readFileSync(join(sessionDir, file), 'utf-8');
      const destPath = join(destDir, sessionId + '.jsonl');
      if (existsSync(destPath)) {
        const existing = readFileSync(destPath, 'utf-8');
        writeFileSync(destPath, existing + content);
      } else {
        writeFileSync(destPath, content);
      }
      migrated++;
    }
  } catch { continue; }
}
console.log('MIGRATED:' + migrated);
"
```

**GitHub storage인 경우:**

```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node -e "
import { loadConfig, createStorageAdapter } from '${CLAUDE_PLUGIN_ROOT}/lib/config.mjs';

const config = loadConfig();
const storage = await createStorageAdapter(config);

const sessions = await storage.list('.raw');
let migrated = 0;
for (const sessionId of sessions) {
  const files = await storage.list('.raw/' + sessionId);
  for (const file of files) {
    if (!file.endsWith('.jsonl')) continue;
    const date = file.replace('.jsonl', '');
    const content = await storage.read('.raw/' + sessionId + '/' + file);
    if (!content) continue;
    const destPath = 'raw/' + date + '/' + sessionId + '.jsonl';
    const existing = await storage.read(destPath);
    await storage.write(destPath, existing ? existing + content : content);
    migrated++;
  }
}
console.log('MIGRATED:' + migrated);
"
```

출력에서 `MIGRATED:N`을 파싱하여 사용자에게 보여줍니다:
> "N개 파일을 마이그레이션했습니다."

### Step 4: 검증

마이그레이션 후 `raw/` 폴더의 내용을 확인합니다:

**Local:**
```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node -e "
import { loadConfig } from '${CLAUDE_PLUGIN_ROOT}/lib/config.mjs';
import { readdirSync } from 'fs';
import { join } from 'path';
const config = loadConfig();
const base = config.storage.local.basePath;
const dates = readdirSync(join(base, 'raw'));
console.log('DATES:' + dates.length);
dates.forEach(d => console.log('  ' + d));
"
```

**GitHub:**
```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/lib/storage-cli.mjs" list raw
```

결과를 사용자에게 보여줍니다:
> "마이그레이션 검증 완료. `raw/` 폴더에 {N}개의 날짜 폴더가 있습니다."

### Step 5: .raw 삭제

사용자에게 확인을 구합니다:
> "마이그레이션이 완료되었습니다. 기존 `.raw/` 폴더를 삭제할까요?"

사용자가 동의하면:

**Local:**
```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node -e "
import { loadConfig } from '${CLAUDE_PLUGIN_ROOT}/lib/config.mjs';
import { rmSync } from 'fs';
import { join } from 'path';
const config = loadConfig();
rmSync(join(config.storage.local.basePath, '.raw'), { recursive: true, force: true });
console.log('DELETED');
"
```

**GitHub:**

```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node -e "
import { loadConfig, createStorageAdapter } from '${CLAUDE_PLUGIN_ROOT}/lib/config.mjs';

const config = loadConfig();
const gh = config.storage.github;
const headers = { Authorization: 'Bearer ' + gh.token, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };
const baseUrl = 'https://api.github.com/repos/' + gh.owner + '/' + gh.repo + '/contents';

async function deleteRecursive(path) {
  const res = await fetch(baseUrl + '/' + path, { headers });
  if (!res.ok) return;
  const items = await res.json();
  if (!Array.isArray(items)) {
    await fetch(baseUrl + '/' + path, { method: 'DELETE', headers, body: JSON.stringify({ message: 'migrate: remove ' + path, sha: items.sha }) });
    return;
  }
  for (const item of items) {
    if (item.type === 'dir') {
      await deleteRecursive(item.path);
    } else {
      await fetch(baseUrl + '/' + item.path, { method: 'DELETE', headers, body: JSON.stringify({ message: 'migrate: remove ' + item.path, sha: item.sha }) });
    }
  }
}
await deleteRecursive('.raw');
console.log('DELETED');
"
```

삭제 완료 후:
> "`.raw/` 폴더를 삭제했습니다. 마이그레이션이 완료되었습니다!"

### Step 6: 인덱스 빌드

raw 로그를 스캔하여 인덱스 파일을 생성합니다.

```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node -e "
import { loadConfig, createStorageAdapter } from '${CLAUDE_PLUGIN_ROOT}/lib/config.mjs';
import { updateIndex } from '${CLAUDE_PLUGIN_ROOT}/lib/index-manager.mjs';
import { basename } from 'path';

const config = loadConfig();
if (!config) { console.log('NO_CONFIG'); process.exit(0); }
const storage = await createStorageAdapter(config);
const dataDir = process.env.CLAUDE_PLUGIN_DATA;
if (!dataDir) { console.log('NO_DATA_DIR'); process.exit(0); }

const dates = await storage.list('raw');
let indexed = 0;
for (const date of dates) {
  const files = await storage.list('raw/' + date);
  for (const file of files) {
    if (!file.endsWith('.jsonl')) continue;
    const sessionId = file.replace('.jsonl', '');
    const content = await storage.read('raw/' + date + '/' + file);
    if (!content) continue;

    const projects = new Set();
    let lastTimestamp = '';
    for (const line of content.trim().split('\n')) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'git') continue;
        if (entry.cwd) projects.add(basename(entry.cwd));
        if (entry.timestamp && entry.timestamp > lastTimestamp) lastTimestamp = entry.timestamp;
      } catch { continue; }
    }

    for (const project of projects) {
      updateIndex(dataDir, { sessionId, date, project, timestamp: lastTimestamp });
    }
    if (projects.size === 0) {
      updateIndex(dataDir, { sessionId, date, project: 'unknown', timestamp: lastTimestamp });
    }
    indexed++;
  }
}
console.log('INDEXED:' + indexed);
"
```

출력에서 `INDEXED:N`을 파싱하여 사용자에게 보여줍니다:
> "N개 파일의 인덱스를 생성했습니다."

인덱스가 이미 존재하는 경우에도 재빌드합니다 (기존 인덱스를 덮어씀).
