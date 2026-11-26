export interface RubberPoint { x: number; y: number; z?: number }
export interface RubberHand { id: string; points: RubberPoint[] }
export interface RubberTracking { face: RubberPoint[] | null; hands: RubberHand[] }
interface FaceShape { center: RubberPoint; ux: number; uy: number; rx: number; ry: number; outline: RubberPoint[] }
interface Grab {
  id: string; anchor: RubberPoint; target: RubberPoint; held: boolean; seen: number
  x: number; y: number; vx: number; vy: number
}

// Ordered MediaPipe face oval. Catmull–Rom interpolation rounds the silhouette;
// this is not the sparse, visibly triangular landmark triangulation.
const OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
export const RUBBER_SEGMENTS = 128
export const RUBBER_RINGS = 28
const VERTICES = 1 + RUBBER_SEGMENTS * RUBBER_RINGS
const finite = (p: RubberPoint) => Number.isFinite(p.x) && Number.isFinite(p.y)
const distance = (a: RubberPoint, b: RubberPoint, aspect: number) => Math.hypot((a.x - b.x) * aspect, a.y - b.y)
function kernelAt(dx:number,dy:number):number {
  const base=Math.max(0,1-(dx*dx+dy*dy)/2.1025)
  return base**3
}

const CURVE_SAMPLES=Array.from({length:RUBBER_SEGMENTS},(_,j)=>{
  const t=j/RUBBER_SEGMENTS*OVAL.length,i=Math.floor(t),n=OVAL.length
  return {a:(i+n-1)%n,b:i%n,c:(i+1)%n,d:(i+2)%n,f:t-i}
})
function curveSample(a:number,b:number,c:number,d:number,f:number):number {
  return .5*(2*b+(-a+c)*f+(2*a-5*b+4*c-d)*f*f+(-a+3*b-3*c+d)*f*f*f)
}

/** Camera coordinates stay unmirrored. Rendering and pointer input share cover.
 * All springs integrate in seconds using bounded substeps, independently of FPS. */
export class RubberHumanModel {
  readonly source = new Float32Array(VERTICES * 2)
  readonly positions = new Float32Array(VERTICES * 2)
  readonly radial = new Float32Array(VERTICES)
  readonly indices: Uint16Array
  private locals = new Float32Array(VERTICES * 2)
  private shape: FaceShape | null = null
  private grabs = new Map<string, Grab>()
  private pinches = new Map<string, boolean>()
  private pinchSeen = new Map<string, number>()
  private consumed = new Set<string>()
  private faceSeen = -Infinity
  private meshDirty = false
  private pulls: Grab[] = []
  private returning: Grab[] = []
  private offsets = new Float64Array(4)
  private fields = new Float64Array(48*8)
  sourceRevision = 0
  positionRevision = 0
  face: RubberPoint[] | null = null
  hands: RubberHand[] = []
  aspect = 16/9
  visible = false

  constructor() {
    const triangles: number[] = []
    for (let ring=1;ring<=RUBBER_RINGS;ring++) for (let j=0;j<RUBBER_SEGMENTS;j++) {
      const a=1+(ring-1)*RUBBER_SEGMENTS+j, b=1+(ring-1)*RUBBER_SEGMENTS+(j+1)%RUBBER_SEGMENTS
      this.radial[a]=ring/RUBBER_RINGS
      if (ring===1) triangles.push(0,a,b)
      else { const c=a-RUBBER_SEGMENTS, d=b-RUBBER_SEGMENTS; triangles.push(c,a,b,c,b,d) }
    }
    this.indices = new Uint16Array(triangles)
  }

  get active() { return this.grabs.size > 0 }
  get stretchAmount() {
    if (!this.shape) return 0
    let amount=0
    for (const grab of this.grabs.values()) amount=Math.max(amount,Math.hypot(grab.x,grab.y)/Math.max(this.shape.rx,this.shape.ry))
    return amount
  }
  get heldCount() { let n=0; for (const grab of this.grabs.values()) if (grab.held) n++; return n }
  get center(): RubberPoint { return this.shape?.center ?? {x:.5,y:.5} }

