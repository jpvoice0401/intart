export interface BooPoint { x: number; y: number; z?: number }
export interface BooHand {
  side: 'Left' | 'Right'
  gesture: string
  confidence: number
  landmarks: BooPoint[]
}

/** Raw camera coordinates, before the display mirror. Handedness determines
 * the winding of the wrist/index/pinky triangle on the visible palm side. */
export function booPalmFacesCamera(hand: BooHand, aspect = 16 / 9): boolean {
  const p = hand.landmarks
  if (p.length < 21 || !p.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) return false
  const wrist = p[0]!, index = p[5]!, pinky = p[17]!
  const ux = (index.x - wrist.x) * aspect, uy = index.y - wrist.y
  const vx = (pinky.x - wrist.x) * aspect, vy = pinky.y - wrist.y
  const area = (ux * vy - uy * vx) / Math.max(1e-6, Math.hypot(ux, uy) * Math.hypot(vx, vy))
  const facing = area * (hand.side === 'Left' ? 1 : -1)
  const distance = (point: BooPoint) => Math.hypot((point.x - wrist.x) * aspect, point.y - wrist.y)
  const extended = [[8, 6], [12, 10], [16, 14], [20, 18]].filter(([tip, joint]) => distance(p[tip!]!) > distance(p[joint!]!) * 1.12).length
  const open = (hand.gesture === 'Open_Palm' && hand.confidence >= .5) || extended >= 3
  return facing > .18 && open
}
export const BOO_WHEEL_LIMIT = Math.PI * .75
export const BOO_MAX_SPEED = 300
export const BOO_CRUISE_SPEED = 68
export const BOO_REV_INTERVAL = 20
export const BOO_SUNSET_START = 30
export const BOO_SUNSET_DURATION = 15
export interface BooControls { leftRaised: boolean; fist: boolean; pointing: boolean; steering: number; twoHands: boolean; wheelAngle: number }
export const BOO_IDLE: BooControls = { leftRaised: false, fist: false, pointing: false, steering: 0, twoHands: false, wheelAngle: 0 }

/** Subject handedness, not display position; camera pixels alone are mirrored. */
export function booControls(hands: BooHand[], swap = false, cameraAspect = 16 / 9): BooControls {
  const result = { ...BOO_IDLE }
  const palms: BooPoint[] = []
  for (const hand of hands) {
    if (hand.landmarks.length < 21) continue
    const p = hand.landmarks
    if (!p.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) continue
    const knuckles = [5, 9, 13, 17].reduce((sum, i) => ({ x: sum.x + p[i]!.x / 4, y: sum.y + p[i]!.y / 4 }), { x: 0, y: 0 })
    palms.push({ x: p[0]!.x * .4 + knuckles.x * .6, y: p[0]!.y * .4 + knuckles.y * .6 })
    const side = swap ? hand.side === 'Left' ? 'Right' : 'Left' : hand.side
    if (side === 'Left') result.leftRaised ||= (p[9]!.y < .78 && p[0]!.y < .96)
    else {
      result.fist ||= hand.gesture === 'Closed_Fist' && hand.confidence >= .6
      result.pointing ||= hand.gesture === 'Pointing_Up' && hand.confidence >= .6
      result.steering = Math.max(-1, Math.min(1, (.5 - p[9]!.x) * 2.6))
    }
  }
  if (palms.length >= 2) {
    result.twoHands = true
    const dx = (palms[0]!.x - palms[1]!.x) * cameraAspect
    const dy = palms[1]!.y - palms[0]!.y
    if (Math.hypot(dx, dy) >= .06) {
      const angle = Math.atan2(dy, dx)
      // A line is unchanged when its endpoints swap. This avoids 180-degree
      // jumps when MediaPipe changes result order or hand labels are reversed.
      result.wheelAngle = .5 * Math.atan2(Math.sin(angle * 2), Math.cos(angle * 2))
    } else result.wheelAngle = NaN // Overlapping palms cannot define a wheel angle.
  }
  return result
}

