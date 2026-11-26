import { calculateShot, danceAt, flightAt, TEE, type GolfPoint, type GolfShot } from './golf-model.ts'
import type { GolfSound } from './golf-audio.ts'
import { golfReaction } from './golf-reactions.ts'

type Phase = 'ready' | 'charging' | 'starting' | 'flight' | 'result'
type Drag = { id: number; start: GolfPoint; last: GolfPoint }
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
const RESULTS = {
  hole: ['HOLE IN ONE!', '홀인원! 오늘 리듬 제대로 탔네요.'], good: ['GOOD SHOT!', '나이스 샷! 그린에 안착했어요.'],
  fairway: ['FAIRWAY!', '페어웨이 안착! 다음엔 깃발을 노려봐요.'], bunker: ['BUNKER', '앗, 벙커! 방향을 살짝 바꿔봐요.'],
  water: ['WATER HAZARD', '풍덩… 연못에 빠졌어요.'], rough: ['ROUGH', '러프에 안착. 박자와 방향을 다시 맞춰봐요.'], ob: ['OB!', '장외입니다! 파워나 방향을 줄여봐요.'],
} as const

function crossesBall(start: GolfPoint, end: GolfPoint, center: GolfPoint, radius: number) {
  const dx = end.x - start.x, dy = end.y - start.y
  const t = clamp(((center.x - start.x) * dx + (center.y - start.y) * dy) / Math.max(1, dx * dx + dy * dy), 0, 1)
  return Math.hypot(start.x + dx * t - center.x, start.y + dy * t - center.y) <= radius
}

export class RhythmGolf {
  private readonly root: HTMLElement
  private readonly audio: GolfSound
  private readonly events = new AbortController()
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  private readonly parts: Record<string, HTMLElement>
  private readonly aimLine: SVGLineElement
  private readonly ball: HTMLButtonElement
  private phase: Phase = 'ready'
  private drag: Drag | null = null
  private width = 1
  private height = 1
  private size = 120
  private position: GolfPoint = { x: 0, y: 0 }
  private pointer: GolfPoint | null = null
  private pointerTime = 0
  private power = .64
  private aim = 0
  private wind = .25
  private shot: GolfShot | null = null
  private flightStart: GolfPoint = { x: 0, y: 0 }
  private hitAt = -Infinity
  private resultAt = 0
  private resultHold = 1800
  private voiceUntil = 0
  private score = 0
  private shots = 0
  private combo = 0
  private frame = 0
  private disposed = false

  constructor(root: HTMLElement, audio: GolfSound) {
    this.root = root
    this.audio = audio
    const ids = ['golf-shadow', 'golf-music', 'golf-message', 'golf-result', 'golf-result-title', 'golf-result-detail', 'golf-feedback', 'golf-score', 'golf-shots', 'golf-combo', 'golf-distance', 'golf-voice', 'golf-driver', 'golf-beat-cursor', 'golf-power-value', 'golf-aim-value', 'golf-wind', 'golf-next']
    this.parts = Object.fromEntries(ids.map(id => [id, root.querySelector<HTMLElement>(`#${id}`)!]))
    this.ball = root.querySelector<HTMLButtonElement>('#golf-ball')!
    this.aimLine = root.querySelector<SVGLineElement>('#golf-aim-line')!
    const options = { signal: this.events.signal }
    this.ball.addEventListener('pointerdown', this.pointerDown, options)
    this.ball.addEventListener('pointermove', this.dragMove, options)
    this.ball.addEventListener('pointerup', this.pointerUp, options)
    this.ball.addEventListener('pointercancel', this.cancelDrag, options)
    this.ball.addEventListener('lostpointercapture', this.cancelDrag, options)
    this.ball.addEventListener('keydown', this.keyDown, options)
    root.addEventListener('pointermove', this.pointerMove, options)
    root.addEventListener('pointerleave', this.pointerLeave, options)
    root.querySelector<HTMLInputElement>('#golf-power')!.addEventListener('input', event => {
      this.power = Number((event.target as HTMLInputElement).value)
      this.updateAim()
    }, options)
    root.querySelector<HTMLInputElement>('#golf-aim')!.addEventListener('input', event => {
      this.aim = Number((event.target as HTMLInputElement).value)
      this.updateAim()
    }, options)
    this.parts['golf-music']!.addEventListener('click', () => {
      if (this.audio.isPlaying) { this.audio.pause(); this.updateMusic() }
      else void this.startMusic()
    }, options)
    this.parts['golf-next']!.addEventListener('click', this.teeUp, options)
    window.addEventListener('resize', this.resize, options)
    window.addEventListener('blur', this.cancelDrag, options)
    document.addEventListener('visibilitychange', this.visibilityChange, options)
    this.resize()
    this.updateAim()
    this.frame = requestAnimationFrame(this.animate)
  }