  private world(point: RubberPoint): RubberPoint {
    const s=this.shape!
    return {x:s.center.x+(point.x*s.rx*s.ux-point.y*s.ry*s.uy)/this.aspect,y:s.center.y+point.x*s.rx*s.uy+point.y*s.ry*s.ux}
  }

  receive(data: RubberTracking, now: number, aspect: number) {
    this.aspect=aspect
    if (data.face && data.face.length>=468 && data.face.every(finite)) {
      const p=data.face
      // Smooth landmarks only slightly; the grab spring handles hand jitter.
      if (!this.face || this.face.length!==p.length) this.face=p.map(point=>({...point}))
      else {
        const smooth=now-this.faceSeen<300
        for(let i=0;i<p.length;i++) {
          const previous=this.face[i]!,point=p[i]!
          previous.x=smooth?previous.x+(point.x-previous.x)*.72:point.x
          previous.y=smooth?previous.y+(point.y-previous.y)*.72:point.y
        }
      }
      const points=this.face, left=points[234]!, right=points[454]!, top=points[10]!, bottom=points[152]!
      const dx=(right.x-left.x)*aspect, dy=right.y-left.y, span=Math.hypot(dx,dy)
      if (span<.045) { this.visible=false; this.releaseAll(); return }
      this.shape={center:{x:(left.x+right.x)/2,y:(top.y+bottom.y)/2},ux:dx/span,uy:dy/span,rx:span/2,ry:Math.max(.04,distance(top,bottom,aspect)/2),outline:OVAL.map(i=>points[i]!)}
      this.faceSeen=now; this.visible=true; this.rebuildRestMesh()
    } else if (now-this.faceSeen>350) { this.visible=false; this.releaseAll() }
    this.hands=data.hands.filter(hand=>hand.points.length>=21 && hand.points.every(finite))
    const present=new Set<string>()
    for (const hand of this.hands) {
      present.add(hand.id)
      this.pinchSeen.set(hand.id,now)
      const p=hand.points, span=Math.max(.025,distance(p[5]!,p[17]!,aspect),distance(p[0]!,p[9]!,aspect))
      const separation=Math.hypot((p[4]!.x-p[8]!.x)*aspect,p[4]!.y-p[8]!.y,((p[4]!.z??0)-(p[8]!.z??0))*aspect*.65)/span
      const was=this.pinches.get(hand.id)??false
      const closed=separation<(was ? .48 : .30)
      this.pinches.set(hand.id,closed)
      const point={x:(p[4]!.x+p[8]!.x)/2,y:(p[4]!.y+p[8]!.y)/2}
      if (!closed) this.consumed.delete(hand.id)
      // A pinch may start just outside the face, then move onto it. Attach at
      // the first actual face hit, only once until the fingers open again.
      if (closed && !this.consumed.has(hand.id) && this.begin(hand.id,point,now)) this.consumed.add(hand.id)
      const grab=this.grabs.get(hand.id)
      if (grab?.held) { grab.target=point; grab.seen=now; if (!closed) { grab.held=false; this.meshDirty=true } }
    }
    for (const id of this.pinches.keys()) if (!present.has(id) && now-(this.pinchSeen.get(id)??-Infinity)>300) {
      this.pinches.delete(id); this.pinchSeen.delete(id); this.consumed.delete(id)
    }
  }

  begin(id: string, point: RubberPoint, now: number): boolean {
    if (!this.visible || !this.shape || this.heldCount>=2) return false
    this.updateMesh()
    const anchor=this.hit(point)
    if (!anchor) return false
    for (const grab of this.grabs.values()) if (grab.held && Math.hypot(grab.anchor.x-anchor.x,grab.anchor.y-anchor.y)<.3) return false
    const origin=this.world(anchor)
    this.grabs.set(id,{id,anchor,target:point,seen:now,held:true,x:(point.x-origin.x)*this.aspect,y:point.y-origin.y,vx:0,vy:0})
    this.meshDirty=true
    return true
  }
  movePointer(point: RubberPoint, now: number) { const grab=this.grabs.get('pointer'); if (grab?.held) { grab.target=point; grab.seen=now } }
  releasePointer() { const grab=this.grabs.get('pointer'); if (grab?.held) { grab.held=false; this.meshDirty=true } }
  releaseAll() { for (const grab of this.grabs.values()) if (grab.held) { grab.held=false; this.meshDirty=true }; this.pinches.clear(); this.pinchSeen.clear(); this.consumed.clear() }
  reset() { this.grabs.clear(); this.pinches.clear(); this.pinchSeen.clear(); this.consumed.clear(); this.meshDirty=true; this.updateMesh() }

