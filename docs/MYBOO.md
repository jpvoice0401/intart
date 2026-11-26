# myboo

추가한 예제: `https://localhost:5174/?example=myboo` 또는 상단 메뉴의 `myboo`.
기존 기본 예제(rolex), 다른 예제의 코드·비주얼, HTTPS·포트·압축 설정은 유지합니다.

## 사용 방법

1. 사용자가 터미널에서 `npm.cmd run dev`를 실행합니다.
2. 위 주소를 Chrome/Edge/Safari 등에서 열고 `카메라 켜고 시작`을 누릅니다.
3. 왼손만 펼쳐 손바닥을 카메라 쪽으로 보이면 손바닥 중앙에 차키가 나타납니다. 손등이나 주먹에는 표시하지 않습니다. 손바닥 방향과 기울기에 맞춰 키의 회전·폭·비스듬한 원근을 조절하고 작은 접촉 그림자를 표시합니다. 약 0.22초 왼손을 들면 키가 연결됩니다.
4. 양손이 함께 인식되면 손을 펼친 상태에서도 핸들을 잡습니다. 키가 연결된 상태에서 약 0.32초 유지하면 시동 효과음과 함께 출발합니다. 기존 오른손 `Closed_Fist` 시동도 유지합니다.
   이때 차키와 연결 표시 문구는 숨깁니다. 한 손의 짧은 추적 누락으로 키가 깜빡이지 않게 양손 인식 후 0.35초 동안 숨김을 유지합니다. 다시 왼손만 손바닥을 보이면 키가 표시됩니다.
5. 오른손의 `Pointing_Up`(검지만 위로 세우기)을 유지하면 최고 **300km/h**까지 가속합니다. 해제하면 기본 68km/h로 부드럽게 돌아옵니다. 엔진음 강도도 300km/h를 기준으로 반영합니다.
6. 양손을 잇는 선을 기울이면 핸들이 같은 각도로 회전합니다. 카메라 비율과 좌우 반전을 반영하며, 손 결과 순서가 바뀌어도 180도 튀지 않습니다. 최대 회전은 좌우 135도입니다. 잠깐 인식이 끊기면 0.25초 동안 각도를 유지한 뒤 부드럽게 중앙으로 돌아옵니다. 한 손 주먹의 기존 좌우 조작도 유지합니다.
7. 엔진음은 시동 순간과 이후 주행 중 **20초 간격**으로 재생됩니다. `SOUND ON/OFF`로 제어합니다.
8. 손 인식이 반대라면 `좌우 전환`, 설명 숨기기는 `Aa`, 처음부터 다시 시작은 `RESET`을 사용합니다.
9. `Open_Palm`으로 손바닥을 카메라 쪽에 보인 채 **밀기 → 되돌리기 → 다시 밀기**를 같은 손으로 3초 안에 하면 “빵빵” 클락션이 울립니다. 양손 중 어느 손이든 가능합니다. 첫 밀기가 잡히면 `클락션 1/2` 안내가 나옵니다. 손 전체가 화면에 보이게 유지해주세요.
   손바닥 가로·세로 길이의 기하평균을 시간에 따라 평활화하고, 12% 확대 → 최고 크기에서 7% 되돌림 → 다시 12% 확대를 인식합니다. 빠른 동작에서 Open_Palm 분류가 잠깐 빠져도 손가락 3개 이상이 펴져 있으면 추적을 이어갑니다. 엄격한 손바닥 방향 판정과 가로·세로 각각 23% 확대 조건을 제거했습니다. 급격한 위치·크기·기울기 변화와 0.6초를 넘는 추적 끊김은 초기화하며 손별 상태를 분리하고 1.1초 재울림 방지를 유지합니다. 깊이 센서가 없는 카메라 추정이므로 완만한 손 회전은 전진으로 오인할 수 있습니다.
   `HORN` 버튼은 카메라·시동·엔진 파일 로딩 없이 같은 클락션을 재생하고 브라우저의 오디오 재생 허용을 요청합니다. SOUND OFF일 때에는 울리지 않습니다. 제스처에서도 중단된 AudioContext의 재개를 시도하고, 차단되면 버튼을 누르라는 안내를 표시합니다. 실제 재생 예약 성공 여부를 확인한 뒤에만 재생 메시지를 표시합니다.

