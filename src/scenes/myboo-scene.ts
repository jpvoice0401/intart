import '../myboo.css'
import type { GestureRecognizerResult } from '@mediapipe/tasks-vision'
import { openCamera, setCameraVisible } from '../camera-access'
import { BOO_IDLE, booControls, MybooDrive, type BooHand } from '../myboo-model'
import { MybooVision } from '../myboo-vision'
import { MybooRenderer } from '../myboo-renderer'
import { MybooAudio } from '../myboo-audio'
import { MybooHornGesture } from '../myboo-horn'

export function mountMyboo(container: HTMLElement): () => void {
  container.innerHTML = `
    <section class="myboo-scene" aria-label="myboo · 손으로 운전하는 라스베가스">
      <video class="myboo-video" playsinline muted aria-hidden="true"></video>
      <header class="myboo-heading"><h1>myboo</h1></header>
      <div class="myboo-stage">
        <div class="myboo-intro">
          <h2>손끝으로 떠나는<br><em>라스베가스.</em></h2>
          <p>왼손으로 차키를 받고,<br>양손으로 핸들을 잡아보세요.</p>
          <button class="myboo-start" type="button">카메라 켜고 시작</button>
          <small>영상은 기기 안에서만 처리됩니다.</small>
        </div>
        <div class="myboo-hud">
          <div class="myboo-speed"><span>라스베가스 · 낮</span><div><b>000</b><small>km/h</small></div><p>시동 꺼짐</p></div>
          <div class="myboo-drive-state" aria-live="polite"><span>왼손을 들어 차키를 받아주세요.</span></div>
        </div>
      </div>
      <footer class="myboo-footer">
        <div class="myboo-help">
          <p class="myboo-status" role="status" aria-live="polite"></p>
          <details class="myboo-demo">
            <summary>조작 방법 · 카메라 없이 체험</summary>
            <div class="myboo-demo-panel">
              <div class="myboo-steps">
                <span data-step="key"><b>차키 받기</b>왼손 손바닥을 보여주세요.</span>
                <span data-step="grip"><b>시동 · 회전</b>양손으로 핸들을 잡고 기울여보세요.</span>
                <span data-step="boost"><b>가속</b>오른손 검지를 위로 세워보세요.</span>
              </div>
              <p class="myboo-horn-help">손바닥을 앞으로 두 번 밀면 클락션이 울려요.</p>
              <div class="myboo-demo-buttons" role="group" aria-label="카메라 없이 체험">
                <button data-demo="key" type="button">차키 받기</button>
                <button data-demo="grip" type="button">시동 걸기</button>
                <button data-demo="boost" type="button">누르는 동안 가속</button>
              </div>
              <a href="${import.meta.env.BASE_URL}myboo/CREDITS.md" target="_blank" rel="noopener">영상·소리 출처</a>
            </div>
          </details>
        </div>
        <div class="myboo-tools" role="group" aria-label="주행 조작">
          <button class="myboo-sound" type="button" aria-pressed="true">소리 켜짐</button>
          <button class="myboo-horn" type="button" aria-label="클락션 빵빵" title="클락션 소리 재생">클락션</button>
          <button class="myboo-labels" type="button" aria-pressed="true" aria-label="안내 숨기기">안내</button>
          <button class="myboo-swap" type="button" aria-pressed="false" title="왼손과 오른손 인식이 반대일 때 전환">좌우 전환</button>
          <button class="myboo-reset" type="button">초기화</button>
          <button class="myboo-camera" type="button">카메라 켜기</button>
        </div>
      </footer>
    </section>`
  const root = container.querySelector<HTMLElement>('.myboo-scene')!
  const video = root.querySelector<HTMLVideoElement>('video')!
  const start = root.querySelector<HTMLButtonElement>('.myboo-start')!
  const cameraButton = root.querySelector<HTMLButtonElement>('.myboo-camera')!
  const sound = root.querySelector<HTMLButtonElement>('.myboo-sound')!
  const labels = root.querySelector<HTMLButtonElement>('.myboo-labels')!
  const swapButton = root.querySelector<HTMLButtonElement>('.myboo-swap')!
  const status = root.querySelector<HTMLElement>('.myboo-status')!
  const state = root.querySelector<HTMLElement>('.myboo-drive-state span')!
  const intro = root.querySelector<HTMLElement>('.myboo-intro')!
  const speed = root.querySelector<HTMLElement>('.myboo-speed b')!
  const engine = root.querySelector<HTMLElement>('.myboo-speed p')!
  const phase = root.querySelector<HTMLElement>('.myboo-speed > span')!
  const steps = ['key', 'grip', 'boost'].map(name => root.querySelector<HTMLElement>(`[data-step="${name}"]`)!)
  const events = new AbortController(), eventOptions = { signal: events.signal }
  const drive = new MybooDrive(), audio = new MybooAudio(), hornGesture = new MybooHornGesture()
  let renderer: MybooRenderer
  try { renderer = new MybooRenderer(root) }
  catch (error) { start.disabled = cameraButton.disabled = true; status.textContent = String(error); return () => events.abort() }
  let stream: MediaStream | null = null, vision: MybooVision | null = null
  let disposed = false, preparing = false, live = false, generation = 0
  let frame = 0, previous = performance.now(), submitAt = -Infinity, videoTime = -1, handsAt = -Infinity, hudAt = 0
  let hands: BooHand[] = [], swap = false, showLabels = true
  let handFrame: ImageBitmap | null = null
  let demoKeyUntil = 0, demoGripUntil = 0, demoBoost = false
  const assetErrors = new Set<string>()
  try { swap = localStorage.getItem('myboo-swap-hands') === 'true'; showLabels = localStorage.getItem('myboo-labels') !== 'hidden' } catch { /* Storage is optional. */ }
  function applyPreferences() { root.classList.toggle('myboo-hide-labels', !showLabels); labels.setAttribute('aria-pressed', String(showLabels)); labels.setAttribute('aria-label', showLabels ? '안내 숨기기' : '안내 보기'); swapButton.setAttribute('aria-pressed', String(swap)) }
  function syncSound() { sound.textContent = audio.enabled ? '소리 켜짐' : '소리 꺼짐'; sound.setAttribute('aria-pressed', String(audio.enabled)); if (audio.error) status.textContent = audio.error }
  function unlock() { renderer.unlockRoad(); void audio.unlock().then(syncSound) }
  function playHorn() {
    if (!audio.enabled) { status.textContent = '소리를 켠 뒤 클락션을 눌러주세요.'; return }
    const token = generation
    status.textContent = '소리가 없으면 클락션 버튼을 다시 눌러주세요.'
    void audio.horn().then(played => {
      if (disposed || document.hidden || token !== generation) return
      if (played) status.textContent = '빵빵! · 클락션을 재생했어요.'
      else if (audio.error) status.textContent = `클락션 재생 실패: ${audio.error}`
    })
  }
  applyPreferences()

  function stopCamera() {
    generation++; preparing = live = false
    stream?.getTracks().forEach(track => track.stop()); stream = null
    vision?.close(); vision = null; video.pause(); video.srcObject = null
    hands = []; handsAt = -Infinity; hornGesture.clear(); drive.reset(); renderer.resetRoad(); audio.stop(); demoBoost = false; demoKeyUntil = demoGripUntil = 0
    handFrame?.close(); handFrame = null
    start.disabled = false; start.textContent = '카메라 켜고 시작'; cameraButton.textContent = '카메라 켜기'; intro.hidden = false; root.classList.remove('is-live', 'is-active', 'is-preparing')
  }
  function receive(result: GestureRecognizerResult, timestamp: number, cameraFrame?: ImageBitmap) {
    if (disposed || document.hidden) { cameraFrame?.close(); return }
    handFrame?.close(); handFrame = cameraFrame ?? null
    hands = result.landmarks.map((landmarks, index) => ({
      side: result.handedness[index]?.[0]?.categoryName === 'Left' ? 'Left' : 'Right',
      gesture: result.gestures[index]?.[0]?.categoryName ?? 'None', confidence: result.gestures[index]?.[0]?.score ?? 0, landmarks,
    }))
    handsAt = timestamp
    const progress = hornGesture.progress
    if (hornGesture.sample(hands, timestamp / 1000, (video.videoWidth || 1280) / (video.videoHeight || 720))) playHorn()
    else if (hornGesture.progress > progress) status.textContent = '클락션 1/2 · 손을 살짝 당겼다가 같은 손으로 한 번 더 앞으로 밀어주세요.'
    else if (hornGesture.progress < progress) status.textContent = '클락션 대기 · 손바닥을 펴고 앞으로 밀기 → 당기기 → 다시 밀기.'
  }
  async function startCamera() {
    unlock()
    if (preparing || stream) { stopCamera(); status.textContent = '카메라를 껐어요. 다시 켜서 시작할 수 있어요.'; return }
    const token = ++generation
    preparing = true; root.classList.add('is-preparing'); start.disabled = true; start.textContent = '카메라 연결 중…'; cameraButton.textContent = '취소'
    drive.reset(); status.textContent = '카메라 사용을 허용해주세요. 왼손과 오른손을 모두 인식합니다.'
    try {
      const camera = await openCamera(video, 960, 540)
      if (disposed || token !== generation) { camera.getTracks().forEach(track => track.stop()); return }
      stream = camera; video.srcObject = camera; setCameraVisible(stream, !document.hidden)
      await video.play()
      if (disposed || token !== generation) return
      const session = new MybooVision((result, timestamp, cameraFrame) => { if (token === generation) receive(result, timestamp, cameraFrame); else cameraFrame?.close() })
      vision = session; status.textContent = '손 제스처 모델 준비 중… 처음에는 잠시 걸릴 수 있어요.'
      await session.initialize()
      if (disposed || token !== generation) { session.close(); return }
      preparing = false; live = true; submitAt = -Infinity; videoTime = -1
      intro.hidden = true; cameraButton.textContent = '카메라 끄기'; root.classList.remove('is-preparing'); root.classList.add('is-live', 'is-active')
      status.textContent = ''
      camera.getVideoTracks()[0]?.addEventListener('ended', () => { if (disposed || token !== generation) return; stopCamera(); status.textContent = '카메라 연결이 종료됐어요. 다시 켜주세요.' }, eventOptions)
    } catch (error) {
      if (disposed || token !== generation) return
      stopCamera()
      const name = error instanceof Error ? error.name : ''
      status.textContent = name === 'NotAllowedError' ? '카메라 권한을 허용해주세요. 인증서 경고가 있다면 신뢰 등록 후 외부 브라우저에서 열어주세요.'
        : name === 'NotFoundError' ? '연결된 카메라를 찾지 못했어요.'
        : name === 'NotReadableError' ? '다른 앱에서 카메라를 사용 중인지 확인해주세요.'
        : `시작하지 못했어요: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  function animate(now: number) {
    if (disposed || document.hidden) return
    const dt = Math.max(0, (now - previous) / 1000); previous = now
    if (live && vision && now - submitAt >= vision.interval && video.currentTime !== videoTime) {
      if (vision.error) { stopCamera(); status.textContent = '손 인식이 중단됐어요. 카메라를 다시 켜주세요.' }
      else if (vision.submit(video, now)) { submitAt = now; videoTime = video.currentTime }
    }
    const fresh = live && now - handsAt < 350 ? hands : []
    const input = fresh.length ? booControls(fresh, swap, (video.videoWidth || 1280) / (video.videoHeight || 720)) : { ...BOO_IDLE }
    input.leftRaised ||= now < demoKeyUntil; input.fist ||= now < demoGripUntil; input.pointing ||= demoBoost
    const wasStarting = drive.starting
    drive.update(dt, input)
    if (!wasStarting && drive.starting) status.textContent = '시동이 걸렸어요. 오른손 검지를 위로 세우면 가속합니다.'
    if (drive.takeRev()) audio.rev(drive.speed)
    renderer.render(video, live, fresh, drive, now / 1000, swap, dt, handFrame)
    if (now - hudAt > 120) {
      speed.textContent = Math.round(drive.speed).toString().padStart(3, '0')
      engine.textContent = drive.starting ? '시동 중…' : drive.boosting ? '가속 중' : drive.running ? '주행 중' : '시동 꺼짐'
      phase.textContent = `라스베가스 · ${drive.nightMix <= 0 ? '낮' : drive.nightMix < 1 ? '노을' : '밤'}`
      state.textContent = drive.starting ? '잠시 후 출발합니다.' : drive.boosting ? '검지를 내리면 속도가 줄어들어요.' : drive.running ? drive.twoHandGrip ? '손을 기울여 핸들을 돌려보세요.' : live ? '양손을 보여 핸들을 잡아주세요.' : '체험 메뉴에서 가속 버튼을 눌러보세요.' : drive.hasKey ? live ? '양손을 보여 핸들을 잡아주세요.' : '체험 메뉴에서 시동을 걸어보세요.' : live ? fresh.length ? '왼손을 들어 차키를 받아주세요.' : '손 전체를 카메라에 보여주세요.' : '체험 메뉴에서 차키를 받아주세요.'
      root.classList.toggle('is-driving', drive.running); root.classList.toggle('is-boosting', drive.boosting)
      steps[0]!.classList.toggle('is-done', drive.hasKey); steps[1]!.classList.toggle('is-done', drive.running || drive.starting); steps[2]!.classList.toggle('is-done', drive.boosting)
      if (renderer.assetError && !assetErrors.has('images')) { assetErrors.add('images'); status.textContent = '실내 이미지를 불러오지 못했어요. 새로고침해주세요.' }
      if (audio.error && !assetErrors.has(audio.error)) { assetErrors.add(audio.error); syncSound() }
      if (renderer.roadError && !assetErrors.has(renderer.roadError)) { assetErrors.add(renderer.roadError); status.textContent = renderer.roadError }
      hudAt = now
    }
    frame = requestAnimationFrame(animate)
  }
  start.addEventListener('click', () => void startCamera(), eventOptions)
  cameraButton.addEventListener('click', () => void startCamera(), eventOptions)
  sound.addEventListener('click', () => { const muted = !audio.enabled; void audio.toggle().then(() => { syncSound(); if (muted && drive.running) audio.rev(drive.speed) }) }, eventOptions)
  root.querySelector('.myboo-horn')!.addEventListener('click', playHorn, eventOptions)
  labels.addEventListener('click', () => { showLabels = !showLabels; applyPreferences(); try { localStorage.setItem('myboo-labels', showLabels ? 'visible' : 'hidden') } catch { /* Optional. */ } }, eventOptions)
  swapButton.addEventListener('click', () => { swap = !swap; hands = []; handFrame?.close(); handFrame = null; hornGesture.clear(); applyPreferences(); try { localStorage.setItem('myboo-swap-hands', String(swap)) } catch { /* Optional. */ } }, eventOptions)
  root.querySelector('.myboo-reset')!.addEventListener('click', () => { hornGesture.clear(); drive.reset(); renderer.resetRoad(); audio.stop(); demoKeyUntil = demoGripUntil = 0; demoBoost = false; status.textContent = '처음으로 돌아왔어요. 왼손을 들어 차키를 받으세요.' }, eventOptions)
  renderer.canvas.addEventListener('pointerdown', () => renderer.unlockRoad(), eventOptions)
  root.querySelector('[data-demo="key"]')!.addEventListener('click', () => { unlock(); demoKeyUntil = performance.now() + 600; intro.hidden = true; root.classList.add('is-active'); status.textContent = '' }, eventOptions)
  root.querySelector('[data-demo="grip"]')!.addEventListener('click', () => { unlock(); demoGripUntil = performance.now() + 800; if (!drive.hasKey) status.textContent = '먼저 차키 받기를 눌러주세요.' }, eventOptions)
  const boost = root.querySelector<HTMLButtonElement>('[data-demo="boost"]')!
  boost.addEventListener('pointerdown', event => { boost.setPointerCapture(event.pointerId); unlock(); demoBoost = true }, eventOptions)
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) boost.addEventListener(name, () => { demoBoost = false }, eventOptions)
  boost.addEventListener('keydown', event => { if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); unlock(); demoBoost = true } }, eventOptions)
  boost.addEventListener('keyup', () => { demoBoost = false }, eventOptions)
  window.addEventListener('blur', () => { demoBoost = false; demoKeyUntil = demoGripUntil = 0; hands = []; handFrame?.close(); handFrame = null; hornGesture.clear() }, eventOptions)
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(frame); hands = []; handsAt = -Infinity; hornGesture.clear(); demoBoost = false; demoKeyUntil = demoGripUntil = 0
    handFrame?.close(); handFrame = null
    setCameraVisible(stream, !document.hidden)
    if (document.hidden) { audio.suspend(); renderer.pauseRoad() }
    else if (!disposed) { audio.resume(); previous = performance.now(); frame = requestAnimationFrame(animate) }
  }, eventOptions)
  frame = requestAnimationFrame(animate)
  return () => { disposed = true; events.abort(); cancelAnimationFrame(frame); stopCamera(); audio.destroy(); renderer.destroy() }
}
