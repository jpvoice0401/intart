export interface Point { x: number; y: number }
export interface SurfaceSample { distance: number; nx: number; ny: number }

/** Signed distance to the live person mask; positive values are free space. */
export class HumanSnowField {
  readonly columns: number
  readonly rows: number
  readonly solid: Uint8Array
  private distances: Float32Array
  private toSolid: Float32Array
  private toAir: Float32Array
  private cellX: number
  private cellY: number
  private width: number
  private height: number
  private sampleResult: SurfaceSample = { distance: 1e6, nx: 0, ny: -1 }
  hasPerson = false

  constructor(width: number, height: number, resolution = 224) {
    this.width = width; this.height = height
    this.columns = Math.max(32, Math.round(resolution * Math.min(1, width / height)))
    this.rows = Math.max(32, Math.round(resolution * Math.min(1, height / width)))
    this.cellX = width / this.columns; this.cellY = height / this.rows
    const count = this.columns * this.rows
    this.solid = new Uint8Array(count)
    this.distances = new Float32Array(count).fill(1e6)
    this.toSolid = new Float32Array(count)
    this.toAir = new Float32Array(count)
  }

  updateConfidence(mask: Float32Array, maskWidth: number, maskHeight: number, cover: Point) {
    let count = 0, changed = false
    for (let y = 0; y < this.rows; y++) {
      const sourceY = Math.min(maskHeight-1, Math.max(0, Math.floor(((y+.5)/this.rows-.5)*cover.y*maskHeight+maskHeight*.5)))
      for (let x = 0; x < this.columns; x++) {
        const sourceX = Math.min(maskWidth-1, Math.max(0, Math.floor((.5-((x+.5)/this.columns-.5)*cover.x)*maskWidth)))
        const i = y*this.columns+x
        // Hysteresis stops boundary flicker from shaking resting snow loose.
        const solid = mask[sourceY*maskWidth+sourceX]! > (this.solid[i] ? .43 : .59) ? 1 : 0
        if (solid !== this.solid[i]) changed = true
        this.solid[i] = solid
        count += this.solid[i]!
      }
    }
    this.hasPerson = count > this.solid.length * .008
    if (changed) this.rebuild()
  }

  clear() { this.solid.fill(0); this.distances.fill(1e6); this.hasPerson = false }

  /** Also used by physics tests with known silhouettes. */
  rebuild() {
    const w = this.columns, h = this.rows
    for (let i = 0; i < this.solid.length; i++) {
      this.toSolid[i] = this.solid[i] ? 0 : 1e6
      this.toAir[i] = this.solid[i] ? 1e6 : 0
    }
    const diagonal = Math.hypot(this.cellX, this.cellY)
    for (const data of [this.toSolid, this.toAir]) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y*w+x
        if (x) data[i] = Math.min(data[i]!, data[i-1]!+this.cellX)
        if (y) {
          data[i] = Math.min(data[i]!, data[i-w]!+this.cellY)
          if (x) data[i] = Math.min(data[i]!, data[i-w-1]!+diagonal)
          if (x+1<w) data[i] = Math.min(data[i]!, data[i-w+1]!+diagonal)
        }
      }
      for (let y = h-1; y >= 0; y--) for (let x = w-1; x >= 0; x--) {
        const i = y*w+x
        if (x+1<w) data[i] = Math.min(data[i]!, data[i+1]!+this.cellX)
        if (y+1<h) {
          data[i] = Math.min(data[i]!, data[i+w]!+this.cellY)
          if (x) data[i] = Math.min(data[i]!, data[i+w-1]!+diagonal)
          if (x+1<w) data[i] = Math.min(data[i]!, data[i+w+1]!+diagonal)
        }
      }
    }
    const halfCell = Math.min(this.cellX,this.cellY)*.5
    for (let i = 0; i < this.distances.length; i++) this.distances[i] = this.solid[i] ? -this.toAir[i]!+halfCell : this.toSolid[i]!-halfCell
  }

  private distance(x: number, y: number) {
    const gx = Math.max(0, Math.min(this.columns-1.001, x/this.cellX-.5))
    const gy = Math.max(0, Math.min(this.rows-1.001, y/this.cellY-.5))
    const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx-ix, fy = gy-iy, i = iy*this.columns+ix
    const a = this.distances[i]!*(1-fx)+this.distances[i+1]!*fx
    const b = this.distances[i+this.columns]!*(1-fx)+this.distances[i+this.columns+1]!*fx
    return a*(1-fy)+b*fy
  }

  sample(x: number, y: number): SurfaceSample {
    return this.sampleInto(x,y,{ distance: 1e6, nx: 0, ny: -1 })
  }

  collisionSample(x: number, y: number, radius: number): SurfaceSample {
    return this.sampleInto(x,y,this.sampleResult,radius)
  }

  private sampleInto(x: number, y: number, result: SurfaceSample, radius = Infinity): SurfaceSample {
    if (x < 0 || y < 0 || x > this.width || y > this.height) { result.distance = 1e6; result.nx = 0; result.ny = -1; return result }
    const distance = this.distance(x,y)
    result.distance = distance
    // Most falling flakes are far from the person: no gradient or normal needed.
    if (distance >= radius) return result
    const dx = (this.distance(x+this.cellX,y)-this.distance(x-this.cellX,y))/(2*this.cellX)
    const dy = (this.distance(x,y+this.cellY)-this.distance(x,y-this.cellY))/(2*this.cellY)
    const length = Math.hypot(dx,dy)
    result.nx = length > .001 ? dx/length : 0; result.ny = length > .001 ? dy/length : -1
    return result
  }
}

export interface SnowParticle extends Point {
  vx: number; vy: number; radius: number; age: number; phase: number; supported: boolean
}

