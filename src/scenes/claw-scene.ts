import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { ClawCycle, PLAY_FLOOR, type ClawPhase } from '../claw-model.ts'
import { ClawPhysics, type PlushActor } from '../claw-physics.ts'
import { PlushFactory, PLUSH_SPECS, type PlushSpec } from '../claw-plush.ts'
import { createClawRig, createMachine } from '../claw-machine.ts'

type PrizeRecord = { specId: string; number: number }
const PHASE_TEXT: Record<ClawPhase, [string, string]> = {
  ready: ['YOUR MOVE', '방향키로 조준하고, 스페이스로 뽑아보세요.'],
  descending: ['GOING DOWN', '집게가 내려가고 있어요. 잠깐만 기다려 주세요.'],
  closing: ['A LITTLE SQUEEZE', '세 발 집게로 조심스럽게 잡는 중…'],
  lifting: ['HOLD ON, LITTLE ONE', '천천히 올라갑니다. 꼭 잡고 있어!'],
  carrying: ['ON THE WAY', '하부 중앙 출구로 데려가는 중…'],
  opening: ['LET IT GO', '집게를 펼쳐 인형을 내려놓아요.'],
  delivery: ['SPECIAL DELIVERY', '인형이 출구를 따라 내려옵니다.'],
  returning: ['ONE MORE TRY?', '집게가 처음 위치로 돌아가고 있어요.'],
}
const KEY_CODES = ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space']

