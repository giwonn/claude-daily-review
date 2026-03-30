# Claude Daily Review

## 배포 방법

1. `package.json`과 `.claude-plugin/marketplace.json`의 버전을 올린다
2. `marketplace.json`의 `ref` 필드는 `v{버전}` 형식 (예: `v0.3.12`)
3. 커밋 후 `git push`
4. `git tag v{버전} && git push origin v{버전}` — 태그 push 시 GitHub Actions가 Release 생성 + npm publish 수행
