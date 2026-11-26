import type { FaceLandmarker, HandLandmarker, HandLandmarkerResult, ImageSegmenter } from '@mediapipe/tasks-vision'

export type VisionTask = 'hands' | 'face' | 'segment'
export type VisionMode = 'snow' | 'hands'
export type VisionInput = HTMLVideoElement | ImageBitmap
export type VisionOutput =
  | { task: 'hands'; result: HandLandmarkerResult }
  | { task: 'face'; landmarks: {x:number;y:number}[] | null }
  | { task: 'segment'; mask: Float32Array; width: number; height: number }

/** Shared inference implementation for workers and the compatibility fallback. */
export class VisionModels {
  private hands: HandLandmarker | null = null
  private face: FaceLandmarker | null = null
  private segmenter: ImageSegmenter | null = null
  private closed = false
  async initialize(base: string, mode: VisionMode, moduleWorker: boolean, progress: (message: string) => void) {
    const { FilesetResolver, HandLandmarker, FaceLandmarker, ImageSegmenter } = await import('@mediapipe/tasks-vision')
    if (this.closed) return
    const vision = await FilesetResolver.forVisionTasks(base,moduleWorker)
    progress(mode === 'snow' ? '손끝 인식 준비 중 · 1 / 3' : '손끝 인식 준비 중')
    const hands = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: `${base}hand_landmarker.task`, delegate: 'GPU' },
      runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .5, minHandPresenceConfidence: .5, minTrackingConfidence: .5,
    }).catch(() => {
      if (this.closed) throw new Error('Cancelled')
      return HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `${base}hand_landmarker.task`, delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .5, minHandPresenceConfidence: .5, minTrackingConfidence: .5,
      })
    })
    if (this.closed) { hands.close(); return }
    this.hands = hands
    if (mode === 'hands') return
    progress('사람 윤곽 인식 준비 중 · 2 / 3')
    const segmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: { modelAssetPath: `${base}selfie_segmenter_landscape.tflite`, delegate: 'GPU' },
      runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true,
    }).catch(() => {
      if (this.closed) throw new Error('Cancelled')
      return ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `${base}selfie_segmenter_landscape.tflite`, delegate: 'CPU' },
        runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true,
      })
    })
    if (this.closed) { segmenter.close(); return }
    this.segmenter = segmenter
    progress('입 모양 인식 준비 중 · 3 / 3')
    const face = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: `${base}face_landmarker.task`, delegate: 'GPU' }, runningMode: 'VIDEO', numFaces: 1,
    }).catch(() => {
      if (this.closed) throw new Error('Cancelled')
      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `${base}face_landmarker.task`, delegate: 'CPU' }, runningMode: 'VIDEO', numFaces: 1,
      })
    })
    if (this.closed) { face.close(); return }
    this.face = face
  }
  detect(task: VisionTask, image: VisionInput, timestamp: number): VisionOutput {
    if (this.closed) throw new Error('Vision session closed')
    if (task === 'hands') return { task, result: this.hands!.detectForVideo(image,timestamp) }
    if (task === 'face') return { task, landmarks: this.face!.detectForVideo(image,timestamp).faceLandmarks[0] ?? null }
    let output: VisionOutput = { task, mask: new Float32Array(0), width: 0, height: 0 }
    this.segmenter!.segmentForVideo(image,timestamp,result => {
      const masks = result.confidenceMasks
      const mask = masks?.[masks.length > 1 ? 1 : 0]
      if (mask) output = { task, mask: mask.getAsFloat32Array().slice(), width: mask.width, height: mask.height }
    })
    return output
  }
  close() {
    this.closed = true
    this.hands?.close(); this.face?.close(); this.segmenter?.close()
    this.hands = null; this.face = null; this.segmenter = null
  }
}
