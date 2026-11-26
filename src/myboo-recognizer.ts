import type { GestureRecognizer, GestureRecognizerResult } from '@mediapipe/tasks-vision'

/** Isolated from the existing examples, so their model setup stays unchanged. */
export class MybooRecognizer {
  private model: GestureRecognizer | null = null
  private closed = false
  async initialize(base: string, worker: boolean) {
    const { FilesetResolver, GestureRecognizer } = await import('@mediapipe/tasks-vision')
    if (this.closed) return
    const files = await FilesetResolver.forVisionTasks(base, worker)
    const options = { runningMode: 'VIDEO' as const, numHands: 2,
      minHandDetectionConfidence: .5, minHandPresenceConfidence: .5, minTrackingConfidence: .5,
      cannedGesturesClassifierOptions: { scoreThreshold: .5 } }
    // CPU is reliable in module workers and avoids competing with the render GPU.
    const model = await GestureRecognizer.createFromOptions(files, {
      ...options, baseOptions: { modelAssetPath: `${base}gesture_recognizer.task`, delegate: worker ? 'CPU' : 'GPU' },
    }).catch(() => GestureRecognizer.createFromOptions(files, {
      ...options, baseOptions: { modelAssetPath: `${base}gesture_recognizer.task`, delegate: 'CPU' },
    }))
    if (this.closed) model.close()
    else this.model = model
  }
  detect(image: HTMLVideoElement | ImageBitmap, time: number): GestureRecognizerResult {
    if (!this.model || this.closed) throw new Error('Gesture recognizer is not ready')
    return this.model.recognizeForVideo(image, time)
  }
  close() { this.closed = true; this.model?.close(); this.model = null }
}
