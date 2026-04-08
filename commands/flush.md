---
description: Flush buffered raw logs to remote storage
allowed-tools: ["Bash"]
---

# Flush Buffered Logs

로컬 버퍼에 남아있는 raw log를 원격 저장소로 즉시 push합니다.

## Important Rules

- 에러 메시지나 스택 트레이스를 그대로 보여주지 마세요. 한국어로 상황을 설명하세요.
- **에러 발생 시 이슈 보고 제안:** Bash 명령이 실패하면, 한국어로 에러를 설명한 뒤 다음을 실행:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/lib/issue-url.mjs" --context "flush" --message "<에러 메시지>" --stack "<스택트레이스>"
  ```
  출력된 URL을 사용자에게 보여주며: "이 문제를 GitHub 이슈로 보고하시겠습니까? [이슈 생성](<URL>)"

## Steps

### Step 1: Flush 실행

```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/hooks/flush.mjs"
```

출력을 파싱합니다:
- `FLUSHED:0` → "flush할 버퍼가 없습니다."
- `FLUSHED:N` → "N개 세션의 버퍼를 원격 저장소로 flush했습니다."
- `NO_CONFIG` → "설정이 없습니다. `/daily-review-setup`을 먼저 실행해주세요."
- `NO_DATA_DIR` → "플러그인 데이터 디렉토리를 찾을 수 없습니다."
- `ERROR:...` → "flush 중 오류가 발생했습니다: (오류 내용 요약)"
