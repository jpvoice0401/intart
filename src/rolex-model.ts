export interface WatchPoint { x: number; y: number }
export interface WatchLandmark extends WatchPoint { z?: number }
export interface WatchPose {
  x: number; y: number; a: number; b: number; c: number; d: number; radius: number
}

export function watchLocalPoint(point: WatchPoint, pose: WatchPose) {
  const determinant = pose.a*pose.d-pose.b*pose.c
  if (Math.abs(determinant) < pose.radius**2*.12) return null
  const x = point.x-pose.x, y = point.y-pose.y
  return {x:(pose.d*x-pose.c*y)/determinant,y:(pose.a*y-pose.b*x)/determinant}
}

/** Infer a wrist plane from the wrist and MCP joints, including depth foreshortening. */
export function wristWatchPose(landmarks: WatchLandmark[], width: number, height: number, cover: WatchPoint): WatchPose | null {
  if (landmarks.length < 21) return null
  if (![0,5,9,17].every(index => Number.isFinite(landmarks[index]!.x) && Number.isFinite(landmarks[index]!.y) && Number.isFinite(landmarks[index]!.z ?? 0))) return null
  const point = (i: number) => {
    const p = landmarks[i]!
    return {x:(.5+(.5-p.x)/cover.x)*width,y:(.5+(p.y-.5)/cover.y)*height,z:(p.z ?? 0)*width/cover.x}
  }
  const wrist = point(0), index = point(5), little = point(17), middle = point(9)
  const span = {x:little.x-index.x,y:little.y-index.y,z:little.z-index.z}
  const spanLength = Math.hypot(span.x,span.y,span.z)
  const arm = {x:wrist.x-middle.x,y:wrist.y-middle.y,z:wrist.z-middle.z}
  const armLength = Math.hypot(arm.x,arm.y,arm.z)
  if (spanLength < 9 || armLength < 12) return null
  const v = {x:span.x/spanLength,y:span.y/spanLength,z:span.z/spanLength}
  const dot = arm.x*v.x+arm.y*v.y+arm.z*v.z
  const u = {x:arm.x-v.x*dot,y:arm.y-v.y*dot,z:arm.z-v.z*dot}
  const length = Math.hypot(u.x,u.y,u.z)
  if (length < 5) return null
  u.x /= length; u.y /= length; u.z /= length
  // Keep lettering readable on either hand; depth still compresses the dial.
  if (u.x*v.y-u.y*v.x < 0) { v.x *= -1; v.y *= -1 }
  const radius = Math.max(18,Math.min(width*.18,spanLength*.46))
  return {x:wrist.x+arm.x*.38,y:wrist.y+arm.y*.38,
    a:u.x*radius,b:u.y*radius,c:v.x*radius,d:v.y*radius,radius}
}

export function interpolateWatchPose(previous: WatchPose | null, next: WatchPose, elapsed: number) {
  if (!previous || Math.hypot(next.x-previous.x,next.y-previous.y) > next.radius*5) return {...next}
  const blend = 1-Math.exp(-Math.max(0,elapsed)*22)
  const result = {...next}
  for (const key of ['x','y','a','b','c','d','radius'] as const) result[key] = previous[key]+(next[key]-previous[key])*blend
  return result
}

export const wrapWatchAngle = (angle: number) => Math.atan2(Math.sin(angle),Math.cos(angle))
export function tickingFrequency(angularSpeed: number) {
  if (!Number.isFinite(angularSpeed)) return 2
  return 2+Math.min(28,Math.max(0,Math.abs(angularSpeed))**.9*1.8)
}

/** Fingertip rotation advances minutes directly and imparts decaying momentum. */
export class WatchMechanism {
  seconds = 10*3600+10*60+32
  velocity = 0
  dragging = false
  private grip: {id:string;angle:number;sampledAt:number} | null = null
  private lastInput = -Infinity
  private pushed = false

  sample(id: string, point: WatchPoint, sampledAt: number) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(sampledAt)) { this.release(id); return false }
    const distance = Math.hypot(point.x,point.y)
    if (distance < .09 || distance > (this.grip ? 1.55 : 1.22)) { this.release(id); return false }
    const angle = Math.atan2(point.x,-point.y)
    return this.applyAngle(id,angle,sampledAt,false)
  }
  /** Direct manipulation is captured by the controller, not a tiny dial hitbox. */
  controlAngle(id: string, angle: number, sampledAt: number) {
    if (!Number.isFinite(angle) || !Number.isFinite(sampledAt)) return false
    return this.applyAngle(id,angle,sampledAt,true)
  }
  keepGripAlive(now: number) { if (this.grip) this.lastInput = now }
  private applyAngle(id: string, angle: number, sampledAt: number, direct: boolean) {
    if (!this.grip || this.grip.id !== id || sampledAt-this.grip.sampledAt > .2) {
      if (direct) this.seconds += wrapWatchAngle(angle-this.angles.minute)*3600/(Math.PI*2)
      this.grip = {id,angle,sampledAt}; this.velocity = 0
      this.dragging = true; this.lastInput = sampledAt; return true
    }
    const dt = sampledAt-this.grip.sampledAt
    if (dt <= 0) return true
    const delta = wrapWatchAngle(angle-this.grip.angle)
    // Tracking teleports cannot wind the mechanism at an impossible speed.
    if (direct || Math.abs(delta) < 1.8) {
      this.seconds += (direct ? wrapWatchAngle(angle-this.angles.minute) : delta)*3600/(Math.PI*2)
      const speed = Math.max(-36,Math.min(36,delta/dt))
      this.velocity += (speed-this.velocity)*(1-Math.exp(-dt*24))
      this.pushed = true
    }
    this.grip = {id,angle,sampledAt}; this.lastInput = sampledAt; this.dragging = true
    return true
  }
  release(id?: string) {
    if (id && this.grip?.id !== id) return
    this.grip = null; this.dragging = false
  }
  update(dt: number, now: number) {
    dt = Math.max(0,Math.min(.08,dt))
    if (now-this.lastInput > .16) this.release()
    if (!this.dragging) {
      const decay = Math.exp(-dt*1.8)
      this.seconds += this.velocity*(1-decay)/1.8*3600/(Math.PI*2)
      this.velocity *= decay
    } else if (!this.pushed) this.velocity *= Math.exp(-dt*12)
    this.seconds = ((this.seconds+dt)%(86400*30)+86400*30)%(86400*30)
    this.pushed = false
  }
  get angles() {
    return {hour:this.seconds*Math.PI/21600,minute:this.seconds*Math.PI/1800,second:this.seconds*Math.PI/30}
  }
  get gripId() { return this.grip?.id ?? null }
  reset(seconds = 10*3600+10*60+32) { this.seconds = seconds; this.velocity = 0; this.release(); this.pushed = false }
  fling(speed: number) { this.release(); this.velocity = Math.max(-36,Math.min(36,speed)) }
}
