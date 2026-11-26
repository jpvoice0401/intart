import { watchLocalPoint, wrapWatchAngle, type WatchMechanism, type WatchPoint, type WatchPose } from './rolex-model.ts'
import type { WatchTip } from './rolex-hands'

export interface RaisedWatchHand {
  center: WatchPoint
  tip: WatchPoint
  radius: number
  strength: number
}

/** Enter once near the wrist; then keep the same fingertip through large circles. */
export class WatchDialControl {
  visual: RaisedWatchHand | null = null
  active = false
  private mechanism: WatchMechanism
  private id: string | null = null
  private tipNumber = 8
  private lastPoint: WatchPoint | null = null
  private lastSample = -Infinity
  private lastFresh = -Infinity
  private started = 0
  constructor(mechanism: WatchMechanism) { this.mechanism = mechanism }

  update(tips: WatchTip[], pose: WatchPose | null, now: number) {
    if (!pose) { this.release(); return }
    const fresh = tips.filter(tip => Number.isFinite(tip.x) && Number.isFinite(tip.y) && Number.isFinite(tip.sampledAt) && now-tip.sampledAt < .45 && now-tip.sampledAt > -.1)
    let selected: WatchTip | undefined
    if (this.active) {
      selected = fresh.find(tip => tip.id === this.id)
      // Reacquire the same finger if the detector renames its hand during overlap.
      if (!selected && this.lastPoint) {
        selected = fresh.filter(tip => tip.tip === this.tipNumber && Math.hypot(tip.x-this.lastPoint!.x,tip.y-this.lastPoint!.y) < Math.max(180,pose.radius*5))
          .sort((a,b) => Math.hypot(a.x-this.lastPoint!.x,a.y-this.lastPoint!.y)-Math.hypot(b.x-this.lastPoint!.x,b.y-this.lastPoint!.y))[0]
      }
    } else {
      // A fingertip pad can reach the bezel without its landmark landing exactly
      // on the small dial; include the center and account for camera jitter.
      const reach = Math.max(60,pose.radius*1.85)
      selected = fresh.filter(tip => Math.hypot(tip.x-pose.x,tip.y-pose.y) <= reach)
        .sort((a,b) => Number(b.tip === 8)-Number(a.tip === 8) || Math.hypot(a.x-pose.x,a.y-pose.y)-Math.hypot(b.x-pose.x,b.y-pose.y))[0]
      if (selected) {
        this.active = true; this.started = now; this.lastSample = -Infinity
      }
    }
    if (selected) {
      this.id = selected.id; this.tipNumber = selected.tip
      if (selected.sampledAt !== this.lastSample) {
        const dx = selected.x-pose.x, dy = selected.y-pose.y
        const faceUp = Math.atan2(-pose.c,pose.d)
        const local = watchLocalPoint(selected,pose)
        const angle = Math.hypot(dx,dy) > Math.max(6,pose.radius*.12)
          ? local ? Math.atan2(local.x,-local.y) : wrapWatchAngle(Math.atan2(dx,-dy)-faceUp) : this.mechanism.angles.minute
        // The captured input id is independent of MediaPipe's transient ids.
        this.mechanism.controlAngle('raised-watch-hand',angle,selected.sampledAt)
        this.lastPoint = {x:selected.x,y:selected.y}
        this.lastSample = selected.sampledAt; this.lastFresh = now
      }
    }
    if (!this.active || now-this.lastFresh > .45) { this.release(); return }
    this.mechanism.keepGripAlive(now)
    const point = this.lastPoint!
    const dx = point.x-pose.x, dy = point.y-pose.y, length = Math.hypot(dx,dy)
    // At the center, generate an obvious hand along the current minute angle.
    const screenAngle = this.mechanism.angles.minute+Math.atan2(-pose.c,pose.d)
    const tip = length < Math.max(12,pose.radius*.35)
      ? {x:pose.x+Math.sin(screenAngle)*Math.max(48,pose.radius*1.35),y:pose.y-Math.cos(screenAngle)*Math.max(48,pose.radius*1.35)}
      : {...point}
    this.visual = {center:{x:pose.x,y:pose.y},tip,radius:pose.radius,strength:Math.max(.3,Math.min(1,(now-this.started)/.12))}
  }
  release() {
    this.active = false; this.id = null; this.visual = null; this.lastPoint = null
    this.lastSample = this.lastFresh = -Infinity; this.mechanism.release()
  }
}

/** The generated control hand renders AFTER the camera's foreground fingers. */
export function drawRaisedWatchHand(ctx: CanvasRenderingContext2D, hand: RaisedWatchHand) {
  const {center,tip,radius,strength} = hand
  const dx = tip.x-center.x, dy = tip.y-center.y, distance = Math.hypot(dx,dy)
  if (distance < .01) return
  const ux = dx/distance, uy = dy/distance, nx = -uy, ny = ux
  const width = Math.max(2.5,Math.min(6,radius*.065)), tail = Math.max(8,radius*.2)
  ctx.save(); ctx.globalAlpha *= strength
  ctx.shadowColor = '#efdf9b9c'; ctx.shadowBlur = 11
  const gradient = ctx.createLinearGradient(center.x+nx*width,center.y+ny*width,center.x-nx*width,center.y-ny*width)
  gradient.addColorStop(0,'#a8833d'); gradient.addColorStop(.32,'#fff4cc'); gradient.addColorStop(.62,'#e7cd83'); gradient.addColorStop(1,'#82662f')
  ctx.fillStyle = gradient; ctx.strokeStyle = '#fff6d8e6'; ctx.lineWidth = .8
  ctx.beginPath(); ctx.moveTo(center.x-ux*tail+nx*width,center.y-uy*tail+ny*width)
  ctx.lineTo(tip.x-ux*12+nx*width*.65,tip.y-uy*12+ny*width*.65); ctx.lineTo(tip.x,tip.y)
  ctx.lineTo(tip.x-ux*12-nx*width*.65,tip.y-uy*12-ny*width*.65)
  ctx.lineTo(center.x-ux*tail-nx*width,center.y-uy*tail-ny*width); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#fffef1'; ctx.lineWidth = Math.max(1,width*.45)
  ctx.beginPath(); ctx.moveTo(center.x+ux*10,center.y+uy*10); ctx.lineTo(tip.x-ux*13,tip.y-uy*13); ctx.stroke()
  ctx.fillStyle = '#efe1b0'; ctx.beginPath(); ctx.arc(center.x,center.y,Math.max(5,radius*.075),0,Math.PI*2); ctx.fill()
  ctx.fillStyle = '#59664e'; ctx.beginPath(); ctx.arc(center.x,center.y,2,0,Math.PI*2); ctx.fill()
  ctx.strokeStyle = '#f8eac1e6'; ctx.lineWidth = 1.4
  ctx.beginPath(); ctx.arc(tip.x,tip.y,9,0,Math.PI*2); ctx.stroke(); ctx.restore()
}
