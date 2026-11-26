import type { Point, SnowParticle } from './snow-physics'

export interface SnowMover extends Point { id: string; radius: number; sampledAt: number }
export interface RollingSnowball extends Point {
  radius: number; targetRadius: number; mass: number; angle: number; origin: Point
}
export type SnowmanPhase = 'waiting' | 'gathering' | 'assembling' | 'complete'
export interface SnowmanView {
  balls: readonly RollingSnowball[]; center: Point; ground: number; decoration: number
  gathering: boolean; phase: SnowmanPhase
}
interface SnowTouch { at: number; x: number; y: number }

/** Moving fingers/palms push real flakes. A dense, swept pile seeds each snowman. */
export class SnowmanBuilder implements SnowmanView {
  readonly balls: RollingSnowball[] = []
  readonly collected: SnowParticle[] = []
  phase: SnowmanPhase = 'waiting'
  gathering = false
  center: Point = { x: 0, y: 0 }
  ground = 0
  completedCount = 0
  private width: number
  private height: number
  private clock = 0
  private assemblyTime = 0
  private baseRadius = 30
  private travel = 0
  private gatherRadius = 100
  private captureBudget = 0
  private previous = new Map<string,SnowMover>()
  private touched = new WeakMap<SnowParticle,SnowTouch>()
  private completed: SnowmanView | null = null
  private bins = new Float64Array(0)
  private counts = new Uint16Array(0)
  private sumsX = new Float64Array(0)
  private sumsY = new Float64Array(0)

  constructor(width: number, height: number) { this.width = width; this.height = height; this.resize(width,height) }
  resize(width: number, height: number) {
    const sx = width/this.width, sy = height/this.height
    this.center.x *= sx; this.center.y *= sy; this.ground *= sy
    for (const ball of this.balls) { ball.x *= sx; ball.y *= sy; ball.origin.x *= sx; ball.origin.y *= sy }
    for (const particle of this.collected) { particle.x *= sx; particle.y *= sy }
    this.width = width; this.height = height
    this.previous.clear(); this.touched = new WeakMap()
    if (!this.balls.length) this.baseRadius = Math.max(24,Math.min(40,width*.035))
    if (this.phase === 'complete') {
      this.center.x = Math.max(this.baseRadius*1.5,Math.min(width-this.baseRadius*1.5,this.center.x))
      this.ground = Math.min(height*.82,Math.max(this.baseRadius*4.5,this.ground))
      let stackHeight = 0
      for (const ball of this.balls) { ball.x = this.center.x; ball.y = this.ground-stackHeight-ball.radius; stackHeight += ball.radius*1.82 }
    }
  }
  private clearConstruction() {
    this.balls.length = 0; this.collected.length = 0; this.phase = 'waiting'; this.gathering = false
    this.assemblyTime = 0; this.travel = 0; this.captureBudget = 0
  }
  reset() {
    this.clearConstruction(); this.clock = 0; this.completedCount = 0; this.completed = null
    this.previous.clear(); this.touched = new WeakMap()
  }
  get progress() {
    return Math.min(1,this.balls.reduce((mass,ball) => mass+ball.mass,0)/(this.baseRadius**2*(1+.72**2+.52**2)))
  }
  get decoration() { return this.phase === 'complete' ? 1 : this.phase === 'assembling' ? Math.max(0,Math.min(1,(this.assemblyTime-1.6)/.9)) : 0 }
  takeCompleted() { const completed = this.completed; this.completed = null; return completed }

  private pushSnow(movers: SnowMover[], particles: SnowParticle[]) {
    const next = new Map<string,SnowMover>()
    for (const mover of movers) {
      const previous = this.previous.get(mover.id)
      next.set(mover.id,mover)
      if (!previous) continue
      const elapsed = mover.sampledAt-previous.sampledAt
      if (elapsed <= 0 || elapsed > .2) continue
      const dx = mover.x-previous.x, dy = mover.y-previous.y, length = Math.hypot(dx,dy)
      // Ignore tracking jitter and reacquisition jumps; a held hand is not a magnet.
      if (length < 1.5 || length > Math.max(160,this.width*.25) || length/elapsed < 35) continue
      const radius = Math.max(10,Math.min(75,mover.radius)), speed = Math.min(1200,length/elapsed)
      const squared = length*length
      for (const particle of particles) {
        const t = Math.max(0,Math.min(1,((particle.x-previous.x)*dx+(particle.y-previous.y)*dy)/squared))
        const distance = Math.hypot(particle.x-previous.x-dx*t,particle.y-previous.y-dy*t)
        if (distance > radius+particle.radius) continue
        const contact = 1-distance/(radius+particle.radius)
        const blend = Math.min(.8,(1-Math.exp(-elapsed*32))*contact)
        // Snow receives the direction of the sweep, rather than being pulled to it.
        const targetSpeed = Math.min(240,speed*.65)
        particle.vx += (dx/length*targetSpeed-particle.vx)*blend
        particle.vy += (dy/length*targetSpeed-particle.vy)*blend
        const touch = this.touched.get(particle)
        if (touch && this.clock-touch.at < 2.5) touch.at = this.clock
        else this.touched.set(particle,{at:this.clock,x:particle.x,y:particle.y})
      }
    }
    this.previous = next
  }