  private resize = () => {
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.size = Math.max(72, Math.min(145, this.width * .25, this.height * .18))
    this.ball.style.width = `${this.size}px`
    this.ball.style.height = `${this.size}px`
    this.cancelDrag()
  }

  private async startMusic() {
    const success = await this.audio.start()
    if (this.disposed) return false
    this.updateMusic()
    if (!success) this.parts['golf-message']!.textContent = '비트 재생을 눌러 음악을 다시 켜주세요.'
    return success
  }

  private updateMusic() {
    const button = this.parts['golf-music']!
    button.setAttribute('aria-pressed', String(this.audio.isPlaying))
    button.textContent = this.audio.isPlaying ? 'Ⅱ 비트 쉬기' : '▶ 비트 켜기'
    this.root.classList.toggle('is-playing', this.audio.isPlaying)
  }

  private pointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || this.phase !== 'ready') return
    event.preventDefault()
    this.ball.focus({ preventScroll: true })
    this.ball.setPointerCapture(event.pointerId)
    this.drag = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, last: { x: event.clientX, y: event.clientY } }
    this.phase = 'charging'
    void this.startMusic()
  }

  private dragMove = (event: PointerEvent) => {
    if (!this.drag || event.pointerId !== this.drag.id) return
    this.drag.last = { x: event.clientX, y: event.clientY }
  }

  private pointerUp = (event: PointerEvent) => {
    if (!this.drag || event.pointerId !== this.drag.id) return
    this.drag.last = { x: event.clientX, y: event.clientY }
    const input = this.dragInput()
    this.drag = null
    if (this.ball.hasPointerCapture(event.pointerId)) this.ball.releasePointerCapture(event.pointerId)
    this.launch(input.power, input.aim)
  }

  private dragInput() {
    if (!this.drag) return { power: this.power, aim: this.aim }
    const dx = this.drag.start.x - this.drag.last.x
    const dy = this.drag.start.y - this.drag.last.y
    const length = Math.hypot(dx, dy)
    return length < 8 ? { power: this.power, aim: this.aim } : { power: clamp(.2 + length / 210, .1, 1), aim: clamp(dx / Math.max(100, this.width * .16), -1, 1) }
  }

  private cancelDrag = () => {
    const id = this.drag?.id
    this.drag = null
    if (this.phase === 'charging') this.phase = 'ready'
    if (id !== undefined && this.ball.hasPointerCapture(id)) this.ball.releasePointerCapture(id)
  }

  private pointerMove = (event: PointerEvent) => {
    const point = { x: event.clientX, y: event.clientY }
    const now = performance.now()
    const isControl = !!(event.target as Element).closest('[data-golf-control]')
    this.parts['golf-driver']!.classList.toggle('is-visible', event.pointerType === 'mouse' && !isControl)
    this.parts['golf-driver']!.style.left = `${point.x}px`
    this.parts['golf-driver']!.style.top = `${point.y}px`
    if (!isControl && this.pointer && event.pointerType === 'mouse' && this.phase === 'ready' && this.audio.isPlaying) {
      const speed = Math.hypot(point.x - this.pointer.x, point.y - this.pointer.y) / Math.max(8, now - this.pointerTime) * 1000
      if (speed > 950 && crossesBall(this.pointer, point, this.position, this.size * .38)) {
        this.launch(clamp(.45 + speed / 7000, .1, 1), this.aim)
      }
    }
    this.pointer = point
    this.pointerTime = now
  }

  private pointerLeave = () => { this.pointer = null; this.parts['golf-driver']!.classList.remove('is-visible') }

  private keyDown = (event: KeyboardEvent) => {
    if (event.code !== 'Space' && event.code !== 'Enter') return
    event.preventDefault()
    if (!event.repeat && this.phase === 'ready') this.launch(this.power, this.aim)
  }

  private launch(power: number, aim: number) {
    if (this.phase !== 'ready' && this.phase !== 'charging') return
    this.phase = 'starting'
    const perform = () => {
      if (this.disposed || this.phase !== 'starting') return
      this.updateMusic()
      this.shot = calculateShot({ power, aim, beat: this.audio.beat(), wind: this.wind })
      this.flightStart = { ...this.position }
      this.hitAt = performance.now()
      this.phase = 'flight'
      this.shots++
      this.audio.hit()
      this.parts['golf-feedback']!.textContent = this.shot.timing === 'perfect' ? 'PERFECT BEAT!' : this.shot.timing === 'good' ? 'ON THE BEAT' : '박자를 조금 더 맞춰봐요'
      this.parts['golf-shots']!.textContent = String(this.shots).padStart(2, '0')
      this.voiceUntil = 0
      this.parts['golf-message']!.textContent = '공이 날아갑니다!'
    }
    if (this.audio.isPlaying) perform()
    else void this.startMusic().then(success => { if (success) perform(); else if (!this.disposed) this.phase = 'ready' })
  }

  private land(now: number) {
    const shot = this.shot!
    this.phase = 'result'
    this.resultAt = now
    const reaction = golfReaction(shot.outcome)
    this.resultHold = reaction?.displayMs ?? 1800
    this.voiceUntil = reaction ? now + reaction.displayMs : 0
    if (reaction) {
      this.audio.result(shot.outcome)
      this.parts['golf-voice']!.textContent = reaction.text
      this.parts['golf-voice']!.style.left = `${clamp(this.position.x + 10, 16, this.width - 180)}px`
      this.parts['golf-voice']!.style.top = `${clamp(this.position.y - 70, 110, this.height - 110)}px`
    }
    this.score += shot.points
    this.combo = shot.timing === 'perfect' && shot.points > 0 ? this.combo + 1 : 0
    this.parts['golf-score']!.textContent = String(this.score)
    this.parts['golf-combo']!.textContent = `${this.combo}×`
    this.parts['golf-distance']!.textContent = `${shot.distance}m`
    this.parts['golf-result-title']!.textContent = RESULTS[shot.outcome][0]
    this.parts['golf-result-detail']!.textContent = `${shot.distance}m · ${shot.points > 0 ? '+' : ''}${shot.points} POINTS`
    this.parts['golf-result']!.setAttribute('data-outcome', shot.outcome)
    this.parts['golf-message']!.textContent = `${RESULTS[shot.outcome][1]}${reaction ? ` ${reaction.text}` : ''}`
  }

  private teeUp = () => {
    if (this.phase === 'flight' || this.phase === 'starting') return
    this.cancelDrag()
    this.phase = 'ready'
    this.shot = null
    this.voiceUntil = 0
    this.updateAim()
    this.wind = Math.random() * .8 - .4
    this.parts['golf-wind']!.textContent = `${this.wind >= 0 ? '↗' : '↖'} ${Math.abs(this.wind * 8).toFixed(1)}m/s`
    this.parts['golf-message']!.textContent = '초록선에 박자가 닿을 때 공을 툭!'
  }

  private updateAim() {
    this.parts['golf-power-value']!.textContent = `${Math.round(this.power * 100)}%`
    this.parts['golf-aim-value']!.textContent = Math.abs(this.aim) < .03 ? 'CENTER' : `${this.aim < 0 ? 'L' : 'R'} ${Math.round(Math.abs(this.aim) * 35)}°`
  }

  private animate = (now: number) => {
    const beat = this.audio.beat()
    const dancing = this.audio.isPlaying ? danceAt(beat) : { hop: 0, sway: 0, rotation: 0, scaleX: 1, scaleY: 1 }
    let rotation = dancing.rotation, scale = 1, scaleX = dancing.scaleX, scaleY = dancing.scaleY
    let ground: GolfPoint = { x: TEE.x * this.width, y: TEE.y * this.height }
    if ((this.phase === 'flight' || this.phase === 'result') && this.shot) {
      const t = clamp((now - this.hitAt) / 1850, 0, 1)
      const end = { x: this.shot.landing.x * this.width, y: this.shot.landing.y * this.height - this.size * .09 }
      const flight = flightAt(this.flightStart, end, t, this.height * .29)
      this.position = { x: flight.x, y: flight.y }
      rotation = flight.rotation
      scale = flight.scale
      scaleX = 1; scaleY = 1
      ground = { x: TEE.x * this.width + (this.shot.landing.x - TEE.x) * this.width * t, y: TEE.y * this.height + (this.shot.landing.y - TEE.y) * this.height * t }
      if (t >= 1 && this.phase === 'flight') this.land(now)
      if (this.phase === 'result' && now - this.resultAt > this.resultHold) this.teeUp()
    } else {
      const amplitude = this.reducedMotion.matches ? .25 : 1
      this.position = { x: ground.x + dancing.sway * 22 * amplitude, y: ground.y - this.size / 2 - dancing.hop * 58 * amplitude }
    }
    this.ball.style.left = `${this.position.x}px`
    this.ball.style.top = `${this.position.y}px`
    this.ball.style.transform = `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale * scaleX}, ${scale * scaleY})`
    const shadow = this.parts['golf-shadow']!
    shadow.style.left = `${ground.x}px`
    shadow.style.top = `${ground.y}px`
    shadow.style.transform = `translate(-50%, -50%) scale(${scale * (.85 - dancing.hop * .12)})`
    shadow.style.opacity = this.phase === 'flight' ? '.25' : '.4'
    const input = this.dragInput()
    const predicted = calculateShot({ ...input, beat, wind: this.wind }).landing
    this.aimLine.setAttribute('x1', String(this.position.x))
    this.aimLine.setAttribute('y1', String(this.position.y))
    this.aimLine.setAttribute('x2', String(predicted.x * this.width))
    this.aimLine.setAttribute('y2', String(predicted.y * this.height))
    if (this.phase === 'charging') {
      this.parts['golf-power-value']!.textContent = `${Math.round(input.power * 100)}%`
      this.parts['golf-aim-value']!.textContent = Math.abs(input.aim) < .03 ? 'CENTER' : `${input.aim < 0 ? 'L' : 'R'} ${Math.round(Math.abs(input.aim) * 35)}°`
    }
    this.parts['golf-beat-cursor']!.style.left = `${50 + Math.sin(beat * Math.PI) * 43}%`
    this.parts['golf-voice']!.classList.toggle('is-visible', now < this.voiceUntil)
    this.parts['golf-driver']!.classList.toggle('is-swinging', now - this.hitAt < 320)
    this.parts['golf-next']!.setAttribute('aria-disabled', String(this.phase === 'flight' || this.phase === 'starting'))
    this.root.style.setProperty('--beat-pulse', String(this.audio.isPlaying ? Math.exp(-(beat % 1) * 12) : 0))
    this.root.setAttribute('data-golf-state', this.phase)
    this.frame = requestAnimationFrame(this.animate)
  }

  private visibilityChange = () => {
    cancelAnimationFrame(this.frame)
    this.cancelDrag()
    if (document.hidden) { this.audio.pause(); this.updateMusic() }
    else this.frame = requestAnimationFrame(this.animate)
  }

  destroy() {
    this.disposed = true
    this.cancelDrag()
    this.events.abort()
    cancelAnimationFrame(this.frame)
  }
}
