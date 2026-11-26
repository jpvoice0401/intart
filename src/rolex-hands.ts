import { watchLocalPoint, type WatchLandmark, type WatchPoint, type WatchPose } from './rolex-model.ts'

export interface TrackedWatchHand { id: string; label: string; landmarks: WatchLandmark[]; seen: number }
export interface WatchTip extends WatchPoint { id: string; tip: number; sampledAt: number }

/** MediaPipe result indexes can swap as the two hands overlap. Keep roles stable. */
export class WatchHandIdentities {
  private tracks = new Map<string,TrackedWatchHand>()
  private serial = 0
  update(landmarks: WatchLandmark[][], labels: string[], now: number) {
    for (const [id,track] of this.tracks) if (now-track.seen > 1400) this.tracks.delete(id)
    const assigned = new Map<number,string>(), used = new Set<string>()
    const pairs = landmarks.flatMap((hand,index) => [...this.tracks.values()].map(track => {
      const wrist = Math.hypot(hand[0]!.x-track.landmarks[0]!.x,hand[0]!.y-track.landmarks[0]!.y)
      const palm = Math.hypot(hand[9]!.x-track.landmarks[9]!.x,hand[9]!.y-track.landmarks[9]!.y)
      const label = labels[index] ?? ''
      return {index,id:track.id,cost:wrist*.7+palm*.3+(label && track.label && label !== track.label ? .38 : 0)}
    })).sort((a,b) => a.cost-b.cost)
    for (const pair of pairs) {
      if (pair.cost > .32 || assigned.has(pair.index) || used.has(pair.id)) continue
      assigned.set(pair.index,pair.id); used.add(pair.id)
    }
    return landmarks.map((hand,index) => {
      const id = assigned.get(index) ?? `wrist-${++this.serial}`
      const track = {id,label:labels[index] ?? '',landmarks:hand,seen:now}
      this.tracks.set(id,track)
      return track
    })
  }
  clear() { this.tracks.clear(); this.serial = 0 }
}

export function projectWatchHand(landmarks: WatchLandmark[], width: number, height: number, cover: WatchPoint) {
  return landmarks.map(point => ({x:(.5+(.5-point.x)/cover.x)*width,y:(.5+(point.y-.5)/cover.y)*height}))
}

/** Favor the pointing index finger; once grabbed, keep that physical tip. */
export function selectWatchTip(tips: WatchTip[], pose: WatchPose, gripId: string | null) {
  const locked = tips.find(tip => tip.id === gripId)
  const ordered = locked ? [locked] : [...tips].sort((a,b) => Number(b.tip === 8)-Number(a.tip === 8))
  for (const tip of ordered) {
    const local = watchLocalPoint(tip,pose)
    if (!local) continue
    const distance = Math.hypot(local.x,local.y)
    if (Number.isFinite(distance) && distance >= .09 && distance <= (locked ? 1.55 : 1.22)) return {tip,local}
  }
  return null
}

export interface HandMaskSegment { from: WatchPoint; to: WatchPoint; startRadius: number; endRadius: number }
export interface WatchHandMask { palm: WatchPoint[]; segments: HandMaskSegment[] }

/** Palm contour plus tapered finger capsules restore real camera pixels in front. */
export function watchHandMask(points: WatchPoint[]): WatchHandMask | null {
  if (points.length < 21 || !points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) return null
  const span = Math.hypot(points[5]!.x-points[17]!.x,points[5]!.y-points[17]!.y)
  if (span < 4) return null
  const across = {x:(points[5]!.x-points[17]!.x)/span,y:(points[5]!.y-points[17]!.y)/span}
  const wrist = points[0]!
  const palm = [{x:wrist.x+across.x*span*.29,y:wrist.y+across.y*span*.29},
    ...[1,2,5,9,13,17].map(i => points[i]!),
    {x:wrist.x-across.x*span*.29,y:wrist.y-across.y*span*.29}]
  const segments: HandMaskSegment[] = []
  const chains = [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]]
  for (const [finger,chain] of chains.entries()) for (let i = 0; i < chain.length-1; i++) {
    const size = span*(finger === 0 ? .16 : finger === 4 ? .1 : .13)
    segments.push({from:points[chain[i]!]!,to:points[chain[i+1]!]!,
      startRadius:Math.max(2,size*(1-i*.1))+.65,endRadius:Math.max(2,size*(.94-i*.1))+.65})
  }
  return {palm,segments}
}

function polygon(ctx: CanvasRenderingContext2D, points: WatchPoint[]) {
  const area = points.reduce((sum,p,i) => { const next = points[(i+1)%points.length]!; return sum+p.x*next.y-next.x*p.y },0)
  const ordered = area < 0 ? [...points].reverse() : points
  ctx.moveTo(ordered[0]!.x,ordered[0]!.y)
  for (let i = 1; i < ordered.length; i++) ctx.lineTo(ordered[i]!.x,ordered[i]!.y)
  ctx.closePath()
}

export function drawWatchForeground(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, pose: WatchPose, hands: WatchHandMask[], width: number, height: number) {
  if (!hands.length || video.readyState < 2) return
  ctx.save()
  // Restrict the second video draw to the watch area, not the entire camera image.
  ctx.beginPath()
  polygon(ctx,[[-1.6,-1.9],[1.6,-1.9],[1.6,1.9],[-1.6,1.9]].map(([x,y]) => ({x:pose.x+pose.a*x!+pose.c*y!,y:pose.y+pose.b*x!+pose.d*y!})))
  ctx.clip(); ctx.beginPath()
  for (const hand of hands) {
    polygon(ctx,hand.palm)
    for (const segment of hand.segments) {
      const dx = segment.to.x-segment.from.x, dy = segment.to.y-segment.from.y, length = Math.hypot(dx,dy)
      if (length > .01) {
        const nx = -dy/length, ny = dx/length
        polygon(ctx,[{x:segment.from.x+nx*segment.startRadius,y:segment.from.y+ny*segment.startRadius},
          {x:segment.to.x+nx*segment.endRadius,y:segment.to.y+ny*segment.endRadius},
          {x:segment.to.x-nx*segment.endRadius,y:segment.to.y-ny*segment.endRadius},
          {x:segment.from.x-nx*segment.startRadius,y:segment.from.y-ny*segment.startRadius}])
      }
      for (const [point,radius] of [[segment.from,segment.startRadius],[segment.to,segment.endRadius]] as const) {
        ctx.moveTo(point.x+radius,point.y); ctx.arc(point.x,point.y,radius,0,Math.PI*2); ctx.closePath()
      }
    }
  }
  ctx.clip()
  const scale = Math.max(width/video.videoWidth,height/video.videoHeight)
  ctx.translate(width,0); ctx.scale(-1,1)
  ctx.drawImage(video,(width-video.videoWidth*scale)/2,(height-video.videoHeight*scale)/2,video.videoWidth*scale,video.videoHeight*scale)
  ctx.restore()
}
