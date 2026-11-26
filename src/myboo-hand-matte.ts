import type { BooHand } from './myboo-model'

interface PixelPoint { x: number; y: number }
interface HandColor { cb: number; cr: number; cbSpread: number; crSpread: number }

function median(values: number[]) {
  values.sort((a, b) => a - b)
  return values[Math.floor(values.length / 2)] ?? 0
}

/** A landmark-bounded, camera-pixel matte. Landmarks locate the hand; they
 * never stretch camera pixels or define the final finger silhouette. */
export class MybooHandMatte {
  private frame = document.createElement('canvas')
  private support = document.createElement('canvas')
  private mask = document.createElement('canvas')
  private composite = document.createElement('canvas')
  private frameContext = this.frame.getContext('2d', { willReadFrequently: true })!
  private supportContext = this.support.getContext('2d', { willReadFrequently: true })!
  private maskContext = this.mask.getContext('2d')!
  private compositeContext = this.composite.getContext('2d')!
  private a = new Uint8Array(0)
  private b = new Uint8Array(0)
  private connected = new Uint8Array(0)
  private queue = new Int32Array(0)
  private lastFrame = -Infinity
  private videoTime = -1
  private ready = false
  private sourceFrame: ImageBitmap | null = null

  draw(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, hands: BooHand[], width: number, height: number, now: number, cameraFrame: ImageBitmap | null = null) {
    if (!hands.length || video.readyState < 2 || !video.videoWidth) { this.ready = false; return }
    const changed = cameraFrame ? cameraFrame !== this.sourceFrame : video.currentTime !== this.videoTime
    if (!this.ready || (changed && now - this.lastFrame >= 1 / 24)) {
      this.update(video, hands, cameraFrame)
      this.videoTime = video.currentTime; this.lastFrame = now
      this.sourceFrame = cameraFrame
    }
    if (!this.ready) return
    const scale = Math.max(width / video.videoWidth, height / video.videoHeight)
    ctx.save(); ctx.translate(width / 2, height / 2); ctx.scale(-1, 1)
    ctx.drawImage(this.composite, -video.videoWidth * scale / 2, -video.videoHeight * scale / 2, video.videoWidth * scale, video.videoHeight * scale)
    ctx.restore()
  }

