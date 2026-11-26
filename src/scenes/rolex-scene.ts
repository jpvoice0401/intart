import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'
import { CameraVision } from '../camera-vision'
import { openCamera, setCameraVisible } from '../camera-access'
import { cameraCover, FINGERTIPS } from '../water-touch-model'
import { WatchMechanism, wristWatchPose, interpolateWatchPose, tickingFrequency, type WatchPose } from '../rolex-model'
import { RolexRenderer } from '../rolex-renderer'
import { RolexAudio } from '../rolex-audio'
import { WatchHandIdentities, projectWatchHand, watchHandMask, type WatchHandMask, type WatchTip } from '../rolex-hands'
import { WatchDialControl } from '../rolex-control'

export function mountRolex(container: HTMLElement): () => void {
  container.innerHTML = `
    <section class="rolex-scene" aria-label="rolex · 손끝으로 돌리는 시간">
      <video class="rolex-video" playsinline muted aria-hidden="true"></video>
      <div class="rolex-vignette" aria-hidden="true"></div>
      <header class="rolex-heading">
        <h1 class="rolex-brand"><img src="${import.meta.env.BASE_URL}rolex/rolex-logo.svg" alt="로렉스"></h1>
        <div class="rolex-live"><span class="rolex-live-copy">손과 손목을 보여주세요</span><span class="rolex-tracking-state">손목 찾는 중</span></div>
      </header>
      <div class="rolex-intro">
        <h2>당신의 손목에,<br><em>반짝이는 시간.</em></h2>
        <p>카메라에 손목을 비추고,<br>반대 손끝으로 시곗바늘을 돌려보세요.</p>
        <button class="rolex-start" type="button">카메라 켜기</button>
        <small>영상은 기기 안에서만 처리됩니다.</small>
      </div>
      <footer class="rolex-footer">
        <p class="rolex-status" role="status" aria-live="polite">시계를 드래그해 시간을 돌려보세요.</p>
        <div class="rolex-tools" role="group" aria-label="시계 조작">
          <span class="rolex-rate"><b>2.0</b> 틱/초</span>
          <button class="rolex-sound" type="button" aria-pressed="true">소리 켜짐</button>
          <button class="rolex-reset" type="button">초기화</button>
          <button class="rolex-labels" type="button" aria-label="안내 숨기기" aria-pressed="true">안내</button>
          <button class="rolex-camera" type="button">카메라 켜기</button>
        </div>
      </footer>
    </section>`
  const root = container.querySelector<HTMLElement>('.rolex-scene')!
  const video = root.querySelector<HTMLVideoElement>('video')!
  const status = root.querySelector<HTMLElement>('.rolex-status')!
  const start = root.querySelector<HTMLButtonElement>('.rolex-start')!
  const cameraButton = root.querySelector<HTMLButtonElement>('.rolex-camera')!
  const sound = root.querySelector<HTMLButtonElement>('.rolex-sound')!
  const intro = root.querySelector<HTMLElement>('.rolex-intro')!
  const labels = root.querySelector<HTMLButtonElement>('.rolex-labels')!
  const liveCopy = root.querySelector<HTMLElement>('.rolex-live-copy')!
  const trackLabel = root.querySelector<HTMLElement>('.rolex-tracking-state')!
  const rateLabel = root.querySelector<HTMLElement>('.rolex-rate b')!
  const events = new AbortController(), options = {signal:events.signal}
  const shell = container.closest<HTMLElement>('.lab-shell')
  let renderer: RolexRenderer
  try { renderer = new RolexRenderer(root) }
  catch (error) {
    start.disabled = cameraButton.disabled = true
    status.textContent = error instanceof Error ? error.message : '시계를 표시할 수 없어요.'
    return () => events.abort()
  }
  const mechanism = new WatchMechanism(), audio = new RolexAudio()
  const dialControl = new WatchDialControl(mechanism)
  let vision: CameraVision | null = null, stream: MediaStream | null = null
  let disposed = false, busy = false, live = false, generation = 0
  let frame = 0, lastFrame = performance.now(), lastSubmit = 0, lastVideoTime = -1, lastSeen = -Infinity, lastHandsFrame = -Infinity, lastPoseTime = 0, lastHud = 0
  let pose: WatchPose | null = null
  let hostId: string | null = null
  const identities = new WatchHandIdentities()
  let tips: WatchTip[] = []
  let foreground: WatchHandMask[] = []
  let pointer: {id:string;x:number;y:number;sampledAt:number} | null = null
  let showLabels = true
  try { showLabels = (localStorage.getItem('rolex-korean-labels') ?? localStorage.getItem('snow-korean-labels')) !== 'hidden' } catch { /* Storage is optional. */ }
  function applyLabels() {
    root.classList.toggle('rolex-hide-labels',!showLabels); shell?.classList.toggle('rolex-hide-labels',!showLabels)
    labels.setAttribute('aria-pressed',String(showLabels)); labels.setAttribute('aria-label',showLabels ? '안내 숨기기' : '안내 보기')
    labels.title = showLabels ? '안내 숨기기' : '안내 보기'
  }
  applyLabels()
  function updateSound() { sound.textContent = audio.enabled ? '소리 켜짐' : '소리 꺼짐'; sound.setAttribute('aria-pressed',String(audio.enabled)) }
  const unlock = () => { void audio.unlock().then(updateSound) }

  function stopCamera() {
    generation++; busy = false; live = false
    stream?.getTracks().forEach(track => track.stop()); stream = null
    vision?.close(); vision = null; video.pause(); video.srcObject = null
    hostId = null; identities.clear(); pose = null; tips = []; foreground = []; pointer = null; lastSeen = lastHandsFrame = -Infinity
    dialControl.release(); audio.setActive(false)
    intro.hidden = false; start.disabled = false; start.textContent = '카메라 켜기'
    cameraButton.textContent = '카메라 켜기'; root.classList.remove('is-live','is-busy')
    trackLabel.textContent = '손목 찾는 중'; liveCopy.textContent = '손과 손목을 보여주세요'
  }

  function receiveHands(result: HandLandmarkerResult, timestamp: number) {
    if (disposed || !live) return
    const now = performance.now()
    const hands = identities.update(result.landmarks,result.handedness.map(hand => hand[0]?.categoryName ?? ''),timestamp)
    tips = []; foreground = []; lastHandsFrame = now
    if (!hands.length) return
    let owner = hands.find(hand => hand.id === hostId)
    // Preserve the wearing wrist through brief occlusion by the interacting hand.
    // Never transfer the watch just because MediaPipe changed its result order.
    if (!hostId || (!owner && now-lastSeen > 1500)) { owner = hands[0]; hostId = owner!.id }
    const cover = cameraCover(renderer.width,renderer.height,video.videoWidth,video.videoHeight)
    if (owner) {
      const next = wristWatchPose(owner.landmarks,renderer.width,renderer.height,cover)
      if (next) {
        pose = interpolateWatchPose(pose,next,(timestamp-lastPoseTime)/1000)
        lastPoseTime = timestamp; lastSeen = now
      }
    }
    // Restore only the opposite hand above the watch. The wearing wrist stays below it.
    for (const hand of hands) {
      if (hand.id === hostId) continue
      const points = projectWatchHand(hand.landmarks,renderer.width,renderer.height,cover)
      const mask = watchHandMask(points)
      if (mask) foreground.push(mask)
      for (const tip of FINGERTIPS) tips.push({id:`${hand.id}:${tip}`,tip,...points[tip]!,sampledAt:timestamp/1000})
    }
  }

  async function startCamera() {
    unlock()
    if (busy || stream) { stopCamera(); status.textContent = '카메라를 껐어요. 다이얼을 드래그해서 계속 돌릴 수 있어요.'; return }
    const token = ++generation
    dialControl.release()
    busy = true; root.classList.add('is-busy'); start.disabled = true; start.textContent = '카메라 연결 중…'; cameraButton.textContent = '취소'
    status.textContent = '카메라 사용을 허용한 뒤 손과 손목을 보여주세요.'
    try {
      const camera = await openCamera(video,1280,720)
      if (disposed || token !== generation) { camera.getTracks().forEach(track => track.stop()); return }
      stream = camera; video.srcObject = camera; setCameraVisible(stream,!document.hidden)
      await video.play()
      if (disposed || token !== generation) return
      const session = new CameraVision('hands',(output,timestamp) => {
        if (token === generation && output.task === 'hands') receiveHands(output.result,timestamp)
      })
      vision = session
      await session.initialize(message => { if (!disposed && token === generation) status.textContent = message })
      if (disposed || token !== generation) { session.close(); return }
      busy = false; live = true; lastSubmit = 0; lastVideoTime = -1
      intro.hidden = true; cameraButton.textContent = '카메라 끄기'; root.classList.remove('is-busy'); root.classList.add('is-live')
      status.textContent = '반대 손끝을 시계에 대고 원을 그리며 돌려보세요.'
      camera.getVideoTracks()[0]?.addEventListener('ended',() => {
        if (disposed || token !== generation) return
        stopCamera(); status.textContent = '카메라 연결이 종료됐어요. 카메라를 다시 켜주세요.'
      },options)
    } catch (error) {
      if (disposed || token !== generation) return
      stopCamera()
      const name = error instanceof Error ? error.name : ''
      status.textContent = name === 'NotAllowedError' ? '카메라 권한을 허용해주세요. 인앱에서 열리지 않으면 Safari 또는 Chrome에서 열어주세요.'
        : name === 'NotFoundError' ? '연결된 카메라를 찾지 못했어요.'
        : name === 'NotReadableError' ? '다른 앱에서 카메라를 사용 중인지 확인해주세요.'
        : `시작하지 못했어요: ${error instanceof Error ? error.message : '다시 시도해주세요.'}`
    }
  }

  function animate(now: number) {
    if (disposed || document.hidden) return
    const dt = Math.min(.05,(now-lastFrame)/1000); lastFrame = now
    if (live && vision && video.readyState >= 2 && now-lastSubmit >= 1000/30 && video.currentTime !== lastVideoTime) {
      try {
        if (vision.error) throw vision.error
        if (vision.submit('hands',video,now)) { lastSubmit = now; lastVideoTime = video.currentTime }
      } catch { stopCamera(); status.textContent = '손 추적이 중단됐어요. 카메라를 다시 켜주세요.' }
    }
    const opacity = live ? Math.max(0,1-Math.max(0,now-lastSeen-900)/400) : 1
    const currentPose = live ? pose : renderer.previewPose()
    const inputs: WatchTip[] = pointer ? [{...pointer,tip:8}] : live && now-lastHandsFrame < 450 ? tips : []
    dialControl.update(inputs,opacity > .2 ? currentPose : null,now/1000)
    mechanism.update(dt,now/1000)
    const rate = tickingFrequency(mechanism.velocity)
    audio.setRate(rate); audio.setActive(!busy && (!live || opacity > .2))
    renderer.render(video,live,currentPose,mechanism,now/1000,opacity,null,now-lastHandsFrame < 200 ? foreground : [],dialControl.visual)
    if (now-lastHud > 150) {
      rateLabel.textContent = rate.toFixed(1)
      if (live) {
        trackLabel.textContent = opacity > .2 ? dialControl.active ? '조작 중' : tips.length ? '손끝 대기' : '반대 손 보이기' : '손목 찾는 중'
        liveCopy.textContent = opacity > .2 ? dialControl.active ? '조작 바늘이 손끝을 따라 돌아가고 있어요' : tips.length ? '반대 손끝을 시계에 대면 조작 바늘이 나타나요' : '반대 손 전체가 카메라에 보이도록 가져와주세요' : '손과 손목을 카메라에 보여주세요'
      }
      lastHud = now
    }
    frame = requestAnimationFrame(animate)
  }

  function samplePointer(event: PointerEvent) {
    const bounds = renderer.canvas.getBoundingClientRect()
    pointer = {id:`pointer:${event.pointerId}`,x:event.clientX-bounds.left,y:event.clientY-bounds.top,sampledAt:performance.now()/1000}
  }
  renderer.canvas.addEventListener('pointerdown',event => { renderer.canvas.setPointerCapture(event.pointerId); samplePointer(event); unlock() },options)
  renderer.canvas.addEventListener('pointermove',event => { if (pointer?.id === `pointer:${event.pointerId}`) samplePointer(event) },options)
  for (const name of ['pointerup','pointercancel','lostpointercapture'] as const) renderer.canvas.addEventListener(name,() => { pointer = null; dialControl.release() },options)
  renderer.canvas.addEventListener('keydown',event => {
    if (!['ArrowLeft','ArrowRight','Space'].includes(event.code)) return
    event.preventDefault(); unlock()
    dialControl.release()
    mechanism.fling(event.code === 'ArrowLeft' ? -12 : event.code === 'ArrowRight' ? 12 : 24)
  },options)
  start.addEventListener('click',() => void startCamera(),options)
  cameraButton.addEventListener('click',() => void startCamera(),options)
  sound.addEventListener('click',() => { void audio.toggle().then(updateSound) },options)
  root.querySelector('.rolex-reset')!.addEventListener('click',() => { dialControl.release(); mechanism.reset(); pointer = null; status.textContent = '시계를 10시 10분으로 맞췄어요. 손끝을 가져다 대면 조작 바늘이 다시 나타나요.' },options)
  labels.addEventListener('click',() => {
    showLabels = !showLabels; applyLabels()
    try { localStorage.setItem('rolex-korean-labels',showLabels ? 'visible' : 'hidden') } catch { /* This session still keeps the preference. */ }
  },options)
  document.addEventListener('visibilitychange',() => {
    cancelAnimationFrame(frame); pointer = null; tips = []; foreground = []; dialControl.release(); audio.setActive(false)
    setCameraVisible(stream,!document.hidden)
    if (!document.hidden && !disposed) { lastFrame = performance.now(); frame = requestAnimationFrame(animate) }
  },options)
  window.addEventListener('blur',() => { pointer = null; dialControl.release() },options)
  frame = requestAnimationFrame(animate)
  return () => { disposed = true; events.abort(); cancelAnimationFrame(frame); stopCamera(); audio.destroy(); renderer.destroy(); shell?.classList.remove('rolex-hide-labels') }
}
