import type { MinecraftMask } from './minecraft-model'
import { previewMinecraftBackground, synthesizeMinecraftBackground, type MinecraftBackgroundPixels } from './minecraft-inpaint'

function canvas2d() {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('카메라 모습을 보관할 수 없어요.')
  return context
}
function confidence(mask: MinecraftMask, x: number, y: number, width: number, height: number) {
  const px = Math.min(mask.width - 1, Math.floor((x + .5) / width * mask.width))
  const py = Math.min(mask.height - 1, Math.floor((y + .5) / height * mask.height))
  return mask.mask[py * mask.width + px]!
}

/** Learn real background even after disappearance. Only unknown areas are
 * synthesized; newly revealed room pixels always replace their estimates. */
export class MinecraftCapture {
  private frame = canvas2d()
  private background = canvas2d()
  private plate: ImageData | null = null
  private backgroundPixels: MinecraftBackgroundPixels | null = null
  private integral = new Uint32Array(0)
  private safe = new Uint8Array(0)
  private previousSafe = new Uint8Array(0)
  private frameReady = false
  private plateAt = -Infinity
  private worker: Worker | null = null
  private workerUnavailable = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private fallback: Generator<void, MinecraftBackgroundPixels> | null = null
  private busy = false
  private revision = 0
  private needsSynthesis = false
  private revealed = 0
  private synthesisAt = -Infinity
  private receive: (background: HTMLCanvasElement) => void

  constructor(receive: (background: HTMLCanvasElement) => void) { this.receive = receive }

