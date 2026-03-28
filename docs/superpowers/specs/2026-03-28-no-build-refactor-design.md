# No-Build 플러그인 구조 전환 설계 문서

## 1. 개요

TypeScript + tsup 빌드 구조를 제거하고, 순수 `.mjs` + JSDoc 기반으로 전환한다. Claude Code 플러그인 생태계 표준 패턴(빌드 없음, 직접 실행)을 따른다. marketplace.json의 SHA 업데이트를 CI에서 자동화한다.

## 2. 목표

- 빌드 단계 제거 (tsup, typescript 의존성 제거)
- `.mjs` + JSDoc으로 타입 안전성 유지
- dist/ 제거, 소스 파일을 직접 실행
- superpowers 플러그인 패턴 준수 (run-hook.cmd polyglot wrapper)
- marketplace.json SHA 자동 업데이트 CI 워크플로우

## 3. 파일 구조

### 제거 대상

```
src/                    ← 전체 제거
dist/                   ← 전체 제거
tests/                  ← 전체 제거
tsconfig.json           ← 제거
tsup.config.ts          ← 제거
vitest.config.ts        ← 제거
```

### 새 구조

```
claude-daily-review/
├── .claude-plugin/
│   └── marketplace.json
├── .github/
│   └── workflows/
│       ├── publish.yml              ← npm publish (기존)
│       └── update-marketplace.yml   ← SHA 자동 업데이트 (신규)
├── hooks/
│   ├── hooks.json
│   ├── run-hook.cmd                 ← Windows+Unix polyglot wrapper
│   ├── session-start-check          ← bash 스크립트 (config 체크 + additionalContext)
│   └── on-stop.mjs                  ← Node.js (raw log append)
├── lib/
│   ├── types.d.ts                   ← TypeScript 타입 정의 (JSDoc용)
│   ├── config.mjs                   ← 설정 관리
│   ├── storage.mjs                  ← StorageAdapter 인터페이스 구현 (local)
│   ├── github-storage.mjs           ← GitHubStorageAdapter
│   ├── github-auth.mjs              ← OAuth Device Flow
│   └── periods.mjs                  ← 날짜/주기 유틸리티
├── prompts/
│   ├── session-end.md
│   └── session-start.md
├── skills/
│   └── daily-review-setup.md
├── package.json                     ← 최소화 (이름, 버전, type: module)
├── README.md
└── README.ko.md
```

## 4. 모듈별 변환

### 4.1 lib/types.d.ts

JSDoc에서 참조할 타입 정의. 런타임에는 사용되지 않음.

```typescript
export interface Profile {
  company: string;
  role: string;
  team: string;
  context: string;
}

export interface Periods {
  daily: true;
  weekly: boolean;
  monthly: boolean;
  quarterly: boolean;
  yearly: boolean;
}

export interface LocalStorageConfig {
  basePath: string;
}

export interface GitHubStorageConfig {
  owner: string;
  repo: string;
  token: string;
  basePath: string;
}

export interface StorageConfig {
  type: "local" | "github";
  local?: LocalStorageConfig;
  github?: GitHubStorageConfig;
}

export interface Config {
  storage: StorageConfig;
  language: string;
  periods: Periods;
  profile: Profile;
}

export interface StorageAdapter {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(dir: string): Promise<string[]>;
  mkdir(dir: string): Promise<void>;
  isDirectory(path: string): Promise<boolean>;
}

export interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  [key: string]: unknown;
}
```

### 4.2 lib/config.mjs

기존 `src/core/config.ts`를 `.mjs` + JSDoc으로 변환.

```javascript
// @ts-check
/** @typedef {import('./types.d.ts').Config} Config */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

/** @returns {string} */
export function getConfigPath() { ... }

/** @returns {Config | null} */
export function loadConfig() { ... }
// ... 동일한 로직, JSDoc 타입 어노테이션만 추가
```

### 4.3 lib/storage.mjs

`LocalStorageAdapter`를 클래스로 구현.

```javascript
// @ts-check
/** @typedef {import('./types.d.ts').StorageAdapter} StorageAdapter */

/** @implements {StorageAdapter} */
export class LocalStorageAdapter { ... }
```

### 4.4 lib/github-storage.mjs

