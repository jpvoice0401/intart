type Point = { x: number; y: number }
type Gesture = { started: number; points: Point[]; last: Point; distance: number }
type Particle = Point & { vx: number; vy: number; age: number; life: number; hue: number; size: number; gravity: number; trail: Point[]; sparkle: boolean }
type Burst = Point & { age: number; hue: number; size: number }
type ScheduledBurst = Point & { at: number; power: number }
type Shape = 'peony' | 'ring' | 'heart' | 'star' | 'willow' | 'spiral'

const TAU = Math.PI * 2
const SHAPES: Shape[] = ['peony', 'ring', 'heart', 'star', 'willow', 'spiral']
const random = (min: number, max: number) => min + Math.random() * (max - min)
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** Sample by travelled distance, so slow and fast drags both produce continuous chains. */
export function samplePath(points: Point[], spacing = 52): Point[] {
  if (points.length === 0) return []
  const result: Point[] = [{ ...points[0]! }]
  let carry = 0
  for (let i = 1; i < points.length; i++) {
    let start = points[i - 1]!
    const end = points[i]!
    let remaining = distance(start, end)
    while (carry + remaining >= spacing && remaining > 0) {
      const fraction = (spacing - carry) / remaining
      start = { x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction }
      result.push(start)
      remaining = distance(start, end)
      carry = 0
    }
    carry += remaining
  }
  const end = points[points.length - 1]!
  if (distance(result[result.length - 1]!, end) > 8) result.push({ ...end })
  return result
}

export class Fireworks {
  private readonly context: CanvasRenderingContext2D
  private particles: Particle[] = []
  private flashes: Burst[] = []
  private scheduled: ScheduledBurst[] = []
  private gestures = new Map<number, Gesture>()
  private width = 0
  private height = 0
  private frame = 0
  private previous = 0
  private count = 0
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  private readonly controller = new AbortController()
  private readonly canvas: HTMLCanvasElement
  private readonly hint: HTMLElement
  private readonly counter: HTMLElement

  constructor(canvas: HTMLCanvasElement, hint: HTMLElement, counter: HTMLElement) {
    this.canvas = canvas
    this.hint = hint
    this.counter = counter
    this.context = canvas.getContext('2d')!
    const options = { signal: this.controller.signal }
    canvas.addEventListener('pointerdown', this.pointerDown, options)
    canvas.addEventListener('pointermove', this.pointerMove, options)
    canvas.addEventListener('pointerup', this.pointerUp, options)
    canvas.addEventListener('pointercancel', this.pointerCancel, options)
    canvas.addEventListener('lostpointercapture', this.pointerCancel, options)
    canvas.addEventListener('contextmenu', event => event.preventDefault(), options)
    canvas.addEventListener('keydown', this.keyDown, options)
    canvas.addEventListener('keyup', this.keyUp, options)
    canvas.addEventListener('blur', this.cancelGestures, options)
    window.addEventListener('blur', this.cancelGestures, options)
    window.addEventListener('resize', this.resize, options)
    document.addEventListener('visibilitychange', this.visibilityChange, options)
    this.resize()
    this.frame = requestAnimationFrame(this.tick)
  }

