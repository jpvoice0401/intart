import { VisionModels, type VisionMode, type VisionOutput, type VisionTask } from './vision-models'

/** One in-flight frame, zero inference backlog, and no required worker APIs. */
export class CameraVision {
  private worker: Worker | null = null
  private models: VisionModels | null = null
  private closed = false
  private ready = false
  private busy = false
  private progress: (message: string) => void = () => {}
  private receive: (output: VisionOutput, timestamp: number) => void
  private mode: VisionMode
  private base = new URL(`${import.meta.env.BASE_URL}mediapipe/`,location.href).href
  private lastVideoTime = -1
  private pendingTimer: ReturnType<typeof setTimeout> | undefined
  private cancelInitialization: (() => void) | undefined
  error: Error | null = null

  constructor(mode: VisionMode, receive: (output: VisionOutput, timestamp: number) => void) { this.mode = mode; this.receive = receive }

  async initialize(progress: (message: string) => void) {
    this.progress = progress
    if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function') {
      try {
        await new Promise<void>((resolve,reject) => {
          const worker = new Worker(new URL('./vision-worker.ts',import.meta.url),{type:'module'})
          this.worker = worker
          const timer = setTimeout(() => reject(new Error('Worker initialization timed out')),20000)
          this.cancelInitialization = () => { clearTimeout(timer); resolve() }
          worker.onerror = () => { clearTimeout(timer); reject(new Error('Worker is unavailable')) }
          worker.onmessage = event => {
            if (event.data.type === 'progress') progress(event.data.text)
            if (event.data.type === 'error') { clearTimeout(timer); reject(new Error(event.data.message)) }
            if (event.data.type === 'ready') { clearTimeout(timer); resolve() }
          }
          worker.postMessage({type:'init',base:this.base,mode:this.mode})
        })
        this.cancelInitialization = undefined
        if (this.closed) return
        this.worker!.onerror = () => void this.fallback()
        this.worker!.onmessage = event => {
          if (this.closed) return
          if (event.data.type === 'result') {
            clearTimeout(this.pendingTimer); this.busy = false
            this.receive(event.data.output,event.data.timestamp)
          } else if (event.data.type === 'error') void this.fallback()
        }
        this.ready = true
        return
      } catch { this.worker?.terminate(); this.worker = null; this.cancelInitialization = undefined }
    }
    if (!this.closed) await this.initializeMain()
  }

  private async initializeMain() {
    const models = new VisionModels()
    this.models = models
    try {
      await models.initialize(this.base,this.mode,false,this.progress)
      if (this.closed) { models.close(); return }
      this.ready = true; this.busy = false
    } catch (error) { models.close(); throw error }
  }

  private async fallback() {
    if (this.closed || !this.worker) return
    this.ready = false; this.busy = true
    clearTimeout(this.pendingTimer)
    this.worker.terminate(); this.worker = null
    try { await this.initializeMain() }
    catch (error) { this.error = error instanceof Error ? error : new Error(String(error)) }
  }

  get available() { return this.ready && !this.busy && !this.closed }

  submit(task: VisionTask, video: HTMLVideoElement, timestamp: number) {
    if (!this.available || video.readyState < 2) return false
    // Different models may inspect the same decoded frame, but each is scheduled
    // independently by SnowTracking. There is never a queued bitmap.
    this.lastVideoTime = video.currentTime
    this.busy = true
    if (this.worker) {
      const worker = this.worker
      this.pendingTimer = setTimeout(() => void this.fallback(),3000)
      void createImageBitmap(video).then(image => {
        if (this.closed || this.worker !== worker) { image.close(); return }
        try { worker.postMessage({type:'frame',task,image,timestamp},[image]) }
        catch { image.close(); void this.fallback() }
      }).catch(() => void this.fallback())
    } else {
      try { this.receive(this.models!.detect(task,video,timestamp),timestamp) }
      finally { this.busy = false }
    }
    return true
  }
  get videoTime() { return this.lastVideoTime }
  close() {
    this.closed = true; this.ready = false
    clearTimeout(this.pendingTimer); this.cancelInitialization?.(); this.cancelInitialization = undefined
    this.worker?.terminate(); this.worker = null
    this.models?.close(); this.models = null
  }
}
