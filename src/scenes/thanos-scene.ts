import '../thanos.css'
import { openCamera, setCameraVisible } from '../camera-access'
import { ThanosMoment, ThanosSnapDetector, type ThanosSnap } from '../thanos-model'
import { ThanosRenderer } from '../thanos-renderer'
import { ThanosVision } from '../thanos-vision'
import { ThanosAudio } from '../thanos-audio'

export function mountThanos(container: HTMLElement): () => void {
  container.innerHTML = `
    <section class="th-scene" aria-label="타노스 · 손가락 스냅으로 사라지는 카메라">
      <video class="th-video" playsinline muted aria-hidden="true"></video>
      <header class="th-heading"><p class="th-eyebrow">EXPERIMENT 016</p><div class="th-coordinate"><b>TITAN · THE LAST LIGHT</b>ONE SNAP. NOTHING REMAINS.</div></header>
      <div class="th-intro"><h1 class="th-intro-kicker">THANOS</h1><h2>손끝 하나로,<br><em>모든 것이 먼지가 된다.</em></h2><p>왼손도, 오른손도 괜찮아요.<br>엄지와 중지를 맞대고, 손가락을 튕겨보세요.</p><button class="th-start" type="button">카메라 켜고 시작하기 <span>↗</span></button><small>마이크 없이 동작을 인식합니다. 영상은 이 기기 안에서만 처리됩니다.</small><div class="th-stones" aria-hidden="true"><i style="--stone:#bba1ed"></i><i style="--stone:#7aa9dd"></i><i style="--stone:#d27a79"></i><i style="--stone:#e6c783"></i><i style="--stone:#d9955e"></i><i style="--stone:#8bbfa3"></i></div></div>
      <svg class="th-mark" viewBox="0 0 180 240" fill="none" aria-hidden="true"><path d="m53 221-8-56c-17-10-25-29-25-50 0-12 8-19 15-9l14 23-6-83c-1-15 17-17 19-2l7 52-1-74c0-17 18-17 19 0l3 72 9-58c2-15 20-13 18 3l-6 66 15-41c5-12 20-6 15 7l-17 64c8 16 10 39 1 56l-11 30-1 29Z" stroke="currentColor" stroke-width="2"/><path d="m47 160 68 2m-64 34 58 1m-44-87 2 45m22-49-1 51m22-42-7 42m-58 59 64-1" stroke="currentColor"/><path d="m75 168 12-5 12 6-3 17-12 4-12-9Z" fill="#d3a65e" fill-opacity=".25" stroke="currentColor"/><ellipse cx="61" cy="112" rx="5" ry="7" fill="#ba9be0"/><ellipse cx="82" cy="108" rx="5" ry="7" fill="#7caad4"/><ellipse cx="103" cy="115" rx="5" ry="7" fill="#d07c78"/><ellipse cx="122" cy="127" rx="5" ry="7" fill="#d1be7d"/><ellipse cx="45" cy="137" rx="5" ry="7" fill="#91b99a"/></svg>
      <div class="th-ending" aria-hidden="true"><small>AND THEN, THERE WAS SILENCE.</small><h2>세계가 조용해졌다.</h2><p>당신은 우주의 먼지가 되었습니다.<br>다시 나타나기를 누르면 돌아올 수 있어요.</p></div>
      <div class="th-bottom"><div class="th-help">
      <div class="th-feedback"><i aria-hidden="true"></i><p class="th-status" role="status" aria-live="polite">한 번의 스냅. 당신이 사라질 차례.</p></div>
      <div class="th-guide"><span><em>01</em><b>손을 카메라에</b></span><span><em>02</em><b>엄지 + 중지 맞대기</b></span><span><em>03</em><b>빠르게 튕기기</b></span></div>
      </div><div class="th-controls">
      <footer class="th-tools"><button class="th-sound" type="button" aria-pressed="true">SOUND ON</button><button class="th-labels" type="button" aria-pressed="true" title="화면 안내 표시 전환" aria-label="화면 안내 표시 전환">Aa</button><select class="th-sensitivity" aria-label="스냅 인식 감도"><option value="1">기본 감도</option><option value="1.25">높은 감도</option></select><button class="th-snap" type="button" disabled title="스냅 인식이 어려울 때 버튼이나 Space로 체험">스냅 체험</button><button class="th-reset" type="button">RESET</button><button class="th-camera" type="button">카메라 켜기</button></footer>
      <span class="th-footnote">A FAN-MADE CAMERA EXPERIMENT / NO RECORDING</span>
      </div></div>
    </section>`
  const root = container.querySelector<HTMLElement>('.th-scene')!, video = root.querySelector<HTMLVideoElement>('video')!
  const start = root.querySelector<HTMLButtonElement>('.th-start')!, camera = root.querySelector<HTMLButtonElement>('.th-camera')!
  const status = root.querySelector<HTMLElement>('.th-status')!, intro = root.querySelector<HTMLElement>('.th-intro')!
  const labels = root.querySelector<HTMLButtonElement>('.th-labels')!, sound = root.querySelector<HTMLButtonElement>('.th-sound')!
  const reset = root.querySelector<HTMLButtonElement>('.th-reset')!, snap = root.querySelector<HTMLButtonElement>('.th-snap')!
  const sensitivity = root.querySelector<HTMLSelectElement>('.th-sensitivity')!
  const detector = new ThanosSnapDetector(), moment = new ThanosMoment(), audio = new ThanosAudio()
  const events = new AbortController(), options = { signal: events.signal }
  let disposed = false, live = false, preparing = false, generation = 0, frame = 0, videoTime = -1, hudAt = -Infinity
  let stream: MediaStream | null = null, vision: ThanosVision | null = null, showLabels = true, finished = false
  let renderer: ThanosRenderer
  function say(text: string) { if (status.textContent !== text) status.textContent = text }
  function requestFrame() { if (!disposed && !document.hidden && !frame) frame = requestAnimationFrame(animate) }
  try { renderer = new ThanosRenderer(root, video, requestFrame, say) }
  catch (error) { say(`그래픽을 시작하지 못했어요: ${String(error)}`); start.disabled = camera.disabled = true; return () => events.abort() }
  try { showLabels = localStorage.getItem('thanos-labels') !== 'hidden'; audio.enabled = localStorage.getItem('thanos-sound') !== 'off' } catch { /* Storage is optional. */ }
  function syncPreferences() {
    root.classList.toggle('th-hide-labels', !showLabels); labels.setAttribute('aria-pressed', String(showLabels))
    sound.textContent = audio.enabled ? 'SOUND ON' : 'SOUND OFF'; sound.setAttribute('aria-pressed', String(audio.enabled))
  }
  syncPreferences()
  function stopCamera() {
    generation++; live = preparing = false; cancelAnimationFrame(frame); frame = 0
    vision?.close(); vision = null; stream?.getTracks().forEach(track => track.stop()); stream = null
    video.pause(); video.srcObject = null; detector.reset(); moment.reset(); audio.suspend(); renderer.reset(); finished = false
    root.classList.remove('th-live', 'th-snapped', 'th-gone', 'th-armed'); intro.hidden = false
    start.disabled = false; start.innerHTML = '카메라 켜고 시작하기 <span>↗</span>'; camera.textContent = '카메라 켜기'; snap.disabled = true; reset.textContent = 'RESET'
    requestFrame()
  }
  async function startCamera() {
    if (preparing || stream) { stopCamera(); say('카메라를 껐어요. 다시 켜면 스냅을 준비할 수 있어요.'); return }
    audio.unlock()
    const token = ++generation; preparing = true; start.disabled = true; start.textContent = '카메라 연결 중…'; camera.textContent = '취소'
    say('카메라 사용을 허용해주세요. 마이크는 사용하지 않습니다.')
    try {
      const cameraStream = await openCamera(video, 960, 540)
      if (disposed || token !== generation) { cameraStream.getTracks().forEach(track => track.stop()); return }
      stream = cameraStream; video.srcObject = stream; await video.play()
      if (disposed || token !== generation) return
      live = true; root.classList.add('th-live'); intro.hidden = true; setCameraVisible(stream, !document.hidden); requestFrame()
      const tracking = new ThanosVision((output, time, image) => {
        if (disposed || token !== generation || document.hidden || moment.snapped) return
        if (output.task === 'segment') { if (image) renderer.updatePerson(output, image, time) }
        else {
          const event = detector.update(output.hands, time, (video.videoWidth || 960) / (video.videoHeight || 540))
          root.classList.toggle('th-armed', detector.armedHands > 0)
          if (event) trigger(event)
        }
      })
      vision = tracking; tracking.setVisible(!document.hidden); await tracking.initialize(message => { if (!disposed && token === generation) say(message) })
      if (disposed || token !== generation) { tracking.close(); return }
      preparing = false; videoTime = -1; hudAt = -Infinity; camera.textContent = '카메라 끄기'; snap.disabled = false
      say('양손 중 어느 손이든 엄지와 중지를 맞댄 뒤 빠르게 튕겨보세요.'); requestFrame()
      cameraStream.getVideoTracks()[0]?.addEventListener('ended', () => { if (!disposed && token === generation) { stopCamera(); say('카메라 연결이 종료됐어요. 다시 켜주세요.') } }, options)
    } catch (error) {
      if (disposed || token !== generation) return
      stopCamera()
      const name = error instanceof Error ? error.name : ''
      say(name === 'NotAllowedError' ? '카메라 권한을 허용해주세요. HTTPS 인증서 경고가 있으면 신뢰 등록 후 Chrome·Safari에서 열어주세요.'
        : name === 'NotReadableError' ? '다른 앱이 카메라를 사용 중인지 확인해주세요.'
        : name === 'NotFoundError' ? '연결된 카메라를 찾지 못했어요.' : `시작하지 못했어요: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  function trigger(event: ThanosSnap | null = null) {
    if (!live || preparing || moment.snapped || document.hidden) return
    const now = performance.now()
    if (!renderer.freeze(now, event?.x, event?.y)) { say('얼굴과 상체가 카메라에 보이게 한 뒤 다시 튕겨주세요.'); return }
    moment.snap(now); detector.clear(); vision?.setVisible(false); setCameraVisible(stream, false)
    root.classList.remove('th-armed'); root.classList.add('th-snapped'); snap.disabled = true; reset.textContent = '다시 나타나기'
    say(event ? '손가락 스냅 인식 · 우주의 균형이 무너집니다.' : '스냅 · 우주의 균형이 무너집니다.')
    audio.play(); requestFrame()
  }
  function restore() {
    detector.reset(); moment.reset(); audio.stop(); audio.unlock(); renderer.reset(); finished = false; hudAt = -Infinity; videoTime = -1
    root.classList.remove('th-snapped', 'th-gone', 'th-armed'); reset.textContent = 'RESET'; snap.disabled = !live || preparing
    vision?.setVisible(!document.hidden); setCameraVisible(stream, !document.hidden)
    say(live ? '다시 돌아왔어요. 어느 손이든 엄지와 중지를 맞대고 튕겨보세요.' : '카메라를 켜고 우주의 균형을 바꿔보세요.'); requestFrame()
  }
  function animate(now: number) {
    frame = 0
    if (disposed || document.hidden) return
    if (live && vision && !preparing && !moment.snapped && video.currentTime !== videoTime) {
      if (vision.error) { stopCamera(); say('인식이 중단됐어요. 카메라를 다시 켜주세요.'); return }
      if (vision.submit(video, now)) videoTime = video.currentTime
    }
    if (moment.finished(now) && !finished) {
      finished = true; root.classList.add('th-gone'); renderer.invalidate(); audio.suspend()
      say('모두 먼지가 되었어요. 다시 나타나기를 누르면 돌아올 수 있어요.')
    }
    renderer.render(video, live, moment, now)
    if (live && !preparing && !moment.snapped && now - hudAt > 220) {
      say(detector.armedHands ? '스냅 준비 완료 · 중지를 손바닥 쪽으로 빠르게 튕겨보세요.' : detector.handCount ? '손이 보여요 · 엄지와 중지를 잠깐 맞댄 뒤 튕겨보세요.' : '얼굴과 손을 함께 보여주세요 · 왼손·오른손 모두 인식합니다.')
      hudAt = now
    }
    if (live && !finished) frame = requestAnimationFrame(animate)
  }
  start.addEventListener('click', () => void startCamera(), options)
  camera.addEventListener('click', () => void startCamera(), options)
  snap.addEventListener('click', () => { audio.unlock(); trigger() }, options)
  reset.addEventListener('click', restore, options)
  sensitivity.addEventListener('change', () => { detector.clear(); detector.sensitivity = Number(sensitivity.value); say('감도를 바꿨어요. 엄지와 중지를 카메라에 보이게 튕겨보세요.') }, options)
  labels.addEventListener('click', () => { showLabels = !showLabels; syncPreferences(); try { localStorage.setItem('thanos-labels', showLabels ? 'visible' : 'hidden') } catch { /* Optional. */ } }, options)
  sound.addEventListener('click', () => { audio.enabled = !audio.enabled; if (audio.enabled) audio.unlock(); else audio.suspend(); syncPreferences(); try { localStorage.setItem('thanos-sound', audio.enabled ? 'on' : 'off') } catch { /* Optional. */ } }, options)
  window.addEventListener('keydown', event => {
    if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || (event.target as HTMLElement)?.closest('button,a,input,select,textarea')) return
    if (!live || preparing || moment.snapped) return
    event.preventDefault(); audio.unlock(); trigger()
  }, options)
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(frame); frame = 0; detector.clear(); if(document.hidden)audio.suspend();else if(live&&!moment.snapped)audio.unlock()
    vision?.setVisible(!document.hidden && !moment.snapped); setCameraVisible(stream, !document.hidden && !moment.snapped)
    if (!document.hidden) { videoTime = -1; renderer.invalidate(); requestFrame() }
  }, options)
  renderer.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); stopCamera(); start.disabled = camera.disabled = snap.disabled = true; say('그래픽 연결이 끊겼어요. 페이지를 새로고침해주세요.') }, options)
  requestFrame()
  return () => { disposed = true; events.abort(); cancelAnimationFrame(frame); frame = 0; stopCamera(); renderer.destroy(); void audio.close() }
}
