# 08 · 6flags

미국 Six Flags Great Adventure의 실제 기구 네 가지를 참고한 3D 테마파크입니다. 같은 로컬 네트워크에서 최대 24명이 함께 이용합니다.

## 실행

```sh
npm install
npm run dev
```

호스트는 `http://localhost:5174`를 열고, 친구는 화면 오른쪽 **친구 초대**에 표시된 주소를 같은 Wi-Fi의 브라우저에서 엽니다. 서버는 `0.0.0.0:5174`에서 웹 페이지와 WebSocket을 함께 제공합니다. 접속할 때마다 닉네임을 입력하고 무작위 캐릭터를 받습니다. 페이지를 정적 호스팅하는 것만으로는 멀티플레이가 작동하지 않습니다.

빌드 결과도 `npm run build` 다음 `npm run preview`로 실행하면 같은 멀티플레이 서버를 사용합니다. 프리뷰 포트는 4174입니다. 서버를 종료하면 접속자와 좌석 상태가 초기화됩니다.

## 조작

- 방향키 / 화면 왼쪽 아래 조이스틱: 카메라 방향을 기준으로 이동
- 가까운 놀이기구 카드의 **탑승하기**: 빈 좌석에 탑승
- 스페이스 / 오른쪽 아래 동작 버튼: 걷는 중에는 점프, 회전목마에서는 가속, 관람차에서는 손 흔들기, SkyScreamer에서는 높이와 속도 올리기, 회전 찻잔에서는 같은 찻잔의 핸들 돌리기
- **내리기**: 놀이기구 출구로 하차
- 화면 드래그 / 스크롤: 시점 회전 / 확대

회전목마 6석, 관람차 8석, 회전그네 6석, 회전 찻잔 4개 × 2석을 공유합니다. 이동 속도·좌석·놀이기구 상태는 서버가 관리하고 초당 20번 전달합니다. 연결이 끊기면 좌석을 반환하며, 재연결 후 입장 버튼을 누르면 다시 참여합니다.

## 기구 참고

미국 Six Flags Great Adventure의 실제 놀이기구 네 가지를 축소된 3D 미니어처로 재해석했습니다. 실제 공원 배치나 치수를 그대로 복제한 모델은 아닙니다.

- [Carousel](https://www.sixflags.com/greatadventure/attractions/carousel)
- [Giant Wheel](https://www.sixflags.com/greatadventure/attractions/giant-wheel)
- [SkyScreamer](https://www.sixflags.com/greatadventure/attractions/skyscreamer)
- [Enchanted Teacups](https://www.sixflags.com/greatadventure/attractions/enchanted-teacups)

## 검증

```sh
node --test tests/*.test.mjs
npm run build
```

`tests/sixflags.test.mjs`는 입력 제한, 네 놀이기구의 탑승·동작·하차, 좌석 중복 방지, 바닥 위 좌석 유지, 찻잔 공유, 실제 WebSocket 두 접속자의 동기화와 연결 해제를 확인합니다.
