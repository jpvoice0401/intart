import type { BooHand } from './myboo-model'

interface PushState {
  width: number
  height: number
  scale: number
  baseline: number
  peak: number
  x: number
  y: number
  seen: number
  settledAt: number
  firstPush: number | null
  retract: boolean
}

function openHand(hand: BooHand, aspect: number): boolean {
  const p = hand.landmarks
  if (p.length < 21 || !p.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) return false
  // A fast push can briefly lose its gesture label. Extended fingers still
  // identify the open hand; do not also require a handedness-dependent winding.
  if (hand.gesture === 'Open_Palm' && hand.confidence >= .4) return true
  const distance = (index: number) => Math.hypot((p[index]!.x - p[0]!.x) * aspect, p[index]!.y - p[0]!.y)
  return [[8, 6], [12, 10], [16, 14], [20, 18]]
    .filter(([tip, joint]) => distance(tip!) > distance(joint!) * 1.15).length >= 3
}

/** Palm magnification estimates forward movement; landmark z is wrist-relative.
 * Consume inference frames only, with separate push/retract cycles per hand. */
export class MybooHornGesture {
  private states = new Map<string, PushState>()
  private cooldownUntil = -Infinity

  get progress(): number {
    return [...this.states.values()].some(state => state.firstPush !== null) ? 1 : 0
  }

  sample(hands: BooHand[], time: number, aspect: number): boolean {
    let honk = false
    for (const side of ['Left', 'Right'] as const) {
      const hand = hands.filter(item => item.side === side && openHand(item, aspect))
        .sort((a, b) => b.confidence - a.confidence)[0]
      if (!hand) continue
      const p = hand.landmarks
      const width = Math.hypot((p[5]!.x - p[17]!.x) * aspect, p[5]!.y - p[17]!.y)
      const height = Math.hypot((p[0]!.x - p[9]!.x) * aspect, p[0]!.y - p[9]!.y)
      const scale = Math.sqrt(width * height)
      const x = (p[0]!.x + p[9]!.x) / 2, y = (p[0]!.y + p[9]!.y) / 2
      if (width < .025 || height < .035) continue
      const previous = this.states.get(side)
      const fresh = (): PushState => ({ width, height, scale, baseline: scale, peak: scale, x, y, seen: time, settledAt: time, firstPush: null, retract: false })
      if (!previous || time - previous.seen > .6 || time < previous.seen ||
        Math.hypot((x - previous.x) * aspect, y - previous.y) > Math.max(width, height) * 1.2 ||
        scale / previous.scale > 1.8 || scale / previous.scale < .55) {
        this.states.set(side, fresh()); continue
      }
      if (time <= previous.seen) continue
      const elapsed = time - previous.seen
      previous.seen = time; previous.x = x; previous.y = y
      if (time < this.cooldownUntil) { this.states.set(side, fresh()); continue }
      if (previous.firstPush !== null && time - previous.firstPush > 3) {
        this.states.set(side, fresh()); continue
      }
      // Reject abrupt edge-on rotations, allowing normal palm tilt while pushing.
      const shapeRatio = (width / height) / (previous.width / previous.height)
      if (shapeRatio < .6 || shapeRatio > 1.65) { this.states.set(side, fresh()); continue }
      previous.width = width; previous.height = height
      // Time-based smoothing works for both the 20 Hz worker and 10 Hz fallback.
      previous.scale += (scale - previous.scale) * (1 - Math.exp(-elapsed / .045))
      if (previous.retract) {
        previous.peak = Math.max(previous.peak, previous.scale)
        if (previous.scale <= previous.peak * .93) {
          previous.retract = false; previous.baseline = previous.scale; previous.settledAt = time
        }
        continue
      }
      previous.baseline = Math.min(previous.baseline, previous.scale)
      if (time - previous.settledAt >= .09 && previous.scale >= previous.baseline * 1.12) {
        if (previous.firstPush !== null && time - previous.firstPush >= .2) {
          honk = true; this.cooldownUntil = time + 1.1
          this.states.clear(); break
        }
        previous.firstPush = time; previous.retract = true; previous.peak = previous.scale
      }
    }
    for (const [side, state] of this.states) if (time - state.seen > .6 || (state.firstPush !== null && time - state.firstPush > 3)) this.states.delete(side)
    return honk
  }
  clear() { this.states.clear(); this.cooldownUntil = -Infinity }
}