앞유리는 시동 전에는 정지한 라스베가스 도로를 보여주고 시동 후 주행을 시작합니다. 전체 카메라 영상을 앞유리/메인 배경에 표시하지 않습니다.
카메라 얼굴 영상은 룸미러 안에서만 유지하고, 메인 화면에는 손 영역만 합성합니다.
룸미러의 카메라는 유지됩니다. 손은 카메라 원본 픽셀을 실내보다 앞에 합성합니다.
손끝 동그라미 및 손바닥 조작 원은 표시하지 않습니다. 마디별 원형 조각으로 손을 자르던 방식은 제거했습니다.
손바닥과 각 손가락 주변으로만 탐색 영역을 제한하고, 손바닥에서 얻은 색 경계로 윤곽을 따며 금속 반지·빛 반사의 작은 틈은 보정합니다. 손가락 사이 전체를 채우는 외곽 다각형과 넓은 팔 영역은 제거했습니다.
색이 비슷해도 실제 손 관절과 연결되지 않은 영역은 제외하며 최종 알파도 손 탐색 범위 밖으로 나가지 못하게 제한합니다.
Worker는 인식한 동일 프레임을 비트맵으로 돌려주어 손 위치와 영상 시점을 맞춥니다. 오래된 손 위치에 현재 얼굴 영상을 잘못 붙이는 현상을 줄입니다. 최신 프레임 하나만 유지하고 교체·숨김·종료 시 닫습니다.
실제 손 영상은 변형하거나 늘리지 않고 원래 해상도로 합성합니다. 윤곽 계산은 가로 최대 640px, 최대 24Hz이며 버퍼를 재사용합니다.
주변 물체가 손과 비슷한 색이거나 조명이 강하게 변할 때에는 색 기반 윤곽 추정에 오차가 생길 수 있습니다. 실제 카메라에서의 경계 품질은 별도 확인이 필요합니다.

앞유리 주행 화면은 Jason James가 라스베가스에서 촬영한 실제 전방 영상입니다. 낮은 Pexels 36500011(원본 3–43초, 40초), 밤은 Pexels 36147776(원본 1–16초, 15초)을 사용합니다.
각각 로컬 H.264 영상(1280×720, 30fps, 오디오 없음)으로 저장했습니다.
낮으로 출발하고 실제 주행 경과 30초부터 15초간 어스름해진 뒤 야간 영상으로 전환해 45초 이후에는 밤이 유지됩니다. 가속과 무관하게 시간 전환은 실제 경과 시간을 기준으로 합니다.
RESET/카메라 종료 시 다시 낮으로 돌아오며 숨겨진 탭에서는 주행 시간과 영상이 모두 멈춥니다.
시동 후 출발하고, 검지 가속/속도에 따라 재생 속도가 0.65–3.5배로 변합니다(68km/h에서 1배, 300km/h에서 3.5배). 주행 경로는 녹화된 영상의 경로이며 핸들은 시야 방향을 조절합니다.
낮 파일은 `public/myboo/vegas-drive.mp4`, 밤 파일은 `vegas-night.mp4`이며 각각 포스터가 있습니다. 출처·라이선스는 `public/myboo/CREDITS.md`에 있습니다.
기존 Canvas 네온 거리 장면은 영상/포스터가 준비되지 않았을 때의 대체 화면으로 유지합니다.
룸미러는 센터 콘솔 위에 놓이고 화면 크기 때문에 숨기는 조건을 제거했습니다. 손 합성과 비네트 뒤에 마지막으로 그려 영상이 가려지거나 어두워지지 않게 했습니다.
카메라가 준비되면 손 인식 모델의 초기화 완료 여부와 관계없이 미러에 내 모습이 표시됩니다.
하단 `카메라 없이 체험 / 소리 출처`를 열면 키·시동·가속 버튼으로도 체험할 수 있습니다.