  /** Barycentric hit testing on the already deformed mask lets the second hand
   * grab its visible location, rather than the original, hidden face location. */
  private hit(point: RubberPoint): RubberPoint | null {
    const p=this.positions, local=this.locals, idx=this.indices
    for (let i=idx.length-3;i>=0;i-=3) {
      const a=idx[i]!*2,b=idx[i+1]!*2,c=idx[i+2]!*2
      const ax=p[a]!,ay=p[a+1]!,bx=p[b]!,by=p[b+1]!,cx=p[c]!,cy=p[c+1]!
      const denominator=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
      if (Math.abs(denominator)<1e-10) continue
      const u=((by-cy)*(point.x-cx)+(cx-bx)*(point.y-cy))/denominator
      const v=((cy-ay)*(point.x-cx)+(ax-cx)*(point.y-cy))/denominator, w=1-u-v
      if (u>=0 && v>=0 && w>=0) return {x:local[a]!*u+local[b]!*v+local[c]!*w,y:local[a+1]!*u+local[b+1]!*v+local[c+1]!*w}
    }
    return null
  }

  update(delta: number, now: number) {
    if (now-this.faceSeen>350) { this.visible=false; this.releaseAll() }
    if (!this.shape) return
    const dt=Math.min(.05,Math.max(0,delta)), steps=Math.max(1,Math.ceil(dt/.008)), h=dt/steps
    for (const [id,grab] of this.grabs) {
      if (grab.held && grab.id!=='pointer' && now-grab.seen>300) { grab.held=false; this.meshDirty=true }
      const s=this.shape,originX=s.center.x+(grab.anchor.x*s.rx*s.ux-grab.anchor.y*s.ry*s.uy)/this.aspect
      const originY=s.center.y+grab.anchor.x*s.rx*s.uy+grab.anchor.y*s.ry*s.ux
      let tx=grab.held?(grab.target.x-originX)*this.aspect:0, ty=grab.held?grab.target.y-originY:0
      // Bound pathological tracking jumps while permitting long, rubbery pulls.
      const length=Math.hypot(tx,ty), limit=.85
      if (length>limit) { tx*=limit/length; ty*=limit/length }
      const stiffness=grab.held?260:155, damping=grab.held?29:13
      const oldX=grab.x,oldY=grab.y
      for (let step=0;step<steps;step++) {
        grab.vx+=((tx-grab.x)*stiffness-grab.vx*damping)*h
        grab.vy+=((ty-grab.y)*stiffness-grab.vy*damping)*h
        grab.x+=grab.vx*h; grab.y+=grab.vy*h
      }
      if (oldX!==grab.x || oldY!==grab.y) this.meshDirty=true
      if (!grab.held && Math.hypot(grab.x,grab.y,grab.vx*.1,grab.vy*.1)<.0003) { this.grabs.delete(id); this.meshDirty=true }
    }
    this.updateMesh()
  }

  private rebuildRestMesh() {
    if (!this.shape) return
    const s=this.shape
    const write=(index:number,x:number,y:number) => {
      const offset=index*2,dx=(x-s.center.x)*this.aspect,dy=y-s.center.y
      this.source[offset]=x; this.source[offset+1]=y
      this.locals[offset]=(dx*s.ux+dy*s.uy)/s.rx; this.locals[offset+1]=(-dx*s.uy+dy*s.ux)/s.ry
    }
    write(0,s.center.x,s.center.y)
    for (let j=0;j<RUBBER_SEGMENTS;j++) {
      const sample=CURVE_SAMPLES[j]!,a=s.outline[sample.a]!,b=s.outline[sample.b]!,c=s.outline[sample.c]!,d=s.outline[sample.d]!
      const edgeX=curveSample(a.x,b.x,c.x,d.x,sample.f),edgeY=curveSample(a.y,b.y,c.y,d.y,sample.f)
      for (let ring=1;ring<=RUBBER_RINGS;ring++) {
        const t=ring/RUBBER_RINGS
        write(1+(ring-1)*RUBBER_SEGMENTS+j,s.center.x+(edgeX-s.center.x)*t,s.center.y+(edgeY-s.center.y)*t)
      }
    }
    this.sourceRevision++; this.meshDirty=true
  }

