import { FINGERTIPS, landmarkToSurface, type WaterContact } from '../water-touch-model'
import { WaterTouchRenderer } from '../water-touch-renderer'
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'
import { CameraVision } from '../camera-vision'
import { openCamera, setCameraVisible } from '../camera-access'

const waveIcon = '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M4 17q8-7 16 0t16 0M4 24q8-7 16 0t16 0M11 31q5-4 10 0t10 0"/><circle cx="20" cy="9" r="2"/></svg>'

export function mountWaterTouch(container: HTMLElement): () => void {
  container.innerHTML = `
    <section class="water-scene" aria-label="WaterTouch 손끝으로 만드는 물결">
      <video class="water-video" playsinline muted aria-hidden="true"></video>
      <div class="water-shade" aria-hidden="true"></div>
      <header class="water-heading">
        <div class="water-wordmark">${waveIcon}<div><span class="water-kicker">AN INTERACTIVE WATER EXPERIMENT</span><h1>Water<span>Touch</span><sup>®</sup></h1></div></div>
        <p>손끝이 닿는 순간,<br>당신의 세상이 일렁입니다.</p>
      </header>
      <div class="water-live"><i></i><span class="water-live-label">카메라 대기</span><span class="water-count">0 / 10</span></div>
      <div class="water-markers" aria-hidden="true">${Array.from({ length: 10 }, () => '<i hidden></i>').join('')}</div>
      <div class="water-welcome">
        <div class="water-orbit" aria-hidden="true">${waveIcon}</div>
        <span class="water-kicker">A LITTLE MOTION. A NEW WAVE.</span>
        <h2>물결을 만드는 건,<br><em>당신의 손끝.</em></h2>
        <p>카메라 앞에서 두 손을 펼쳐보세요.<br>열 개의 손끝을 따라 화면이 물처럼 흐릅니다.</p>
        <button class="water-start" type="button">카메라 켜고 시작하기 <span>↗</span></button>
        <small>카메라 영상은 기기 안에서만 처리됩니다.</small>
      </div>
      <p class="water-status" role="status" aria-live="polite">마우스나 터치로 먼저 물결을 만들어보세요.</p>
      <footer class="water-footer">
        <div class="water-instructions"><span>HOW TO PLAY</span><p>천천히 스치면 잔물결, 빠르게 휘저으면 큰 물살.</p><small>양손 · 열 손끝의 움직임에 반응합니다</small></div>
        <div class="water-controls">
          <label class="water-intensity">물결 세기 <input type="range" min="0.3" max="2.5" step="0.1" value="1.3" aria-label="물결 세기"><output>1.3</output></label>
          <button class="water-points" type="button" aria-pressed="true">손끝 표시</button>
          <button class="water-clear" type="button">잔물결 지우기</button>
          <button class="water-camera" type="button">카메라 켜기 ↗</button>
        </div>
      </footer>
      <div class="water-edition" aria-hidden="true"><span>WATER STUDIES — Nº 010</span><span>MOVE SLOWLY. FEEL THE FLOW.</span></div>
    </section>`
  const root = container.querySelector<HTMLElement>('.water-scene')!
  const video = root.querySelector<HTMLVideoElement>('video')!
  const status = root.querySelector<HTMLElement>('.water-status')!
  const start = root.querySelector<HTMLButtonElement>('.water-start')!
  const cameraButton = root.querySelector<HTMLButtonElement>('.water-camera')!
  const welcome = root.querySelector<HTMLElement>('.water-welcome')!
  const liveLabel = root.querySelector<HTMLElement>('.water-live-label')!
  const count = root.querySelector<HTMLElement>('.water-count')!
  const markers = [...root.querySelectorAll<HTMLElement>('.water-markers i')]
  const events = new AbortController()
  const options = { signal: events.signal }
  let surface: WaterTouchRenderer
  try { surface = new WaterTouchRenderer(root, video) }
  catch (error) {
    status.textContent = error instanceof Error ? error.message : 'WebGL을 시작할 수 없어요.'
    start.disabled = cameraButton.disabled = true
    return () => events.abort()
  }
  surface.setStrength(1.3)
  let disposed = false
  let generation = 0
  let busy = false
  let stream: MediaStream | null = null
  let detector: CameraVision | null = null
  let tracking: WaterContact[] = []
  let lastDetection = 0
  let lastRequest = 0
  let lastVideoTime = -1
  let lastFrame = performance.now()
  let frame = 0
  let showPoints = true
  const pointers = new Map<number, WaterContact>()
  const hands = new Map<number, { x: number; y: number; time: number }>()
  const smoothed = new Map<string, { x: number; y: number }>()

  function stopCamera() {
    generation++
    busy = false
    stream?.getTracks().forEach(track => track.stop())
    stream = null
    video.pause(); video.srcObject = null
    detector?.close(); detector = null
    tracking = []; hands.clear(); smoothed.clear()
    surface.setCamera(false)
    root.classList.remove('is-live', 'is-loading')
    welcome.hidden = false
    start.disabled = false
    start.innerHTML = '카메라 켜고 시작하기 <span>↗</span>'
    cameraButton.textContent = '카메라 켜기 ↗'
    liveLabel.textContent = '카메라 대기'
    count.textContent = '0 / 10'
  }

  async function startCamera() {
    if (stream || busy) {
      stopCamera()
      status.textContent = '카메라를 껐어요. 마우스나 터치로도 물결을 만들 수 있어요.'
      return
    }
    const token = ++generation
    busy = true
    root.classList.add('is-loading')
    start.disabled = true
    start.textContent = '카메라와 손 추적 준비 중…'
    cameraButton.textContent = '준비 취소'
    status.textContent = '카메라 사용을 허용해주세요. 손 인식 모델을 준비합니다.'
    try {
      const camera = await openCamera(video,1280,720)
      if (disposed || token !== generation) { camera.getTracks().forEach(track => track.stop()); return }
      stream = camera
      setCameraVisible(stream,!document.hidden)
      video.srcObject = camera
      await video.play()
      if (disposed || token !== generation) return
      const instance = new CameraVision('hands',(output,timestamp) => {
        if (!disposed && token === generation && output.task === 'hands') { updateHands(output.result,timestamp); lastDetection = performance.now() }
      })
      detector = instance
      await instance.initialize(message => { if (!disposed && token === generation) status.textContent = message })
      if (disposed || token !== generation) { instance.close(); return }
      detector = instance
      lastVideoTime = -1
      lastDetection = 0
      lastRequest = 0
      surface.clear(); surface.setCamera(true)
      busy = false
      root.classList.remove('is-loading')
      root.classList.add('is-live')
      welcome.hidden = true
      cameraButton.textContent = '카메라 끄기'
      liveLabel.textContent = '손을 보여주세요'
      status.textContent = '두 손을 카메라에 보여주세요. 손끝을 빠르게 움직일수록 물결이 더 강해집니다.'
      camera.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (token !== generation || disposed) return
        stopCamera(); status.textContent = '카메라 연결이 종료됐어요. 다시 켜서 연결해주세요.'
      }, options)
    } catch (error) {
      if (disposed || token !== generation) return
      stopCamera()
      const name = error instanceof Error ? error.name : ''
      status.textContent = name === 'NotAllowedError' ? '카메라 권한이 필요해요. 주소창의 카메라 권한을 허용한 뒤 다시 눌러주세요.'
        : name === 'NotFoundError' ? '연결된 카메라를 찾을 수 없어요. 카메라를 연결한 뒤 다시 시도해주세요.'
        : name === 'NotReadableError' ? '카메라를 열 수 없어요. 다른 앱에서 사용 중인지 확인해주세요.'
        : error instanceof Error ? `시작하지 못했어요: ${error.message}` : '카메라를 시작하지 못했어요. 다시 시도해주세요.'
    }
  }

  function updateHands(result: HandLandmarkerResult, now: number) {
    const used = new Set<number>()
    const cover = surface.cover(video.videoWidth, video.videoHeight)
    const next: WaterContact[] = []
    // Match wrists across frames rather than relying on MediaPipe's result order.
    const assignments = result.landmarks.map(() => -1)
    const pairs = result.landmarks.flatMap((landmarks, index) => [...hands].filter(([, hand]) => now-hand.time < 350)
      .map(([slot, hand]) => ({ index, slot, distance: Math.hypot(landmarks[0]!.x-hand.x, landmarks[0]!.y-hand.y) })))
      .sort((a,b) => a.distance-b.distance)
    for (const pair of pairs) {
      if (pair.distance > .3 || assignments[pair.index] !== -1 || used.has(pair.slot)) continue
      assignments[pair.index] = pair.slot; used.add(pair.slot)
    }
    result.landmarks.forEach((landmarks, index) => {
      const slot = assignments[index] !== -1 ? assignments[index]! : [0,1].find(id => !used.has(id))!
      if (!used.has(slot)) for (const tip of FINGERTIPS) smoothed.delete(`${slot}:${tip}`)
      used.add(slot)
      hands.set(slot, { x: landmarks[0]!.x, y: landmarks[0]!.y, time: now })
      for (const tip of FINGERTIPS) {
        const landmark = landmarks[tip]!
        const point = landmarkToSurface(landmark.x, landmark.y, cover)
        const id = `${slot}:${tip}`
        const prev = smoothed.get(id)
        const blend = prev ? Math.min(.85, .48 + Math.hypot(point.x-prev.x,point.y-prev.y)*4) : 1
        const filtered = { x: prev ? prev.x+(point.x-prev.x)*blend : point.x, y: prev ? prev.y+(point.y-prev.y)*blend : point.y }
        smoothed.set(id, filtered)
        if (filtered.x >= 0 && filtered.x <= 1 && filtered.y >= 0 && filtered.y <= 1) next.push({ id, ...filtered, sampledAt: now / 1000 })
      }
    })
    for (const slot of hands.keys()) if (!used.has(slot)) {
      hands.delete(slot)
      for (const tip of FINGERTIPS) smoothed.delete(`${slot}:${tip}`)
    }
    tracking = next
    const text = next.length ? `${result.landmarks.length}손 추적 중` : '손을 보여주세요'
    if (liveLabel.textContent !== text) liveLabel.textContent = text
    count.textContent = `${next.length} / 10`
  }

  function animate(now: number) {
    if (disposed || document.hidden) return
    if (detector && !busy && video.readyState >= 2 && video.currentTime !== lastVideoTime && now-lastRequest >= 1000/30) {
      try {
        if (detector.error) throw detector.error
        if (detector.submit('hands',video,now)) { lastVideoTime = video.currentTime; lastRequest = now }
      }
      catch {
        stopCamera()
        status.textContent = '손 추적이 중단됐어요. 카메라를 다시 켜주세요.'
      }
    }
    if (now-lastDetection > 250) tracking = []
    const contacts = [...tracking, ...pointers.values()].slice(0,10)
    surface.setContacts(contacts)
    contacts.forEach((point, i) => {
      const marker = markers[i]!
      marker.hidden = !showPoints
      marker.style.left = `${point.x*100}%`; marker.style.top = `${(1-point.y)*100}%`
    })
    for (let i = contacts.length; i < 10; i++) markers[i]!.hidden = true
    surface.render((now-lastFrame)/1000, now/1000, video.videoWidth, video.videoHeight)
    lastFrame = now
    frame = requestAnimationFrame(animate)
  }

  function pointer(event: PointerEvent) {
    if (event.pointerType !== 'mouse' && !pointers.has(event.pointerId)) return
    const bounds = surface.canvas.getBoundingClientRect()
    pointers.set(event.pointerId, { id: `pointer:${event.pointerId}`, x: (event.clientX-bounds.left)/bounds.width, y: 1-(event.clientY-bounds.top)/bounds.height, sampledAt: performance.now() / 1000 })
  }
  surface.canvas.addEventListener('pointerdown', event => { pointers.set(event.pointerId, { id: '', x: 0, y: 0, sampledAt: performance.now() / 1000 }); surface.canvas.setPointerCapture(event.pointerId); pointer(event) }, options)
  surface.canvas.addEventListener('pointermove', pointer, options)
  for (const name of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'] as const) surface.canvas.addEventListener(name, event => pointers.delete(event.pointerId), options)
  window.addEventListener('blur', () => { pointers.clear(); tracking = []; hands.clear(); smoothed.clear() }, options)
  document.addEventListener('visibilitychange',() => {
    cancelAnimationFrame(frame)
    setCameraVisible(stream,!document.hidden)
    pointers.clear(); tracking = []; hands.clear(); smoothed.clear()
    if (!document.hidden && !disposed) { lastFrame = performance.now(); frame = requestAnimationFrame(animate) }
  },options)
  start.addEventListener('click', () => void startCamera(), options)
  cameraButton.addEventListener('click', () => void startCamera(), options)
  root.querySelector<HTMLInputElement>('input')!.addEventListener('input', event => {
    const value = Number((event.target as HTMLInputElement).value)
    surface.setStrength(value)
    root.querySelector<HTMLOutputElement>('output')!.value = value.toFixed(1)
  }, options)
  root.querySelector('.water-points')!.addEventListener('click', event => {
    showPoints = !showPoints
    ;(event.currentTarget as HTMLButtonElement).setAttribute('aria-pressed', String(showPoints))
  }, options)
  root.querySelector('.water-clear')!.addEventListener('click', () => surface.clear(), options)
  frame = requestAnimationFrame(animate)
  return () => {
    disposed = true
    events.abort(); cancelAnimationFrame(frame); stopCamera(); surface.destroy()
  }
}
