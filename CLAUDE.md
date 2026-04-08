# Claude Daily Review

## 배포 방법

1. `package.json`의 버전을 올린다
2. 커밋 후 `git push`
3. `git tag v{버전} && git push origin v{버전}` — 태그 push 시 GitHub Actions가 Release 생성
4. `giwonn-plugins` 레포의 마켓플레이스에서 `claude-daily-review` 버전(`ref` 필드 포함)도 동일하게 업데이트
