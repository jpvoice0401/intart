import type { GestureRecognizerResult } from '@mediapipe/tasks-vision'
import { MybooRecognizer } from './myboo-recognizer'

/** One frame in flight with worker timeout, cancellation and a main-thread fallback. */
export class MybooVision {
  private worker: Worker | null = null
  private main: MybooRecognizer | null = null
  private ready = false
  private busy = false
  private closed = false
  private pending: ReturnType<typeof setTimeout> | undefined
  private cancelInit: (() => void) | undefined
  private base: string
  private receive: (result: GestureRecognizerResult, timestamp: number, frame?: ImageBitmap) => void
  error: Error | null = null
  interval = 50
  constructor(receive: (result: GestureRecognizerResult, timestamp: number, frame?: ImageBitmap) => void) {
    this.receive = receive
    this.base = new URL(`${import.meta.env.BASE_URL}mediapipe/`, location.href).href
  }
  async initialize() {
    if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function') {
      try {
        const worker = new Worker(new URL('./myboo-worker.ts', import.meta.url), { type: 'module' })
        this.worker = worker
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Gesture worker timed out')), 25000)
          this.cancelInit = () => { clearTimeout(timer); resolve() }
          worker.onerror = () => { clearTimeout(timer); reject(new Error('Gesture worker unavailable')) }
          worker.onmessage = event => {
            if (event.data.type === 'ready') { clearTimeout(timer); resolve() }
            if (event.data.type === 'error') { clearTimeout(timer); reject(new Error(event.data.message)) }
          }
          worker.postMessage({ type: 'init', base: this.base })
        })
        this.cancelInit = undefined
        if (this.closed) return
        worker.onerror = () => void this.fallback()
        worker.onmessage = event => {
          if (this.closed) { event.data.image?.close(); return }
          if (event.data.type === 'result') {
            clearTimeout(this.pending); this.busy = false
            this.receive(event.data.result, event.data.timestamp, event.data.image)
          } else if (event.data.type === 'error') void this.fallback()
        }
        this.ready = true; return
      } catch { this.worker?.terminate(); this.worker = null; this.cancelInit = undefined }
    }
    if (!this.closed) await this.initializeMain()
  }
  private async initializeMain() {
    const model = new MybooRecognizer(); this.main = model
    this.interval = 100
    try { await model.initialize(this.base, false); if (this.closed) model.close(); else { this.ready = true; this.busy = false } }
    catch (error) { model.close(); throw error }
  }
  private async fallback() {
    if (this.closed || !this.worker) return
    this.ready = false; this.busy = true; clearTimeout(this.pending)
    this.worker.terminate(); this.worker = null
    try { await this.initializeMain() }
    catch (error) { this.error = error instanceof Error ? error : new Error(String(error)) }
  }
  submit(video: HTMLVideoElement, timestamp: number) {
    if (!this.ready || this.busy || this.closed || video.readyState < 2) return false
    this.busy = true
    if (this.worker) {
      const worker = this.worker
      this.pending = setTimeout(() => void this.fallback(), 3000)
      void createImageBitmap(video).then(image => {
        if (this.closed || worker !== this.worker) { image.close(); return }
        try { worker.postMessage({ type: 'frame', image, timestamp }, [image]) }
        catch { image.close(); void this.fallback() }
      }).catch(() => void this.fallback())
    } else {
      try { this.receive(this.main!.detect(video, timestamp), timestamp) }
      catch (error) { this.error = error instanceof Error ? error : new Error(String(error)) }
      finally { this.busy = false }
    }
    return true
  }
  close() {
    this.closed = true; this.ready = false; this.cancelInit?.(); this.cancelInit = undefined
    clearTimeout(this.pending); this.worker?.terminate(); this.worker = null; this.main?.close(); this.main = null
  }
}
