import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RIDES, clamp, seatPose, initialRides, type ParkPlayer, type ParkSnapshot } from '../sixflags-model.ts'
import { createAvatar, createPark, disposePark } from '../sixflags-world.ts'

export function mountSixflags(container: HTMLElement) {
  container.innerHTML = `
    <section class="sixflags-scene">
      <div class="park-viewport" tabindex="0" aria-label="Six Flags 3D 테마파크. 방향키로 이동, 스페이스로 동작"></div>
      <div class="park-heading"><p>EXPERIMENT 08 <span>●</span> GREAT ADVENTURE · USA</p><h1>6flags<span>✳</span></h1><div>미국 Six Flags Great Adventure · 3D 미니어처</div></div>
      <div class="park-tools"><span class="park-online"><i></i><b>연결 중</b></span><button class="park-invite" type="button">친구 초대 ↗</button></div>
      <aside class="park-share" hidden><strong>같은 Wi-Fi에서 만나요</strong><p>친구의 브라우저에서 아래 주소로 접속하세요.</p><div class="park-addresses">주소를 확인하고 있어요.</div><small>이 컴퓨터에서 개발 서버가 실행 중이어야 해요.</small></aside>
      <div class="park-message" role="status" aria-live="polite">닉네임을 정하고 Six Flags 테마파크에 입장하세요.</div>
      <div class="park-rides">${RIDES.map((r, i) => `<article class="park-ride" data-ride="${r.id}" style="--ride-color:${r.color}"><span class="park-ride-number">0${i + 1}</span><div><h2>${r.name}</h2><p>${r.subtitle}</p><small class="park-seats">0 / ${r.seats}명</small></div><button type="button" disabled>탑승하기</button></article>`).join('')}</div>
      <div class="park-controls"><div class="park-stick" aria-label="이동 조이스틱"><span class="park-stick-label">MOVE</span><i></i></div><div class="park-key-guide"><div><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd><span>이동</span></div><small>화면 드래그 · 시점 회전 / 스크롤 · 확대</small></div><button class="park-action" type="button" disabled><span>SPACE</span><strong>폴짝 뛰기</strong></button><button class="park-leave" type="button" hidden>내리기 ↓</button></div>
      <div class="park-entry"><form class="park-ticket"><p>SIX FLAGS · GREAT ADVENTURE</p><div class="park-ticket-flags">⚑ ⚑ ⚑ ⚑ ⚑ ⚑</div><h2>미국 테마파크로 떠나요</h2><div class="park-entry-copy">Carousel · Giant Wheel<br>SkyScreamer · Enchanted Teacups<br>실제 기구를 담은 작은 3D 파크에서 만나요.</div><label for="park-nickname">오늘의 닉네임</label><input id="park-nickname" name="nickname" placeholder="어떤 이름으로 만날까요?" maxlength="24" autocomplete="off" required><button class="park-enter" type="submit" disabled>서버 연결 중…</button><small class="park-entry-status" role="status">같은 네트워크의 친구들과 함께할 수 있어요.</small><div class="park-ticket-bottom"><span>ADMIT ONE</span><span>PLAY ALL DAY</span><span>08 / 6FLAGS</span></div></form></div>
    </section>`
  const root = container.querySelector<HTMLElement>('.sixflags-scene')!
  const q = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!
  const viewport = q<HTMLDivElement>('.park-viewport'), entry = q<HTMLDivElement>('.park-entry'), form = q<HTMLFormElement>('.park-ticket'), enter = q<HTMLButtonElement>('.park-enter'), input = q<HTMLInputElement>('#park-nickname'), entryStatus = q<HTMLElement>('.park-entry-status')
  const message = q<HTMLElement>('.park-message'), online = q<HTMLElement>('.park-online b'), action = q<HTMLButtonElement>('.park-action'), leave = q<HTMLButtonElement>('.park-leave'), stick = q<HTMLElement>('.park-stick'), knob = q<HTMLElement>('.park-stick i')
  const abort = new AbortController(), signal = abort.signal
  let disposed = false, ws: WebSocket | null = null, selfId = '', snapshot: ParkSnapshot | null = null, reconnect = 0, frame = 0, lastTime = performance.now(), sentAt = 0, uiAt = 0, toastUntil = 0
  const keys = new Set<string>(); let joyX = 0, joyY = 0, stickId: number | null = null
  const avatars = new Map<string, ReturnType<typeof createAvatar>>()
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#dce8dd'); scene.fog = new THREE.Fog('#dce8dd', 55, 100)
  let renderer: THREE.WebGLRenderer
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }) }
  catch { entryStatus.textContent = '3D 그래픽을 시작하지 못했어요. WebGL을 지원하는 브라우저에서 다시 열어 주세요.'; enter.textContent = '3D 그래픽 지원 필요'; return () => abort.abort() }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.28
  viewport.append(renderer.domElement)
  const camera = new THREE.OrthographicCamera(-18, 18, 13, -13, .1, 150); camera.position.set(0, 22, 29)
  const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, 1.8, 0); controls.enableDamping = true; controls.enablePan = false; controls.minPolarAngle = .3; controls.maxPolarAngle = 1.15; controls.minZoom = .75; controls.maxZoom = 2.1; controls.update()
  scene.add(new THREE.HemisphereLight('#fff8e9', '#88a787', 2.7))
  const sun = new THREE.DirectionalLight('#fff0ce', 3.3); sun.position.set(-12, 25, 10); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19, near: 1, far: 65 }); sun.shadow.normalBias = .035; sun.shadow.bias = -.0002; scene.add(sun)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#dce8dd', roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -.86; ground.receiveShadow = true; scene.add(ground)
  const park = createPark(scene)
  const visualRides = initialRides()
  const resize = () => { const { width, height } = viewport.getBoundingClientRect(); if (!width || !height) return; const aspect = width / height; const h = Math.max(11.6, 15 / aspect); camera.left = -h * aspect; camera.right = h * aspect; camera.top = h; camera.bottom = -h; camera.updateProjectionMatrix(); renderer.setSize(width, height) }
  const observer = new ResizeObserver(resize); observer.observe(viewport); resize()
  function send(value: object) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value)) }
  function toast(text: string) { message.textContent = text; toastUntil = performance.now() + 3500 }
  function resetInput() { keys.clear(); joyX = 0; joyY = 0; stickId = null; knob.style.transform = ''; action.classList.remove('is-pressed'); send({ type: 'move', x: 0, z: 0 }) }
  function connect() {
    if (disposed) return
    enter.disabled = true; enter.textContent = '서버 연결 중…'
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/__sixflags`); ws = socket
    socket.onmessage = event => {
      if (disposed || ws !== socket) return
      const data = JSON.parse(event.data)
      if (data.type === 'ready') { enter.disabled = false; enter.textContent = '테마파크 입장하기 ↗'; online.textContent = '입장 대기' }
      if (data.type === 'joined') { selfId = data.id; entry.hidden = true; action.disabled = false; viewport.focus(); toast('환영해요! 놀이기구 가까이 가서 탑승하기를 눌러 보세요.') }
      if (data.type === 'error') { enter.disabled = false; entryStatus.textContent = data.message; toast(data.message) }
      if (data.type === 'state') {
        snapshot = data as ParkSnapshot
        const present = new Set(snapshot.players.map(p => p.id))
        for (const [id, avatar] of avatars) if (!present.has(id)) { scene.remove(avatar.root); /* Shared materials live until scene cleanup. */ avatar.root.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); if (o instanceof THREE.Sprite) { o.material.map?.dispose(); o.material.dispose() } }); avatars.delete(id) }
        for (const player of snapshot.players) if (!avatars.has(player.id)) { const avatar = createAvatar(player.outfit, player.nickname, player.id === selfId); avatar.root.position.set(player.x, player.y, player.z); avatars.set(player.id, avatar); scene.add(avatar.root) }
      }
    }
    socket.onerror = () => { entryStatus.textContent = '서버에 연결할 수 없어요. 개발 서버가 실행 중인지 확인해 주세요.' }
    socket.onclose = () => {
      if (disposed || ws !== socket) return
      selfId = ''; resetInput(); entry.hidden = false; action.disabled = true; leave.hidden = true; online.textContent = '재연결 중'; entryStatus.textContent = '연결이 끊겼어요. 연결 후 다시 입장해 주세요.'
      enter.disabled = true; enter.textContent = '다시 연결하는 중…'; reconnect = window.setTimeout(connect, 2000)
    }
  }
  connect()
  form.addEventListener('submit', event => { event.preventDefault(); const nickname = input.value.trim(); if (!nickname || [...nickname].length > 12) { entryStatus.textContent = '닉네임을 1–12자로 입력해 주세요.'; input.focus(); return } enter.disabled = true; send({ type: 'join', nickname }) }, { signal })
  function doAction() { if (!selfId || document.hidden) return; send({ type: 'action' }); action.classList.add('is-pressed') }
  action.addEventListener('pointerdown', () => doAction(), { signal })
  // Keyboard activation for assistive technologies also works on the action button.
  action.addEventListener('click', event => { if (event.detail === 0) doAction(); viewport.focus() }, { signal })
  window.addEventListener('pointerup', () => action.classList.remove('is-pressed'), { signal })
  leave.addEventListener('click', () => { send({ type: 'dismount' }); viewport.focus() }, { signal })
  for (const ride of RIDES) q<HTMLButtonElement>(`[data-ride="${ride.id}"] button`).addEventListener('click', () => { send({ type: 'board', ride: ride.id }); viewport.focus() }, { signal })
  window.addEventListener('keydown', event => {
    if (!selfId || event.target instanceof HTMLInputElement || (event.target instanceof Element && event.target.closest('[data-lab-navigation]'))) return
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) { event.preventDefault(); keys.add(event.code); if (event.code === 'Space' && !event.repeat) doAction() }
  }, { signal })
  window.addEventListener('keyup', event => { keys.delete(event.code); if (event.code === 'Space') action.classList.remove('is-pressed') }, { signal })
  window.addEventListener('blur', resetInput, { signal }); document.addEventListener('visibilitychange', () => { if (document.hidden) resetInput() }, { signal })
  function moveStick(event: PointerEvent) { if (event.pointerId !== stickId) return; const rect = stick.getBoundingClientRect(), dx = event.clientX - rect.left - rect.width / 2, dy = event.clientY - rect.top - rect.height / 2, length = Math.max(32, Math.hypot(dx, dy)); joyX = dx / length; joyY = dy / length; knob.style.transform = `translate(${joyX * 30}px, ${joyY * 30}px)` }
  stick.addEventListener('pointerdown', event => { if (!selfId) return; stickId = event.pointerId; stick.setPointerCapture(event.pointerId); moveStick(event); event.preventDefault() }, { signal })
  stick.addEventListener('pointermove', moveStick, { signal })
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(name, resetInput, { signal })
  q<HTMLButtonElement>('.park-invite').addEventListener('click', () => { const share = q<HTMLElement>('.park-share'); share.hidden = !share.hidden }, { signal })
  fetch('/__sixflags/info', { signal }).then(r => r.json()).then((data: { urls: string[] }) => {
    const list = q<HTMLElement>('.park-addresses'); list.replaceChildren()
    for (const url of data.urls) { const link = document.createElement('a'); link.href = url; link.textContent = url; list.append(link) }
    if (!data.urls.length) list.textContent = '연결된 로컬 네트워크 주소가 없어요.'
  }).catch(() => { if (!disposed) q<HTMLElement>('.park-addresses').textContent = '서버의 로컬 IP 주소와 포트로 접속해 주세요.' })
  const forward = new THREE.Vector3(), right = new THREE.Vector3(), targetPosition = new THREE.Vector3()
  function updateUI(now: number, player?: ParkPlayer) {
    online.textContent = selfId ? `${snapshot?.players.length ?? 0}명 함께 노는 중` : ws?.readyState === WebSocket.OPEN ? '입장 대기' : '연결 중'
    root.classList.toggle('park-is-riding', !!player?.ride)
    action.querySelector('strong')!.textContent = player?.ride ? RIDES.find(r => r.id === player.ride)!.action : '폴짝 뛰기'
    leave.hidden = !player?.ride
    let nearby = ''
    for (const ride of RIDES) {
      const card = q<HTMLElement>(`[data-ride="${ride.id}"]`), button = card.querySelector('button')!, count = snapshot?.players.filter(p => p.ride === ride.id).length ?? 0
      const close = !!player && Math.hypot(player.x - ride.x, player.z - ride.z) <= 3.7
      card.classList.toggle('is-near', close); card.classList.toggle('is-riding', player?.ride === ride.id)
      card.querySelector('.park-seats')!.textContent = `${count} / ${ride.seats}명`
      button.disabled = !player || !!player.ride || !close || count >= ride.seats
      button.textContent = player?.ride === ride.id ? '탑승 중' : count >= ride.seats ? '잠시 대기' : close ? '탑승하기 ↗' : '가까이 오세요'
      if (close) nearby = ride.name
    }
    if (now > toastUntil && player) message.textContent = player.ride ? `${RIDES.find(r => r.id === player.ride)!.name} · 스페이스 / 동작 버튼으로 즐겨요` : nearby ? `${nearby}에 도착했어요. 아래 탑승하기 버튼을 눌러 주세요.` : '방향키나 조이스틱으로 이동해서 놀이기구에 가까이 가 보세요.'
    const codes = ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight']; root.querySelectorAll('kbd').forEach((key, i) => key.classList.toggle('is-pressed', keys.has(codes[i]!)))
  }
  function animate(now: number) {
    if (disposed) return
    frame = requestAnimationFrame(animate)
    if (document.hidden) { lastTime = now; return }
    const dt = Math.min(.05, (now - lastTime) / 1000); lastTime = now
    const player = snapshot?.players.find(p => p.id === selfId), blend = 1 - Math.exp(-18 * dt)
    if (snapshot) {
      const state = snapshot.rides
      for (let i = 0; i < 4; i++) {
        visualRides.angles[i]! += Math.atan2(Math.sin(state.angles[i]! - visualRides.angles[i]!), Math.cos(state.angles[i]! - visualRides.angles[i]!)) * blend
        visualRides.cupAngles[i]! += Math.atan2(Math.sin(state.cupAngles[i]! - visualRides.cupAngles[i]!), Math.cos(state.cupAngles[i]! - visualRides.cupAngles[i]!)) * blend
        visualRides.speeds[i] = THREE.MathUtils.lerp(visualRides.speeds[i]!, state.speeds[i]!, blend)
      }
      visualRides.lift = THREE.MathUtils.lerp(visualRides.lift, state.lift, blend); visualRides.time = THREE.MathUtils.lerp(visualRides.time, state.time, blend)
      park.update(visualRides)
      for (const p of snapshot.players) {
        const avatar = avatars.get(p.id)!
        const pose = p.ride ? seatPose(p.ride, p.seat, visualRides) : p
        targetPosition.set(pose.x, pose.y - (p.ride ? .35 : 0), pose.z)
        if (p.ride || avatar.root.position.distanceTo(targetPosition) > 3) avatar.root.position.copy(targetPosition)
        else avatar.root.position.lerp(targetPosition, blend)
        const turn = Math.atan2(Math.sin(pose.yaw - avatar.root.rotation.y), Math.cos(pose.yaw - avatar.root.rotation.y)); avatar.root.rotation.y += turn * (p.ride ? 1 : blend)
        avatar.animate(p, now / 1000)
      }
    }
    if (selfId && now - sentAt > 60) {
      sentAt = now
      let x = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft')) + joyX, y = Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp')) + joyY
      const length = Math.max(1, Math.hypot(x, y)); x /= length; y /= length
      camera.getWorldDirection(forward); forward.y = 0; forward.normalize(); right.crossVectors(forward, camera.up).normalize()
      send({ type: 'move', x: clamp(right.x * x - forward.x * y, -1, 1), z: clamp(right.z * x - forward.z * y, -1, 1) })
    }
    if (now - uiAt > 100) { updateUI(now, player); uiAt = now }
    controls.update(); renderer.render(scene, camera)
  }
  frame = requestAnimationFrame(animate)
  return () => { disposed = true; resetInput(); clearTimeout(reconnect); cancelAnimationFrame(frame); abort.abort(); observer.disconnect(); ws?.close(1000, 'Left playground'); controls.dispose(); disposePark(scene); sun.shadow.dispose(); renderer.dispose(); renderer.forceContextLoss() }
}
