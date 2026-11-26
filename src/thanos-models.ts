import type { HandLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision'
import type { ThanosHand, ThanosMask } from './thanos-model'
export type ThanosTask = 'hands' | 'segment'
export type ThanosTracking = { task: 'hands'; hands: ThanosHand[] } | ({ task: 'segment' } & ThanosMask)

/** This example owns only two models. Existing examples and shared options stay intact. */
export class ThanosModels {
  private hands: HandLandmarker | null = null
  private segment: ImageSegmenter | null = null
  private closed = false
  async initialize(base: string, worker: boolean, progress: (text: string) => void) {
    const { FilesetResolver, HandLandmarker, ImageSegmenter } = await import('@mediapipe/tasks-vision')
    if (this.closed) return
    const files = await FilesetResolver.forVisionTasks(base, worker)
    const delegate = worker ? 'CPU' : 'GPU'
    progress('양손 인식 준비 중 · 1 / 2')
    const handOptions = { runningMode: 'VIDEO' as const, numHands: 2, minHandDetectionConfidence: .5, minHandPresenceConfidence: .5, minTrackingConfidence: .5 }
    const hands = await HandLandmarker.createFromOptions(files, { ...handOptions, baseOptions: { modelAssetPath: `${base}hand_landmarker.task`, delegate } })
      .catch(() => { if (this.closed) throw new Error('Cancelled'); return HandLandmarker.createFromOptions(files, { ...handOptions, baseOptions: { modelAssetPath: `${base}hand_landmarker.task`, delegate: 'CPU' } }) })
    if (this.closed) { hands.close(); return }; this.hands = hands
    progress('사람 윤곽 준비 중 · 2 / 2')
    const segmentOptions = { runningMode: 'VIDEO' as const, outputConfidenceMasks: true, outputCategoryMask: false }
    const segment = await ImageSegmenter.createFromOptions(files, { ...segmentOptions, baseOptions: { modelAssetPath: `${base}selfie_segmenter_landscape.tflite`, delegate } })
      .catch(() => { if (this.closed) throw new Error('Cancelled'); return ImageSegmenter.createFromOptions(files, { ...segmentOptions, baseOptions: { modelAssetPath: `${base}selfie_segmenter_landscape.tflite`, delegate: 'CPU' } }) })
    if (this.closed) segment.close(); else this.segment = segment
  }
  detect(task: ThanosTask, image: HTMLVideoElement | ImageBitmap, now: number): ThanosTracking {
    if (this.closed || !this.hands || !this.segment) throw new Error('손과 사람 인식이 준비되지 않았어요.')
    if (task === 'hands') {
      const result = this.hands.detectForVideo(image, now)
      return { task, hands: result.landmarks.map((points, i) => ({ id: result.handedness[i]?.[0]?.categoryName ?? `hand-${i}`, points })) }
    }
    let output: ThanosTracking = { task, width: 0, height: 0, mask: new Float32Array(0) }
    this.segment.segmentForVideo(image, now, result => {
      const masks = result.confidenceMasks, mask = masks?.[masks.length > 1 ? 1 : 0]
      if (mask) output = { task, width: mask.width, height: mask.height, mask: mask.getAsFloat32Array().slice() }
    })
    return output
  }
  close() { this.closed = true; this.hands?.close(); this.segment?.close(); this.hands = null; this.segment = null }
}
