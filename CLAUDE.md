# Claude Daily Review

## 배포 방법

1. `package.json`과 `.claude-plugin/marketplace.json`의 버전을 올린다
2. `marketplace.json`의 `ref` 필드는 `v{버전}` 형식 (예: `v0.3.12`)
3. 커밋 후 `git push`하면 배포 완료 (GitHub Actions가 자동으로 npm publish 및 태그 생성)
