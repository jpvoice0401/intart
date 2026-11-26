import type { BooHand, BooPoint, MybooDrive } from './myboo-model'
import { BOO_WHEEL_LIMIT, booPalmFacesCamera } from './myboo-model'
import { MybooRoad } from './myboo-road'
import { MybooHandMatte } from './myboo-hand-matte'

const WIDTH = 1536, HEIGHT = 1024
const COLORS = ['#ffb46f', '#ed589e', '#45d2f5', '#c4aeff', '#ffe6a0']

function path(ctx: CanvasRenderingContext2D, points: number[][]) {
  ctx.beginPath(); ctx.moveTo(points[0]![0]!, points[0]![1]!)
  for (const point of points.slice(1)) ctx.lineTo(point[0]!, point[1]!)
  ctx.closePath()
}
function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + w - radius, y); ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius); ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius); ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath()
}

export class MybooRenderer {
  readonly canvas = document.createElement('canvas')
  private ctx: CanvasRenderingContext2D
  private observer: ResizeObserver
  private cockpit = new Image()
  private key = new Image()
  private wheel = document.createElement('canvas')
  private navigation = document.createElement('canvas')
  private navigationContext: CanvasRenderingContext2D
  private skyline = document.createElement('canvas')
  private street = document.createElement('canvas')
  private streetContext: CanvasRenderingContext2D
  private road: MybooRoad
  private handMatte = new MybooHandMatte()
  private city = Array.from({ length: 28 }, (_, i) => this.building(i))
  private keyPose: { x: number; y: number; size: number; angle: number; widthScale: number; shear: number } | null = null
  private keyHiddenUntil = -Infinity
  private ratio = 1
  width = 1
  height = 1
  assetError = false

  constructor(root: HTMLElement) {
    this.canvas.className = 'myboo-canvas'; this.canvas.tabIndex = 0
    this.canvas.setAttribute('aria-label', '람보르기니 실내. 카메라를 켜 손으로 조작하거나 아래 체험 버튼을 사용하세요.')
    const ctx = this.canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('화면을 표시할 수 없어요.')
    this.ctx = ctx
    const streetContext = this.street.getContext('2d', { alpha: false })
    if (!streetContext) throw new Error('거리 화면을 표시할 수 없어요.')
    this.streetContext = streetContext; root.prepend(this.canvas)
    this.navigation.width = 214; this.navigation.height = 115
    const navigationContext = this.navigation.getContext('2d')
    if (!navigationContext) throw new Error('네비게이션을 표시할 수 없어요.')
    this.navigationContext = navigationContext
    this.road = new MybooRoad(root)
    this.cockpit.src = `${import.meta.env.BASE_URL}myboo/cockpit.png`
    this.key.src = `${import.meta.env.BASE_URL}myboo/key.png`
    this.cockpit.onerror = this.key.onerror = () => { this.assetError = true }
    this.cacheWheel(); this.cacheSkyline()
    const resize = () => {
      const bounds = root.getBoundingClientRect()
      this.width = Math.max(1, bounds.width); this.height = Math.max(1, bounds.height)
      this.ratio = Math.min(window.devicePixelRatio || 1, 1.5)
      this.canvas.width = Math.round(this.width * this.ratio); this.canvas.height = Math.round(this.height * this.ratio)
      this.street.width = this.canvas.width; this.street.height = this.canvas.height
    }
    this.observer = new ResizeObserver(resize); this.observer.observe(root); resize()
  }

