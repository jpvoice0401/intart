import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { CHURCH_SEATS, CHURCH_PHRASES, type ChurchGender, type ChurchPhrase, type ChurchActivity, type ChurchPlayer, type ChurchSnapshot } from '../church-model.ts'
import { createChurchAvatar, createSanctuary, disposeChurch, loadChurchExterior } from '../church-world.ts'
import { createChurchVoice, createChurchSpeechInbox } from '../church-voice.ts'
import { CHURCH_HYMNS, createChurchMusic } from '../church-music.ts'
import { HALL } from '../church-layout.ts'

type View = 'walk' | 'hall' | 'stage' | 'exterior'
export function mountChurch(container: HTMLElement) {
  container.innerHTML = `<section class="church-scene">
    <div class="church-viewport" tabindex="0" aria-label="여의도순복음교회 대성전 3D 공간. 방향키로 이동하세요."></div>
    <header class="church-heading"><p>EXPERIMENT 09 <i></i> Y O I D O</p><h1>여의도순복음교회<span>대성전</span></h1><div>같은 공간에서, 함께 마음을 모으다.</div></header>
    <div class="church-tools"><div class="church-music" data-church-music aria-label="찬송 음악"><button type="button" class="church-music-toggle" aria-pressed="false">♫ 음악 켜기</button><details class="church-music-picker"><summary aria-label="찬송 음악 선택"><span class="church-music-current">${CHURCH_HYMNS[0].title}</span><span class="church-music-select-label">곡 선택</span><span aria-hidden="true">⌄</span></summary><div class="church-music-list"><p class="church-music-state" role="status">입장하면 순서대로 재생됩니다.</p>${CHURCH_HYMNS.map((song, index) => `<button type="button" data-track="${index}" aria-pressed="${index === 0}"><span>${song.title}</span><i aria-hidden="true">♪</i></button>`).join('')}<small>세 곡 순서대로 · 마지막 곡 후 처음부터</small><p class="church-music-credit">음악 출처: <a href="https://www.youtube.com/c/beecompanyccm" target="_blank" rel="noopener noreferrer">@beecompanyccm ↗</a></p></div></details></div><span class="church-online">서버 연결 중</span><button type="button" class="church-share-toggle">함께 입장 ↗</button></div>
    <aside class="church-share" hidden><strong>같은 Wi-Fi에서 함께 입장</strong><p>친구의 브라우저에 아래 주소를 입력하세요.</p><div class="church-addresses">주소 확인 중…</div></aside>
    <nav class="church-views" aria-label="대성전 시점"><button data-view="walk" type="button">내 캐릭터</button><button data-view="hall" type="button" aria-pressed="true">전체보기</button><button data-view="stage" type="button">강단보기</button><button data-view="exterior" type="button">실제 외관 모델</button></nav>
    <div class="church-view-caption">VR 사진을 참고해 재구성한 대성전 내부</div>
    <div class="church-status" role="status" aria-live="polite">닉네임을 입력하고 대성전에 입장하세요.</div>
    <footer class="church-bottom"><div class="church-move"><div class="church-stick" aria-label="터치 이동 조이스틱"><i></i><span>MOVE</span></div><div class="church-keyboard"><p><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> 이동</p><small>드래그 · 시점 회전 &nbsp; 스크롤 · 확대</small></div></div><div class="church-actions"><button data-activity="pray" type="button" disabled><span>01</span><strong>기도하기</strong><small>착석 · 두 손 모으기</small></button><button data-activity="praise" type="button" disabled><span>02</span><strong>찬송하기</strong><small>착석 · 함께 박수</small></button><button data-activity="walk" type="button" disabled><span>03</span><strong>일어나기</strong><small>통로로 나오기</small></button></div></footer>
    <div class="church-entry"><form class="church-entry-card"><div class="church-entry-cross">✝</div><p>YOIDO FULL GOSPEL CHURCH</p><h2>여의도순복음교회에<br>오신 것을 환영합니다.</h2><div>닉네임과 나만의 작은 캐릭터로<br>함께 기도하고 찬송하는 공간</div><label for="church-nickname">닉네임</label><input id="church-nickname" maxlength="24" placeholder="1–12자로 입력하세요" autocomplete="off" required><button type="submit" disabled>연결 중…</button><small class="church-entry-message" role="status">입장할 때마다 새로운 옷차림을 만나요.</small><footer>09 <span>여의도순복음교회 · 대성전</span></footer></form></div>
  </section>`
  const root = container.querySelector<HTMLElement>('.church-scene')!, q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!
  q<HTMLElement>('[data-activity="pray"]').insertAdjacentHTML('afterend', `<div class="church-speech-actions"><button type="button" data-speech="amen" disabled>아멘 <span>♪</span></button><button type="button" data-speech="lord" disabled>주여! <span>♪</span></button></div>`)
  q<HTMLElement>('.church-entry-card>button').insertAdjacentHTML('beforebegin', `<fieldset class="church-gender" aria-label="성별 선택"><label><input type="radio" name="church-gender" value="male" checked><span>남자</span></label><label><input type="radio" name="church-gender" value="female"><span>여자</span></label><button type="button" class="church-voice-preview">목소리 듣기 ♪</button></fieldset>`)
  const viewport = q<HTMLDivElement>('.church-viewport'), form = q<HTMLFormElement>('.church-entry-card'), entry = q<HTMLElement>('.church-entry'), enter = form.querySelector<HTMLButtonElement>('button[type="submit"]')!, nickname = q<HTMLInputElement>('#church-nickname'), entryMessage = q<HTMLElement>('.church-entry-message'), status = q<HTMLElement>('.church-status'), online = q<HTMLElement>('.church-online'), caption = q<HTMLElement>('.church-view-caption'), stick = q<HTMLElement>('.church-stick'), knob = q<HTMLElement>('.church-stick i')
  const events = new AbortController(), signal = events.signal, keys = new Set<string>()
  let renderer: THREE.WebGLRenderer
  try { renderer = new THREE.WebGLRenderer({ antialias: true }) }
  catch { enter.textContent = 'WebGL 지원 필요'; entryMessage.textContent = '3D 그래픽을 시작하지 못했어요. WebGL 지원 브라우저에서 다시 열어 주세요.'; return () => events.abort() }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; viewport.append(renderer.domElement)
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#171e22')
  const environmentMaker = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment(), environment = environmentMaker.fromScene(room); scene.environment = environment.texture; scene.environmentIntensity = .65; room.dispose(); environmentMaker.dispose()
  const hemisphere = new THREE.HemisphereLight('#fff0d9', '#a98d76', 1.2); scene.add(hemisphere)
  const light = new THREE.DirectionalLight('#fff3dd', 1.5); light.position.set(-8, 28, 12); light.castShadow = true; light.shadow.mapSize.set(2048, 2048); Object.assign(light.shadow.camera, { left: -35, right: 35, top: 36, bottom: -36, near: 1, far: 90 }); light.shadow.normalBias = .04; light.shadow.bias = -.0001; scene.add(light)
  const stageLight = new THREE.PointLight('#ffe6c5', 60, 34, 1.3); stageLight.position.set(0, 10, -10); scene.add(stageLight)
  const crossLight = new THREE.PointLight('#8fddf3', 18, 8); crossLight.position.set(0, 10, -15); scene.add(crossLight)
  const sanctuary = createSanctuary(); scene.add(sanctuary.root)
  const destinationMarker = new THREE.Mesh(new THREE.RingGeometry(.22, .34, 40), new THREE.MeshBasicMaterial({ color: '#dfbc6b', side: THREE.DoubleSide, depthWrite: false }))
  destinationMarker.rotation.x = -Math.PI / 2; destinationMarker.visible = false; scene.add(destinationMarker)
  const exteriorGroup = new THREE.Group(); exteriorGroup.visible = false; scene.add(exteriorGroup)
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, .35, 80), new THREE.MeshStandardMaterial({ color: '#b5b5ae', roughness: .95 })); plinth.position.y = -.2; exteriorGroup.add(plinth)
  const avatars = new Map<string, ReturnType<typeof createChurchAvatar>>(), retiredAvatars: THREE.Object3D[] = []
  const camera = new THREE.PerspectiveCamera(54, 1, .1, 300), controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 3; controls.maxDistance = 65; controls.maxPolarAngle = Math.PI * .49
  let view: View = 'hall', disposed = false, exteriorLoaded = false, exteriorPromise: Promise<void> | null = null, frame = 0, ws: WebSocket | null = null, reconnect = 0, selfId = '', snapshot: ChurchSnapshot | null = null, sentAt = 0, uiAt = 0, lastTime = performance.now(), toastUntil = 0, joyX = 0, joyY = 0, pointer: number | null = null
  const forward = new THREE.Vector3(), right = new THREE.Vector3(), target = new THREE.Vector3(), previousFollow = new THREE.Vector3(), shift = new THREE.Vector3()
  function me() { return snapshot?.players.find(p => p.id === selfId) }
  function toast(message: string) { status.textContent = message; toastUntil = performance.now() + 4000 }
  const voice = createChurchVoice(toast), speechInbox = createChurchSpeechInbox()
  const musicToggle = q<HTMLButtonElement>('.church-music-toggle'), musicPicker = q<HTMLDetailsElement>('.church-music-picker')
  const music = createChurchMusic(state => {
    const active = state.enabled && (state.playing || state.loading)
    musicToggle.textContent = active ? '♫ 음악 끄기' : '♫ 음악 켜기'; musicToggle.setAttribute('aria-pressed', String(active))
    q<HTMLElement>('.church-music-current').textContent = CHURCH_HYMNS[state.index]!.title
    musicPicker.querySelector('summary')!.setAttribute('aria-label', `곡 선택: ${CHURCH_HYMNS[state.index]!.title}`)
    q<HTMLElement>('.church-music-state').textContent = state.error || (state.loading ? '음악을 불러오고 있어요…' : state.playing ? '지금 재생 중 · 순서대로 반복' : state.enabled ? '입장하면 순서대로 재생됩니다.' : '음악이 꺼져 있어요.')
    root.querySelectorAll<HTMLButtonElement>('[data-track]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.track) === state.index)))
  })
  musicToggle.addEventListener('click', () => music.toggle(), { signal })
  root.querySelectorAll<HTMLButtonElement>('[data-track]').forEach(button => button.addEventListener('click', () => { music.select(Number(button.dataset.track)); musicPicker.open = false }, { signal }))
  document.addEventListener('pointerdown', event => { if (!musicPicker.contains(event.target as Node)) musicPicker.open = false }, { signal })
  musicPicker.addEventListener('keydown', event => { if (event.code === 'Escape') { musicPicker.open = false; musicPicker.querySelector('summary')!.focus() } }, { signal })
  const gender = () => q<HTMLInputElement>('input[name="church-gender"]:checked').value as ChurchGender
  let lastSpeechAt = -Infinity
  function send(data: object) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)) }
  function resetInput() { keys.clear(); joyX = 0; joyY = 0; pointer = null; knob.style.transform = ''; send({ type: 'move', x: 0, z: 0 }) }
  function frameHall() {
    controls.target.set(0, 3.5, 3)
    camera.position.set(34, 34.5, 45).multiplyScalar(Math.max(1, .85 / camera.aspect)).add(controls.target)
  }
  function selectView(next: View) {
    view = next; resetInput(); sanctuary.root.visible = next !== 'exterior'; exteriorGroup.visible = next === 'exterior'
    if (next === 'exterior') send({ type: 'stop' })
    avatars.forEach(a => { a.root.visible = next !== 'exterior' })
    root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === next)))
    scene.background = new THREE.Color(next === 'exterior' ? '#d9ddd9' : '#171e22'); stageLight.visible = crossLight.visible = next !== 'exterior'
    if (next === 'walk') { const p = me(); previousFollow.set(p?.x ?? 0, 1, p?.z ?? 13); controls.target.copy(previousFollow); camera.position.copy(previousFollow).add(new THREE.Vector3(0, 3.1, 6.5)); controls.maxDistance = 24 }
    else { controls.maxDistance = 220; if (next === 'hall') frameHall(); if (next === 'stage') { camera.position.set(0, 5.5, 16); controls.target.set(0, 7, -15) } if (next === 'exterior') { camera.position.set(-24, 18, 27); controls.target.set(0, 4, 0) } }
    controls.update()
    caption.textContent = next === 'exterior' ? exteriorLoaded ? '공식 VR 사이트에서 가져온 대성전 외관 3D 모델' : '공식 대성전 외관 모델 불러오는 중…' : 'VR 사진을 참고해 재구성한 대성전 내부'
    if (next === 'exterior' && !exteriorLoaded && !exteriorPromise) {
      exteriorPromise = loadChurchExterior().then(model => { if (disposed) { disposeChurch(model); return } exteriorGroup.add(model); exteriorLoaded = true; if (view === 'exterior') caption.textContent = '공식 VR 사이트에서 가져온 대성전 외관 3D 모델' }).catch(() => { if (!disposed) { caption.textContent = '외관 파일을 불러오지 못했어요. 버튼을 다시 눌러 주세요.'; toast('내부 체험은 계속 이용할 수 있어요.') } }).finally(() => { exteriorPromise = null })
    }
  }
  selectView('hall')
  const raycaster = new THREE.Raycaster(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), floorHit = new THREE.Vector3(), screenPoint = new THREE.Vector2()
  const canvasPointers = new Set<number>()
  let tap: { id: number; x: number; y: number; dragged: boolean } | null = null
  renderer.domElement.addEventListener('pointerdown', event => {
    canvasPointers.add(event.pointerId)
    if (canvasPointers.size > 1) { tap = null; return }
    if (event.button === 0) tap = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false }
  }, { signal })
  renderer.domElement.addEventListener('pointermove', event => { if (tap?.id === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 7) tap.dragged = true }, { signal })
  renderer.domElement.addEventListener('pointerup', event => {
    canvasPointers.delete(event.pointerId)
    const click = tap; tap = null
    if (!click || click.id !== event.pointerId || click.dragged || !selfId || view === 'exterior' || Math.hypot(event.clientX - click.x, event.clientY - click.y) > 7) return
    const rect = renderer.domElement.getBoundingClientRect()
    screenPoint.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2)
    raycaster.setFromCamera(screenPoint, camera)
    if (raycaster.ray.intersectPlane(floorPlane, floorHit)) { resetInput(); send({ type: 'navigate', x: floorHit.x, z: floorHit.z }); viewport.focus() }
  }, { signal })
  renderer.domElement.addEventListener('pointercancel', e => { canvasPointers.delete(e.pointerId); tap = null }, { signal })
  function resize() { const rect = viewport.getBoundingClientRect(); if (!rect.width || !rect.height) return; camera.aspect = rect.width / rect.height; camera.fov = rect.width < 700 ? 68 : 54; camera.updateProjectionMatrix(); if (view === 'hall') frameHall(); renderer.setSize(rect.width, rect.height) }
  const observer = new ResizeObserver(resize); observer.observe(viewport); resize()
  function connect() {
    if (disposed) return
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/__church`); ws = socket
    socket.onmessage = event => {
      if (disposed || ws !== socket) return
      const data = JSON.parse(event.data)
      if (data.type === 'ready') { enter.disabled = false; enter.textContent = '대성전 입장하기'; online.textContent = '입장 대기' }
      if (data.type === 'joined') { selfId = data.id; entry.hidden = true; viewport.focus(); toast('환영합니다. 통로 옆 빈 의자 가까이에서 기도하기나 찬송하기를 눌러 주세요.') }
      if (data.type === 'error') { enter.disabled = false; entryMessage.textContent = data.message; toast(data.message) }
      if (data.type === 'state') {
        snapshot = data as ChurchSnapshot
        for (const speech of speechInbox.read(snapshot)) if (selfId && speech.id !== selfId && !document.hidden) { voice.speak(speech.phrase, speech.gender); toast(`${speech.nickname}: ${CHURCH_PHRASES[speech.phrase]}`) }
        const present = new Set(snapshot.players.map(p => p.id))
        for (const [id, avatar] of avatars) if (!present.has(id)) { scene.remove(avatar.root); retiredAvatars.push(avatar.root); avatars.delete(id) }
        for (const p of snapshot.players) if (!avatars.has(p.id)) { const avatar = createChurchAvatar(p, p.id === selfId); avatar.root.position.set(p.x, p.seat ? .2 : 0, p.z); avatar.root.visible = view !== 'exterior'; avatars.set(p.id, avatar); scene.add(avatar.root); if (p.id === selfId) selectView('walk') }
      }
    }
    socket.onerror = () => { entryMessage.textContent = '서버 연결을 확인해 주세요. npm.cmd run dev로 실행할 수 있어요.' }
    socket.onclose = () => { if (disposed || ws !== socket) return; selfId = ''; snapshot = null; speechInbox.clear(); resetInput(); entry.hidden = false; enter.disabled = true; enter.textContent = '다시 연결하는 중…'; entryMessage.textContent = '연결이 끊겼어요. 재연결 후 다시 입장해 주세요.'; online.textContent = '재연결 중'; reconnect = window.setTimeout(connect, 2000) }
  }
  connect()
  form.addEventListener('submit', event => { event.preventDefault(); const name = nickname.value.trim(); if (!name || [...name].length > 12) { entryMessage.textContent = '닉네임을 1–12자로 입력해 주세요.'; nickname.focus(); return } voice.unlock(); music.startOnEntry(); enter.disabled = true; send({ type: 'join', nickname: name, gender: gender() }) }, { signal })
  q<HTMLButtonElement>('.church-voice-preview').addEventListener('click', () => voice.speak('amen', gender(), true), { signal })
  root.querySelectorAll<HTMLButtonElement>('[data-speech]').forEach(button => button.addEventListener('click', () => {
    const p = me(), now = performance.now(); if (!p || now - lastSpeechAt < 1100) return
    lastSpeechAt = now; const phrase = button.dataset.speech as ChurchPhrase
    voice.speak(phrase, p.gender, true); send({ type: 'speak', phrase }); toast(`${p.nickname}: ${CHURCH_PHRASES[phrase]}`); viewport.focus()
  }, { signal }))
  function activity(value: ChurchActivity) { if (!selfId) return; if (view === 'exterior') selectView('walk'); send({ type: 'activity', activity: value }); viewport.focus() }
  root.querySelectorAll<HTMLButtonElement>('[data-activity]').forEach(button => button.addEventListener('click', () => activity(button.dataset.activity as ChurchActivity), { signal }))
  root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.addEventListener('click', () => { selectView(button.dataset.view as View); viewport.focus() }, { signal }))
  window.addEventListener('keydown', event => {
    if (!selfId || (event.target instanceof Element && event.target.closest('input,textarea,select,button,summary,[data-lab-navigation],[data-church-music]'))) return
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyP', 'KeyH', 'Escape'].includes(event.code)) {
      event.preventDefault(); keys.add(event.code)
      if (!event.repeat) { if (event.code === 'Space' || event.code === 'KeyP') activity('pray'); if (event.code === 'KeyH') activity('praise'); if (event.code === 'Escape') activity('walk') }
    }
  }, { signal })
  function stopMovement() { resetInput(); send({ type: 'stop' }); tap = null; canvasPointers.clear() }
  window.addEventListener('keyup', e => keys.delete(e.code), { signal }); window.addEventListener('blur', stopMovement, { signal }); document.addEventListener('visibilitychange', () => { if (document.hidden) stopMovement() }, { signal })
  function moveStick(event: PointerEvent) { if (event.pointerId !== pointer) return; const bounds = stick.getBoundingClientRect(), x = event.clientX - bounds.left - bounds.width / 2, y = event.clientY - bounds.top - bounds.height / 2, length = Math.max(30, Math.hypot(x, y)); joyX = x / length; joyY = y / length; knob.style.transform = `translate(${joyX * 28}px,${joyY * 28}px)` }
  stick.addEventListener('pointerdown', e => { if (!selfId) return; pointer = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); e.preventDefault() }, { signal }); stick.addEventListener('pointermove', moveStick, { signal })
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(name, resetInput, { signal })
  q<HTMLButtonElement>('.church-share-toggle').addEventListener('click', () => { const share = q<HTMLElement>('.church-share'); share.hidden = !share.hidden }, { signal })
  fetch('/__church/info', { signal }).then(r => r.json()).then((data: { urls: string[] }) => { const list = q<HTMLElement>('.church-addresses'); list.replaceChildren(); for (const url of data.urls) { const link = document.createElement('a'); link.textContent = url; link.href = url; list.append(link) } if (!data.urls.length) list.textContent = '로컬 네트워크 연결을 확인해 주세요.' }).catch(() => { if (!disposed) q<HTMLElement>('.church-addresses').textContent = '서버 IP 주소와 포트로 접속할 수 있어요.' })
  function updateUI(now: number, p?: ChurchPlayer) {
    online.textContent = selfId ? `${snapshot?.players.length ?? 0}명 함께하는 중` : ws?.readyState === WebSocket.OPEN ? '입장 대기' : '서버 연결 중'
    root.querySelectorAll<HTMLButtonElement>('[data-activity]').forEach(button => { button.disabled = !p || (button.dataset.activity === 'walk' && !p.seat); button.setAttribute('aria-pressed', String(button.dataset.activity === p?.activity)) })
    root.querySelectorAll<HTMLButtonElement>('[data-speech]').forEach(button => { button.disabled = !p || now - lastSpeechAt < 1100 })
    if (p && now > toastUntil) {
      const seat = CHURCH_SEATS.find(s => s.id === p.seat)
      status.textContent = seat ? `${seat.label} · ${p.activity === 'pray' ? '두 손을 모아 기도하고 있어요' : p.activity === 'praise' ? '박수 치며 찬송하고 있어요' : '앉아 있어요'} · 바닥을 누르면 일어나 이동해요` : view === 'exterior' ? '공식 외관 모델을 회전해서 보세요. 내 캐릭터를 누르면 예배당으로 돌아갑니다.' : p.destination ? '선택한 곳으로 걸어가는 중 · 방향키로 이동 취소' : '바닥 클릭 / 터치로 걷기 · 방향키 / 조이스틱 이동 · 드래그로 둘러보기'
    }
    const codes = ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight']; root.querySelectorAll('kbd').forEach((el, i) => el.classList.toggle('is-pressed', keys.has(codes[i]!)))
  }
  function animate(now: number) {
    if (disposed) return
    frame = requestAnimationFrame(animate)
    if (document.hidden) { lastTime = now; return }
    const dt = Math.min(.05, (now - lastTime) / 1000), blend = 1 - Math.exp(-16 * dt); lastTime = now
    sanctuary.animate(now / 1000)
    for (const p of snapshot?.players ?? []) {
      const avatar = avatars.get(p.id)!
      target.set(p.x, p.seat ? .2 : 0, p.z)
      if (avatar.root.position.distanceTo(target) > 4) avatar.root.position.copy(target); else avatar.root.position.lerp(target, blend)
      avatar.root.rotation.y += Math.atan2(Math.sin(p.yaw - avatar.root.rotation.y), Math.cos(p.yaw - avatar.root.rotation.y)) * blend
      avatar.animate(p, snapshot!.time)
    }
    const p = me()
    destinationMarker.visible = !!p?.destination && view !== 'exterior'
    if (p?.destination) { destinationMarker.position.set(p.destination.x, .065, p.destination.z); destinationMarker.scale.setScalar(1 + Math.sin(now / 180) * .12) }
    if (view === 'walk' && p) { const avatar = avatars.get(p.id); if (avatar) { target.copy(avatar.root.position); target.y = 1; shift.copy(target).sub(previousFollow); camera.position.add(shift); controls.target.add(shift); previousFollow.copy(target) } }
    // Remove only obstructing architectural surfaces when viewing the interior from outside.
    sanctuary.roof.visible = camera.position.y < HALL.eaveY && view !== 'hall'; sanctuary.back.visible = camera.position.z < 27; sanctuary.left.visible = camera.position.x > -26; sanctuary.right.visible = camera.position.x < 26
    if (selfId && now - sentAt > 60) {
      sentAt = now
      let x = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft')) + joyX, z = Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp')) + joyY
      const length = Math.max(1, Math.hypot(x, z)); x /= length; z /= length
      camera.getWorldDirection(forward); forward.y = 0; forward.normalize(); right.crossVectors(forward, camera.up).normalize()
      send({ type: 'move', x: view === 'exterior' ? 0 : right.x * x - forward.x * z, z: view === 'exterior' ? 0 : right.z * x - forward.z * z })
    }
    if (now - uiAt > 100) { updateUI(now, p); uiAt = now }
    controls.update(); renderer.render(scene, camera)
  }
  frame = requestAnimationFrame(animate)
  return () => { disposed = true; music.dispose(); voice.dispose(); resetInput(); clearTimeout(reconnect); cancelAnimationFrame(frame); events.abort(); observer.disconnect(); ws?.close(1000, 'Left sanctuary'); controls.dispose(); retiredAvatars.forEach(a => disposeChurch(a)); disposeChurch(scene); environment.dispose(); light.shadow.dispose(); renderer.dispose(); renderer.forceContextLoss() }
}
