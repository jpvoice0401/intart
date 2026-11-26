import { TypingRain, type Letter } from '../typing-rain.ts'
import { SnowWordChallenge, wordUnits } from '../snow-words.ts'

export function mountTypingRain(container: HTMLElement): () => void {
  container.innerHTML = `
    <section class="rain-scene" data-rain-state="ready" aria-label="타이핑 스노우: 단어를 입력해 눈을 내리는 게임">
      <canvas class="rain-canvas" aria-hidden="true"></canvas>
      <div class="rain-heading"><p><span></span> EXPERIMENT 06 / WINTER WORD PLAY</p><h1>TYPE<span> / </span>SNOW<span class="rain-title-dot">.</span></h1><div>한 단어씩, 소복소복 쌓이는 겨울</div></div>
      <div class="rain-top-note"><span>SMALL WORDS. SOFT SNOW.</span><p>눈놀이하러 나왔어! 같이 놀자.</p><span class="rain-snow-mark" aria-hidden="true">❄</span></div>
      <div class="rain-word-prompt" aria-live="off">
        <span class="rain-kicker" id="rain-language"></span>
        <h2 class="rain-target-word" id="rain-target-word" aria-label="입력할 단어"></h2>
        <div class="rain-jamo" id="rain-jamo" aria-hidden="true"></div>
        <p id="rain-word-guide">보이는 단어를 입력하면 눈이 내려요</p>
        <span class="rain-word-progress" id="rain-word-progress"></span>
      </div>
      <div class="rain-runner-caption" aria-hidden="true">첫눈을 기다리고 있어!</div>
      <div class="rain-pause" hidden>잠시 쉬는 중 <span>화면으로 돌아오면 이어집니다</span></div>
      <footer class="rain-footer">
        <div class="rain-dashboard">
          <div class="rain-stats"><div><span>WORDS</span><strong id="rain-typed">000</strong><small>완성한 단어</small></div><div><span>SNOW</span><strong id="rain-dodged">000</strong><small>쌓인 눈 단어</small></div><div><span>TIME</span><strong id="rain-time">0.0<em>s</em></strong><small>눈놀이 시간</small></div></div>
          <div class="rain-type-control">
            <label for="rain-word-input"><span>입력할 단어 <strong id="rain-input-target"></strong></span><span id="rain-input-language"></span></label>
            <div class="rain-input-shell"><input id="rain-word-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text" enterkeyhint="next" aria-describedby="rain-input-hint" aria-label="화면 중앙의 단어 입력"/><div class="rain-input-preview" aria-hidden="true"><span id="rain-input-preview"></span><i></i></div><span class="rain-input-snow" aria-hidden="true">❄</span></div>
            <small id="rain-input-hint">마지막 글자를 쓰면 자동으로 떨어져요 · Enter 없이</small>
          </div>
          <div class="rain-guide"><span><i></i> 한글 + ENGLISH</span><p>꼬마는 스스로 눈을 피해요.<br>단어를 완성해 눈을 내려주세요.</p></div>
        </div>
        <div class="rain-bottom-line"><span>작은 손, 따뜻한 장갑, 소복한 눈.</span><span>ONE WORD. A LITTLE MORE WINTER. <b>❄</b></span><button type="button" id="rain-reset" aria-label="게임 처음부터">처음부터 ↻</button></div>
      </footer>
      <div class="rain-gameover" hidden><div class="rain-result" role="dialog" aria-modal="true" aria-labelledby="rain-result-title" tabindex="-1"><span class="rain-result-icon" aria-hidden="true">❄</span><p>A LITTLE SNOW BREAK!</p><h2 id="rain-result-title">앗, 눈을 맞았어!</h2><div class="rain-result-description">모자에 눈이 소복! 다시 눈놀이할까?</div><div class="rain-result-stats"><div><strong id="rain-final-typed">0</strong><span>완성한 단어</span></div><div><strong id="rain-final-dodged">0</strong><span>쌓인 눈 단어</span></div><div><strong id="rain-final-time">0</strong><span>눈놀이 시간 (초)</span></div></div><button type="button" id="rain-restart">다시 눈놀이하기 <span>↗</span></button><small>다음에는 어떤 단어가 내릴까?</small></div></div>
      <span class="sr-only" id="rain-status" role="status" aria-live="polite"></span>
    </section>`

  const root = container.querySelector<HTMLElement>('.rain-scene')!
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!
  const ctx = canvas.getContext('2d')!
  const game = new TypingRain(root.clientWidth, root.clientHeight)
  const challenge = new SnowWordChallenge()
  const controller = new AbortController()
  const options = { signal: controller.signal }
  const find = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!
  const typed = find('#rain-typed'), dodged = find('#rain-dodged'), time = find('#rain-time')
  const modal = find('.rain-gameover'), dialog = find('.rain-result'), restart = find<HTMLButtonElement>('#rain-restart')
  const status = find('#rain-status'), caption = find('.rain-runner-caption'), pause = find('.rain-pause')
  const input = find<HTMLInputElement>('#rain-word-input'), preview = find('#rain-input-preview')
  const wordDisplay = find('#rain-target-word'), jamoDisplay = find('#rain-jamo'), language = find('#rain-language')
  const sprites = new Map<Letter, HTMLCanvasElement>()
  let frame = 0, previous = 0, accumulator = 0, clock = 0, paused = document.hidden || !document.hasFocus()
  let lastHud = '', stopped = false, lastState = game.state, composing = false, committing = false

  function resize() {
    game.resize(root.clientWidth, root.clientHeight)
    const dpr = Math.min(devicePixelRatio || 1, 2)
    canvas.width = Math.round(game.width * dpr); canvas.height = Math.round(game.height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    sprites.clear()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(root); resize()
  void document.fonts.ready.then(() => { if (!stopped) sprites.clear() })

  function showWord() {
    const matched = challenge.matched
    let offset = 0
    wordDisplay.replaceChildren(...[...challenge.word].map(char => {
      const span = document.createElement('span'), count = wordUnits(char).length
      span.className = 'rain-word-letter'; span.textContent = char; span.dataset.letter = char
      span.style.setProperty('--typed', `${Math.max(0, Math.min(1, (matched - offset) / count)) * 100}%`)
      offset += count
      return span
    }))
    wordDisplay.setAttribute('aria-label', `입력할 단어: ${challenge.word}`)
    jamoDisplay.replaceChildren(...challenge.units.map((unit, i) => {
      const span = document.createElement('span'); span.textContent = unit
      span.className = i < matched ? 'is-typed' : i === matched ? 'is-next' : ''
      return span
    }))
    language.textContent = challenge.korean ? 'KOREAN WORD / 한글 단어' : 'ENGLISH WORD / 영어 단어'
    find('#rain-input-language').textContent = challenge.korean ? '한글' : 'EN'
    find('#rain-input-target').textContent = challenge.word
    input.placeholder = challenge.word
    input.lang = challenge.korean ? 'ko' : 'en'
    preview.textContent = challenge.input || (challenge.korean ? '여기에 한글 단어를 입력하세요' : '여기에 영어 단어를 입력하세요')
    preview.classList.toggle('is-placeholder', !challenge.input)
    root.classList.toggle('rain-input-error', challenge.invalid)
    find('#rain-word-progress').textContent = `${matched} / ${challenge.units.length}`
    find('#rain-word-guide').textContent = challenge.invalid ? '다음 자음·모음이나 알파벳을 확인해 주세요' : '보이는 단어를 완성하면 눈이 내려요 · Enter 없이'
  }

  function receiveInput() {
    if (committing || game.state === 'over') return
    const completed = challenge.accept(input.value)
    if (completed) {
      game.dropWord(completed)
      // Commit the final Korean syllable now, so its final consonant cannot move
      // into the next word. Ignore synchronous compositionend/input callbacks.
      committing = true
      input.value = ''
      if (composing) { input.blur(); input.value = ''; composing = false; input.focus({ preventScroll: true }) }
      committing = false
      root.dataset.rainState = game.state
      status.textContent = `${completed} 눈이 내려요. 다음 단어: ${challenge.word}`
    } else {
      if (!composing && challenge.invalid) input.value = challenge.input
      if (challenge.input && game.state === 'ready') { game.state = 'playing'; root.dataset.rainState = 'playing' }
    }
    showWord()
  }
  input.addEventListener('input', receiveInput, options)
  input.addEventListener('compositionstart', () => { composing = true }, options)
  input.addEventListener('compositionend', () => { composing = false; receiveInput() }, options)
  input.addEventListener('paste', event => { event.preventDefault() }, options)
  input.addEventListener('drop', event => { event.preventDefault() }, options)
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) event.preventDefault()
  }, options)
  root.addEventListener('pointerdown', event => {
    if (!(event.target as HTMLElement).closest('button, input') && game.state !== 'over') input.focus({ preventScroll: true })
  }, options)
  window.addEventListener('keydown', event => {
    if (game.state === 'over' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.repeat) return
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
    if (event.key === 'Process' || event.key === 'Unidentified') { input.focus({ preventScroll: true }); return }
    if (/^[a-zㄱ-ㅎㅏ-ㅣ가-힣]$/i.test(event.key)) {
      event.preventDefault(); input.focus({ preventScroll: true }); input.value += event.key; receiveInput()
    }
  }, options)

  function reset() {
    committing = true; input.blur(); composing = false; input.value = ''; committing = false
    game.restart(); challenge.restart(); sprites.clear()
    root.dataset.rainState = 'ready'; modal.hidden = true; input.disabled = false
    find<HTMLButtonElement>('#rain-reset').inert = false
    accumulator = 0; lastState = 'ready'; showWord()
    status.textContent = `새 눈놀이입니다. 입력할 단어: ${challenge.word}`
    input.focus({ preventScroll: true })
  }
  restart.addEventListener('click', reset, options)
  find('#rain-reset').addEventListener('click', reset, options)
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Tab') { event.preventDefault(); restart.focus() }
  }, options)
  const updatePause = () => {
    paused = document.hidden || !document.hasFocus(); previous = 0; accumulator = 0
    pause.hidden = !paused || game.state !== 'playing'
  }
  window.addEventListener('blur', updatePause, options)
  window.addEventListener('focus', updatePause, options)
  document.addEventListener('visibilitychange', updatePause, options)

  function endGame() {
    root.dataset.rainState = 'over'; modal.hidden = false; input.disabled = true
    find('#rain-final-typed').textContent = String(game.typed)
    find('#rain-final-dodged').textContent = String(game.dodged)
    find('#rain-final-time').textContent = game.elapsed.toFixed(1)
    find<HTMLButtonElement>('#rain-reset').inert = true
    status.textContent = `눈 단어에 맞았습니다! ${game.typed}개 완성, ${game.dodged}개 쌓임. 다시 눈놀이할 수 있습니다.`
    restart.focus({ preventScroll: true })
  }

  function path(points: number[], color: string, width: number) {
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.moveTo(points[0]!, points[1]!)
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i]!, points[i + 1]!)
    ctx.stroke()
  }
  function ellipse(x: number, y: number, rx: number, ry: number, color: string) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
  }
  function roundedRect(x: number, y: number, width: number, height: number, radius: number, color: string) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill()
  }

  function drawChild() {
    const speed = Math.abs(game.vx) / 190, step = Math.sin(clock * 12) * speed
    const ground = game.groundAt(game.x)
    let nearest: Letter | undefined, distance = Infinity
    for (const letter of game.letters) {
      if (letter.landed) continue
      const d = Math.hypot(letter.x - game.x, letter.y - ground + 70)
      if (d < distance) { nearest = letter; distance = d }
    }
    const lookX = nearest ? Math.max(-3, Math.min(3, (nearest.x - game.x) * .025)) : Math.sin(clock * .8)
    ctx.save(); ctx.translate(game.x, ground)
    ellipse(0, 3, 25 + speed * 4, 4, '#547a9040')
    ctx.rotate(game.vx * .00045)
    // Short snow-pants, oversize boots and a round head give preschool proportions.
    path([-8, -28, -9 + step * 7, -15, -10 - step * 8, -5], '#647f99', 10)
    path([8, -28, 9 - step * 7, -15, 10 + step * 8, -5], '#738fa7', 10)
    roundedRect(-20 - step * 8, -9, 18, 11, 4, '#e7b06d')
    roundedRect(2 + step * 8, -9, 18, 11, 4, '#e7b06d')
    path([-18 - step * 8, 1, -3 - step * 8, 1], '#fff5df', 3)
    path([4 + step * 8, 1, 18 + step * 8, 1], '#fff5df', 3)
    ctx.translate(0, -Math.abs(step) * 2)
    path([-13, -43, -22 - step * 5, -32, -25 - step * 4, -39], '#da917e', 10)
    path([13, -43, 22 + step * 5, -32, 25 + step * 4, -40], '#e9a18c', 10)
    ellipse(-26 - step * 4, -41, 6, 7, '#edc78b'); ellipse(26 + step * 4, -42, 6, 7, '#edc78b')
    ellipse(-21 - step * 4, -39, 3, 3, '#edc78b'); ellipse(21 + step * 4, -40, 3, 3, '#edc78b')
    roundedRect(-18, -54, 36, 33, 11, '#e9a18c')
    path([-14, -42, 14, -42], '#f3bca0', 1.5); path([-15, -32, 15, -32], '#d98f7f', 1.5)
    path([1, -50, 1, -24], '#f7d0b3', 2)
    ellipse(4, -37, 1.5, 1.5, '#fff3d7')
    // A long knitted scarf flutters behind the child.
    ctx.save(); ctx.translate(-7, -53); ctx.rotate(-.3 + step * .14)
    roundedRect(-19, 0, 11, 24, 3, '#b5d0bf')
    path([-18, 19, -10, 19], '#e4eddb', 2); ctx.restore()
    ctx.save(); ctx.translate(lookX * .35, -71); ctx.rotate(lookX * .035)
    ellipse(0, 0, 23, 22, '#f9dbc0')
    ellipse(-22, 1, 4, 6, '#f2cab0'); ellipse(22, 1, 4, 6, '#f2cab0')
    // Soft hair peeking out of the wool hat.
    path([-17, -9, -11, -14, -4, -10, 3, -14, 12, -9, 18, -8], '#705448', 5)
    ellipse(-11, 7, 5, 3, '#edafa399'); ellipse(12, 7, 5, 3, '#edafa399')
    if (game.state === 'over') {
      for (const x of [-7, 8]) { path([x - 3, -3, x + 3, 2], '#614b42', 1.8); path([x + 3, -3, x - 3, 2], '#614b42', 1.8) }
    } else {
      for (const x of [-7, 8]) {
        ellipse(x, -1, 4.5, 5.8, '#fffaf0'); ellipse(x + lookX * .45, -3, 2.5, 3.4, '#53463e'); ellipse(x + lookX * .45 + .8, -4.3, .85, 1, '#fff')
      }
      path([-12, -10, -5, -11], '#8a6550', 1.3); path([5, -11, 12, -10], '#8a6550', 1.3)
    }
    ctx.beginPath(); ctx.strokeStyle = '#ac7569'; ctx.lineWidth = 1.8; ctx.arc(1, 7, 4, .1, Math.PI - .1); ctx.stroke()
    // Rounded ribbed beanie, cuff, ear flaps and fluffy pom-pom.
    ctx.beginPath(); ctx.ellipse(0, -14, 24, 19, 0, Math.PI, Math.PI * 2); ctx.lineTo(24, -10); ctx.lineTo(-24, -10); ctx.fillStyle = '#a9c8b8'; ctx.fill()
    for (let x = -17; x <= 18; x += 6) path([x, -25 + Math.abs(x) * .3, x, -12], '#c2dccb', 1.5)
    roundedRect(-25, -14, 50, 9, 4, '#d8e6d2')
    roundedRect(-24, -7, 6, 12, 3, '#b9d4c2'); roundedRect(18, -7, 6, 12, 3, '#b9d4c2')
    for (let i = 0; i < 8; i++) ellipse(Math.cos(i * Math.PI / 4) * 5, -35 + Math.sin(i * Math.PI / 4) * 5, 4, 4, '#f5f7e9')
    ellipse(0, -35, 6, 6, '#fffdf1')
    ctx.restore()
    roundedRect(-18, -55, 36, 8, 4, '#c4dbca')
    path([-13, -51, 12, -51], '#edf2db', 1.5)
    ctx.restore()
  }

  function snowSprite(letter: Letter): HTMLCanvasElement {
    const cached = sprites.get(letter)
    if (cached) return cached
    const sprite = document.createElement('canvas'), pad = 12
    const w = letter.width + pad * 2, h = letter.size * 1.25 + pad * 2
    sprite.width = Math.ceil(w * 2); sprite.height = Math.ceil(h * 2)
    const paint = sprite.getContext('2d')!
    paint.scale(2, 2); paint.translate(w / 2, h / 2)
    paint.font = `900 ${letter.size}px "Noto Sans KR", sans-serif`
    paint.textAlign = 'center'; paint.textBaseline = 'middle'; paint.lineJoin = 'round'
    const measured = paint.measureText(letter.char).width
    paint.scale((letter.width - 5) / Math.max(1, measured), 1)
    paint.lineWidth = 6; paint.strokeStyle = '#90b9ce'; paint.strokeText(letter.char, 0, 2)
    paint.lineWidth = 4; paint.strokeStyle = '#f7fcff'; paint.strokeText(letter.char, 0, -1)
    const gradient = paint.createLinearGradient(0, -letter.size / 2, 0, letter.size / 2)
    gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.48, '#f7fdff'); gradient.addColorStop(1, '#c1deee')
    paint.fillStyle = gradient; paint.fillText(letter.char, 0, 0)
    // Grain is clipped to the glyph mask, making the letters look packed from snow.
    paint.globalCompositeOperation = 'source-atop'
    for (let i = 0; i < letter.width * 3; i++) {
      const x = Math.sin(i * 127.1 + 1) * letter.width / 2, y = Math.sin(i * 311.7 + 4) * letter.size / 2
      paint.beginPath(); paint.arc(x, y, .4 + (i % 5) * .18, 0, Math.PI * 2)
      paint.fillStyle = i % 3 ? '#ffffffa0' : '#8fb7cf55'; paint.fill()
    }
    paint.globalCompositeOperation = 'source-over'
    // Sample the transparent glyph silhouette, so tilted words settle on their
    // own snow edges rather than on an invisible rectangular bounding box.
    const pixels = paint.getImageData?.(0, 0, sprite.width, sprite.height)
    if (pixels?.data) {
      const shape = [], stride = 6
      const alpha = (x: number, y: number) => x < 0 || y < 0 || x >= sprite.width || y >= sprite.height ? 0 : pixels.data[(y * sprite.width + x) * 4 + 3]!
      for (let y = stride; y < sprite.height - stride; y += stride) {
        for (let x = stride; x < sprite.width - stride; x += stride) {
          if (alpha(x, y) < 96) continue
          if (alpha(x - stride, y) >= 96 && alpha(x + stride, y) >= 96 && alpha(x, y - stride) >= 96 && alpha(x, y + stride) >= 96) continue
          shape.push({ x: x / 2 - sprite.width / 4, y: y / 2 - sprite.height / 4, radius: 2 })
        }
      }
      if (shape.length) letter.shape = shape
    }
    sprites.set(letter, sprite)
    return sprite
  }

  function render() {
    const { width: w, height: h, floor } = game
    ctx.clearRect(0, 0, w, h)
    // Sparse powder flakes are scenery; only completed words are game hazards.
    for (let i = 0; i < 48; i++) {
      const x = ((i * 137.31 + Math.sin(clock * .28 + i) * 18) % w + w) % w
      const y = (i * 83.73 + clock * (8 + i % 9)) % (floor + 20)
      ellipse(x, y, .7 + i % 3 * .45, .7 + i % 3 * .45, '#e3f3ff45')
    }
    // The base stays low and flat. The accumulated pile consists exclusively
    // of the transparent snow-word sprites drawn below, with no filled blocks.
    ctx.beginPath(); ctx.moveTo(0, h)
    for (let x = 0; x <= w + 8; x += 8) {
      const base = floor + 6 + Math.sin(x * .014) * 3
      ctx.lineTo(x, base)
    }
    ctx.lineTo(w, h); ctx.closePath()
    const snowGradient = ctx.createLinearGradient(0, floor - 50, 0, h)
    snowGradient.addColorStop(0, '#e6f4fb'); snowGradient.addColorStop(1, '#bfd8e8')
    ctx.fillStyle = snowGradient; ctx.fill()
    ctx.strokeStyle = '#f5fcff'; ctx.lineWidth = 2; ctx.stroke()
    for (const letter of game.letters) {
      const sprite = snowSprite(letter)
      ctx.save(); ctx.translate(letter.x, letter.y); ctx.rotate(letter.angle)
      ctx.drawImage(sprite, -sprite.width / 4, -sprite.height / 4, sprite.width / 2, sprite.height / 2)
      ctx.restore()
    }
    drawChild()
    caption.style.top = `${Math.max(120, game.groundAt(game.x) - 145)}px`
    caption.style.left = `${Math.max(105, Math.min(w - 105, game.x))}px`
    caption.textContent = game.state === 'ready' ? '첫눈을 기다리고 있어!' : Math.abs(game.vx) > 80 ? '우와! 눈이다, 피해라!' : game.dodged ? '눈이 소복소복 쌓였네!' : '어떤 눈 단어가 내릴까?'
  }
  function animate(now: number) {
    if (stopped) return
    if (document.hidden) { previous = 0; frame = requestAnimationFrame(animate); return }
    const dt = previous ? Math.min((now - previous) / 1000, .05) : 0
    previous = now
    if (!paused) {
      clock += dt; accumulator += dt
      while (accumulator >= 1 / 120) { game.update(1 / 120); accumulator -= 1 / 120 }
    }
    if (game.state === 'over' && lastState !== 'over') endGame()
    lastState = game.state
    const hud = `${game.typed}:${game.dodged}:${game.elapsed.toFixed(1)}`
    if (hud !== lastHud) {
      typed.textContent = String(game.typed).padStart(3, '0'); dodged.textContent = String(game.dodged).padStart(3, '0')
      time.innerHTML = `${game.elapsed.toFixed(1)}<em>s</em>`; lastHud = hud
    }
    render(); frame = requestAnimationFrame(animate)
  }
  showWord(); status.textContent = `중앙의 단어를 입력하세요: ${challenge.word}`
  input.focus({ preventScroll: true })
  frame = requestAnimationFrame(animate)
  return () => { stopped = true; cancelAnimationFrame(frame); controller.abort(); observer.disconnect(); sprites.clear() }
}