## 구조와 자원 관리

- `src/scenes/myboo-scene.ts`: 카메라 동의, 상태, 이벤트와 UI, 종료 처리.
- `src/myboo-model.ts`: 키/시동 조건과 유지 시간, 속도, 방향, 실제 경과 시간에 따른 20초 엔진음 간격 및 낮→밤 전환.
- `src/myboo-road.ts`: 실제 라스베가스 전방 영상, 로컬 파일 재생·정지·속도·가시성·종료 처리.
- `src/myboo-hand-matte.ts`: 카메라 픽셀의 손 윤곽 추정과 원본 해상도 합성. 추가 신경망 모델 없음.
- `src/myboo-horn.ts`: 인식 프레임별 양손 독립 push 상태, 두 번 밀기, 되돌림·시간 제한·재울림 방지.
- `src/myboo-vision.ts`, `myboo-recognizer.ts`, `myboo-worker.ts`: 기존 예제와 분리된 MediaPipe GestureRecognizer.
- 공식 로컬 모델 `public/mediapipe/gesture_recognizer.task`, 기존 로컬 WASM 재사용. 최대 두 손.
- Worker는 CPU 인식, 20Hz 상한, 단일 프레임만 처리. Worker가 불가능하거나 실패하면 메인 스레드의 GPU/CPU 인식으로 전환하고 10Hz 상한 적용.
- 손 정보가 350ms 이상 오래되면 제스처 입력 해제. 시작 버튼 동작에서만 카메라/오디오 초기화.
- 정적 실내·키·핸들·호텔·스카이라인 캐시. 거리 레이어를 프레임당 한 번만 그려 재사용. DPR 최대 1.5.
- 숨겨진 탭에서는 rAF, 카메라 트랙과 소리를 중단. 재표시 시 숨겨진 시간만큼 시뮬레이션/소리를 몰아서 실행하지 않음.
- 예제 전환 시 카메라 트랙, Worker/모델, 오디오, 이벤트, ResizeObserver 및 rAF 정리. 비동기 시작 중 취소/예제 전환도 처리.
- 주행 영상도 숨겨진 탭/카메라 중지/초기화 시 정지하고, 예제 전환 시 source 및 비디오 요소를 해제합니다. 화면을 누르면 브라우저 재생 차단을 다시 시도할 수 있습니다.
- 네트워크로 카메라 프레임을 전송하지 않음. 이미지/소리/모델 모두 로컬 파일에서 로딩.

## 소리 및 이미지 출처

출처상 람보르기니 아벤타도르/SV/SVJ 계열 녹음으로 명시된 샘플 세 개(2000·4000·6000 RPM)를 사용합니다.
2026-11-19 원본 패키지의 manifest/저작자/차종/라이선스를 재확인하고 파일을 다시 내려받아 바이트 일치와 SHA-256, 무음·클리핑 여부를 확인했습니다.
검증 내역은 `public/myboo/engine-provenance.json`입니다. 차종 판단은 원 저작자의 설명에 근거하며 독립적인 음향 감정 결과는 아닙니다.
앱에서 음높이를 크게 바꾸던 처리를 제거하고 각 녹음의 1배속 음색을 유지하며 볼륨을 교차 전환해 약 4.65초 레브 효과를 구성합니다.
별도의 실제 시동 원본 녹음은 아닙니다. 저작자, 원본 링크, CC BY 3.0 라이선스와 변경 사항은
`public/myboo/CREDITS.md` 및 화면의 출처 링크에 기록했습니다.
클락션은 이 앱에서 만든 400/500Hz 이중 음색을 두 번 짧게 재생하는 합성 효과입니다. 실제 람보르기니 클락션 녹음으로 표시하지 않습니다. 엔진음과 별도로 재생하며 음소거·카메라 종료·탭 숨김 시 함께 정지합니다.

