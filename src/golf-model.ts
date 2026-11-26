export const GOLF_BPM = 92
export type GolfPoint = { x: number; y: number }
export type GolfOutcome = 'hole' | 'good' | 'fairway' | 'bunker' | 'water' | 'rough' | 'ob'
export type GolfShot = { landing: GolfPoint; outcome: GolfOutcome; timing: 'perfect' | 'good' | 'miss'; points: number; distance: number; power: number }
export const TEE: GolfPoint = { x: .5, y: .79 }
export const HOLE: GolfPoint = { x: .54, y: .46 }
export const BUNKERS = [{ x: .39, y: .56, rx: .085, ry: .045 }, { x: .67, y: .53, rx: .095, ry: .045 }]
export const WATER = { x: .21, y: .63, rx: .135, ry: .065 }
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
const inside = (p: GolfPoint, e: GolfPoint & { rx: number; ry: number }) => Math.pow((p.x - e.x) / e.rx, 2) + Math.pow((p.y - e.y) / e.ry, 2) <= 1

export function beatOffset(beat: number): number {
  return beat - Math.round(beat)
}

export function danceAt(beat: number) {
  const phase = ((beat % 1) + 1) % 1
  const kick = Math.exp(-phase * 22)
  return {
    hop: Math.pow(Math.sin(phase * Math.PI), 2) * (Math.floor(beat) % 2 === 0 ? 1 : .82),
    sway: Math.sin(beat * Math.PI / 2), rotation: Math.sin(beat * Math.PI) * 9,
    scaleX: 1 + kick * .1, scaleY: 1 - kick * .1,
  }
}

export function calculateShot(input: { aim: number; power: number; beat: number; wind?: number }): GolfShot {
  const power = clamp(input.power, .1, 1)
  const offset = beatOffset(input.beat)
  const error = Math.abs(offset)
  const timing = error <= .12 ? 'perfect' : error <= .25 ? 'good' : 'miss'
  const landing = {
    x: HOLE.x + clamp(input.aim, -1, 1) * .45 + offset * .65 + (input.wind ?? 0) * .025,
    y: TEE.y - (.12 + power * .35),
  }
  let outcome: GolfOutcome
  if (landing.x < .10 || landing.x > .9 || landing.y < .34) outcome = 'ob'
  else if (inside(landing, WATER)) outcome = 'water'
  else if (BUNKERS.some(bunker => inside(landing, bunker))) outcome = 'bunker'
  else if (timing === 'perfect' && error < .035 && inside(landing, { ...HOLE, rx: .012, ry: .009 })) outcome = 'hole'
  else if (inside(landing, { ...HOLE, rx: .13, ry: .045 })) outcome = 'good'
  else if (Math.abs(landing.x - (.51 + Math.sin(landing.y * 8) * .035)) < .15 + (landing.y - .4) * .14) outcome = 'fairway'
  else outcome = 'rough'
  const base: Record<GolfOutcome, number> = { hole: 1000, good: 120, fairway: 60, bunker: -20, water: -35, rough: 10, ob: -50 }
  return { landing, outcome, timing, points: base[outcome] + (base[outcome] > 0 ? timing === 'perfect' ? 30 : timing === 'good' ? 10 : 0 : 0), distance: Math.round((.12 + power * .35) / .33 * 235), power }
}

export function flightAt(start: GolfPoint, end: GolfPoint, progress: number, height: number) {
  const t = clamp(progress, 0, 1)
  return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t - Math.sin(t * Math.PI) * height, scale: 1 - t * .82, rotation: t * 680 }
}

/** Original two-bar boom-bap loop. Integer beat positions are shared with danceAt. */
export function renderHipHop(sampleRate = 22050, random: () => number = Math.random): Float32Array {
  const secondsPerBeat = 60 / GOLF_BPM
  const count = Math.round(secondsPerBeat * 8 * sampleRate)
  const samples = new Float32Array(count)
  const add = (beat: number, duration: number, sound: (t: number) => number) => {
    const start = Math.round(beat * secondsPerBeat * sampleRate)
    for (let i = 0; i < duration * sampleRate; i++) {
      const index = (start + i) % count
      samples[index] = samples[index]! + sound(i / sampleRate)
    }
  }
  for (const step of [0, 6, 8, 14, 16, 22, 24, 27, 30]) {
    add(step / 4, .4, t => Math.sin(2 * Math.PI * (48 * t + 9 * (1 - Math.exp(-t * 24)))) * Math.exp(-t * 15) * .85)
  }
  for (const step of [4, 12, 20, 28]) {
    let low = 0
    add(step / 4, .22, t => {
      const noise = random() * 2 - 1
      low = low * .7 + noise * .3
      return ((noise - low) * Math.exp(-t * 25) * .55 + Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 32) * .25)
    })
  }
  for (let step = 0; step < 32; step += 2) {
    add(step / 4 + (step % 4 === 2 ? .035 : 0), .07, t => (random() * 2 - 1) * Math.exp(-t * 80) * (step % 4 === 0 ? .15 : .09))
  }
  const bass: [number, number, number][] = [[0, 82.41, .45], [1.5, 82.41, .28], [2, 98, .4], [3.25, 73.42, .3], [4, 65.41, .45], [5.5, 73.42, .28], [6, 82.41, .4], [7.25, 61.74, .3]]
  for (const [beat, frequency, duration] of bass) add(beat, duration, t => (Math.sin(2 * Math.PI * frequency * t) + Math.sin(4 * Math.PI * frequency * t) * .16) * Math.min(1, t * 130) * Math.exp(-t * 6) * .29)
  for (const [beat, notes] of [[0, [164.81, 196, 246.94, 293.66, 369.99]], [3, [196, 246.94, 293.66]], [4, [130.81, 164.81, 196, 246.94]], [7, [146.83, 185, 220, 293.66]]] as [number, number[]][]) {
    for (const frequency of notes) add(beat, 1.1, t => Math.sin(2 * Math.PI * frequency * t + Math.sin(4 * Math.PI * frequency * t) * 1.3 * Math.exp(-t * 5)) * Math.min(1, t * 100) * Math.exp(-t * 3.4) * .045)
  }
  for (const [beat, note] of [[.5, 659.25], [2.5, 587.33], [6.5, 493.88]]) add(beat!, .25, t => Math.sin(2 * Math.PI * note! * t) * Math.min(1, t * 150) * Math.exp(-t * 18) * .045)
  for (let i = 0; i < count; i++) samples[i] = Math.tanh(samples[i]! * 1.1) * .85
  return samples
}
