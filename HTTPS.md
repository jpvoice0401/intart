# 로컬 네트워크 HTTPS 개발

## 현재 PC 확인 결과 · 2026-11-19

- Wi-Fi IP: `172.30.1.55`, 현재 Windows 네트워크 분류는 Public입니다.
- 개발 CA가 이미 Windows 루트 저장소에서 신뢰됩니다. localhost/IP SAN과 인증서·키 일치도 확인했습니다.
- 현재 Public 프로필에 Node.js 실행 파일의 TCP 수신 허용 규칙이 활성화되어 있습니다. 추가 방화벽 규칙이나 네트워크 분류 변경은 적용하지 않았습니다.
- Windows의 카메라 접근 및 데스크톱 앱 카메라 접근은 Allow입니다. 각 브라우저의 사이트별 카메라 허용은 별도입니다.
- 사용자가 실행해 둔 서버의 `https://172.30.1.55:5174/`에서 인증서를 검증한 HTTPS 요청이 `200`, TLS 1.3으로 응답했습니다. 다른 기기의 접속이나 기기 격리까지 검증한 결과는 아닙니다. 에이전트가 서버를 실행하거나 재시작하지 않았습니다.

바탕화면의 `int_art-phone-access` 폴더와 `int_art-phone-access.zip`에 접속 기기용 공개 CA, 아이폰 설치 프로파일, 다른 Windows PC용 설치 명령, 바로가기와 안내문을 준비했습니다. 프로파일의 공개 CA 내용 일치와 ZIP에 비밀키가 없음을 확인했습니다. 이 파일들은 public에 넣지 않았습니다. 휴대폰으로 해당 파일을 옮긴 후 설치·신뢰 승인과 사이트 카메라 허용은 접속 기기에서 직접 진행해야 합니다.

기존 개발 포트 `5174`, strictPort, 플러그인, 압축, MediaPipe 및 빌드 설정을 유지합니다. 개발 서버만 HTTPS로 바꾸며 `preview`는 기존 HTTP 포트 `4174`를 유지합니다.

## 실행 및 공유

프로젝트 폴더의 PowerShell에서 아래 명령만 실행합니다. `npm.cmd`는 Windows의 `npm.ps1` 실행 정책 차단을 피합니다. 다른 터미널에서는 `npm run dev`도 사용할 수 있습니다.

```powershell
npm.cmd run dev
```

같은 로컬 네트워크에 연결된 PC에서 `https://172.30.1.55:5174/`에 접속합니다. 개발 PC에서는 `https://localhost:5174/`도 사용할 수 있습니다. Vite는 `0.0.0.0`에 바인딩되어 시작 시 HTTPS Network URL을 출력합니다. 보조 어댑터의 `https://192.168.137.1:5174/`도 인증서에 포함되어 있으나 해당 네트워크에서만 사용할 수 있습니다.

위 주소는 2026-11-19에 확인한 Wi-Fi IP입니다. 휴대폰도 같은 Wi-Fi에서 접속할 수 있습니다. `Local:` / `Network:`는 터미널에 입력하는 명령이 아니며, 표시된 `https://...` 주소만 브라우저 주소창에 입력합니다. 실행 중에는 서버 터미널을 열어 둡니다.

이미 5174 포트를 사용 중이면 기존 개발 서버 터미널에서 Ctrl+C로 종료한 뒤 다시 실행합니다. strictPort를 유지했으므로 포트가 임의로 변경되지 않습니다.

## 인증서 신뢰 및 카메라

mkcert가 만든 개발 CA는 각 접속 기기에서 별도로 신뢰해야 합니다. 개발 PC에서도 인증서 경고가 나오면 다음 명령을 직접 실행하고 Windows의 인증서 등록 확인을 승인합니다.

```powershell
.\.tools\mkcert.exe -install
```

다른 PC에는 **공개 CA 인증서인 `.certs/rootCA.crt`만** 안전하게 복사하여 신뢰할 수 있는 루트 인증 기관에 등록합니다. Windows는 인증서 가져오기에서 **현재 사용자 → 신뢰할 수 있는 루트 인증 기관**을 선택하거나 다음 명령을 실행할 수 있습니다.

```powershell
certutil -user -addstore Root .\rootCA.crt
```

macOS는 키체인 접근으로 가져온 뒤 해당 인증서의 신뢰 설정을 지정합니다. Firefox에서 경고가 남으면 설정 → 개인정보 및 보안 → 인증서 → 인증서 보기 → 인증 기관에서 같은 CA를 가져와 웹사이트 식별을 신뢰합니다. 브라우저를 완전히 종료한 뒤 다시 열고 HTTPS 주소로 접속합니다. 경고를 단순히 무시하는 것만으로는 카메라 사용이 보장되지 않습니다.

카메라는 신뢰된 HTTPS에서 사이트의 카메라 권한을 허용하고, 운영체제의 해당 브라우저 카메라 접근도 허용해야 합니다. 이전에 거부했다면 주소창의 사이트 권한에서 초기화 후 새로고침합니다. 인앱 브라우저가 카메라 접근을 지원하지 않으면 Chrome, Edge 또는 Safari 등 외부 브라우저로 엽니다.

접속 자체가 되지 않으면 같은 네트워크인지 확인하고 Windows 방화벽에서 Node.js의 **개인 네트워크** 접근 또는 TCP 5174 수신을 허용합니다. 게스트 Wi-Fi의 기기 격리도 확인합니다. 방화벽 전체를 끄거나 인터넷 포트 포워딩을 설정할 필요는 없습니다.

## IP 변경 / 재설정

Wi-Fi 변경 등으로 IP가 바뀌면 아래 명령으로 현재 IP를 포함한 인증서를 다시 생성하고, 실행 중인 개발 서버를 직접 재시작합니다. 이 명령 자체는 서버를 실행하지 않습니다.

```powershell
npm.cmd run setup:https
```

새 PC에서는 먼저 [mkcert 공식 설치 안내](https://github.com/FiloSottile/mkcert#installation)에 따라 설치하거나 `.tools/mkcert.exe`에 Windows 실행 파일을 두고 위 명령을 실행합니다. 기존 CA가 유지되면 클라이언트에 CA를 재등록할 필요는 없습니다. 새 CA를 만들었다면 공개 루트 인증서를 다시 등록해야 합니다.

`.certs/`는 public 밖에 있으며 Git에서 제외되고 Vite 파일 접근도 차단됩니다. `.tools/`와 PEM/KEY/P12/PFX도 Git에서 제외합니다. 서버 비밀키 `dev-key.pem`과 mkcert CA 비밀키 `rootCA-key.pem`은 공유하지 마세요. CA 비밀키는 mkcert의 사용자별 저장소에 유지하며 프로젝트로 복사하지 않습니다. 위치는 `.\.tools\mkcert.exe -CAROOT`으로 확인합니다.

참고: [Vite 서버 설정](https://vite.dev/config/server-options.html), [mkcert의 다른 기기 신뢰 설정](https://github.com/FiloSottile/mkcert#installing-the-ca-on-other-systems), [카메라의 HTTPS 및 권한 요구 사항](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).