  private hull(points: PixelPoint[]) {
    const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y)
    const cross = (a: PixelPoint, b: PixelPoint, c: PixelPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    const lower: PixelPoint[] = [], upper: PixelPoint[] = []
    for (const p of sorted) { while (lower.length > 1 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop(); lower.push(p) }
    for (const p of sorted.reverse()) { while (upper.length > 1 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop(); upper.push(p) }
    lower.pop(); upper.pop(); return [...lower, ...upper]
  }

  private color(data: Uint8ClampedArray, stride: number, x: number, y: number) {
    const i = (y * stride + x) * 4, r = data[i]!, g = data[i + 1]!, b = data[i + 2]!
    return { cb: 128 - .168736 * r - .331264 * g + .5 * b, cr: 128 + .5 * r - .418688 * g - .081312 * b }
  }

  private update(video: HTMLVideoElement, hands: BooHand[], cameraFrame: ImageBitmap | null) {
    const sourceImage = cameraFrame ?? video
    const width = Math.min(640, video.videoWidth), height = Math.max(1, Math.round(video.videoHeight * width / video.videoWidth))
    if (this.frame.width !== width || this.frame.height !== height) {
      for (const canvas of [this.frame, this.support, this.mask]) { canvas.width = width; canvas.height = height }
      this.a = new Uint8Array(width * height); this.b = new Uint8Array(width * height)
      this.connected = new Uint8Array(width * height); this.queue = new Int32Array(width * height)
    }
    const support = this.supportContext
    support.clearRect(0, 0, width, height); support.fillStyle = support.strokeStyle = '#fff'; support.lineJoin = 'round'; support.lineCap = 'round'
    const samples: { centers: PixelPoint[]; radius: number }[] = []
    const seeds: PixelPoint[] = []
    let minX = width, minY = height, maxX = 0, maxY = 0
    for (const hand of hands) {
      if (hand.landmarks.length < 21 || !hand.landmarks.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) continue
      const points = hand.landmarks.map(p => ({ x: p.x * width, y: p.y * height }))
      const wrist = points[0]!, center = [5, 9, 13, 17].reduce((s, i) => ({ x: s.x + points[i]!.x / 4, y: s.y + points[i]!.y / 4 }), { x: 0, y: 0 })
      const span = Math.hypot(points[5]!.x - points[17]!.x, points[5]!.y - points[17]!.y)
      if (span < 4) continue
      const length = Math.max(1, Math.hypot(wrist.x - center.x, wrist.y - center.y)), dx = (wrist.x - center.x) / length, dy = (wrist.y - center.y) / length
      const padding = Math.max(1.5, Math.min(3, span * .035))
      // Only palm + individual finger corridors. A hull around all fingertips
      // includes the gaps between fingers, where a face can share the skin tone.
      const bounds = this.hull([...[0, 1, 2, 5, 9, 13, 17].map(i => points[i]!),
        { x: wrist.x + dx * span * .1 - dy * span * .27, y: wrist.y + dy * span * .1 + dx * span * .27 },
        { x: wrist.x + dx * span * .1 + dy * span * .27, y: wrist.y + dy * span * .1 - dx * span * .27 }])
      support.beginPath(); support.moveTo(bounds[0]!.x, bounds[0]!.y)
      for (const point of bounds.slice(1)) support.lineTo(point.x, point.y)
      support.closePath(); support.lineWidth = padding * 2; support.fill(); support.stroke()
      for (const [finger, chain] of [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]].entries()) {
        support.lineWidth = Math.max(4, span * (finger === 0 ? .27 : finger === 4 ? .2 : .235))
        support.beginPath(); support.moveTo(points[chain[0]!]!.x, points[chain[0]!]!.y)
        for (const index of chain.slice(1)) support.lineTo(points[index]!.x, points[index]!.y)
        support.stroke()
      }
      for (const point of [...points, ...bounds]) { minX = Math.min(minX, point.x - span * .16 - 3); maxX = Math.max(maxX, point.x + span * .16 + 3); minY = Math.min(minY, point.y - span * .16 - 3); maxY = Math.max(maxY, point.y + span * .16 + 3) }
      samples.push({ centers: [.35, .55, .72].map(t => ({ x: wrist.x * (1 - t) + center.x * t, y: wrist.y * (1 - t) + center.y * t })), radius: Math.max(1, Math.min(3, span * .035)) })
      seeds.push(...[0, 2, 5, 6, 9, 10, 13, 14, 17, 18].map(i => points[i]!), { x: wrist.x * .45 + center.x * .55, y: wrist.y * .45 + center.y * .55 })
    }
    if (!samples.length) { this.ready = false; return }
    this.frameContext.drawImage(sourceImage, 0, 0, width, height)
    const source = this.frameContext.getImageData(0, 0, width, height)
    const colors: HandColor[] = []
    for (const sample of samples) {
      const cbs: number[] = [], crs: number[] = []
      for (const center of sample.centers) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = Math.max(0, Math.min(width - 1, Math.round(center.x + dx * sample.radius))), y = Math.max(0, Math.min(height - 1, Math.round(center.y + dy * sample.radius)))
        const c = this.color(source.data, width, x, y); cbs.push(c.cb); crs.push(c.cr)
      }
      const cb = median(cbs), cr = median(crs)
      colors.push({ cb, cr, cbSpread: Math.max(5, Math.min(11, median(cbs.map(v => Math.abs(v - cb))) * 2 + 3)), crSpread: Math.max(5, Math.min(11, median(crs.map(v => Math.abs(v - cr))) * 2 + 3)) })
    }
    const x = Math.max(0, Math.floor(minX)), y = Math.max(0, Math.floor(minY))
    const rw = Math.min(width, Math.ceil(maxX)) - x, rh = Math.min(height, Math.ceil(maxY)) - y
    if (rw < 1 || rh < 1) { this.ready = false; return }
    const region = this.supportContext.getImageData(x, y, rw, rh)
    const a = this.a, b = this.b, count = rw * rh
    a.fill(0, 0, count)
    for (let py = 0; py < rh; py++) for (let px = 0; px < rw; px++) {
      const index = py * rw + px
      if (region.data[index * 4 + 3]! < 30) continue
      const color = this.color(source.data, width, x + px, y + py)
      let distance = Infinity
      for (const profile of colors) distance = Math.min(distance, ((color.cb - profile.cb) / profile.cbSpread) ** 2 + ((color.cr - profile.cr) / profile.crSpread) ** 2)
      a[index] = distance < 7.3 ? 1 : 0
    }
    // Small closing preserves reflective rings/highlights without turning each
    // finger joint into a separate circular cutout. Buffers are reused.
    for (const dilate of [true, true, false, false]) {
      b.fill(0, 0, count)
      for (let py = 1; py < rh - 1; py++) for (let px = 1; px < rw - 1; px++) {
        const i = py * rw + px, sum = a[i]! + a[i - 1]! + a[i + 1]! + a[i - rw]! + a[i + rw]!
        b[i] = dilate ? Number(sum > 0) : Number(sum === 5)
      }
      a.set(b.subarray(0, count), 0)
    }
    // Reject disconnected skin-colored objects (such as cheeks/forehead) that
    // do not connect to actual palm or finger joints. Reuse the flood-fill queue.
    const connected = this.connected, queue = this.queue
    connected.fill(0, 0, count)
    let head = 0, tail = 0
    const add = (i: number) => { if (a[i] && !connected[i]) { connected[i] = 1; queue[tail++] = i } }
    for (const seed of seeds) {
      const sx = Math.round(seed.x) - x, sy = Math.round(seed.y) - y
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const px = sx + ox, py = sy + oy
        if (px >= 0 && px < rw && py >= 0 && py < rh) add(py * rw + px)
      }
    }
    while (head < tail) {
      const i = queue[head++]!, px = i % rw
      if (px > 0) add(i - 1)
      if (px < rw - 1) add(i + 1)
      if (i >= rw) add(i - rw)
      if (i < count - rw) add(i + rw)
    }
    a.set(connected.subarray(0, count), 0)
    for (let py = 0; py < rh; py++) for (let px = 0; px < rw; px++) {
      const i = py * rw + px, j = i * 4
      const sum = a[i]! * 4 + (px > 0 ? a[i - 1]! : 0) + (px < rw - 1 ? a[i + 1]! : 0) + (py > 0 ? a[i - rw]! : 0) + (py < rh - 1 ? a[i + rw]! : 0)
      region.data[j] = region.data[j + 1] = region.data[j + 2] = 255
      region.data[j + 3] = Math.min(region.data[j + 3]!, Math.round(sum / 8 * 255))
    }
    this.maskContext.clearRect(0, 0, width, height); this.maskContext.putImageData(region, x, y)
    if (this.composite.width !== video.videoWidth || this.composite.height !== video.videoHeight) { this.composite.width = video.videoWidth; this.composite.height = video.videoHeight }
    const composite = this.compositeContext
    composite.globalCompositeOperation = 'copy'; composite.drawImage(sourceImage, 0, 0)
    composite.globalCompositeOperation = 'destination-in'; composite.drawImage(this.mask, 0, 0, video.videoWidth, video.videoHeight)
    composite.globalCompositeOperation = 'source-over'
    this.ready = true
  }
  destroy() {
    this.ready = false; this.sourceFrame = null; this.a = this.b = this.connected = new Uint8Array(0); this.queue = new Int32Array(0)
    for (const canvas of [this.frame, this.support, this.mask, this.composite]) canvas.width = canvas.height = 1
  }
}
