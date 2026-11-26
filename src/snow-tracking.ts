import { cameraCover, FINGERTIPS } from './water-touch-model'
import type { HumanSnowField, Point } from './snow-physics'
import { mouthOpening } from './snow-fog'
import { CameraVision } from './camera-vision'
import type { VisionOutput, VisionTask } from './vision-models'
import type { SnowMover } from './snowman'

export interface SnowFinger extends Point { id: string }
export interface SnowMouth extends Point { openness: number; width: number }

export class SnowTracking {
  fingers: SnowFinger[] = []
  mouth: SnowMouth | null = null
  sweepers: SnowMover[] = []
  private vision = new CameraVision('snow',(output,time) => this.receive(output,time))
  private last = { hands: -Infinity, face: -Infinity, segment: -Infinity }
  private completed = { hands: -Infinity, face: -Infinity, segment: -Infinity }
  private videoTimes = { hands: -1, face: -1, segment: -1 }
  private previous = new Map<string,Point>()
  private view: {field:HumanSnowField;width:number;height:number;videoWidth:number;videoHeight:number} | null = null

  initialize(progress: (text: string) => void) { return this.vision.initialize(progress) }

  private receive(output: VisionOutput, timestamp: number) {
    const view = this.view
    if (!view) return
    const {field,width,height,videoWidth,videoHeight} = view
    this.completed[output.task] = timestamp
    const cover = cameraCover(width,height,videoWidth,videoHeight)
    const toScreen = (p: Point): Point => ({x:(.5+(.5-p.x)/cover.x)*width,y:(.5+(p.y-.5)/cover.y)*height})
    if (output.task === 'hands') {
      const next = new Map<string,Point>()
      this.sweepers = output.result.landmarks.flatMap((hand,i) => {
        const wrist = toScreen(hand[0]!), index = toScreen(hand[5]!), middle = toScreen(hand[9]!), little = toScreen(hand[17]!)
        const id = `${output.result.handedness[i]?.[0]?.categoryName ?? 'hand'}:${i}`
        const span = Math.max(20,Math.hypot(index.x-little.x,index.y-little.y),Math.hypot(wrist.x-middle.x,wrist.y-middle.y))
        return [{id:`${id}:palm`,x:(wrist.x+index.x+middle.x+little.x)*.25,y:(wrist.y+index.y+middle.y+little.y)*.25,
          radius:Math.max(22,Math.min(65,span*.7)),sampledAt:timestamp/1000},
          ...FINGERTIPS.map(tip => ({id:`${id}:${tip}`,...toScreen(hand[tip]!),radius:Math.max(10,Math.min(24,span*.22)),sampledAt:timestamp/1000}))]
      })
      this.fingers = output.result.landmarks.map((hand,i) => {
        const label = output.result.handedness[i]?.[0]?.categoryName ?? String(i)
        const raw = toScreen(hand[8]!), prev = this.previous.get(label)
        const point = prev && Math.hypot(raw.x-prev.x,raw.y-prev.y) < width*.2
          ? {x:prev.x+(raw.x-prev.x)*.75,y:prev.y+(raw.y-prev.y)*.75} : raw
        next.set(label,point)
        return {id:label,...point}
      })
      this.previous = next
    } else if (output.task === 'face') {
      const landmarks = output.landmarks
      if (landmarks) {
        const upper = toScreen(landmarks[13]!), lower = toScreen(landmarks[14]!)
        const left = toScreen(landmarks[78]!), right = toScreen(landmarks[308]!)
        this.mouth = {x:(upper.x+lower.x)*.5,y:(upper.y+lower.y)*.5,width:Math.hypot(left.x-right.x,left.y-right.y),openness:mouthOpening(landmarks,videoWidth/videoHeight)}
      } else this.mouth = null
    } else if (output.mask.length) field.updateConfidence(output.mask,output.width,output.height,cover)
  }

  update(video: HTMLVideoElement, field: HumanSnowField, width: number, height: number, now: number, snowActive = true) {
    if (this.vision.error) throw this.vision.error
    if (video.readyState < 2) return
    this.view = {field,width,height,videoWidth:video.videoWidth,videoHeight:video.videoHeight}
    // Preserve active tracking rates; idle face/mask work cannot affect snow yet.
    const intervals = {hands:45,segment:snowActive ? 85 : 350,face:snowActive ? 95 : 600}
    let task: VisionTask | undefined, priority = -Infinity
    for (const key of ['hands','segment','face'] as const) {
      if (video.currentTime === this.videoTimes[key] || now-this.last[key] < intervals[key]) continue
      const overdue = (now-this.last[key])/intervals[key]
      if (overdue > priority) { task = key; priority = overdue }
    }
    if (task && this.vision.submit(task,video,now)) { this.last[task] = now; this.videoTimes[task] = video.currentTime }
    if (now-this.completed.hands > 350) { this.fingers = []; this.sweepers = []; this.previous.clear() }
    if (now-this.completed.face > (snowActive ? 500 : 1000)) this.mouth = null
    if (now-this.completed.segment > 1000) field.clear()
  }
  close() { this.vision.close(); this.fingers = []; this.sweepers = []; this.mouth = null; this.previous.clear(); this.view = null }
}
