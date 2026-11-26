export interface ThanosPoint { x: number; y: number; z?: number }
export interface ThanosHand { id: string; points: ThanosPoint[] }
export interface ThanosSnap { hand: string; x: number; y: number }
export interface ThanosMask { width: number; height: number; mask: Float32Array }
interface SnapTrack {
  id: string; wrist: ThanosPoint; seen: number; start: number; contactAt: number
  armed: boolean; curl: number; tipX: number; tipY: number; scale: number
}
const distance = (a: ThanosPoint, b: ThanosPoint, aspect: number) => Math.hypot((a.x - b.x) * aspect, a.y - b.y)

/** A temporal thumb/middle-finger snap estimate, not a canned pose classifier.
 * Distances are relative to the palm; either hand can trigger independently.
 * Translation/handedness order alone can never become a snap. No microphone. */
export class ThanosSnapDetector {
  private tracks: SnapTrack[] = []
  private cooldown = -Infinity
  sensitivity = 1
  handCount = 0
  get armedHands() { return this.tracks.filter(track => track.armed).length }

  update(hands: ThanosHand[], now: number, aspect = 1): ThanosSnap | null {
    const previous = this.tracks.filter(track => now - track.seen < 240), used = new Set<SnapTrack>()
    const next: SnapTrack[] = []
    let visible = 0
    let snap: ThanosSnap | null = null
    for (const hand of hands.slice(0, 2)) {
      const p = hand.points
      if (p.length < 21 || p.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) continue
      const scale = (distance(p[0]!, p[9]!, aspect) + distance(p[5]!, p[17]!, aspect)) / 2
      if (scale < .025) continue
      visible++
      let track: SnapTrack | undefined, nearest = Infinity
      for (const candidate of previous) {
        const d = distance(candidate.wrist, p[0]!, aspect)
        if (!used.has(candidate) && d < Math.max(scale, candidate.scale) * 2.5 && d < nearest) { nearest = d; track = candidate }
      }
      if (track && now <= track.seen) { used.add(track); next.push(track); continue }
      if (track) used.add(track)
      else track = { id: hand.id, wrist: p[0]!, seen: now, start: -Infinity, contactAt: -Infinity, armed: false, curl: 0, tipX: 0, tipY: 0, scale }
      const gap = distance(p[4]!, p[12]!, aspect) / scale
      const curl = distance(p[12]!, p[9]!, aspect) / scale
      const tipX = (p[12]!.x - p[9]!.x) * aspect / scale, tipY = (p[12]!.y - p[9]!.y) / scale
      const sensitivity = Math.max(.85, Math.min(1.3, this.sensitivity))
      if (gap < .42 * sensitivity && curl > .3) {
        if (!Number.isFinite(track.start) || now - track.contactAt > 240) track.start = now
        if (now - track.start >= 24) track.armed = true
        track.contactAt = now; track.curl = curl; track.tipX = tipX; track.tipY = tipY
      } else if (track.armed) {
        const elapsed = now - track.contactAt
        const motion = Math.hypot(tipX - track.tipX, tipY - track.tipY)
        const speed = motion / Math.max(.016, elapsed / 1000)
        // The middle finger must recoil toward its knuckle. Simply extending
        // the thumb, opening a palm, or releasing an index pinch is insufficient.
        if (elapsed > 0 && elapsed <= 240 && gap > .68 / sensitivity && motion > .27 / sensitivity && speed > 2.1 / sensitivity && track.curl - curl > .16 / sensitivity && now >= this.cooldown) {
          snap = { hand: hand.id, x: (p[4]!.x + p[12]!.x) / 2, y: (p[4]!.y + p[12]!.y) / 2 }
          this.cooldown = now + 1600; track.armed = false; track.start = -Infinity
        } else if (elapsed > 240 || gap > 1.8) { track.armed = false; track.start = -Infinity }
      } else if (now - track.contactAt > 240) track.start = -Infinity
      track.wrist = { x: p[0]!.x, y: p[0]!.y }; track.scale = scale; track.seen = now
      next.push(track)
    }
    // A snap can briefly occlude the fingertips. Bridge at most 120ms, without
    // treating an absent hand as visible or accepting a stale preparation.
    for (const track of previous) if (!used.has(track) && now - track.seen <= 120) next.push(track)
    this.tracks = next; this.handCount = visible
    return snap
  }
  clear() { this.tracks = []; this.handCount = 0 }
  reset() { this.clear(); this.cooldown = -Infinity }
}

export const THANOS_DISSOLVE_MS = 4200
export const THANOS_EFFECT_MS = 6100
export class ThanosMoment {
  private snappedAt = -Infinity
  get snapped() { return Number.isFinite(this.snappedAt) }
  snap(now: number) { if (this.snapped) return false; this.snappedAt = now; return true }
  elapsed(now: number) { return this.snapped ? Math.max(0, now - this.snappedAt) / 1000 : -1 }
  progress(now: number) { return this.snapped ? Math.min(1, Math.max(0, (now - this.snappedAt) / THANOS_DISSOLVE_MS)) : 0 }
  finished(now: number) { return this.snapped && now - this.snappedAt >= THANOS_EFFECT_MS }
  reset() { this.snappedAt = -Infinity }
}

const fract = (x: number) => x - Math.floor(x)
const hash = (x: number, y: number) => { const i = ((x * 17 + y * 131) % 251 + 251) % 251; return (i * i * 13 % 251) / 251 }
function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = fract(x), fy = fract(y)
  const a = fx * fx * (3 - 2 * fx), b = fy * fy * (3 - 2 * fy)
  return (hash(ix, iy) * (1 - a) + hash(ix + 1, iy) * a) * (1 - b)
    + (hash(ix, iy + 1) * (1 - a) + hash(ix + 1, iy + 1) * a) * b
}
/** Same coarse field as the GPU: particles detach near the dissolving edge. */
export function thanosDissolveField(x: number, y: number) { return noise(x * 22, y * 22) * .55 + noise(x * 55, y * 55) * .25 + y * .2 }