/** Debounced ignition and acceleration use seconds, independent of inference FPS. */
export class MybooDrive {
  hasKey = false
  running = false
  starting = false
  speed = 0
  distance = 0
  driveTime = 0
  steering = 0
  boosting = false
  keyProgress = 0
  gripProgress = 0
  twoHandGrip = false
  handsOnWheel = false
  private previousHandAngle: number | null = null
  private handTurn = 0
  private releaseTime = 0
  private hadTwoHands = false
  private ignitionTime = 0
  private revClock = 0
  private pendingRev = false

  update(delta: number, input: BooControls) {
    const elapsed = Math.max(0, Number.isFinite(delta) ? delta : 0)
    const dt = Math.min(.25, elapsed)
    this.keyProgress = input.leftRaised ? Math.min(.22, this.keyProgress + dt) : 0
    if (this.keyProgress >= .22) this.hasKey = true
    this.twoHandGrip = input.twoHands
    this.handsOnWheel = input.twoHands || input.fist
    this.gripProgress = this.hasKey && this.handsOnWheel ? Math.min(.32, this.gripProgress + dt) : 0
    if (!this.running && !this.starting && this.gripProgress >= .32) {
      this.starting = true; this.ignitionTime = 0; this.pendingRev = true; this.revClock = 0
    }
    if (this.starting) {
      this.ignitionTime += dt
      if (this.ignitionTime >= 1.15) { this.starting = false; this.running = true }
    }
    this.boosting = this.running && input.pointing
    const target = this.running ? this.boosting ? BOO_MAX_SPEED : BOO_CRUISE_SPEED : 0
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * (this.boosting ? .9 : .5)))
    if (Math.abs(target - this.speed) < .05) this.speed = target
    let targetSteering = 0
    if (input.twoHands) {
      this.releaseTime = 0
      if (Number.isFinite(input.wheelAngle)) {
        if (this.previousHandAngle === null) this.handTurn = this.hadTwoHands ? this.steering * BOO_WHEEL_LIMIT : input.wheelAngle
        else {
          const deltaAngle = input.wheelAngle - this.previousHandAngle
          this.handTurn += .5 * Math.atan2(Math.sin(deltaAngle * 2), Math.cos(deltaAngle * 2))
        }
        this.handTurn = Math.max(-BOO_WHEEL_LIMIT, Math.min(BOO_WHEEL_LIMIT, this.handTurn))
        this.previousHandAngle = input.wheelAngle; this.hadTwoHands = true
      }
      targetSteering = this.handTurn / BOO_WHEEL_LIMIT
    } else {
      this.releaseTime += elapsed
      if (input.fist) { targetSteering = input.steering * .72 / BOO_WHEEL_LIMIT; this.previousHandAngle = null }
      else if (this.releaseTime < .25) targetSteering = this.handTurn / BOO_WHEEL_LIMIT
      else this.previousHandAngle = null
    }
    this.steering += (targetSteering - this.steering) * (1 - Math.exp(-dt * (this.handsOnWheel ? 14 : 5)))
    this.distance += this.speed / 3.6 * dt
    if (this.running) this.driveTime += elapsed
    if (this.running || this.starting) {
      this.revClock += elapsed
      if (this.revClock >= BOO_REV_INTERVAL) { this.revClock %= BOO_REV_INTERVAL; this.pendingRev = true }
    }
  }

  takeRev() { const value = this.pendingRev; this.pendingRev = false; return value }
  get revIn() { return Math.max(0, BOO_REV_INTERVAL - this.revClock) }
  get nightMix() {
    const t = Math.max(0, Math.min(1, (this.driveTime - BOO_SUNSET_START) / BOO_SUNSET_DURATION))
    return t * t * (3 - 2 * t)
  }
  reset() {
    this.hasKey = this.running = this.starting = this.boosting = this.pendingRev = this.twoHandGrip = this.handsOnWheel = this.hadTwoHands = false
    this.speed = this.distance = this.driveTime = this.steering = this.keyProgress = this.gripProgress = this.ignitionTime = this.revClock = 0
    this.previousHandAngle = null; this.handTurn = this.releaseTime = 0
  }
}
