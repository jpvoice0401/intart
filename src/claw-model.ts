export const CLAW_HOME = 5.72
export const PLAY_FLOOR = 2.35
export const PRIZE_COUNT = 72
export const EXIT = { x: 0, z: 1.18 }
export type ClawPhase = 'ready' | 'descending' | 'closing' | 'lifting' | 'carrying' | 'opening' | 'delivery' | 'returning'
export type GripKind = 'miss' | 'stable' | 'slip'
export type GrabTarget = { id: number; y: number; distance: number; tilt: number }
export type ClawHooks = { probe(x: number, z: number): GrabTarget | null; grab(target: GrabTarget, kind: GripKind): void; release(delivery: boolean): void }
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
const ease = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t) }
const mix = (a: number, b: number, t: number) => a + (b - a) * ease(t)

/** Each finger stays inside its own 120-degree sector, even fully closed. */
export function fingerPose(open: number) {
  const upperAngle = mix(.22, .73, open), lowerAngle = mix(-.39, .16, open)
  const root = { radius: .16, y: -.04 }
  const joint = { radius: root.radius + Math.sin(upperAngle) * .47, y: root.y - Math.cos(upperAngle) * .47 }
  const tip = { radius: joint.radius + Math.sin(lowerAngle) * .36, y: joint.y - Math.cos(lowerAngle) * .36 }
  return { root, joint, tip }
}

export function gripResult(distance: number, tilt: number, roll: number): GripKind {
  if (distance > .48) return 'miss'
  const quality = clamp(1 - distance / .58 - Math.abs(tilt) * .12, 0, 1)
  const catchChance = .42 + quality * .55
  if (roll > catchChance) return 'miss'
  return roll < .18 + quality * .61 ? 'stable' : 'slip'
}

export class ClawCycle {
  phase: ClawPhase = 'ready'
  x = 0
  z = 0
  y = CLAW_HOME
  open = 1
  attempts = 0
  grip: GripKind = 'miss'
  time = 0
  private from = { x: 0, z: 0 }
  private low = 3
  private target: GrabTarget | null = null
  private held = false
  private released = false
  private slipAt = .9
  private hooks: ClawHooks
  private random: () => number

  constructor(hooks: ClawHooks, random = Math.random) { this.hooks = hooks; this.random = random }
  get locked() { return this.phase !== 'ready' }

  move(dx: number, dz: number, dt: number) {
    if (this.locked) return
    const length = Math.max(1, Math.hypot(dx, dz))
    this.x = clamp(this.x + dx / length * dt * 1.25, -1.65, 1.65)
    this.z = clamp(this.z + dz / length * dt * 1.25, -1.05, .94)
  }

  start() {
    if (this.locked) return false
    this.attempts++; this.from = { x: this.x, z: this.z }
    this.target = this.hooks.probe(this.x, this.z)
    this.low = clamp((this.target?.y ?? PLAY_FLOOR + .23) + .57, PLAY_FLOOR + .86, CLAW_HOME - .5)
    this.held = false; this.released = false; this.grip = 'miss'
    this.setPhase('descending')
    return true
  }

  private setPhase(phase: ClawPhase) { this.phase = phase; this.time = 0 }

  update(dt: number) {
    if (!this.locked) return
    this.time += dt
    switch (this.phase) {
      case 'descending':
        this.y = mix(CLAW_HOME, this.low, this.time / 1.7)
        if (this.time >= 1.7) this.setPhase('closing')
        break
      case 'closing':
        this.open = 1 - ease(this.time / .8)
        if (this.time >= .8) {
          this.target = this.hooks.probe(this.x, this.z)
          this.grip = this.target ? gripResult(this.target.distance, this.target.tilt, this.random()) : 'miss'
          if (this.target && this.grip !== 'miss') { this.hooks.grab(this.target, this.grip); this.held = true }
          this.slipAt = .65 + this.random() * 2.4
          this.setPhase('lifting')
        }
        break
      case 'lifting':
        this.y = mix(this.low, CLAW_HOME, this.time / 2.1)
        if (this.held && this.grip === 'slip' && this.time >= this.slipAt) { this.hooks.release(false); this.held = false }
        if (this.time >= 2.1) this.setPhase('carrying')
        break
      case 'carrying':
        this.x = mix(this.from.x, EXIT.x, this.time / 1.65); this.z = mix(this.from.z, EXIT.z, this.time / 1.65)
        if (this.held && this.grip === 'slip' && this.time + 2.1 >= this.slipAt) { this.hooks.release(false); this.held = false }
        if (this.time >= 1.65) this.setPhase('opening')
        break
      case 'opening':
        this.open = ease(this.time / .75)
        if (!this.released && this.time > .28) {
          if (this.held) this.hooks.release(true)
          this.held = false; this.released = true
        }
        if (this.time >= .75) this.setPhase('delivery')
        break
      case 'delivery': if (this.time >= 2.3) this.setPhase('returning'); break
      case 'returning':
        this.x = mix(EXIT.x, 0, this.time / 1.2); this.z = mix(EXIT.z, 0, this.time / 1.2)
        if (this.time >= 1.2) { this.x = this.z = 0; this.open = 1; this.setPhase('ready') }
        break
    }
  }
}