export function mountClaw(container: HTMLElement): () => void {
  container.innerHTML = `
    <section class="claw-scene" aria-label="3차원 인형뽑기 Cuddle Club">
      <div class="claw-viewport" tabindex="0" aria-label="3D 인형뽑기 기계. 드래그로 회전, 방향키로 이동, 스페이스로 뽑기."></div>
      <div class="claw-title"><p><i></i> EXPERIMENT 07 / A LITTLE LUCK</p><h1>Find your<br>little <em>friend.</em></h1><div>조금의 행운, 한 아름의 포근함.<br>당신을 기다리는 친구를 데려가세요.</div><span class="claw-edition">THE CUDDLE CLUB <b>VOL. 01</b></span></div>
      <div class="claw-top-tools"><button type="button" class="claw-prizes">Prizes <span id="claw-prize-count">00</span><b>↗</b></button><button type="button" class="claw-front">정면 보기 ⟳</button></div>
      <div class="claw-left-foot"><span>72 PLUSH FRIENDS</span><strong>12가지 작은 행복</strong><p>봉제 인형 · 세 발 집게 · 3D 플레이</p><div class="claw-counters"><div><b id="claw-attempts">00</b><small>TRIES</small></div><i></i><div><b id="claw-wins">00</b><small>NEW FRIENDS</small></div></div></div>
      <div class="claw-control-panel"><div class="claw-map-heading"><span>TOP VIEW</span><span id="claw-lock-label">READY</span></div><canvas class="claw-map" width="340" height="220" aria-label="위에서 본 집게 위치"></canvas><div class="claw-keypad"><button type="button" data-claw-key="ArrowUp" aria-label="집게 뒤로">↑</button><div><button type="button" data-claw-key="ArrowLeft" aria-label="집게 왼쪽">←</button><button type="button" data-claw-key="ArrowDown" aria-label="집게 앞으로">↓</button><button type="button" data-claw-key="ArrowRight" aria-label="집게 오른쪽">→</button></div><button type="button" class="claw-space" data-claw-key="Space" aria-label="집게 내려 뽑기"><span>SPACE</span> <small>잡기</small></button></div><p>↑ 뒤로 · ↓ 앞으로 · ← → 좌우<br>드래그하면 기계를 돌려볼 수 있어요</p></div>
      <div class="claw-status"><span class="claw-status-dot"></span><div><strong id="claw-status-title">FILLING WITH FRIENDS</strong><p id="claw-status-message" role="status" aria-live="polite">72개의 인형이 제자리를 찾고 있어요…</p></div></div>
      <div class="claw-loading"><span class="claw-loading-icon">✳</span><p>친구들이 모이고 있어요</p><small id="claw-load-progress">72개의 인형을 준비하는 중</small></div>
      <div class="claw-gallery" hidden><div class="claw-gallery-card" role="dialog" aria-modal="true" aria-labelledby="claw-gallery-title" tabindex="-1"><header><div><span>YOUR LITTLE COLLECTION</span><h2 id="claw-gallery-title">My new friends<span>.</span></h2></div><button type="button" class="claw-gallery-close" aria-label="인형 목록 닫기">×</button></header><div class="claw-gallery-body"><div class="claw-prize-list"></div><div class="claw-inspect"><div class="claw-inspect-canvas"></div><div class="claw-inspect-label"><p id="claw-prize-tag"></p><h3 id="claw-prize-name"></h3><span>드래그해서 360° 돌려보세요</span></div></div><div class="claw-empty" hidden><span>✳</span><h3>첫 번째 친구를 기다려요</h3><p>인형을 뽑으면 여기에 모여요.</p></div></div></div></div>
      <div class="claw-error" hidden></div>
    </section>`
  const root = container.querySelector<HTMLElement>('.claw-scene')!
  const get = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!
  const viewport = get('.claw-viewport'), loading = get('.claw-loading'), prizesButton = get<HTMLButtonElement>('.claw-prizes')
  const gallery = get('.claw-gallery'), galleryCard = get('.claw-gallery-card'), galleryClose = get<HTMLButtonElement>('.claw-gallery-close')
  const inspect = get('.claw-inspect-canvas'), prizeList = get('.claw-prize-list'), empty = get('.claw-empty')
  const mapCanvas = get<HTMLCanvasElement>('.claw-map'), map = mapCanvas.getContext('2d')!
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-claw-key]')]
  const controller = new AbortController(), options = { signal: controller.signal }
  let renderer: THREE.WebGLRenderer
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }) }
  catch {
    loading.hidden = true; const error = get('.claw-error'); error.hidden = false; error.textContent = '3D 화면을 시작할 수 없어요. WebGL을 지원하는 브라우저에서 다시 열어 주세요.'
    return () => controller.abort()
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15; viewport.append(renderer.domElement)
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, .1, 70)
  camera.position.set(0, 4.4, 12.8)
  const orbit = new OrbitControls(camera, renderer.domElement); orbit.target.set(0, 3.35, 0); orbit.enablePan = false; orbit.enableDamping = true; orbit.dampingFactor = .08; orbit.minDistance = 9; orbit.maxDistance = 16; orbit.minPolarAngle = .65; orbit.maxPolarAngle = 1.6; orbit.update()
  const environment = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer), env = pmrem.fromScene(environment, .05)
  scene.environment = env.texture; scene.environmentIntensity = .65; environment.dispose(); pmrem.dispose()
  scene.add(new THREE.HemisphereLight('#f3e9ff', '#605769', 2.1))
  const key = new THREE.DirectionalLight('#fff0de', 4.3); key.position.set(-4, 8, 7); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -5; key.shadow.camera.right = 5; key.shadow.camera.top = 8; key.shadow.camera.bottom = -3; key.shadow.normalBias = .025; key.shadow.bias = -.0001; scene.add(key)
  const fill = new THREE.DirectionalLight('#b6d7ff', 2.1); fill.position.set(5, 5, -2); scene.add(fill)
  const inside = new THREE.PointLight('#fff1db', 24, 8, 2); inside.position.set(0, 5.9, .4); scene.add(inside)
  const machine = createMachine(); scene.add(machine.root)
  const rig = createClawRig(machine.root, machine.steel, machine.dark)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ color: '#12101b', opacity: .37 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.position.y = .025; scene.add(ground)
  const factory = new PlushFactory(), physics = new ClawPhysics()
  const toys = new Map<number, THREE.Group>()
  for (const actor of physics.actors) { const toy = factory.create(actor.spec); toy.scale.setScalar(actor.scale); toys.set(actor.id, toy); machine.root.add(toy) }
  const cycle = new ClawCycle({ probe: (x, z) => physics.probe(x, z), grab: (target, kind) => physics.grab(target, kind), release: delivery => physics.release(delivery) })
  let records: PrizeRecord[] = []
  try {
    const stored: unknown = JSON.parse(localStorage.getItem('vibe-claw-prizes-v1') ?? '[]')
    if (Array.isArray(stored)) records = stored.filter((r): r is PrizeRecord => Boolean(r && typeof r === 'object' && PLUSH_SPECS.some(s => s.id === r.specId) && Number.isFinite(r.number))).slice(-200)
  } catch { /* The cabinet still works when browser storage is unavailable. */ }
  const pressed = new Set<string>(), drive = new Set<string>()
  let ready = false, destroyed = false, previous = 0, frame = 0, accumulator = 0, settleSteps = 0, lastPhase = '', elapsed = 0
  let popupUntil = 0, galleryMode: 'closed' | 'collection' | 'winner' = 'closed'
  let deliveryAnimation: { actor: PlushActor; time: number; origin: THREE.Vector3; rotation: THREE.Quaternion } | null = null
  let deliveryElapsed = 0
  let viewer: THREE.WebGLRenderer | null = null, viewerScene: THREE.Scene | null = null, viewerCamera: THREE.PerspectiveCamera | null = null, viewerControls: OrbitControls | null = null, viewerModel: THREE.Group | null = null
  let viewerEnvironment: THREE.WebGLRenderTarget | null = null

  function resize() {
    const width = Math.max(1, viewport.clientWidth), height = Math.max(1, viewport.clientHeight)
    renderer.setSize(width, height); camera.aspect = width / height
    camera.fov = width / height < .8 ? 46 : 38; camera.updateProjectionMatrix()
    resizeViewer()
  }
  const observer = new ResizeObserver(resize); observer.observe(viewport)
  const viewerObserver = new ResizeObserver(() => resizeViewer()); viewerObserver.observe(inspect)
  function updateCounts() {
    get('#claw-prize-count').textContent = String(records.length).padStart(2, '0'); get('#claw-wins').textContent = String(records.length).padStart(2, '0')
    get('#claw-attempts').textContent = String(cycle.attempts).padStart(2, '0')
  }
  function resizeViewer() {
    if (!viewer || !viewerCamera) return
    const width = Math.max(1, inspect.clientWidth), height = Math.max(1, inspect.clientHeight)
    viewer.setSize(width, height); viewerCamera.aspect = width / height; viewerCamera.updateProjectionMatrix()
    fitViewer()
  }
  function fitViewer() {
    if (!viewerModel || !viewerCamera || !viewerControls) return
    const box = new THREE.Box3().setFromObject(viewerModel), sphere = box.getBoundingSphere(new THREE.Sphere())
    const halfFov = THREE.MathUtils.degToRad(viewerCamera.fov / 2), effective = Math.min(halfFov, Math.atan(Math.tan(halfFov) * viewerCamera.aspect))
    const distance = sphere.radius / Math.sin(effective) * 1.18
    viewerCamera.position.set(0, sphere.center.y + distance * .12, distance); viewerControls.target.copy(sphere.center); viewerControls.minDistance = distance * .75; viewerControls.maxDistance = distance * 1.7; viewerControls.update()
  }
  function showSpec(spec: PlushSpec) {
    if (!viewer) {
      viewer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); viewer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7)); viewer.toneMapping = THREE.ACESFilmicToneMapping; viewer.toneMappingExposure = 1.2; inspect.append(viewer.domElement)
      viewerScene = new THREE.Scene()
      const room = new RoomEnvironment(), generator = new THREE.PMREMGenerator(viewer)
      viewerEnvironment = generator.fromScene(room, .05); room.dispose(); generator.dispose()
      viewerScene.environment = viewerEnvironment.texture; viewerScene.environmentIntensity = .6
      viewerScene.add(new THREE.HemisphereLight('#ffffff', '#867589', 2.8))
      const lamp = new THREE.DirectionalLight('#fff1dd', 3.5); lamp.position.set(-2, 3, 4); viewerScene.add(lamp)
      const rim = new THREE.DirectionalLight('#dfdcff', 2); rim.position.set(2, 2, -2); viewerScene.add(rim)
      viewerCamera = new THREE.PerspectiveCamera(35, 1, .01, 20)
      viewerControls = new OrbitControls(viewerCamera, viewer.domElement); viewerControls.enablePan = false; viewerControls.enableDamping = true; viewerControls.autoRotate = true; viewerControls.autoRotateSpeed = 1.6
    }
    if (viewerModel) viewerScene!.remove(viewerModel)
    viewerModel = factory.create(spec); viewerScene!.add(viewerModel)
    // Preserve the original mesh proportions; only the camera is fitted to the viewport.
    get('#claw-prize-name').textContent = spec.name; get('#claw-prize-tag').textContent = spec.tag
    resizeViewer()
  }
  function closeGallery() {
    gallery.hidden = true; galleryMode = 'closed'; popupUntil = 0; drive.clear(); viewport.focus({ preventScroll: true })
  }
  function openCollection() {
    if (!ready || cycle.locked || deliveryAnimation) return
    drive.clear(); galleryMode = 'collection'; gallery.hidden = false; gallery.classList.remove('is-winner')
    get('#claw-gallery-title').textContent = 'My new friends.'
    empty.hidden = records.length > 0; get('.claw-inspect').hidden = !records.length; prizeList.hidden = !records.length
    prizeList.replaceChildren(...records.map((record, index) => {
      const spec = PLUSH_SPECS.find(s => s.id === record.specId)!
      const button = document.createElement('button'); button.type = 'button'; button.className = 'claw-prize-item'; button.setAttribute('aria-pressed', String(index === records.length - 1))
      const swatch = document.createElement('span'); swatch.style.background = spec.color; swatch.textContent = String(record.number).padStart(2, '0')
      const name = document.createElement('strong'); name.textContent = spec.name
      button.append(swatch, name)
      button.addEventListener('click', () => { prizeList.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', 'false')); button.setAttribute('aria-pressed', 'true'); showSpec(spec) }, options)
      return button
    }))
    if (records.length) showSpec(PLUSH_SPECS.find(s => s.id === records[records.length-1]!.specId)!)
    galleryClose.focus({ preventScroll: true })
  }
  function celebrate(actor: PlushActor) {
    records.push({ specId: actor.spec.id, number: records.length + 1 })
    try { localStorage.setItem('vibe-claw-prizes-v1', JSON.stringify(records.slice(-200))) } catch { /* Session-only collection. */ }
    updateCounts(); galleryMode = 'winner'; gallery.hidden = false; gallery.classList.add('is-winner'); get('#claw-gallery-title').textContent = '새 친구를 만났어요!'
    empty.hidden = true; prizeList.hidden = true; get('.claw-inspect').hidden = false
    showSpec(actor.spec); popupUntil = performance.now() + 2000
    galleryClose.focus({ preventScroll: true })
  }
  galleryClose.addEventListener('click', closeGallery, options)
  gallery.addEventListener('click', event => { if (event.target === gallery) closeGallery() }, options)
  galleryCard.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeGallery() }
    if (event.key === 'Tab') {
      const controls = [...galleryCard.querySelectorAll<HTMLButtonElement>('button')].filter(b => !b.hidden && b.offsetParent !== null)
      const first = controls[0], last = controls[controls.length-1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }, options)
  prizesButton.addEventListener('click', openCollection, options)
  get('.claw-front').addEventListener('click', () => { camera.position.set(0, 4.4, 12.8); orbit.target.set(0, 3.35, 0); orbit.update(); viewport.focus({ preventScroll: true }) }, options)
  function highlight() { buttons.forEach(button => button.classList.toggle('is-pressed', pressed.has(button.dataset.clawKey!))) }
  function press(code: string, repeat = false) {
    pressed.add(code); highlight()
    if (!ready || galleryMode !== 'closed' || cycle.locked || repeat) return
    if (code === 'Space') { drive.clear(); cycle.start(); updateCounts() }
    else drive.add(code)
  }
  function release(code: string) { pressed.delete(code); drive.delete(code); highlight() }
  window.addEventListener('keydown', event => {
    if (!KEY_CODES.includes(event.code) || event.altKey || event.ctrlKey || event.metaKey) return
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, select, [contenteditable="true"]') || galleryMode !== 'closed') return
    if (target?.closest('button') && !target.closest('[data-claw-key]')) return
    event.preventDefault(); press(event.code, event.repeat)
  }, options)
  window.addEventListener('keyup', event => { if (KEY_CODES.includes(event.code)) release(event.code) }, options)
  buttons.forEach(button => {
    const code = button.dataset.clawKey!
    button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); press(code) }, options)
    button.addEventListener('pointerup', () => release(code), options)
    button.addEventListener('pointercancel', () => release(code), options)
    button.addEventListener('lostpointercapture', () => release(code), options)
    button.addEventListener('click', event => { if (event.detail === 0) { press(code); release(code) } }, options)
  })
  const clearInput = () => { drive.clear(); pressed.clear(); highlight(); previous = 0; accumulator = 0 }
  window.addEventListener('blur', clearInput, options); document.addEventListener('visibilitychange', clearInput, options)
  renderer.domElement.addEventListener('pointerdown', () => viewport.focus({ preventScroll: true }), options)
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); get('#claw-status-message').textContent = '3D 화면이 잠시 중단됐어요. 탭을 다시 선택해 주세요.'; ready = false }, options)

  function drawMap() {
    const w = mapCanvas.width, h = mapCanvas.height
    map.clearRect(0, 0, w, h); map.fillStyle = '#ffffff04'; map.fillRect(0, 0, w, h)
    const point = (x: number, z: number) => [w / 2 + x / 4.6 * w, h / 2 + z / 3.6 * h]
    map.strokeStyle = '#d4c6db22'; map.lineWidth = 1
    for (let x = 0; x < w; x += w / 5) { map.beginPath(); map.moveTo(x, 0); map.lineTo(x, h); map.stroke() }
    for (let y = 0; y < h; y += h / 4) { map.beginPath(); map.moveTo(0, y); map.lineTo(w, y); map.stroke() }
    const [ex, ez] = point(0, 1.26); map.fillStyle = '#dfc4a533'; map.fillRect(ex! - 29, ez! - 16, 58, 32)
    for (const actor of physics.actors) {
      if (actor.won || actor.delivering) continue
      const [x, y] = point(actor.body.position.x, actor.body.position.z); map.beginPath(); map.arc(x!, y!, 6, 0, Math.PI * 2); map.fillStyle = actor.spec.color + 'b0'; map.fill()
    }
    const [x, y] = point(cycle.x, cycle.z); map.strokeStyle = cycle.locked ? '#e9bd96' : '#f4eed4'; map.lineWidth = 2.4
    map.beginPath(); map.arc(x!, y!, 15, 0, Math.PI * 2); map.moveTo(x! - 22, y!); map.lineTo(x! + 22, y!); map.moveTo(x!, y! - 22); map.lineTo(x!, y! + 22); map.stroke()
  }

  function updateDelivery(dt: number) {
    if (physics.delivery && !deliveryAnimation) {
      deliveryElapsed += dt
      const actor = physics.delivery
      if (actor.body.position.y < PLAY_FLOOR - .35 || deliveryElapsed > 2.0) {
        const toy = toys.get(actor.id)!
        deliveryAnimation = { actor, time: 0, origin: new THREE.Vector3(0, 1.35, 1.35), rotation: toy.quaternion.clone() }
        actor.body.type = CANNON.Body.KINEMATIC; actor.body.collisionFilterMask = 0; actor.body.velocity.setZero()
      }
    } else if (!physics.delivery) deliveryElapsed = 0
    if (deliveryAnimation) {
      const d = deliveryAnimation; d.time += dt
      const t = Math.min(1, d.time / .9), toy = toys.get(d.actor.id)!
      // Follow the inside chute, then visibly tumble out of the central collection bay.
      toy.position.set(0, 1.35 - .72 * t + Math.sin(t * Math.PI) * .08, 1.35 + 1.25 * t)
      toy.quaternion.copy(d.rotation).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -t * 1.7))
      if (t >= 1) { physics.collect(d.actor); toy.visible = false; celebrate(d.actor); deliveryAnimation = null; deliveryElapsed = 0 }
    }
  }

  function animate(now: number) {
    if (destroyed) return
    if (document.hidden) { previous = 0; frame = requestAnimationFrame(animate); return }
    const dt = previous ? Math.min((now - previous) / 1000, .05) : 0; previous = now
    if (!ready && settleSteps < 240) {
      for (let i = 0; i < 8; i++) { physics.step(1 / 60); settleSteps++ }
      get('#claw-load-progress').textContent = `친구들이 자리를 잡는 중 · ${Math.min(100, Math.round(settleSteps / 240 * 100))}%`
      if (settleSteps >= 240) {
        physics.actors.forEach(actor => actor.body.sleep())
        ready = true; loading.hidden = true; viewport.focus({ preventScroll: true })
      }
    } else if (ready && !document.hidden && document.hasFocus() && galleryMode !== 'collection') {
      elapsed += dt; accumulator += dt
      while (accumulator >= 1 / 60) {
        if (galleryMode === 'closed') cycle.move(Number(drive.has('ArrowRight')) - Number(drive.has('ArrowLeft')), Number(drive.has('ArrowDown')) - Number(drive.has('ArrowUp')), 1 / 60)
        cycle.update(1 / 60); physics.step(1 / 60, cycle); accumulator -= 1 / 60
      }
    }
    for (const actor of physics.actors) {
      if (actor.won || deliveryAnimation?.actor === actor) continue
      const toy = toys.get(actor.id)!; toy.position.copy(actor.body.position as unknown as THREE.Vector3); toy.quaternion.copy(actor.body.quaternion as unknown as THREE.Quaternion)
    }
    if (ready && !document.hidden && document.hasFocus()) updateDelivery(dt)
    rig.update(cycle.x, cycle.y, cycle.z, cycle.open)
    if (lastPhase !== cycle.phase && ready) {
      lastPhase = cycle.phase; drive.clear()
      const [title, message] = PHASE_TEXT[cycle.phase]
      get('#claw-status-title').textContent = title; get('#claw-status-message').textContent = message
      get('#claw-lock-label').textContent = cycle.locked ? 'AUTO / LOCKED' : 'READY'
      root.classList.toggle('is-locked', cycle.locked)
      buttons.forEach(button => button.setAttribute('aria-disabled', String(cycle.locked)))
      prizesButton.disabled = cycle.locked
    }
    if (galleryMode === 'winner' && now >= popupUntil) closeGallery()
    orbit.update(); renderer.render(scene, camera)
    if (viewer && viewerScene && viewerCamera && galleryMode !== 'closed') { viewerControls?.update(dt); viewer.render(viewerScene, viewerCamera) }
    if (Math.floor(elapsed * 30) % 2 === 0 || !ready) drawMap()
    frame = requestAnimationFrame(animate)
  }
  resize(); updateCounts(); frame = requestAnimationFrame(animate)
  return () => {
    destroyed = true; cancelAnimationFrame(frame); controller.abort(); observer.disconnect(); viewerObserver.disconnect(); orbit.dispose(); viewerControls?.dispose(); physics.dispose()
    viewerEnvironment?.dispose(); viewer?.dispose(); viewer?.forceContextLoss(); renderer.dispose(); renderer.forceContextLoss(); env.dispose(); factory.dispose()
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>()
    machine.root.children.filter(child => ![...toys.values()].includes(child as THREE.Group)).forEach(child => child.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => { materials.add(material); const m = material as THREE.MeshStandardMaterial; if (m.map) textures.add(m.map) })
    }))
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); ground.geometry.dispose(); (ground.material as THREE.Material).dispose()
  }
}
