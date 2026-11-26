import type { Point } from './snow-physics'

/** Persistent condensation on the camera plane, independent of the moving face. */
export class SnowFog {
  readonly width: number
  readonly height: number
  readonly density: Float32Array
  maximum = 0
  constructor(width: number, height: number) {
    this.width = width; this.height = height
    this.density = new Float32Array(width*height)
  }
  clear() { this.density.fill(0); this.maximum = 0 }
  fade(dt: number) {
    if (!this.maximum || !dt) return
    const decay = Math.exp(-dt/6.5)
    this.maximum *= decay
    if (this.maximum < .004) { this.clear(); return }
    for (let i = 0; i < this.density.length; i++) this.density[i] *= decay
  }
  breathe(x: number, y: number, radius: number, dt: number, amount: number) {
    const left = Math.max(0,Math.floor(x-radius)), right = Math.min(this.width-1,Math.ceil(x+radius))
    const top = Math.max(0,Math.floor(y-radius*.78)), bottom = Math.min(this.height-1,Math.ceil(y+radius*.78))
    for (let py = top; py <= bottom; py++) for (let px = left; px <= right; px++) {
      const d = Math.hypot((px-x)/radius,(py-y)/(radius*.78))
      if (d >= 1) continue
      const strength = Math.exp(-d*d*4.5)*(1-d)*amount*dt*3.8
      const i = py*this.width+px
      this.density[i] += (1-this.density[i]!)*Math.min(1,strength)
      this.maximum = Math.max(this.maximum,this.density[i]!)
    }
  }
  wipe(from: Point, to: Point, radius: number) {
    if (!this.maximum) return
    const dx = to.x-from.x, dy = to.y-from.y, squared = dx*dx+dy*dy
    const left = Math.max(0,Math.floor(Math.min(from.x,to.x)-radius)), right = Math.min(this.width-1,Math.ceil(Math.max(from.x,to.x)+radius))
    const top = Math.max(0,Math.floor(Math.min(from.y,to.y)-radius)), bottom = Math.min(this.height-1,Math.ceil(Math.max(from.y,to.y)+radius))
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const t = squared ? Math.max(0,Math.min(1,((x-from.x)*dx+(y-from.y)*dy)/squared)) : 0
      const distance = Math.hypot(x-from.x-dx*t,y-from.y-dy*t)/radius
      if (distance >= 1) continue
      this.density[y*this.width+x] *= Math.max(0,Math.min(1,(distance-.65)/.35))
    }
  }
}

export function mouthOpening(landmarks: Point[], aspect: number) {
  if (landmarks.length < 309) return 0
  const left = landmarks[78]!, right = landmarks[308]!, upper = landmarks[13]!, lower = landmarks[14]!
  const width = Math.hypot((left.x-right.x)*aspect,left.y-right.y)
  const gap = Math.hypot((upper.x-lower.x)*aspect,upper.y-lower.y)
  return Math.max(0,Math.min(1,(gap/Math.max(.001,width)-.12)/.38))
}