  private findSweptPile(particles: SnowParticle[]) {
    const cell = this.baseRadius*1.6, columns = Math.ceil(this.width/cell), rows = Math.ceil(this.height/cell)
    const size = columns*rows
    if (this.bins.length !== size) {
      this.bins = new Float64Array(size); this.counts = new Uint16Array(size)
      this.sumsX = new Float64Array(size); this.sumsY = new Float64Array(size)
    } else { this.bins.fill(0); this.counts.fill(0); this.sumsX.fill(0); this.sumsY.fill(0) }
    for (const particle of particles) {
      const touch = this.touched.get(particle)
      if (!touch || this.clock-touch.at > 2.5 || Math.hypot(particle.x-touch.x,particle.y-touch.y) < 4) continue
      const x = Math.floor(particle.x/cell), y = Math.floor(particle.y/cell)
      if (x < 0 || y < 0 || x >= columns || y >= rows) continue
      const index = y*columns+x, mass = particle.radius**2
      this.bins[index] += mass; this.counts[index]++
      this.sumsX[index] += particle.x*mass; this.sumsY[index] += particle.y*mass
    }
    let best: Point | null = null, bestMass = this.baseRadius**2*.13
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      if (!this.counts[y*columns+x]) continue
      let mass = 0, count = 0, sumX = 0, sumY = 0
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const xx = x+ox, yy = y+oy
        if (xx < 0 || yy < 0 || xx >= columns || yy >= rows) continue
        const index = yy*columns+xx
        mass += this.bins[index]!; count += this.counts[index]!
        sumX += this.sumsX[index]!; sumY += this.sumsY[index]!
      }
      if (count >= 8 && mass > bestMass) { bestMass = mass; best = {x:sumX/mass,y:sumY/mass} }
    }
    if (!best) return null
    let localMass = 0, localCount = 0, localX = 0, localY = 0
    for (const particle of particles) {
      const touch = this.touched.get(particle)
      if (!touch || this.clock-touch.at > 2.5 || Math.hypot(particle.x-touch.x,particle.y-touch.y) < 4) continue
      if (Math.hypot(particle.x-best.x,particle.y-best.y) > this.baseRadius*1.5) continue
      const mass = particle.radius**2
      localMass += mass; localCount++; localX += particle.x*mass; localY += particle.y*mass
    }
    return localCount >= 8 && localMass > this.baseRadius**2*.13 ? {x:localX/localMass,y:localY/localMass} : null
  }

  update(dt: number, movers: SnowMover[], particles: SnowParticle[]) {
    dt = Math.max(0,Math.min(.08,dt)); this.clock += dt
    if (this.phase === 'complete') this.clearConstruction()
    this.pushSnow(movers,particles)
    this.gathering = false
    if (this.phase === 'assembling') { this.assemble(dt); return }
    if (this.phase === 'waiting') {
      const pile = this.findSweptPile(particles)
      if (!pile) return
      this.center = pile
      this.ground = Math.min(this.height*.82,Math.max(this.height*.58,pile.y+this.baseRadius*2.8))
      this.center.x = Math.max(this.baseRadius*1.5,Math.min(this.width-this.baseRadius*1.5,pile.x))
      this.gatherRadius = this.baseRadius*1.7+28
      this.phase = 'gathering'
    }
    const active = this.balls.find(ball => ball.mass < ball.targetRadius**2-.01)
    if (!active && this.balls.length < 3 && (particles.length || this.collected.length)) this.addBall()
    const ball = this.balls.find(item => item.mass < item.targetRadius**2-.01)
    if (ball) {
      this.gathering = this.collected.length > 0
      const beforeX = ball.x, beforeY = ball.y
      this.travel += dt*.8
      const targetX = this.center.x+Math.sin(this.travel)*this.baseRadius*.65
      const targetY = this.center.y+this.baseRadius*.65+Math.cos(this.travel*1.3)*5
      const blend = 1-Math.exp(-dt*5)
      ball.x += (targetX-ball.x)*blend; ball.y += (targetY-ball.y)*blend
      ball.angle += Math.sign(ball.x-beforeX || 1)*Math.hypot(ball.x-beforeX,ball.y-beforeY)/Math.max(4,ball.radius)
      this.captureBudget = Math.min(10,this.captureBudget+dt*95)
      let alive = 0
      for (const particle of particles) {
        if (Math.hypot(ball.x-particle.x,ball.y-particle.y) < this.gatherRadius && this.captureBudget >= 1 && this.collected.length < 160) {
          this.collected.push(particle); this.captureBudget--; this.gathering = true
        } else particles[alive++] = particle
      }
      particles.length = alive
      let travelling = 0
      for (const particle of this.collected) {
        const dx = ball.x-particle.x, dy = ball.y-particle.y, distance = Math.hypot(dx,dy)
        if (distance < ball.radius+particle.radius+6 && ball.mass < ball.targetRadius**2-.01) {
          ball.mass = Math.min(ball.targetRadius**2,ball.mass+particle.radius**2*2.1)
          ball.radius = Math.max(3,Math.sqrt(ball.mass))
          continue
        }
        const swirl = distance > ball.radius*2 ? 1 : 0, drag = Math.exp(-dt*5)
        particle.vx = (particle.vx+(dx*18-dy*swirl*3)*dt)*drag
        particle.vy = (particle.vy+(dy*18+dx*swirl*3)*dt)*drag
        particle.x += particle.vx*dt; particle.y += particle.vy*dt
        this.collected[travelling++] = particle
      }
      this.collected.length = travelling
      if (this.balls.length === 3 && this.balls.every(item => item.mass >= item.targetRadius**2-.01)) {
        this.phase = 'assembling'; this.assemblyTime = 0
        particles.push(...this.collected); this.collected.length = 0
        for (const item of this.balls) item.origin = {x:item.x,y:item.y}
        this.placeNextSnowman()
      }
    }
    this.balls.forEach((item,i) => {
      if (item === ball || this.phase === 'assembling') return
      const targetX = this.center.x+(i === 0 ? -1 : 1)*this.baseRadius*1.8, targetY = this.ground-item.radius
      const blend = 1-Math.exp(-dt*3), oldX = item.x
      item.x += (targetX-item.x)*blend; item.y += (targetY-item.y)*blend
      item.angle += (item.x-oldX)/Math.max(3,item.radius)
    })
  }

  private addBall() {
    const index = this.balls.length, targetRadius = this.baseRadius*[1,.72,.52][index]!
    const position = {x:this.center.x+(index%2 ? 1 : -1)*this.baseRadius*1.3,y:this.center.y+20}
    this.balls.push({...position,radius:3,targetRadius,mass:0,angle:0,origin:{...position}})
  }
  private placeNextSnowman() {
    if (!this.completedCount) return
    const margin = this.baseRadius*1.6, available = Math.max(1,this.width-margin*2)
    const columns = Math.max(1,Math.floor(available/(this.baseRadius*3.8))+1)
    const seed = Math.round((this.center.x-margin)/available*(columns-1))
    const offset = Math.ceil(this.completedCount/2)*(this.completedCount%2 ? 1 : -1)
    const column = ((seed+offset)%columns+columns)%columns
    this.center.x = columns > 1 ? margin+column*available/(columns-1) : this.width*.5
    // Once a row fills, stagger later creations instead of replacing old ones.
    this.ground -= Math.floor(this.completedCount/columns)%4*this.baseRadius*.45
  }
  private assemble(dt: number) {
    this.assemblyTime += dt
    let height = 0
    this.balls.forEach((ball,i) => {
      const targetY = this.ground-height-ball.radius
      height += ball.radius*1.82
      const t = Math.max(0,Math.min(1,(this.assemblyTime-i*.35)/1.65)), ease = t*t*(3-2*t), previousX = ball.x
      ball.x = ball.origin.x+(this.center.x-ball.origin.x)*ease
      ball.y = ball.origin.y+(targetY-ball.origin.y)*ease-Math.sin(t*Math.PI)*(i ? 45 : 12)
      ball.angle += (ball.x-previousX)/Math.max(3,ball.radius)
    })
    if (this.assemblyTime >= 2.5) {
      this.phase = 'complete'; this.completedCount++
      this.completed = {balls:this.balls.map(ball => ({...ball,origin:{...ball.origin}})),center:{...this.center},ground:this.ground,decoration:1,gathering:false,phase:'complete'}
      this.touched = new WeakMap()
    }
  }
}
