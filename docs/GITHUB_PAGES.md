# GitHub Pages 배포

배포 주소: https://jpvoice0401.github.io/intart/

## GitHub에서 한 번 설정하기

1. 저장소의 **Settings → Pages**를 엽니다.
2. **Build and deployment → Source**를 **GitHub Actions**로 선택합니다.
3. 프로젝트 변경 사항을 커밋하고 `main` 브랜치로 푸시합니다.
4. 저장소의 **Actions → Deploy to GitHub Pages**에서 빌드와 배포가 모두 성공했는지 확인합니다.
5. 위 배포 주소를 엽니다. 이후 `main`에 푸시할 때마다 자동 배포됩니다.

별도 토큰이나 Secrets 등록은 필요 없습니다. Actions가 비활성화된 저장소라면 **Settings → Actions → General**에서 GitHub 공식 Actions를 허용합니다. 최초 실행이 Pages 설정 전에 실패했다면 설정 후 **Actions → Deploy to GitHub Pages → Run workflow → main → Run workflow**로 재실행합니다.

현재 변경 사항을 업로드하는 명령은 다음과 같습니다.

```powershell
git add .github/workflows/deploy-pages.yml vite.config.mjs package.json scripts/verify-pages.mjs src/church-music.ts src/church-exclamation.ts src/church-world.ts docs/GITHUB_PAGES.md
git commit -m "Configure GitHub Pages deployment"
git push
```

## 빌드와 파일 경로

- CI는 Node.js 24에서 `npm ci`와 `npm run build`를 실행하고 `dist/`만 배포합니다.
- `actions/configure-pages`가 알려주는 배포 경로를 `VITE_BASE_PATH`로 전달합니다. 현재 저장소에서는 `/intart/`이며, Vite의 `import.meta.env.BASE_URL`에도 같은 값이 반영됩니다.
- 음원, 모델 등 `public/` 파일은 `${import.meta.env.BASE_URL}audio/...`처럼 경로를 만듭니다. CSS의 `url(...)`과 HTML의 파일 경로는 Vite가 빌드하면서 배포 경로로 변환합니다.
- Git LFS 음원은 checkout의 `lfs: true` 설정으로 원본을 받은 뒤 빌드하므로 배포 결과에 실제 MP3가 포함됩니다. LFS 설정을 제거할 필요 없습니다.
- `scripts/verify-pages.mjs`는 빌드 결과의 파일 경로, 필요한 런타임 파일, 미다운로드 LFS 포인터, 배포 총용량을 검사합니다. 서버를 실행하지 않습니다.

PowerShell에서 현재 저장소의 Pages 빌드를 확인하려면:

```powershell
npm.cmd run build:pages
```

개발 서버 설정은 기존처럼 `/` 경로를 사용합니다. 다른 저장소 이름으로 옮기면 로컬 확인 명령의 `/intart/`도 새 이름에 맞게 바꿉니다. CI는 Pages 설정에서 경로를 가져옵니다.

## 정적 호스팅에서의 범위

- GitHub Pages는 정적 파일을 제공하며 `server/`의 Node.js 및 WebSocket 코드를 실행하지 않습니다.
- 테마파크와 교회의 실시간 입장·이동·접속자 동기화, 같은 Wi-Fi 주소 조회는 별도 서버가 필요합니다. 현재 멀티플레이 입장 화면은 Pages에서 서버에 연결할 수 없어 입장하지 못합니다. 이 기능이 필요하면 별도 서버 배포와 클라이언트 연결 주소 설정이 추가로 필요합니다.
- 카메라 기능은 HTTPS 배포 주소에서 사용자가 카메라 권한을 허용해야 합니다.
- 이 작업은 빌드와 파일 검사로 검증합니다. 개발·미리보기 서버와 브라우저 체험은 자동 실행하지 않습니다.

공식 안내: [Vite GitHub Pages 배포](https://vite.dev/guide/static-deploy#github-pages), [GitHub Pages 사용자 지정 워크플로](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