  private resize = () => {
    this.width = window.innerWidth
    this.height = window.innerHeight
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.round(this.width * ratio)
    this.canvas.height = Math.round(this.height * ratio)
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0)
    this.cancelGestures()
  }

  private pointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    this.canvas.focus({ preventScroll: true })
    this.canvas.setPointerCapture(event.pointerId)
    const point = { x: event.clientX, y: event.clientY }
    this.gestures.set(event.pointerId, { started: performance.now(), points: [point], last: point, distance: 0 })
  }

  private recordPoint(gesture: Gesture, point: Point) {
    const travelled = distance(gesture.last, point)
    if (travelled < 2) return
    gesture.distance += travelled
    gesture.last = point
    gesture.points.push(point)
    if (gesture.points.length > 1600) {
      gesture.points = gesture.points.filter((_, index, points) => index % 2 === 0 || index === points.length - 1)
    }
  }

  private pointerMove = (event: PointerEvent) => {
    const gesture = this.gestures.get(event.pointerId)
    if (!gesture) return
    const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : []
    for (const point of events.length ? events : [event]) this.recordPoint(gesture, { x: point.clientX, y: point.clientY })
  }

  private pointerUp = (event: PointerEvent) => {
    const gesture = this.gestures.get(event.pointerId)
    if (!gesture) return
    this.recordPoint(gesture, { x: event.clientX, y: event.clientY })
    this.release(gesture)
    this.gestures.delete(event.pointerId)
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId)
    this.hint.classList.remove('visible')
  }

  private pointerCancel = (event: PointerEvent) => {
    this.gestures.delete(event.pointerId)
    this.hint.classList.remove('visible')
  }

  private keyDown = (event: KeyboardEvent) => {
    if (event.code !== 'Space' && event.code !== 'Enter') return
    event.preventDefault()
    if (event.repeat || this.gestures.has(-1)) return
    const point = { x: random(this.width * 0.25, this.width * 0.75), y: random(this.height * 0.25, this.height * 0.6) }
    this.gestures.set(-1, { started: performance.now(), points: [point], last: point, distance: 0 })
  }

  private keyUp = (event: KeyboardEvent) => {
    if (event.code !== 'Space' && event.code !== 'Enter') return
    event.preventDefault()
    const gesture = this.gestures.get(-1)
    if (gesture) this.release(gesture)
    this.gestures.delete(-1)
    this.hint.classList.remove('visible')
  }

  private release(gesture: Gesture) {
    const now = performance.now()
    const power = 1 + Math.min((now - gesture.started) / 1800, 1.6)
    if (gesture.distance > 18) {
      const path = samplePath(gesture.points, Math.max(48, gesture.distance / 90))
      const interval = Math.min(90, 4500 / Math.max(path.length - 1, 1))
      this.scheduled.push(...path.map((point, index) => ({ ...point, power, at: now + index * interval })))
      if (this.scheduled.length > 600) this.scheduled.splice(0, this.scheduled.length - 600)
    } else {
      this.burst(gesture.last.x, gesture.last.y, power)
    }
  }

  private burst(x: number, y: number, power: number) {
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)]!
    const hue = random(0, 360)
    const mobileScale = Math.min(1, Math.max(0.5, this.width / 1000))
    const speed = random(110, 145) * power * mobileScale
    const amount = Math.round((70 + power * 30) * (this.reducedMotion.matches ? 0.5 : 1))
    const rotation = random(-0.25, 0.25)
    for (let i = 0; i < amount; i++) {
      const angle = i / amount * TAU
      let dx = Math.cos(angle)
      let dy = Math.sin(angle)
      let magnitude = 1
      switch (shape) {
        case 'heart':
          dx = Math.pow(Math.sin(angle), 3)
          dy = -(13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle)) / 16
          magnitude = random(0.92, 1.04)
          break
        case 'star': {
          const segment = i / amount * 10
          const vertex = Math.floor(segment)
          const fraction = segment - vertex
          const a = vertex / 10 * TAU - Math.PI / 2
          const b = (vertex + 1) / 10 * TAU - Math.PI / 2
          const r1 = vertex % 2 === 0 ? 1 : 0.44
          const r2 = vertex % 2 === 0 ? 0.44 : 1
          dx = Math.cos(a) * r1 * (1 - fraction) + Math.cos(b) * r2 * fraction
          dy = Math.sin(a) * r1 * (1 - fraction) + Math.sin(b) * r2 * fraction
          break
        }
        case 'ring': magnitude = random(0.92, 1.05); dy *= 0.72; break
        case 'spiral': {
          const turn = angle * 3
          magnitude = 0.18 + i / amount * 0.85
          dx = Math.cos(turn); dy = Math.sin(turn)
          break
        }
        default: magnitude = Math.sqrt(Math.random()); break
      }
      const vx = (dx * Math.cos(rotation) - dy * Math.sin(rotation)) * speed * magnitude
      const vy = (dx * Math.sin(rotation) + dy * Math.cos(rotation)) * speed * magnitude
      this.particles.push({
        x, y, vx, vy, age: 0, life: random(1.25, shape === 'willow' ? 3.5 : 2.5),
        hue: hue + (shape === 'spiral' ? i / amount * 100 : random(-16, 16)),
        size: random(0.9, 1.9), gravity: shape === 'willow' ? 44 : 22,
        trail: [{ x, y }], sparkle: Math.random() > 0.65,
      })
    }
    if (this.particles.length > 6500) this.particles.splice(0, this.particles.length - 6500)
    this.flashes.push({ x, y, hue, size: 32 * power * mobileScale, age: 0 })
    this.count++
    this.counter.textContent = `${this.count.toLocaleString('ko-KR')}개의 불꽃으로 수놓은 밤`
  }

  private drawGestures(now: number) {
    const context = this.context
    let current: Gesture | undefined
    for (const gesture of this.gestures.values()) {
      current = gesture
      const charge = Math.min((now - gesture.started) / 2880, 1)
      const radius = 13 + charge * 30
      context.strokeStyle = 'rgba(193, 208, 255, 0.38)'
      context.lineWidth = 1
      context.setLineDash([2, 7])
      context.beginPath()
      gesture.points.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y))
      context.stroke()
      context.setLineDash([])
      context.beginPath()
      context.arc(gesture.last.x, gesture.last.y, radius, 0, TAU)
      context.strokeStyle = 'rgba(203, 212, 255, 0.2)'
      context.stroke()
      context.beginPath()
      context.arc(gesture.last.x, gesture.last.y, radius, -Math.PI / 2, -Math.PI / 2 + TAU * charge)
      context.strokeStyle = 'rgba(220, 225, 255, 0.85)'
      context.lineWidth = 2
      context.stroke()
      const glow = context.createRadialGradient(gesture.last.x, gesture.last.y, 0, gesture.last.x, gesture.last.y, radius)
      glow.addColorStop(0, `rgba(213, 219, 255, ${0.2 + charge * 0.3})`)
      glow.addColorStop(1, 'rgba(170, 180, 255, 0)')
      context.fillStyle = glow
      context.fillRect(gesture.last.x - radius, gesture.last.y - radius, radius * 2, radius * 2)
    }
    this.hint.classList.toggle('visible', !!current)
    if (current) {
      this.hint.style.left = `${Math.max(70, Math.min(this.width - 70, current.last.x))}px`
      this.hint.style.top = `${Math.max(15, current.last.y - 65)}px`
      this.hint.textContent = current.distance > 18 ? '놓으면 빛이 이어져요' : now - current.started > 2800 ? '가득 찼어요 · 놓아보세요' : '빛을 모으는 중'
    }
  }

  private tick = (now: number) => {
    const dt = this.previous ? Math.min((now - this.previous) / 1000, 0.04) : 1 / 60
    this.previous = now
    const due = this.scheduled.filter(item => item.at <= now)
    this.scheduled = this.scheduled.filter(item => item.at > now)
    for (const item of due) this.burst(item.x, item.y, item.power)
    const context = this.context
    context.clearRect(0, 0, this.width, this.height)
    context.globalCompositeOperation = 'lighter'
    for (const flash of this.flashes) {
      flash.age += dt
      const alpha = Math.max(0, 1 - flash.age / 0.4)
      const radius = flash.size * (0.5 + flash.age * 2)
      const glow = context.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, radius)
      glow.addColorStop(0, `hsla(${flash.hue}, 95%, 85%, ${alpha * 0.6})`)
      glow.addColorStop(0.2, `hsla(${flash.hue}, 95%, 65%, ${alpha * 0.15})`)
      glow.addColorStop(1, `hsla(${flash.hue}, 95%, 50%, 0)`)
      context.fillStyle = glow
      context.fillRect(flash.x - radius, flash.y - radius, radius * 2, radius * 2)
    }
    this.flashes = this.flashes.filter(flash => flash.age < 0.4)
    for (const particle of this.particles) {
      particle.age += dt
      if (particle.age >= particle.life) continue
      const drag = Math.exp(-0.95 * dt)
      particle.vx *= drag
      particle.vy = particle.vy * drag + particle.gravity * dt
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      particle.trail.push({ x: particle.x, y: particle.y })
      if (particle.trail.length > (this.reducedMotion.matches ? 3 : 8)) particle.trail.shift()
      const fade = Math.pow(1 - particle.age / particle.life, 0.65)
      const twinkle = particle.sparkle && particle.age > 0.6 ? 0.5 + Math.random() * 0.5 : 1
      context.lineWidth = particle.size * fade
      context.strokeStyle = `hsla(${particle.hue}, 95%, 72%, ${fade * twinkle * 0.7})`
      context.beginPath()
      particle.trail.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y))
      context.stroke()
      context.fillStyle = `hsla(${particle.hue}, 100%, 85%, ${fade * twinkle})`
      context.beginPath()
      context.arc(particle.x, particle.y, Math.max(0.1, particle.size * fade), 0, TAU)
      context.fill()
      context.fillStyle = `hsla(${particle.hue}, 100%, 65%, ${fade * 0.055})`
      context.beginPath()
      context.arc(particle.x, particle.y, particle.size * 4, 0, TAU)
      context.fill()
    }
    this.particles = this.particles.filter(particle => particle.age < particle.life && particle.y < this.height + 100)
    context.globalCompositeOperation = 'source-over'
    this.drawGestures(now)
    this.frame = requestAnimationFrame(this.tick)
  }

  private cancelGestures = () => {
    for (const id of this.gestures.keys()) {
      if (id >= 0 && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id)
    }
    this.gestures.clear()
    this.hint.classList.remove('visible')
  }

  private visibilityChange = () => {
    cancelAnimationFrame(this.frame)
    this.cancelGestures()
    this.scheduled = []
    this.previous = 0
    if (!document.hidden) this.frame = requestAnimationFrame(this.tick)
  }

  clear() {
    this.cancelGestures()
    this.particles = []
    this.flashes = []
    this.scheduled = []
    this.count = 0
    this.context.clearRect(0, 0, this.width, this.height)
    this.counter.textContent = '오늘 밤의 첫 불꽃을 기다리는 중'
  }

  destroy() {
    this.clear()
    cancelAnimationFrame(this.frame)
    this.controller.abort()
  }
}