  private updateMesh() {
    if (!this.shape || !this.meshDirty) return
    this.meshDirty=false; this.positionRevision++
    const pulls=this.pulls,returning=this.returning
    pulls.length=returning.length=0
    for(const grab of this.grabs.values()) { if(grab.held) pulls.push(grab); else returning.push(grab) }
    for(let i=returning.length-1;pulls.length<2&&i>=0;i--) pulls.push(returning[i]!)
    pulls.length=Math.min(2,pulls.length)
    if (!pulls.length) { this.positions.set(this.source); return }
    const s=this.shape
    const offsets=this.offsets,fields=this.fields
    let length=0
    for(let i=0;i<pulls.length;i++) {
      const grab=pulls[i]!
      offsets[i*2]=(grab.x*s.ux+grab.y*s.uy)/s.rx; offsets[i*2+1]=(-grab.x*s.uy+grab.y*s.ux)/s.ry
      length=Math.max(length,Math.hypot(offsets[i*2]!,offsets[i*2+1]!))
    }
    const steps=Math.max(1,Math.min(48,Math.ceil(length/.09)))
    // Advect the rubber through a smooth moving field in small steps. A single
    // large Gaussian displacement folds the face over itself during long pulls.
    // Here the field follows the grab, making a curved neck without that fold.
    const second=pulls[1],ax=offsets[0]!,ay=offsets[1]!,bx=second?offsets[2]!:0,by=second?offsets[3]!:0
    for(let step=0;step<steps;step++){
      const t=step/steps,first=pulls[0]!,slot=step*8
      const anchorX=first.anchor.x+ax*t,anchorY=first.anchor.y+ay*t
      const otherX=second?second.anchor.x+bx*t:100,otherY=second?second.anchor.y+by*t:100
      const coupling=second?Math.min(.94,kernelAt(anchorX-otherX,anchorY-otherY)):0,divisor=(1-coupling*coupling)*steps
      let dx=(ax-coupling*bx)/divisor,dy=(ay-coupling*by)/divisor
      let ex=(bx-coupling*ax)/divisor,ey=(by-coupling*ay)/divisor
      // Near-coincident targets are ill-conditioned. Bound each integration step
      // instead of producing an explosive displacement when hands cross.
      const bound=Math.max(1,(Math.hypot(dx,dy)+Math.hypot(ex,ey))/.18)
      dx/=bound;dy/=bound;ex/=bound;ey/=bound
      fields[slot]=anchorX;fields[slot+1]=anchorY;fields[slot+2]=otherX;fields[slot+3]=otherY
      fields[slot+4]=dx;fields[slot+5]=dy;fields[slot+6]=ex;fields[slot+7]=ey
    }
    for (let offset=0;offset<this.source.length;offset+=2) {
      let x=this.locals[offset]!,y=this.locals[offset+1]!
      for (let slot=0;slot<steps*8;slot+=8) {
        const w=kernelAt(x-fields[slot]!,y-fields[slot+1]!)
        const v=second?kernelAt(x-fields[slot+2]!,y-fields[slot+3]!):0
        x+=fields[slot+4]!*w+fields[slot+6]!*v; y+=fields[slot+5]!*w+fields[slot+7]!*v
      }
      this.positions[offset]=s.center.x+(x*s.rx*s.ux-y*s.ry*s.uy)/this.aspect
      this.positions[offset+1]=s.center.y+x*s.rx*s.uy+y*s.ry*s.ux
    }
  }
}