  update(image: HTMLVideoElement | ImageBitmap, mask: MinecraftMask, now: number, defeated: boolean) {
    // Cutouts keep the same analyzed frame; background learning is capped at 5Hz.
    if (defeated && now - this.plateAt < 200) return
    const video = image instanceof HTMLVideoElement
    const sw = video ? image.videoWidth : image.width, sh = video ? image.videoHeight : image.height
    if (!sw || !sh) return
    const scale = Math.min(1, 512 / Math.max(sw, sh))
    const width = Math.max(1, Math.round(sw * scale)), height = Math.max(1, Math.round(sh * scale))
    if (this.frame.canvas.width !== width || this.frame.canvas.height !== height || !this.plate) {
      this.reset()
      this.frame.canvas.width = this.background.canvas.width = width
      this.frame.canvas.height = this.background.canvas.height = height
      this.plate = this.frame.createImageData(width, height)
      this.integral = new Uint32Array((width + 1) * (height + 1))
      this.safe = new Uint8Array(width * height); this.previousSafe = new Uint8Array(width * height)
    }
    this.frame.drawImage(image, 0, 0, width, height); this.frameReady = true
    if (now - this.plateAt < 200) return
    this.plateAt = now
    const pixels = this.frame.getImageData(0, 0, width, height).data
    const plate = this.plate!.data, stride = width + 1, guard = Math.max(3, Math.round(width / 100))
    // Dilate every person, including hair and uncertain edges, before learning
    // any source texture. The selected target alone controls disappearance.
    this.integral.fill(0)
    for (let y = 0; y < height; y++) {
      let sum = 0
      for (let x = 0; x < width; x++) {
        sum += confidence(mask, x, y, width, height) > .08 ? 1 : 0
        this.integral[(y + 1) * stride + x + 1] = this.integral[y * stride + x + 1]! + sum
      }
    }
    let difference = 0, changed = 0, samples = 0
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - guard), x1 = Math.min(width, x + guard + 1)
      const y0 = Math.max(0, y - guard), y1 = Math.min(height, y + guard + 1), p = y * width + x
      const blocked = this.integral[y1 * stride + x1]! - this.integral[y0 * stride + x1]! - this.integral[y1 * stride + x0]! + this.integral[y0 * stride + x0]!
      this.safe[p] = blocked ? 0 : 1
      const i = p * 4
      if (blocked || !this.previousSafe[p] || !plate[i + 3] || x % 8 || y % 8) continue
      const delta = (Math.abs(pixels[i]! - plate[i]!) + Math.abs(pixels[i + 1]! - plate[i + 1]!) + Math.abs(pixels[i + 2]! - plate[i + 2]!)) / 3
      difference += delta; samples++; if (delta > 28) changed++
    }
    if (samples >= 64 && difference / samples > 26 && changed / samples > .5) {
      // A substantially changed camera view must not reuse old furniture.
      plate.fill(0); this.revision++; this.cancelWork()
      this.backgroundPixels = null; this.revealed = 0; this.synthesisAt = -Infinity
    }
    for (let p = 0; p < width * height; p++) {
      if (!this.safe[p] || !this.previousSafe[p]) continue
      const i = p * 4
      if (!plate[i + 3]) this.revealed++
      plate[i] = pixels[i]!; plate[i + 1] = pixels[i + 1]!; plate[i + 2] = pixels[i + 2]!; plate[i + 3] = 255
    }
    this.previousSafe.set(this.safe)
    if (defeated) {
      if (!this.backgroundPixels) this.showPreview()
      else this.publish(this.backgroundPixels)
      if (this.revealed > Math.max(64, width * height * .015)) this.needsSynthesis = true
      this.schedule()
    }
  }

  save(mask: MinecraftMask) {
    if (!this.frameReady || !this.plate) return null
    const { width, height } = this.frame.canvas, image = this.frame.getImageData(0, 0, width, height)
    let left = width, top = height, right = -1, bottom = -1
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const t = Math.max(0, Math.min(1, (confidence(mask, x, y, width, height) - .38) / .27))
      image.data[(y * width + x) * 4 + 3] = Math.round(255 * t * t * (3 - 2 * t))
      if (t > 0) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y) }
    }
    if (right < left || bottom < top) return null
    const cutout = canvas2d()
    left = Math.max(0, left - 1); top = Math.max(0, top - 1)
    cutout.canvas.width = Math.min(width - 1, right + 1) - left + 1
    cutout.canvas.height = Math.min(height - 1, bottom + 1) - top + 1
    cutout.putImageData(image, -left, -top)
    this.showPreview(); this.schedule()
    return { cutout: cutout.canvas, background: this.background.canvas }
  }

  private showPreview() {
    if (!this.plate) return
    this.publish(previewMinecraftBackground(this.plate)); this.needsSynthesis = true
  }
  private publish(result: MinecraftBackgroundPixels) {
    if (!this.plate || result.width !== this.plate.width || result.height !== this.plate.height) return
    const observed = this.plate.data
    // A completed worker job must never overwrite newer real observations.
    for (let i = 0; i < observed.length; i += 4) if (observed[i + 3]) {
      result.data[i] = observed[i]!; result.data[i + 1] = observed[i + 1]!; result.data[i + 2] = observed[i + 2]!; result.data[i + 3] = 255
    }
    this.backgroundPixels = result
    this.background.putImageData(new ImageData(result.data, result.width, result.height), 0, 0)
    this.receive(this.background.canvas)
  }
  private schedule() {
    if (!this.plate || !this.needsSynthesis || this.busy || document.hidden || performance.now() - this.synthesisAt < 1200) return
    let missing = false
    for (let i = 3; i < this.plate.data.length; i += 4) if (!this.plate.data[i]) { missing = true; break }
    if (!missing) { this.needsSynthesis = false; return }
    this.busy = true; this.needsSynthesis = false; this.revealed = 0; this.synthesisAt = performance.now()
    if (this.workerUnavailable || typeof Worker === 'undefined') { this.beginFallback(); return }
    try {
      if (!this.worker) {
        this.worker = new Worker(new URL('./minecraft-inpaint-worker.ts', import.meta.url), { type: 'module' })
        this.worker.onmessage = event => {
          if (event.data.revision !== this.revision) return
          clearTimeout(this.timer)
          if (event.data.error) { this.failWorker(); return }
          this.busy = false; this.publish(event.data as MinecraftBackgroundPixels)
        }
        this.worker.onerror = event => { event.preventDefault(); this.failWorker() }
      }
      const data = this.plate.data.slice()
      this.worker.postMessage({ width: this.plate.width, height: this.plate.height, data, revision: this.revision }, [data.buffer])
      this.timer = setTimeout(() => this.failWorker(), 3500)
    } catch { this.failWorker() }
  }
  private failWorker() {
    clearTimeout(this.timer); this.worker?.terminate(); this.worker = null; this.workerUnavailable = true
    this.beginFallback()
  }
  private beginFallback() {
    if (!this.plate || document.hidden) { this.busy = false; this.needsSynthesis = true; return }
    const revision = this.revision
    this.fallback = synthesizeMinecraftBackground({ width: this.plate.width, height: this.plate.height, data: this.plate.data.slice() })
    const advance = () => {
      if (revision !== this.revision || !this.fallback) return
      if (document.hidden) { this.pause(); return }
      const start = performance.now()
      let step = this.fallback.next()
      while (!step.done && performance.now() - start < 4) step = this.fallback.next()
      if (step.done) { this.busy = false; this.fallback = null; this.publish(step.value) }
      else this.timer = setTimeout(advance, 0)
    }
    this.timer = setTimeout(advance, 0)
  }
  private cancelWork() {
    clearTimeout(this.timer); this.worker?.terminate(); this.worker = null; this.fallback = null; this.busy = false
  }
  pause() {
    if (this.busy) this.needsSynthesis = true
    this.revision++; this.cancelWork()
  }
  reset() {
    this.pause()
    this.plate = this.backgroundPixels = null; this.needsSynthesis = false; this.revealed = 0
    this.integral = new Uint32Array(0); this.safe = this.previousSafe = new Uint8Array(0)
    this.frameReady = false; this.plateAt = this.synthesisAt = -Infinity
    this.frame.canvas.width = this.frame.canvas.height = this.background.canvas.width = this.background.canvas.height = 1
  }
}
