export const GRAVITY = 510
export type SnowPoint = { x: number; y: number; radius: number }
export type Letter = { char: string; x: number; y: number; vx: number; vy: number; angle: number; spin: number; size: number; width: number; landed: boolean; shape?: SnowPoint[] }
export type RainState = 'ready' | 'playing' | 'over'
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))
const CELL = 8

function contactPoints(letter: Letter): SnowPoint[] {
  const c = Math.cos(letter.angle), s = Math.sin(letter.angle)
  let outline = letter.shape
  if (!outline?.length) {
    // A fallback until the view has sampled the rendered snow lettering.
    outline = []
    const steps = Math.max(2, Math.ceil(letter.width / CELL))
    for (let i = 0; i <= steps; i++) {
      const x = -letter.width / 2 + letter.width * i / steps
      outline.push({ x, y: -letter.size * .42, radius: CELL / 2 }, { x, y: letter.size * .42, radius: CELL / 2 })
    }
  }
  return outline.map(point => ({ x: point.x * c - point.y * s, y: point.x * s + point.y * c, radius: point.radius }))
}

export function touchesLetter(letter: Letter, x: number, y: number, radius: number): boolean {
  const dx = x - letter.x, dy = y - letter.y
  const c = Math.cos(letter.angle), s = Math.sin(letter.angle)
  const localX = dx * c + dy * s, localY = -dx * s + dy * c
  if (letter.shape?.length) return letter.shape.some(point => Math.hypot(localX - point.x, localY - point.y) < radius + point.radius)
  return Math.hypot(localX - clamp(localX, -letter.width / 2, letter.width / 2), localY - clamp(localY, -letter.size * .42, letter.size * .42)) < radius
}

export class TypingRain {
  state: RainState = 'ready'
  letters: Letter[] = []
  width: number
  height: number
  floor: number
  x: number
  vx = 0
  elapsed = 0
  typed = 0
  dodged = 0
  target: number
  impact: Letter | null = null
  snow: number[]
  private decision = 0
  private random: () => number

  constructor(width: number, height: number, random: () => number = Math.random) {
    this.width = width; this.height = height; this.floor = this.floorAt(height, width)
    this.x = this.target = width / 2; this.random = random
    this.snow = Array(Math.ceil(width / CELL) + 1).fill(0)
  }

  private floorAt(height: number, width: number) { return Math.max(160, height - (width < 650 ? 205 : 164)) }
  groundAt(x: number) { return this.floor - (this.snow[clamp(Math.floor(x / CELL), 0, this.snow.length - 1)] ?? 0) }

  resize(width: number, height: number) {
    if (!width || !height) return
    const scale = width / this.width, previousFloor = this.floor, previousSnow = this.snow
    this.width = width; this.height = height; this.floor = this.floorAt(height, width)
    this.x = clamp(this.x * scale, 32, width - 32); this.target = clamp(this.target * scale, 32, width - 32)
    this.snow = Array.from({ length: Math.ceil(width / CELL) + 1 }, (_, i) => (previousSnow[Math.min(previousSnow.length - 1, Math.floor(i / scale))] ?? 0) * scale)
    for (const l of this.letters) {
      l.x *= scale
      let shapeScale = 1
      if (l.landed) { l.width *= scale; l.size *= scale; l.y = this.floor - (previousFloor - l.y) * scale; shapeScale = scale }
      else if (l.width > width - 32) { const shrink = (width - 32) / l.width; l.size *= shrink; l.width *= shrink; shapeScale = shrink }
      if (l.shape && shapeScale !== 1) l.shape = l.shape.map(point => ({ x: point.x * shapeScale, y: point.y * shapeScale, radius: point.radius * shapeScale }))
      l.x = clamp(l.x, l.width / 2 + 8, width - l.width / 2 - 8)
    }
  }

  restart() {
    this.state = 'ready'; this.letters = []; this.x = this.target = this.width / 2
    this.snow.fill(0); this.vx = 0; this.elapsed = 0; this.typed = 0; this.dodged = 0; this.decision = 0; this.impact = null
  }

