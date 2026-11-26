import { ThanosModels, type ThanosTask, type ThanosTracking } from './thanos-models'

/** One inference in flight. Hands get the higher rate; no face model or microphone. */
export class ThanosVision {
  private worker: Worker | null = null
  private main: ThanosModels | null = null
  private base = new URL(`${import.meta.env.BASE_URL}mediapipe/`, location.href).href
  private ready = false
  private busy = false
  private closed = false
  private paused = false
  private initializingMain = false
  private needsMain = false
  private cancelInit: (() => void) | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private resize = true
  private bitmapOptions = { resizeWidth: 640, resizeHeight: 360 }
  private handAt = -Infinity
  private segmentAt = -Infinity
  private handsSinceSegment = 0
  private handInterval = 40
  private segmentInterval = 150
  private progress: (text: string) => void = () => {}
  private receive: (output: ThanosTracking, time: number, image?: HTMLVideoElement | ImageBitmap) => void
  error: Error | null = null
  constructor(receive: (output: ThanosTracking, time: number, image?: HTMLVideoElement | ImageBitmap) => void) { this.receive = receive }
  async initialize(progress: (text: string) => void) {
    this.progress = progress
    if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function') {
      try {
        const worker = new Worker(new URL('./thanos-worker.ts', import.meta.url), { type: 'module' }); this.worker = worker
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('인식 준비 시간이 초과됐어요.')), 25000)
          this.cancelInit = () => { clearTimeout(timer); resolve() }
          worker.onerror = () => { clearTimeout(timer); reject(new Error('Worker unavailable')) }
          worker.onmessage = event => {
            if (event.data.type === 'progress') progress(event.data.text)
            if (event.data.type === 'ready') { clearTimeout(timer); resolve() }
            if (event.data.type === 'error') { clearTimeout(timer); reject(new Error(event.data.message)) }
          }
          worker.postMessage({ type: 'init', base: this.base })
        })
        this.cancelInit = undefined
        if (this.closed) return
        worker.onerror = () => void this.fallback()
        worker.onmessage = event => {
          if (this.closed || this.worker !== worker) { event.data.image?.close(); return }
          if (event.data.type === 'result') {
            clearTimeout(this.timer); this.busy = false
            this.adapt(event.data.output.task, event.data.duration)
            try { if (!this.paused) this.receive(event.data.output, event.data.time, event.data.image) }
            finally { event.data.image?.close() }
          } else if (event.data.type === 'error') void this.fallback()
        }
        this.ready = true; return
      } catch { this.worker?.terminate(); this.worker = null; this.cancelInit = undefined }
    }
    if (!this.closed) await this.initializeMain()
  }
  private adapt(task: ThanosTask, duration: number) {
    if (task === 'hands') this.handInterval = Math.max(this.main ? 60 : 40, Math.min(140, duration * 1.3))
    else this.segmentInterval = Math.max(this.main ? 190 : 150, Math.min(300, duration * 2))
  }
  private async initializeMain() {
    if (this.initializingMain || this.closed) return
    this.initializingMain = true; this.needsMain = false
    const model = new ThanosModels(); this.main = model; this.handInterval = 60; this.segmentInterval = 190
    try { await model.initialize(this.base, false, this.progress); if (this.closed) model.close(); else { this.ready = true; this.busy = false } }
    catch (error) { model.close(); this.main = null; throw error }
    finally { this.initializingMain = false }
  }
  private async fallback() {
    if (this.closed || this.initializingMain || !this.worker) return
    clearTimeout(this.timer); this.worker.terminate(); this.worker = null; this.ready = this.busy = false; this.needsMain = true
    if (this.paused) return
    try { await this.initializeMain() } catch (error) { this.error = error instanceof Error ? error : new Error(String(error)) }
  }
  submit(video: HTMLVideoElement, time: number) {
    if (!this.ready || this.busy || this.closed || this.paused || video.readyState < 2) return false
    const segmentDue = time - this.segmentAt >= this.segmentInterval
    const task: ThanosTask = segmentDue && (this.handsSinceSegment >= 3 || this.segmentAt === -Infinity) ? 'segment' : 'hands'
    if (task === 'hands' && time - this.handAt < this.handInterval) return false
    if (task === 'hands') { this.handAt = time; this.handsSinceSegment++ }
    else { this.segmentAt = time; this.handsSinceSegment = 0 }
    this.busy = true
    if (this.worker) {
      const worker = this.worker
      this.timer = setTimeout(() => void this.fallback(), 3500)
      const scale = Math.min(1,640/Math.max(video.videoWidth,video.videoHeight))
      this.bitmapOptions.resizeWidth = Math.max(1,Math.round(video.videoWidth*scale))
      this.bitmapOptions.resizeHeight = Math.max(1,Math.round(video.videoHeight*scale))
      const bitmap = this.resize ? createImageBitmap(video, this.bitmapOptions).catch(() => { this.resize = false; return createImageBitmap(video) }) : createImageBitmap(video)
      void bitmap.then(image => {
        if (this.closed || this.worker !== worker) { image.close(); return }
        try { worker.postMessage({ type: 'frame', task, image, time }, [image]) } catch { image.close(); void this.fallback() }
      }).catch(() => void this.fallback())
    } else {
      const start = performance.now()
      try { this.receive(this.main!.detect(task, video, time), time, task === 'segment' ? video : undefined); this.adapt(task, performance.now() - start) }
      catch (error) { this.error = error instanceof Error ? error : new Error(String(error)) }
      finally { this.busy = false }
    }
    return true
  }
  setVisible(visible: boolean) {
    this.paused = !visible; clearTimeout(this.timer)
    if (visible) {
      this.handAt = this.segmentAt = -Infinity
      if (this.busy && this.worker) this.timer = setTimeout(() => void this.fallback(), 3500)
      if (this.needsMain) void this.initializeMain().catch(error => { this.error = error instanceof Error ? error : new Error(String(error)) })
    }
  }
  close() {
    this.closed = true; this.ready = false; this.cancelInit?.(); this.cancelInit = undefined; clearTimeout(this.timer)
    this.worker?.terminate(); this.worker = null; this.main?.close(); this.main = null
  }
}