`GitHubStorageAdapter`를 클래스로 구현. `fetch` 사용 (Node.js 내장).

### 4.5 lib/github-auth.mjs

OAuth Device Flow. `fetch` 사용.

### 4.6 lib/periods.mjs

날짜/주기 유틸리티. 순수 함수.

### 4.7 hooks/on-stop.mjs

```javascript
#!/usr/bin/env node
// stdin → raw log append
import { loadConfig, createStorageAdapter } from '../lib/config.mjs';
// ...
```

### 4.8 hooks/session-start-check

```bash
#!/usr/bin/env bash
# superpowers 패턴: config 체크 → additionalContext 주입
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Node.js로 config 체크
result=$(node -e "
  import { loadConfig } from '${PLUGIN_ROOT}/lib/config.mjs';
  const config = loadConfig();
  if (!config) process.stdout.write('NEEDS_SETUP');
" 2>/dev/null || echo "NEEDS_SETUP")

if [ "$result" = "NEEDS_SETUP" ]; then
  msg="<important-reminder>IN YOUR FIRST REPLY YOU MUST TELL THE USER: daily-review 플러그인이 아직 설정되지 않았습니다. /daily-review-setup 을 실행해주세요.</important-reminder>"
  escaped=$(echo "$msg" | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$escaped"
fi

exit 0
```

### 4.9 hooks/run-hook.cmd

superpowers의 polyglot wrapper를 그대로 복사하여 Windows + Unix 모두 지원.

## 5. hooks/hooks.json

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/on-stop.mjs\"",
            "async": true,
            "timeout": 10
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "agent",
            "prompt": "Follow the instructions in the file at ${CLAUDE_PLUGIN_ROOT}/prompts/session-end.md exactly. The CLAUDE_PLUGIN_DATA directory is: ${CLAUDE_PLUGIN_DATA}. The plugin root is: ${CLAUDE_PLUGIN_ROOT}",
            "timeout": 120
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" session-start-check",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

## 6. package.json

```json
{
  "name": "@giwonn/claude-daily-review",
  "version": "0.3.0",
  "type": "module",
  "description": "Claude Code plugin that auto-captures conversations for daily review and career documentation",
  "repository": {
    "type": "git",
    "url": "https://github.com/giwonn/claude-daily-review"
  },
  "license": "MIT"
}
```

의존성 없음. devDependencies도 없음.

## 7. marketplace.json SHA 자동 업데이트

### 문제

릴리즈마다 marketplace.json의 SHA를 수동으로 업데이트해야 함.

### 해결: GitHub Actions 워크플로우

release 생성 시:
1. npm publish
2. marketplace.json의 SHA를 릴리즈 태그의 커밋 SHA로 업데이트
3. 자동 커밋 + push

```yaml
# .github/workflows/update-marketplace.yml
name: Update Marketplace SHA

on:
  release:
    types: [published]

jobs:
  update-sha:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: master

      - name: Update SHA in marketplace.json
        run: |
          SHA=$(git rev-parse HEAD)
          sed -i "s/\"sha\": \"[a-f0-9]*\"/\"sha\": \"$SHA\"/" .claude-plugin/marketplace.json

      - name: Commit and push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add .claude-plugin/marketplace.json
          git commit -m "chore: update marketplace SHA to $SHA" || exit 0
          git push
```

### 주의: 순환 방지

marketplace.json 변경 커밋은 릴리즈 태그에 포함되지 않으므로, 다음 릴리즈에서 반영됨. 이는 의도된 동작 — 릴리즈 시점의 코드가 설치되고, SHA는 그 직후 업데이트됨.

## 8. 스코프

### 포함

- TypeScript → .mjs + JSDoc 변환 (config, storage, github-storage, github-auth, periods)
- Hook 스크립트 변환 (on-stop.mjs, session-start-check bash)
- run-hook.cmd polyglot wrapper 추가
- hooks.json 업데이트
- package.json 최소화 (빌드 의존성 제거)
- src/, dist/, tests/, tsconfig, tsup, vitest 제거
- marketplace SHA 자동 업데이트 워크플로우
- .gitignore 정리

### 제외

- 기능 변경 없음 — 동일한 동작, 다른 구조
- 테스트 프레임워크 재구축 (플러그인은 수동 테스트가 표준)
