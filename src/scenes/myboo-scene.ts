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
      <header class="myboo-heading"><div><span class="myboo-kicker">FROM DAYLIGHT TO NEON</span><h1>myboo<span>®</span></h1><p>LAS VEGAS / DAY TO NIGHT</p></div><div class="myboo-location"><i></i> 36.1147° N &nbsp; 115.1728° W<span>THE STRIP, NEVADA</span></div></header>
      <div class="myboo-intro"><span>YOUR HANDS. YOUR DRIVE.</span><h2>낮부터 밤까지,<br><em>라스베가스.</em></h2><p>왼손에 차키를. 양손으로 시동을.<br>검지를 들면, 풍경이 더 빠르게 흐릅니다.</p><button class="myboo-start" type="button">카메라 켜고 시작 <span>↗</span></button><small>카메라 영상은 기기 안에서만 처리됩니다.</small></div>
      <div class="myboo-drive-state" aria-live="polite"><i></i><span>카메라를 켜고 왼손을 들어주세요</span></div>
      <div class="myboo-speed"><span>CORSA / DAY DRIVE</span><div><b>000</b><small>KM/H</small></div><p>ENGINE OFF</p></div>
      <div class="myboo-steps"><span data-step="key"><i>01</i> 왼손 들기 <b>차키 받기</b></span><span data-step="grip"><i>02</i> 양손으로 핸들 잡기 <b>시동 · 회전</b></span><span data-step="boost"><i>03</i> 오른손 검지 ↑ <b>가속하기</b></span></div>
      <footer class="myboo-footer"><p class="myboo-status" role="status">손끝으로 시작하는 나만의 나이트 드라이브.</p><div class="myboo-tools"><button class="myboo-sound" type="button" aria-pressed="true">SOUND ON</button><button class="myboo-horn" type="button" aria-label="클락션 빵빵" title="클락션 소리 재생 / 브라우저 소리 허용">HORN</button><button class="myboo-labels" type="button" aria-pressed="true" title="설명 표시 전환">Aa</button><button class="myboo-swap" type="button" aria-pressed="false" title="왼손과 오른손 인식이 반대일 때 전환">좌우 전환</button><button class="myboo-reset" type="button">RESET</button><button class="myboo-camera" type="button">CAMERA ↗</button></div></footer>
      <details class="myboo-demo"><summary>카메라 없이 체험 / 영상·소리 출처</summary><div><button data-demo="key" type="button">차키 받기</button><button data-demo="grip" type="button">주먹으로 시동</button><button data-demo="boost" type="button">검지 가속 · 누르기</button></div><small>Road footage: Jason James / Pexels · Engine audio: Super Cars for you, Erwin Lindsen, ePic eXhaust · <a href="${import.meta.env.BASE_URL}myboo/CREDITS.md" target="_blank" rel="noopener">출처 및 변경 사항</a></small></details>
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
  function applyPreferences() { root.classList.toggle('myboo-hide-labels', !showLabels); labels.setAttribute('aria-pressed', String(showLabels)); swapButton.setAttribute('aria-pressed', String(swap)) }
  function syncSound() { sound.textContent = audio.enabled ? 'SOUND ON' : 'SOUND OFF'; sound.setAttribute('aria-pressed', String(audio.enabled)); if (audio.error) status.textContent = audio.error }
  function unlock() { renderer.unlockRoad(); void audio.unlock().then(syncSound) }
  function playHorn() {
    if (!audio.enabled) { status.textContent = '클락션 음소거 중 · SOUND ON으로 켜주세요.'; return }
    const token = generation
    status.textContent = '클락션 재생 요청 · 소리가 없으면 HORN 버튼을 눌러 소리를 허용해주세요.'
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
    start.disabled = false; start.innerHTML = '카메라 켜고 시작 <span>↗</span>'; cameraButton.textContent = 'CAMERA ↗'; intro.hidden = false; root.classList.remove('is-live')
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
    preparing = true; start.disabled = true; start.textContent = '카메라 연결 중…'; cameraButton.textContent = 'CANCEL'
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
      intro.hidden = true; cameraButton.textContent = 'CAMERA OFF'; root.classList.add('is-live')
      status.textContent = '왼손 손바닥에 차키 · 양손으로 핸들 · 손바닥을 앞으로 두 번 밀면 빵빵!'
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
      engine.textContent = drive.starting ? 'ENGINE STARTING…' : drive.running ? `NEXT REV IN ${Math.ceil(drive.revIn)}s` : 'ENGINE OFF'
      phase.textContent = `CORSA / ${drive.nightMix <= 0 ? 'DAY' : drive.nightMix < 1 ? 'SUNSET' : 'NIGHT'} DRIVE`
      state.textContent = drive.starting ? '시동 중 · 준비하세요' : drive.boosting ? 'CORSA · 검지로 가속 중' : drive.running ? drive.twoHandGrip ? '양손 연결됨 · 손을 기울여 핸들을 돌려보세요' : 'LAS VEGAS · 양손을 보여주면 핸들을 잡아요' : drive.hasKey ? '차키 연결됨 · 양손을 보여 핸들을 잡으세요' : live ? fresh.length ? '왼손을 들어 차키를 받아주세요' : '손 전체가 카메라에 보이도록 들어주세요' : '카메라를 켜고 왼손을 들어주세요'
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
  root.querySelector('[data-demo="key"]')!.addEventListener('click', () => { unlock(); demoKeyUntil = performance.now() + 600; intro.hidden = true }, eventOptions)
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