실내와 키는 첨부된 네 장의 사진을 시각적 참고로 사용해 built-in image_gen 도구로 새로 생성했습니다.
생성 이미지를 프로젝트의 `public/myboo/cockpit.png`, `public/myboo/key.png`로 복사했습니다.
원본 사진 자체를 변형하거나 공식 사진으로 표시하지 않습니다. 핸들과 거리 그래픽은 Canvas 코드입니다.

### 최종 생성 프롬프트 — cockpit.png

```text
Use case: product-mockup. Create one photorealistic transparent PNG cockpit overlay asset for a Lamborghini driving simulator called myboo, based on the supplied Lamborghini cabin reference photographs (references only, not edit targets). Landscape 1536x1024. First-person driver eye view, wide windshield dominates upper 50 percent, gorgeous sculpted black leather and carbon fiber dashboard occupying lower half, vivid orange leather trim and stitching matching references, angular hexagonal air vents, brushed metal controls, center console on right. Crucial: the area through the windshield and side windows is genuine transparent alpha, not black and not checkerboard painted into image; only physical car interior is opaque. Lower dashboard rises around y=55%. Keep a large clear region at x=32%, y=74% for a separate animated steering wheel; do NOT render any steering wheel or wheel rim. No rear view mirror (a live camera mirror is separately composited at upper right). No people, no hands, no text, no UI, no road, no exterior scenery, no watermark. Beautiful realistic studio automotive photography, warm orange leather edges and cold ambient highlights, detailed dark materials readable rather than crushed black. Reference photo style and proportions. Asset only.
```

### 최종 생성 프롬프트 — key.png

```text
Use case: product-mockup. One isolated photorealistic Lamborghini smart car key fob, matching the supplied key reference photograph (second reference: silver angular trim around black glossy oval key with lock, trunk, unlock buttons and gold bull shield). Reference only, not an edit target. Object aligned vertically upright, tip at bottom, whole key fully visible, centered, occupying most of a square image, close detailed black polished enamel, brushed silver metal edges and three crisp tiny white button icons. A small gold bull shield near its lower end. Genuine transparent alpha background. No hand, no table, no keyring, no text, no shadow outside the object, no duplicate objects, no watermark. Premium realistic product photograph, accurate reflections, asset for attaching to a tracked left palm.
```

## 검증 범위

2026-11-19: `npm.cmd run build` 통과 — TypeScript 검사와 Vite 프로덕션 빌드 완료.
클락션 수정 후 같은 명령을 다시 실행해 종료 코드 0과 Brotli 압축 완료를 확인했습니다. 변경 범위는 myboo의 클락션 인식·오디오·버튼/안내와 이 문서입니다. 실제 손 밀기 인식 및 스피커 출력은 정적 빌드로 확인할 수 없어 실기기 확인이 필요합니다.
추가 정적 검사 통과: 모델 ZIP 구조, PNG/WAV 헤더, 빌드 자원 복사 및 압축 파일 무결성, 13개 예제 등록 유지와 myboo 지연 로딩 산출물.
실내 PNG 1536×1024(투명 픽셀 29.3%), 키 PNG 1254×1254(투명 픽셀 69.1%), 두 WAV는 mono 48 kHz 16-bit PCM(각 1.18/1.21초)임을 확인했습니다.
기존 Three.js 공통 청크가 500 kB를 초과한다는 Vite 경고는 남아 있으나 빌드는 성공했습니다.
라스베가스 영상 교체/미러 복원 후에도 빌드가 통과했습니다. FFmpeg로 로컬 영상 60초 전체를 오류 없이 디코딩하고 전방 도로·차량이 이동하는 프레임들을 확인했습니다.
MP4 fast-start 메타데이터, 영상·포스터의 public/dist 바이트 일치, 미러 숨김 조건 제거 및 미러가 비네트/손 합성 뒤에 그려지는 순서를 정적으로 확인했습니다.
AGENTS.md에 따라 개발 서버, 미리보기 서버 및 서버를 실행하는 검증 도구는 실행하지 않습니다.
실제 카메라 제스처 정확도, 실기기 오디오 재생, 반응 속도와 모바일 화면은 직접 확인하지 않았습니다.

공식 인식 가이드: https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer?tab=Web