  /** The full wheel and windshield remain visible in portrait as well as landscape. */
  private layout() {
    const scale = Math.max(this.width / WIDTH, Math.min(this.height / HEIGHT, this.width / WIDTH * 1.32))
    return { scale, x: (this.width - WIDTH * scale) / 2, y: this.height - HEIGHT * scale }
  }
  private project(point: BooPoint, video: HTMLVideoElement) {
    const scale = Math.max(this.width / (video.videoWidth || 1280), this.height / (video.videoHeight || 720))
    return { x: this.width / 2 + (.5 - point.x) * (video.videoWidth || 1280) * scale,
      y: this.height / 2 + (point.y - .5) * (video.videoHeight || 720) * scale }
  }
  private camera(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, x: number, y: number, w: number, h: number) {
    if (video.readyState < 2 || !video.videoWidth) return
    const scale = Math.max(w / video.videoWidth, h / video.videoHeight)
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(-1, 1)
    ctx.drawImage(video, -video.videoWidth * scale / 2, -video.videoHeight * scale / 2, video.videoWidth * scale, video.videoHeight * scale); ctx.restore()
  }

  render(video: HTMLVideoElement, live: boolean, hands: BooHand[], drive: MybooDrive, time: number, swap: boolean, dt: number, cameraFrame: ImageBitmap | null = null) {
    const ctx = this.ctx, w = this.width, h = this.height, layout = this.layout()
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0)
    ctx.fillStyle = '#090b13'; ctx.fillRect(0, 0, w, h)
    this.road.sync(drive.running, drive.speed, drive.nightMix)
    this.streetContext.setTransform(this.ratio, 0, 0, this.ratio, 0, 0)
    this.streetContext.fillStyle = '#090b13'; this.streetContext.fillRect(0, 0, w, h)
    if (!this.road.draw(this.streetContext, 0, 0, w, h, drive.steering)) this.drawStreet(this.streetContext, w, h, drive, time)
    ctx.drawImage(this.street, 0, 0, w, h)
    ctx.save(); ctx.translate(layout.x, layout.y); ctx.scale(layout.scale, layout.scale)
    // Every generated pixel stays intact; the animated view is composited on top
    // only inside the physical windshield, independent of PNG alpha variations.
    if (this.cockpit.complete && this.cockpit.naturalWidth) ctx.drawImage(this.cockpit, 0, 0, WIDTH, HEIGHT)
    else { ctx.fillStyle = '#151515'; ctx.fillRect(0, HEIGHT * .48, WIDTH, HEIGHT) }
    ctx.save()
    path(ctx, [[192, 67], [1327, 67], [1396, 106], [1323, 400], [1249, 424], [326, 424], [262, 407], [155, 125]])
    ctx.clip()
    ctx.translate(-layout.x / layout.scale, -layout.y / layout.scale); ctx.scale(1 / layout.scale, 1 / layout.scale)
    if (!this.road.draw(ctx, layout.x + 155 * layout.scale, layout.y + 67 * layout.scale, 1241 * layout.scale, 357 * layout.scale, drive.steering)) ctx.drawImage(this.street, 0, 0, w, h)
    ctx.restore()
    this.drawInstruments(ctx, drive, time)
    ctx.save(); ctx.translate(500, 760); ctx.rotate(drive.steering * BOO_WHEEL_LIMIT)
    ctx.drawImage(this.wheel, -265, -265, 530, 530); ctx.restore()
    ctx.restore()
    if (live) this.drawHands(ctx, video, hands, drive, swap, dt, time, cameraFrame)
    const shade = ctx.createLinearGradient(0, 0, 0, h); shade.addColorStop(0, '#05060caa'); shade.addColorStop(.28, '#05060c00'); shade.addColorStop(.8, '#05060c00'); shade.addColorStop(1, '#05060cbb')
    ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h)
    // The mirror stays bright and above foreground-hand masks and the vignette.
    this.drawRearView(ctx, video, Boolean(video.srcObject) && video.readyState >= 2, layout)
  }

  private drawRearView(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, live: boolean, layout: { scale: number; x: number; y: number }) {
    const s = layout.scale
    // Cabin coordinates place the mirror above the central console, beneath
    // the windscreen's roof attachment, instead of in a screen-corner widget.
    const navigationBottom = this.width < 800 ? 78 : 94
    // Never hide the camera mirror when the background cockpit is cropped.
    const width = Math.min(Math.max(286 * s, this.width < 800 ? 148 : 210), this.width * .46, 310), height = width * .44
    const top = Math.max(8, Math.min(Math.max(navigationBottom, layout.y + 105 * s), this.height - height - 18))
    const center = Math.max(width / 2 + 12, Math.min(this.width - width / 2 - 12, layout.x + 922 * s))
    const left = center - width / 2, rim = Math.max(2, 5 * s)
    const mountTop = Math.max(0, top - 25 * Math.max(.65, s))
    ctx.save()
    // Roof pad, angled support and ball joint make the mirror part of the car.
    const mount = ctx.createLinearGradient(center - 18 * s, 0, center + 18 * s, 0)
    mount.addColorStop(0, '#101216'); mount.addColorStop(.5, '#45484b'); mount.addColorStop(1, '#0c0e11')
    ctx.fillStyle = mount
    round(ctx, center - 21 * s, mountTop, 42 * s, 16 * s, 5 * s); ctx.fill()
    ctx.strokeStyle = '#101216'; ctx.lineWidth = 12 * s; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(center, mountTop + 11 * s); ctx.lineTo(center - 8 * s, top - 4 * s); ctx.stroke()
    ctx.strokeStyle = '#4b4e51'; ctx.lineWidth = 3 * s
    ctx.beginPath(); ctx.moveTo(center - 3 * s, mountTop + 12 * s); ctx.lineTo(center - 10 * s, top - 4 * s); ctx.stroke()
    ctx.fillStyle = '#22252a'; ctx.beginPath(); ctx.arc(center - 8 * s, top, 9 * s, 0, Math.PI * 2); ctx.fill()
    // A shallow, wide automotive housing with a slight angle toward the driver.
    ctx.translate(center, top + height / 2); ctx.rotate(-.025); ctx.translate(-center, -top - height / 2)
    ctx.shadowColor = '#0009'; ctx.shadowBlur = 12 * s; ctx.shadowOffsetY = 5 * s
    round(ctx, left - rim, top - rim, width + rim * 2, height + rim * 2.3, 11 * s)
    ctx.fillStyle = '#090b0e'; ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
    ctx.strokeStyle = '#777b7d'; ctx.lineWidth = Math.max(.7, s); ctx.stroke()
    ctx.save(); round(ctx, left, top, width, height, 7 * s); ctx.clip()
    if (live) this.camera(ctx, video, left, top, width, height)
    else {
      const glass = ctx.createLinearGradient(0, top, 0, top + height)
      glass.addColorStop(0, '#35414c'); glass.addColorStop(1, '#101a22')
      ctx.fillStyle = glass; ctx.fillRect(left, top, width, height)
      ctx.fillStyle = '#c1c9cd'; ctx.font = `${Math.max(5, 9 * s)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('YOUR CAMERA', center, top + height * .56)
    }
    const reflection = ctx.createLinearGradient(0, top, 0, top + height)
    reflection.addColorStop(0, '#cfe8f61b'); reflection.addColorStop(.35, '#a8cddd05'); reflection.addColorStop(1, '#102c3812')
    ctx.fillStyle = reflection; ctx.fillRect(left, top, width, height)
    ctx.restore()
    ctx.fillStyle = '#8bbf9d'; ctx.beginPath(); ctx.arc(center, top + height + rim * .65, Math.max(.6, 1.2 * s), 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  private drawInstruments(ctx: CanvasRenderingContext2D, drive: MybooDrive, time: number) {
    ctx.save(); ctx.translate(500, 515)
    ctx.fillStyle = '#06090d'; round(ctx, -158, -56, 316, 100, 25); ctx.fill()
    ctx.strokeStyle = drive.running ? '#fc8c41' : '#5c626a'; ctx.lineWidth = 4
    ctx.beginPath(); ctx.arc(0, -3, 49, Math.PI * .86, Math.PI * 2.14); ctx.stroke()
    ctx.fillStyle = '#f3f1ed'; ctx.font = '500 36px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(Math.round(drive.speed)), 0, 8)
    ctx.font = '8px sans-serif'; ctx.fillStyle = '#a7adb4'; ctx.fillText('KM / H', 0, 27)
    ctx.fillStyle = '#f98c39'; ctx.font = '19px sans-serif'; ctx.fillText(drive.running ? `D${Math.min(7, 1 + Math.floor(drive.speed / 32))}` : drive.starting ? 'N' : 'P', -108, 0)
    ctx.font = '8px sans-serif'; ctx.fillStyle = '#b9c4c9'; ctx.fillText(drive.hasKey ? 'KEY CONNECTED' : 'KEY REQUIRED', 103, 0)
    ctx.restore()
    this.drawNavigation(ctx, drive, time)
  }

  private drawNavigation(ctx: CanvasRenderingContext2D, drive: MybooDrive, time: number) {
    const screen = this.navigationContext, width = this.navigation.width, height = this.navigation.height
    screen.setTransform(1, 0, 0, 1, 107, 61)
    screen.fillStyle = '#0d1720'; screen.fillRect(-107, -61, width, height)
    screen.strokeStyle = '#737f7a22'; screen.lineWidth = 1
    for (let i = -80; i < 90; i += 25) { screen.beginPath(); screen.moveTo(i, -53); screen.lineTo(i + 15, 47); screen.stroke() }
    screen.strokeStyle = '#f58f38'; screen.lineWidth = 3; screen.beginPath(); screen.moveTo(-70, 43); screen.lineTo(-35, 8); screen.lineTo(-35, -35); screen.lineTo(65, -35); screen.stroke()
    screen.fillStyle = '#ffdf9e'; screen.beginPath(); screen.arc(-35, 8 - (drive.distance % 44), 4, 0, Math.PI * 2); screen.fill()
    screen.fillStyle = '#d5dcdf'; screen.font = '10px sans-serif'; screen.textAlign = 'center'; screen.fillText('LAS VEGAS BLVD', 25, 27)
    if (drive.boosting) { screen.fillStyle = `rgba(255,142,48,${.65 + .3 * Math.sin(time * 5)})`; screen.fillText('CORSA', 26, 44) }
    const reflection = screen.createLinearGradient(-107, -61, 107, 54)
    reflection.addColorStop(0, '#d9e8f30b'); reflection.addColorStop(.55, '#bfd1e402'); reflection.addColorStop(1, '#00000010')
    screen.fillStyle = reflection; screen.fillRect(-107, -61, width, height)

    // Inner glass corners measured in the original 1536x1024 cockpit photo.
    // Map the screen into this slanted quadrilateral, preserving its real bezel
    // and leaving the vents, orange trim and metal switches unobstructed.
    const tl = { x: 886, y: 568 }, tr = { x: 1099, y: 563 }
    const br = { x: 1137, y: 681 }, bl = { x: 933, y: 691 }
    ctx.save()
    path(ctx, [[tl.x, tl.y], [tr.x, tr.y], [bl.x, bl.y]]); ctx.clip()
    ctx.transform((tr.x - tl.x) / width, (tr.y - tl.y) / width, (bl.x - tl.x) / height, (bl.y - tl.y) / height, tl.x, tl.y)
    ctx.drawImage(this.navigation, 0, 0); ctx.restore()
    ctx.save()
    path(ctx, [[tr.x, tr.y], [br.x, br.y], [bl.x, bl.y]]); ctx.clip()
    const a = (br.x - bl.x) / width, b = (br.y - bl.y) / width
    ctx.transform(a, b, (br.x - tr.x) / height, (br.y - tr.y) / height, tr.x - a * width, tr.y - b * width)
    ctx.drawImage(this.navigation, 0, 0); ctx.restore()
  }

  private drawHands(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, hands: BooHand[], drive: MybooDrive, swap: boolean, dt: number, time: number, cameraFrame: ImageBitmap | null) {
    this.handMatte.draw(ctx, video, hands, this.width, this.height, time, cameraFrame)
    const validHands = hands.filter(hand => hand.landmarks.length >= 21)
    if (validHands.length >= 2 || drive.twoHandGrip) this.keyHiddenUntil = time + .35
    const allowKey = validHands.length === 1 && time >= this.keyHiddenUntil
    let foundKey = false
    for (const hand of hands) {
      const side = swap ? hand.side === 'Left' ? 'Right' : 'Left' : hand.side
      const points = hand.landmarks.map(point => this.project(point, video))
      if (points.length < 21) continue
      // Average all four knuckles so a spread or tilted hand cannot pull the
      // anchor toward one finger. Place the object inside the palm, above the wrist.
      const knuckles = [5, 9, 13, 17].reduce((sum, index) => ({ x: sum.x + points[index]!.x / 4, y: sum.y + points[index]!.y / 4 }), { x: 0, y: 0 })
      const wrist = points[0]!
      const palm = { x: wrist.x * .4 + knuckles.x * .6, y: wrist.y * .4 + knuckles.y * .6 }
      if (allowKey && side === 'Left' && hand.landmarks[9]!.y < .78 && booPalmFacesCamera(hand, (video.videoWidth || 1280) / (video.videoHeight || 720))) {
        foundKey = true
        const span = Math.hypot(points[5]!.x - points[17]!.x, points[5]!.y - points[17]!.y)
        const length = Math.hypot(knuckles.x - wrist.x, knuckles.y - wrist.y)
        const upX = (knuckles.x - wrist.x) / Math.max(1, length), upY = (knuckles.y - wrist.y) / Math.max(1, length)
        let acrossX = (points[5]!.x - points[17]!.x) / Math.max(1, span), acrossY = (points[5]!.y - points[17]!.y) / Math.max(1, span)
        if (acrossX * -upY + acrossY * upX < 0) { acrossX *= -1; acrossY *= -1 }
        const footprint = Math.max(.3, Math.min(1, span / Math.max(1, length)))
        const next = { ...palm, size: Math.max(20, Math.min(180, length * .86)),
          angle: Math.atan2(knuckles.x - wrist.x, wrist.y - knuckles.y),
          widthScale: Math.max(.2, (acrossX * -upY + acrossY * upX) * footprint),
          shear: (acrossX * -upX + acrossY * -upY) * footprint }
        if (!this.keyPose || Math.hypot(next.x - this.keyPose.x, next.y - this.keyPose.y) > next.size * .18) this.keyPose = next
        else {
          const t = 1 - Math.exp(-dt * 32)
          this.keyPose.x += (next.x - this.keyPose.x) * t; this.keyPose.y += (next.y - this.keyPose.y) * t
          this.keyPose.size += (next.size - this.keyPose.size) * t
          this.keyPose.angle += Math.atan2(Math.sin(next.angle - this.keyPose.angle), Math.cos(next.angle - this.keyPose.angle)) * t
          this.keyPose.widthScale += (next.widthScale - this.keyPose.widthScale) * t
          this.keyPose.shear += (next.shear - this.keyPose.shear) * t
        }
      }
    }
    if (foundKey && this.keyPose && this.key.complete && this.key.naturalWidth) {
      const p = this.keyPose
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle); ctx.transform(p.widthScale, p.shear, 0, 1, 0, 0)
      // A small contact shadow keeps the fob resting on the skin rather than glowing above it.
      ctx.shadowColor = '#0009'; ctx.shadowBlur = Math.max(1, p.size * .018); ctx.shadowOffsetY = Math.max(1, p.size * .012)
      ctx.drawImage(this.key, -p.size / 2, -p.size / 2, p.size, p.size); ctx.restore()
      ctx.fillStyle = '#ffc18d'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(drive.hasKey ? 'KEY CONNECTED' : 'CONNECTING…', p.x, p.y + p.size / 2 + 12 + Math.sin(time * 2))
    } else this.keyPose = null
  }

  private building(index: number) {
    const canvas = document.createElement('canvas'); canvas.width = 180; canvas.height = 340
    const ctx = canvas.getContext('2d')!, color = COLORS[index % COLORS.length]!
    const names = ['BELLAGIO', 'PARIS', 'CAESARS', 'ARIA', 'THE COSMOPOLITAN', 'LAS VEGAS', 'VENETIAN']
    const fill = ctx.createLinearGradient(0, 0, 180, 340); fill.addColorStop(0, '#33303d'); fill.addColorStop(1, '#111824'); ctx.fillStyle = fill; ctx.fillRect(4, 8, 172, 332)
    ctx.fillStyle = '#0a1018'; ctx.fillRect(15, 18, 150, 320)
    for (let y = 40; y < 330; y += 16) for (let x = 20; x < 165; x += 17) { ctx.fillStyle = (x * 7 + y * 3 + index * 19) % 11 > 2 ? '#e9ce9170' : '#3e506255'; ctx.fillRect(x, y, 7, 6) }
    ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 9; ctx.lineWidth = 2; ctx.strokeRect(5, 8, 170, 330)
    ctx.fillStyle = '#14111c'; ctx.fillRect(9, 87, 162, 47)
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.font = 'bold 14px sans-serif'; ctx.fillText(names[index % names.length]!, 90, 116, 155)
    ctx.font = '10px sans-serif'; ctx.fillText('HOTEL · CASINO', 90, 145, 150)
    return canvas
  }

  private cacheSkyline() {
    this.skyline.width = 1536; this.skyline.height = 560
    const ctx = this.skyline.getContext('2d')!
    const sky = ctx.createLinearGradient(0, 0, 0, 560); sky.addColorStop(0, '#070d20'); sky.addColorStop(.6, '#2c1d45'); sky.addColorStop(1, '#9d5264'); ctx.fillStyle = sky; ctx.fillRect(0, 0, 1536, 560)
    for (let i = 0; i < 72; i++) { ctx.fillStyle = '#d7e9f287'; ctx.fillRect((i * 191.3) % 1536, 70 + (i * 31) % 270, i % 9 === 0 ? 2 : 1, 1) }
    ctx.fillStyle = '#ffe5c0'; ctx.shadowColor = '#ffdbaf'; ctx.shadowBlur = 28; ctx.beginPath(); ctx.arc(1090, 160, 27, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0
    for (let i = 0; i < 40; i++) { const bw = 35 + i % 4 * 14, bh = 30 + (i * 41) % 105; ctx.fillStyle = i % 2 ? '#111a31' : '#17223c'; ctx.fillRect(i * 41 - 20, 500 - bh, bw, bh) }
    // The Strip's recognizable illuminated Eiffel silhouette and observation wheel.
    ctx.strokeStyle = '#cda477'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(250, 500); ctx.lineTo(300, 292); ctx.lineTo(350, 500); ctx.moveTo(273, 397); ctx.lineTo(327, 397); ctx.moveTo(263, 445); ctx.lineTo(337, 445); ctx.stroke()
    ctx.lineWidth = 1; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.moveTo(265 + i * 5, 475 - i * 22); ctx.lineTo(335 - i * 5, 453 - i * 22); ctx.stroke() }
    ctx.strokeStyle = '#dfb4ee'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(1240, 423, 62, 0, Math.PI * 2); ctx.stroke()
    for (let i = 0; i < 20; i++) { const a = i * Math.PI / 10; ctx.beginPath(); ctx.moveTo(1240, 423); ctx.lineTo(1240 + Math.cos(a) * 62, 423 + Math.sin(a) * 62); ctx.stroke(); ctx.fillStyle = '#d7d4ff'; ctx.fillRect(1237 + Math.cos(a) * 62, 420 + Math.sin(a) * 62, 6, 6) }
  }

  private drawStreet(ctx: CanvasRenderingContext2D, w: number, h: number, drive: MybooDrive, time: number) {
    const layout = this.layout()
    const horizon = Math.max(h * .14, layout.y + 220 * layout.scale), center = w * (.5 - drive.steering * .075), reach = Math.max(h * .55, 450 * layout.scale)
    ctx.drawImage(this.skyline, center - w * .55, 0, w * 1.1, horizon + h * .035)
    const ground = ctx.createLinearGradient(0, horizon, 0, h); ground.addColorStop(0, '#201b2e'); ground.addColorStop(1, '#060a10'); ctx.fillStyle = ground; ctx.fillRect(0, horizon, w, h - horizon)
    path(ctx, [[center - 8, horizon], [center + 8, horizon], [w * 1.9, h], [-w * .9, h]]); ctx.fillStyle = '#151724'; ctx.fill()
    const road = (x: number, depth: number) => ({ x: center + x * depth * w * .36, y: horizon + depth * reach })
    for (const side of [-1, 1]) {
      const far = road(side * 1.24, .01), near = road(side * 1.24, 1.2)
      ctx.strokeStyle = '#d6b27c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(far.x, far.y); ctx.lineTo(near.x, near.y); ctx.stroke()
    }
    for (let i = 0; i < 28; i++) {
      const distance = (i * 20 - drive.distance % 20 + 1 + 560) % 560 + 3
      const depth = 12 / distance
      if (depth > 1.2) continue
      for (const lane of [-.42, .42]) {
        const a = road(lane, depth), b = road(lane, Math.min(1.5, 12 / Math.max(1, distance - 5)))
        ctx.strokeStyle = '#e5dfd5a8'; ctx.lineWidth = Math.max(.6, depth * 6); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      }
    }
    // Far-to-near drawing; only a fixed number of cached hotel textures.
    for (let i = 27; i >= 0; i--) {
      const z = ((i * 30 - drive.distance * .72) % 840 + 840) % 840 + 12, depth = 22 / z
      if (depth > 2) continue
      const side = i % 2 ? 1 : -1, bw = w * .43 * depth, bh = h * (1.25 + i % 3 * .2) * depth
      const base = road(side * 1.8, depth)
      ctx.drawImage(this.city[i]!, side < 0 ? base.x - bw : base.x, base.y - bh, bw, bh)
      if (i % 2 === 0) {
        const palm = road(side * 1.38, depth), trunk = h * .47 * depth
        ctx.strokeStyle = '#8d7254'; ctx.lineWidth = Math.max(1, depth * 9); ctx.beginPath(); ctx.moveTo(palm.x, palm.y); ctx.lineTo(palm.x + side * 9 * depth, palm.y - trunk); ctx.stroke()
        ctx.strokeStyle = '#37735b'; ctx.lineWidth = Math.max(1, depth * 6)
        for (let leaf = 0; leaf < 6; leaf++) { const a = Math.PI + leaf * Math.PI / 5; ctx.beginPath(); ctx.moveTo(palm.x + side * 9 * depth, palm.y - trunk); ctx.quadraticCurveTo(palm.x + Math.cos(a) * 80 * depth, palm.y - trunk - 30 * depth, palm.x + Math.cos(a) * 90 * depth, palm.y - trunk + 10 * depth); ctx.stroke() }
      }
    }
    for (let i = 0; i < 4; i++) {
      const z = 40 + ((i * 39 - drive.distance * .18) % 180 + 180) % 180, d = 12 / z, p = road(i % 2 ? -.75 : .75, d)
      ctx.fillStyle = '#202a38'; round(ctx, p.x - d * 75, p.y - d * 47, d * 150, d * 49, d * 9); ctx.fill()
      ctx.fillStyle = '#ff344f'; ctx.shadowColor = '#ff344f'; ctx.shadowBlur = 8
      ctx.fillRect(p.x - d * 64, p.y - d * 28, d * 35, Math.max(1, d * 7)); ctx.fillRect(p.x + d * 29, p.y - d * 28, d * 35, Math.max(1, d * 7)); ctx.shadowBlur = 0
    }
    if (drive.boosting) {
      ctx.strokeStyle = '#f0c0914d'; ctx.lineWidth = 1
      for (let i = 0; i < 12; i++) { const y = horizon + ((time * 170 + i * 61) % reach), side = i % 2 ? 1 : -1, x = center + side * w * (.3 + (y - horizon) / reach * .4); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + side * 20, y + 12); ctx.stroke() }
    }
  }

  private cacheWheel() {
    this.wheel.width = this.wheel.height = 640
    const ctx = this.wheel.getContext('2d')!; ctx.translate(320, 320)
    ctx.shadowColor = '#000b'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12
    ctx.strokeStyle = '#08090b'; ctx.lineWidth = 54; ctx.beginPath(); ctx.arc(0, 0, 262, Math.PI * .14, Math.PI * 2.86); ctx.stroke(); ctx.shadowBlur = 0
    const metal = ctx.createLinearGradient(-250, -250, 250, 270); metal.addColorStop(0, '#83868a'); metal.addColorStop(.17, '#1a1c20'); metal.addColorStop(.5, '#30343a'); metal.addColorStop(.8, '#08090b'); metal.addColorStop(1, '#898b8d')
    ctx.strokeStyle = metal; ctx.lineWidth = 42; ctx.beginPath(); ctx.arc(0, 0, 255, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = '#bd6e37'; ctx.lineWidth = 1.6; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(0, 0, 235, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = metal; path(ctx, [[-250, -15], [-82, -55], [80, -55], [250, -15], [220, 45], [93, 57], [37, 227], [-39, 227], [-94, 57], [-220, 45]]); ctx.fill()
    ctx.strokeStyle = '#888c92'; ctx.lineWidth = 2; ctx.stroke()
    ctx.fillStyle = '#16191d'; path(ctx, [[-110, -65], [109, -65], [115, 26], [56, 116], [-56, 116], [-115, 26]]); ctx.fill()
    ctx.strokeStyle = '#565957'; ctx.stroke(); ctx.fillStyle = '#090b0e'
    path(ctx, [[-42, -20], [42, -20], [39, 35], [0, 72], [-39, 35]]); ctx.fill(); ctx.strokeStyle = '#c2a357'; ctx.lineWidth = 2; ctx.stroke()
    ctx.fillStyle = '#d7b966'; ctx.font = 'bold 8px Georgia'; ctx.textAlign = 'center'; ctx.fillText('LAMBORGHINI', 0, -5)
    ctx.fillStyle = '#c5aa65'; path(ctx, [[-24, 24], [-8, 15], [16, 22], [28, 13], [24, 29], [14, 35], [9, 49], [4, 48], [5, 32], [-10, 33], [-18, 44], [-23, 41], [-17, 28], [-28, 31]]); ctx.fill()
    ctx.fillStyle = '#df3c39'; ctx.fillRect(-6, -278, 12, 36)
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) { ctx.fillStyle = '#07090c'; round(ctx, side < 0 ? -210 + i * 30 : 120 + i * 30, -15, 24, 25, 6); ctx.fill(); ctx.fillStyle = '#b9bfc5'; ctx.font = '11px sans-serif'; ctx.fillText(['+', '◀', '●'][i]!, side < 0 ? -198 + i * 30 : 132 + i * 30, 2) }
    ctx.fillStyle = '#eae8df'; ctx.fillRect(-10, 219, 20, 5); ctx.fillStyle = '#28995b'; ctx.fillRect(-30, 219, 20, 5); ctx.fillStyle = '#c34338'; ctx.fillRect(10, 219, 20, 5)
    ctx.fillStyle = '#f34c36'; ctx.beginPath(); ctx.arc(-143, -65, 17, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#131316'; ctx.beginPath(); ctx.arc(-143, -65, 12, 0, Math.PI * 2); ctx.fill()
  }
  unlockRoad() { this.road.unlock() }
  pauseRoad() { this.road.pause() }
  resetRoad() { this.road.reset() }
  get roadError() { return this.road.error }
  destroy() { this.handMatte.destroy(); this.road.destroy(); this.observer.disconnect(); this.cockpit.onerror = this.key.onerror = null; this.canvas.remove() }
}