export function collideWithHuman(p: SnowParticle, field: HumanSnowField, dt: number) {
  const surface = field.collisionSample(p.x,p.y,p.radius)
  if (surface.distance >= p.radius) return false
  const { nx, ny } = surface
  const correction = Math.min(24, p.radius-surface.distance+.05)
  p.x += nx*correction; p.y += ny*correction
  const normalSpeed = p.vx*nx+p.vy*ny
  const impulse = Math.max(0,-normalSpeed)
  if (normalSpeed < 0) { p.vx += nx*impulse*1.06; p.vy += ny*impulse*1.06 }
  const tangentSpeed = -p.vx*ny+p.vy*nx
  const supportImpulse = Math.max(impulse, Math.max(0,-ny)*90*dt)
  const friction = Math.abs(tangentSpeed) < supportImpulse*.72 ? Math.abs(tangentSpeed) : Math.min(Math.abs(tangentSpeed),supportImpulse*.48)
  const change = Math.sign(tangentSpeed)*friction
  p.vx += ny*change; p.vy -= nx*change
  if (ny < -.3) p.supported = true
  return true
}

/** Fixed-step granular snow: gravity, air drag, Coulomb friction and disk contacts. */
export class SnowPhysics {
  particles: SnowParticle[] = []
  private width: number
  private height: number
  private accumulator = 0
  private random: () => number
  private bucketHeads = new Int32Array(0)
  private bucketTails = new Int32Array(0)
  private bucketNext = new Int32Array(1600)
  constructor(width: number, height: number, random = Math.random) { this.width = width; this.height = height; this.random = random }
  resize(width: number, height: number) {
    for (const p of this.particles) { p.x *= width/this.width; p.y *= height/this.height }
    this.width = width; this.height = height
  }
  emit(x: number, y: number, spread: number, count: number) {
    for (let i = 0; i < count && this.particles.length < 1600; i++) this.particles.push({
      x: x+(this.random()-.5)*spread, y: y+this.random()*12,
      vx: (this.random()-.5)*15, vy: 10+this.random()*14, radius: 1.7+this.random()*1.8,
      age: 0, phase: this.random()*Math.PI*2, supported: false,
    })
  }
  clear() { this.particles = []; this.accumulator = 0 }
  update(elapsed: number, field: HumanSnowField) {
    this.accumulator += Math.min(.08,elapsed)
    while (this.accumulator >= 1/60) { this.step(1/60,field); this.accumulator -= 1/60 }
  }
  private step(dt: number, field: HumanSnowField) {
    const horizontalDrag = Math.exp(-.7*dt), verticalDrag = Math.exp(-1.35*dt)
    for (const p of this.particles) {
      p.age += dt
      if (!p.supported) p.vx += Math.sin(p.age*1.9+p.phase)*10*dt
      p.vx *= horizontalDrag
      p.vy = (p.vy+90*dt)*verticalDrag
      p.x += p.vx*dt; p.y += p.vy*dt
      p.supported = false
    }
    const stride = Math.ceil((this.width+200)/9)
    const rows = Math.ceil((this.height+220)/9)
    const cells = stride*rows
    if (this.bucketNext.length < this.particles.length) this.bucketNext = new Int32Array(this.particles.length)
    if (this.bucketHeads.length !== cells) { this.bucketHeads = new Int32Array(cells); this.bucketTails = new Int32Array(cells) }
    const heads = this.bucketHeads, tails = this.bucketTails, next = this.bucketNext
    // Reuse contiguous buffers; retain the original ascending neighbour order.
    for (let iteration = 0; iteration < 4; iteration++) {
      heads.fill(-1); tails.fill(-1)
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i]!
        collideWithHuman(p,field,dt/4)
        const cx = Math.floor((p.x+100)/9), cy = Math.floor((p.y+100)/9)
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const bx = cx+ox, by = cy+oy
          if (bx < 0 || bx >= stride || by < 0 || by >= rows) continue
          for (let j = heads[by*stride+bx]!; j !== -1; j = next[j]!) {
            const q = this.particles[j]!, dx = p.x-q.x, dy = p.y-q.y
            const radii = p.radius+q.radius, squared = dx*dx+dy*dy
            if (squared >= radii*radii) continue
            const distance = Math.sqrt(squared)
            const nx = distance > .001 ? dx/distance : 0, ny = distance > .001 ? dy/distance : -1
            const separation = (radii-distance)*.5
            p.x += nx*separation; p.y += ny*separation
            q.x -= nx*separation; q.y -= ny*separation
            const vn = (p.vx-q.vx)*nx+(p.vy-q.vy)*ny
            const impulse = Math.max(0,-vn)*.5
            p.vx += nx*impulse; p.vy += ny*impulse; q.vx -= nx*impulse; q.vy -= ny*impulse
            const vt = -(p.vx-q.vx)*ny+(p.vy-q.vy)*nx
            const friction = Math.sign(vt)*Math.min(Math.abs(vt)*.5,Math.max(impulse,.2)*.6)
            p.vx += ny*friction; p.vy -= nx*friction; q.vx -= ny*friction; q.vy += nx*friction
            if (ny < -.4) p.supported = true
            if (ny > .4) q.supported = true
          }
        }
        const key = cy*stride+cx
        if (cx >= 0 && cx < stride && cy >= 0 && cy < rows) {
          next[i] = -1
          if (heads[key] === -1) heads[key] = i
          else next[tails[key]!] = i
          tails[key] = i
        }
      }
    }
    let alive = 0
    for (const p of this.particles) if (p.y < this.height+20 && p.x > -40 && p.x < this.width+40 && p.age < 100) this.particles[alive++] = p
    this.particles.length = alive
  }
}
