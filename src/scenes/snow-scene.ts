import { SnowWorld } from '../snow-world'
import { SnowTracking, type SnowFinger } from '../snow-tracking'
import { openCamera, setCameraVisible } from '../camera-access'
import type { SnowMover } from '../snowman'

const crystal = '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true"><path d="M20 3v34M5 11l30 18M5 29l30-18M15 6l5 5 5-5M15 34l5-5 5 5M6 17l7-2-2-7M29 32l-2-7 7-2M6 23l7 2-2 7M29 8l-2 7 7 2"/></svg>'

export function mountSnow(container: HTMLElement): () => void {
  container.innerHTML = `
    <section class="snow-scene" aria-label="Snow · 손끝에 찾아온 겨울">
      <video class="snow-video" playsinline muted aria-hidden="true"></video>
      <div class="snow-vignette" aria-hidden="true"></div>
      <header class="snow-heading"><div class="snow-title">${crystal}<div><span>A SMALL WINTER, MADE BY YOU</span><h1>Snow<span>.</span></h1></div></div><p>구름을 톡, 입김을 후.<br>나만의 겨울을 그려보세요.</p></header>
      <div class="snow-live"><i></i><span class="snow-live-label">겨울을 기다리는 중</span><span class="snow-particle-count">0 flakes</span></div>
      <div class="snow-welcome"><span class="snow-eyebrow">HELLO, WINTER</span><h2>손끝으로 부르는 눈,<br>입김으로 그리는 겨울.</h2><p>검지로 구름을 찌르면 눈이 내리고,<br>손이나 손가락으로 눈을 밀어 모으면 눈사람이 만들어집니다.</p><button class="snow-start" data-english="Start camera ↗" type="button">카메라 켜고 시작하기 <span>↗</span></button><small>영상은 기기 안에서만 처리됩니다.</small></div>
      <div class="snow-builder-hud" aria-live="polite"><span class="snow-builder-icon" aria-hidden="true">☃</span><span class="snow-builder-copy">눈을 한쪽으로 밀어 모아보세요</span><span class="snow-builder-progress">0%</span></div>
      <p class="snow-status" role="status" aria-live="polite">마우스로 구름을 톡 눌러 눈을 먼저 내려보세요.</p>
      <footer class="snow-footer"><div class="snow-guide"><span><b>01</b> 검지로 구름 톡</span><span><b>02</b> 입을 벌려 김 위에 그리기</span><span><b>03</b> 눈을 밀어 눈사람 계속 만들기</span></div><div class="snow-tools"><button class="snow-text-toggle" type="button" aria-label="Hide Korean labels" title="Hide Korean labels" aria-pressed="true">Aa</button><button class="snow-outline" data-english="Outline" type="button" aria-pressed="false">사람 윤곽 보기</button><button class="snow-reset" data-english="Clear" type="button">눈·김 지우기</button><button class="snow-camera" data-english="Camera ↗" type="button">카메라 켜기 ↗</button></div></footer>
      <div class="snow-edition" aria-hidden="true"><span>WINTER STUDIES — Nº 011</span><span>LET IT SNOW. LET IT SLOW.</span></div>
    </section>`
  const root = container.querySelector<HTMLElement>('.snow-scene')!
  const video = root.querySelector<HTMLVideoElement>('video')!
  const start = root.querySelector<HTMLButtonElement>('.snow-start')!
  const cameraButton = root.querySelector<HTMLButtonElement>('.snow-camera')!
  const welcome = root.querySelector<HTMLElement>('.snow-welcome')!
  const status = root.querySelector<HTMLElement>('.snow-status')!
  const liveLabel = root.querySelector<HTMLElement>('.snow-live-label')!
  const count = root.querySelector<HTMLElement>('.snow-particle-count')!
  const textToggle = root.querySelector<HTMLButtonElement>('.snow-text-toggle')!
  const builderCopy = root.querySelector<HTMLElement>('.snow-builder-copy')!
  const builderProgress = root.querySelector<HTMLElement>('.snow-builder-progress')!
  const shell = container.closest<HTMLElement>('.lab-shell')
  const events = new AbortController(), options = { signal: events.signal }
  let world: SnowWorld
  try { world = new SnowWorld(root) }
  catch (error) {
    start.disabled = cameraButton.disabled = true
    status.textContent = error instanceof Error ? error.message : 'Snow를 시작할 수 없어요.'
    return () => events.abort()
  }
  let tracker: SnowTracking | null = null
  let stream: MediaStream | null = null
  let disposed = false, busy = false, live = false, generation = 0, outline = false
  let showKorean = true
  try { showKorean = localStorage.getItem('snow-korean-labels') !== 'hidden' } catch { /* Private browsing can disable storage. */ }
  let frame = 0, lastFrame = performance.now(), lastHud = 0
  const pointers = new Map<number,SnowFinger & {sampledAt:number}>()
  function applyLabels() {
    root.classList.toggle('snow-hide-korean',!showKorean)
    shell?.classList.toggle('snow-hide-korean',!showKorean)
    world.setKoreanLabels(showKorean)
    textToggle.setAttribute('aria-pressed',String(showKorean))
    textToggle.setAttribute('aria-label',showKorean ? 'Hide Korean labels' : 'Show Korean labels')
    textToggle.title = showKorean ? 'Hide Korean labels' : 'Show Korean labels'
  }
  applyLabels()

  function stopCamera() {
    generation++; busy = false; live = false
    stream?.getTracks().forEach(track => track.stop()); stream = null
    tracker?.close(); tracker = null
    video.pause(); video.srcObject = null
    world.field.clear(); world.reset(); pointers.clear()
    root.classList.remove('is-live')
    welcome.hidden = false; start.disabled = false
    start.innerHTML = '카메라 켜고 시작하기 <span>↗</span>'
    start.dataset.english = 'Start camera ↗'
    cameraButton.textContent = '카메라 켜기 ↗'
    cameraButton.dataset.english = 'Camera ↗'
    liveLabel.textContent = '겨울을 기다리는 중'
  }

  async function startCamera() {
    if (busy || stream) { stopCamera(); status.textContent = '카메라를 껐어요. 구름은 마우스로도 누를 수 있어요.'; return }
    const token = ++generation
    busy = true; start.disabled = true
    start.textContent = '겨울을 준비하고 있어요…'; cameraButton.textContent = '준비 취소'
    start.dataset.english = 'Preparing…'; cameraButton.dataset.english = 'Cancel'
    const progress = (text: string) => { if (!disposed && token === generation) status.textContent = text }
    try {
      progress('카메라 사용을 허용해주세요.')
      const camera = await openCamera(video,960,540)
      if (disposed || generation !== token) { camera.getTracks().forEach(track => track.stop()); return }
      stream = camera; video.srcObject = camera
      setCameraVisible(stream,!document.hidden)
      await video.play()
      if (disposed || generation !== token) return
      const session = new SnowTracking()
      tracker = session
      await session.initialize(progress)
      if (disposed || generation !== token) { session.close(); return }
      busy = false; live = true; welcome.hidden = true
      world.reset(); root.classList.add('is-live')
      cameraButton.textContent = '카메라 끄기'
      cameraButton.dataset.english = 'Camera off'
      status.textContent = '손이나 손가락으로 내리는 눈을 한쪽으로 쓸어 모아보세요. 눈을 계속 굴리면 눈사람을 계속 만들 수 있어요.'
      camera.getVideoTracks()[0]?.addEventListener('ended',() => {
        if (disposed || generation !== token) return
        stopCamera(); status.textContent = '카메라 연결이 끝났어요. 다시 켜서 연결해주세요.'
      },options)
    } catch (error) {
      if (disposed || generation !== token) return
      stopCamera()
      const name = error instanceof Error ? error.name : ''
      status.textContent = name === 'NotAllowedError' ? '주소창에서 카메라 권한을 허용한 뒤 다시 눌러주세요.'
        : name === 'NotFoundError' ? '카메라를 찾지 못했어요. 카메라 연결을 확인해주세요.'
        : name === 'NotReadableError' ? '카메라를 열 수 없어요. 다른 앱에서 사용 중인지 확인해주세요.'
        : `시작하지 못했어요: ${error instanceof Error ? error.message : '다시 시도해주세요.'}`
    }
  }

  function animate(now: number) {
    if (disposed || document.hidden) return
    const dt = document.hidden ? 0 : Math.min(.05,(now-lastFrame)/1000)
    lastFrame = now
    if (live && tracker && !document.hidden) {
      try { tracker.update(video,world.field,root.clientWidth,root.clientHeight,now,world.snowing || world.snowCount > 0) }
      catch {
        stopCamera(); status.textContent = '카메라 인식이 중단됐어요. 카메라를 다시 켜주세요.'
      }
    }
    const fingers = document.hidden ? [] : [...(live ? tracker?.fingers ?? [] : []),...pointers.values()]
    const movers: SnowMover[] = [...(live ? tracker?.sweepers ?? [] : []),...[...pointers.values()].map(point => ({...point,radius:20}))]
    world.update(dt,fingers,live ? tracker?.mouth ?? null : null,movers)
    world.render(video,live,fingers)
    if (now-lastHud > 250) {
      count.textContent = `${world.snowCount} flakes`
      if (live) liveLabel.textContent = world.field.hasPerson ? '사람 윤곽 · 손끝 추적 중' : '카메라에 얼굴과 어깨를 보여주세요'
      const builder = world.snowman
      const copy = builder.phase === 'complete' ? '또 눈을 굴려 다음 눈사람을 만들어보세요!' : builder.phase === 'assembling' ? '눈덩이가 굴러와 쌓이는 중…' : builder.phase === 'gathering' ? builder.gathering ? '모인 눈이 동글동글 뭉치는 중…' : '눈덩이 쪽으로 눈을 더 밀어주세요' : '눈을 한쪽으로 밀어 모아보세요'
      if (builderCopy.textContent !== copy) builderCopy.textContent = copy
      builderProgress.textContent = `${builder.completedCount ? `${builder.completedCount} ☃ · ` : ''}${Math.round(builder.progress*100)}%`
      lastHud = now
    }
    frame = requestAnimationFrame(animate)
  }

  function pointer(event: PointerEvent) {
    if (event.pointerType !== 'mouse' && !pointers.has(event.pointerId)) return
    const bounds = world.canvas.getBoundingClientRect()
    pointers.set(event.pointerId,{ id: `pointer:${event.pointerId}`,x: event.clientX-bounds.left,y: event.clientY-bounds.top,sampledAt:performance.now()/1000 })
  }
  world.canvas.addEventListener('pointerdown',event => {
    pointers.set(event.pointerId,{ id: '',x: 0,y: 0,sampledAt:performance.now()/1000 })
    world.canvas.setPointerCapture(event.pointerId); pointer(event)
  },options)
  world.canvas.addEventListener('pointermove',pointer,options)
  for (const name of ['pointerup','pointerleave','pointercancel','lostpointercapture'] as const) world.canvas.addEventListener(name,event => pointers.delete(event.pointerId),options)
  window.addEventListener('blur',() => pointers.clear(),options)
  document.addEventListener('visibilitychange',() => {
    cancelAnimationFrame(frame); pointers.clear()
    setCameraVisible(stream,!document.hidden)
    if (!document.hidden && !disposed) { lastFrame = performance.now(); frame = requestAnimationFrame(animate) }
  },options)
  start.addEventListener('click',() => void startCamera(),options)
  textToggle.addEventListener('click',() => {
    showKorean = !showKorean; applyLabels()
    try { localStorage.setItem('snow-korean-labels',showKorean ? 'visible' : 'hidden') } catch { /* Preference still applies for this session. */ }
  },options)
  cameraButton.addEventListener('click',() => void startCamera(),options)
  root.querySelector('.snow-reset')!.addEventListener('click',() => { world.reset(); status.textContent = '눈과 김을 지웠어요. 구름을 다시 톡 찔러보세요.' },options)
  root.querySelector('.snow-outline')!.addEventListener('click',event => {
    outline = !outline; world.setOutline(outline)
    ;(event.currentTarget as HTMLButtonElement).setAttribute('aria-pressed',String(outline))
  },options)
  frame = requestAnimationFrame(animate)
  return () => { disposed = true; events.abort(); cancelAnimationFrame(frame); stopCamera(); world.destroy(); shell?.classList.remove('snow-hide-korean') }
}