  dropWord(word: string) {
    if (this.state === 'over' || !/^(?:[a-z]+|[가-힣]+)$/i.test(word)) return false
    this.state = 'playing'; this.typed++
    const r = this.random
    let size = 38 + r() * 10
    const units = [...word].reduce((sum, char) => sum + (/[a-z]/i.test(char) ? .69 : 1), 0)
    let width = size * units + 10
    if (width > this.width * .62) { size *= this.width * .62 / width; width = this.width * .62 }
    const margin = width / 2 + 15
    const x = r() < .45 ? this.x + (r() - .5) * this.width * .55 : margin + r() * (this.width - margin * 2)
    this.letters.push({ char: word, x: clamp(x, margin, this.width - margin), y: -width / 2 - size,
      vx: (r() - .5) * 40, vy: 20 + r() * 30, angle: (r() - .5) * .55, spin: (r() - .5) * 1.2,
      size, width, landed: false })
    return true
  }

  private chooseEscape() {
    const threats = this.letters.filter(l => !l.landed)
    if (!threats.length) { this.target = this.x; return }
    let best = this.x, bestCost = Infinity
    const candidates = [this.x, this.target]
    for (let x = 35; x <= this.width - 35; x += 20) candidates.push(x)
    for (const candidate of candidates) {
      let cost = Math.abs(candidate - this.x) * .035 + Math.abs(this.groundAt(candidate) - this.groundAt(this.x)) * .18
      for (const l of threats) {
        const distance = this.groundAt(this.x) - 58 - l.y
        const t = (-l.vy + Math.sqrt(l.vy * l.vy + 2 * GRAVITY * Math.max(0, distance))) / GRAVITY
        if (t > 1.25 || distance < -l.size) continue
        const reachable = this.x + clamp(candidate - this.x, -190 * Math.max(0, t - .1), 190 * Math.max(0, t - .1))
        const landingX = clamp(l.x + l.vx * t, l.width / 2, this.width - l.width / 2)
        const clearance = Math.abs(Math.cos(l.angle + l.spin * t)) * l.width / 2 + l.size * .3 + 25
        cost += Math.max(0, clearance - Math.abs(reachable - landingX)) ** 2 / Math.max(.18, t)
      }
      if (cost < bestCost) { bestCost = cost; best = candidate }
    }
    this.target = best
  }

  update(dt: number) {
    if (this.state !== 'playing') return
    this.elapsed += dt; this.decision -= dt
    if (this.decision <= 0) { this.chooseEscape(); this.decision = .12 }
    const desired = clamp((this.target - this.x) * 7, -190, 190)
    this.vx += clamp(desired - this.vx, -900 * dt, 900 * dt)
    this.x = clamp(this.x + this.vx * dt, 30, this.width - 30)
    const ground = this.groundAt(this.x)
    for (const l of this.letters) {
      if (l.landed) continue
      l.vy += GRAVITY * dt; l.x += l.vx * dt; l.y += l.vy * dt; l.angle += l.spin * dt
      const points = contactPoints(l)
      let left = Infinity, right = -Infinity
      for (const point of points) { left = Math.min(left, point.x - point.radius); right = Math.max(right, point.x + point.radius) }
      if (l.x + left < 5 || l.x + right > this.width - 5) { l.x = clamp(l.x, 5 - left, this.width - 5 - right); l.vx *= -.45 }
      if (touchesLetter(l, this.x, ground - 69, 20) || touchesLetter(l, this.x, ground - 35, 17) || touchesLetter(l, this.x, ground - 10, 12)) {
        this.state = 'over'; this.impact = l; this.vx = 0; return
      }
      let penetration = -Infinity
      for (const point of points) {
        penetration = Math.max(penetration, l.y + point.y + point.radius - this.groundAt(l.x + point.x))
      }
      if (penetration >= 0) {
        l.y -= penetration; l.landed = true; l.vx = l.vy = l.spin = 0; this.dodged++
        // Only actual glyph pixels support the next word. Empty corners and the
        // spaces between letters stay empty instead of becoming solid blocks.
        for (const point of points) {
          const top = this.floor - (l.y + point.y - point.radius)
          const from = clamp(Math.floor((l.x + point.x - point.radius) / CELL), 0, this.snow.length - 1)
          const to = clamp(Math.floor((l.x + point.x + point.radius) / CELL), 0, this.snow.length - 1)
          for (let i = from; i <= to; i++) this.snow[i] = Math.max(this.snow[i]!, top)
        }
      }
    }
  }
}
