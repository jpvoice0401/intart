import { HumanSnowField, SnowPhysics, type Point } from './snow-physics'
import { SnowFog } from './snow-fog'
import type { SnowFinger, SnowMouth } from './snow-tracking'
import { createSnowCloud } from './snow-cloud'
import { SnowmanBuilder, type SnowMover, type SnowmanView } from './snowman'

interface Cloud extends Point { width: number; phase: number; rainUntil: number; pokedAt: number; emission: number; sprites: HTMLCanvasElement[] }

export class SnowWorld {
  readonly canvas = document.createElement('canvas')
  private ctx: CanvasRenderingContext2D
  private fogCanvas = document.createElement('canvas')
  private fogCtx: CanvasRenderingContext2D
  private maskCanvas = document.createElement('canvas')
  private blurredCanvas = document.createElement('canvas')
  private blurredCtx: CanvasRenderingContext2D
  private blurVideoTime = -1
  private smallVideo = document.createElement('canvas')
  private maskCtx: CanvasRenderingContext2D
  private maskImage: ImageData
  private fog: SnowFog
  field: HumanSnowField
  private physics: SnowPhysics
  private clouds: Cloud[] = []
  private observer: ResizeObserver
  private previous = new Map<string,Point>()
  private inside = new Set<string>()
  private width = 1
  private height = 1
  private time = 0
  private breathTime = 0
  private outline = false
  private host: HTMLElement
  private showKorean = true
  private completedCanvas = document.createElement('canvas')
  private completedCtx: CanvasRenderingContext2D
  readonly snowman = new SnowmanBuilder(1,1)

  constructor(host: HTMLElement) {
    this.host = host
    this.canvas.className = 'snow-camera-canvas'
    this.canvas.setAttribute('aria-label','구름을 검지로 찌르고 김 위에 그림을 그리는 Snow')
    this.canvas.style.touchAction = 'none'
    const ctx = this.canvas.getContext('2d',{ alpha: false })
    const fogCtx = this.fogCanvas.getContext('2d')
    const maskCtx = this.maskCanvas.getContext('2d')
    const blurredCtx = this.blurredCanvas.getContext('2d')
    const completedCtx = this.completedCanvas.getContext('2d')
    if (!ctx || !fogCtx || !maskCtx || !blurredCtx || !completedCtx) throw new Error('브라우저에서 캔버스를 시작할 수 없어요.')
    this.completedCtx = completedCtx
    this.blurredCtx = blurredCtx
    this.ctx = ctx; this.fogCtx = fogCtx; this.maskCtx = maskCtx
    this.field = new HumanSnowField(1,1)
    this.physics = new SnowPhysics(1,1)
    this.fog = new SnowFog(1,1)
    this.maskImage = maskCtx.createImageData(1,1)
    host.prepend(this.canvas)
    this.resize()
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(host)
  }

  private resize() {
    const width = Math.max(1,this.host.clientWidth), height = Math.max(1,this.host.clientHeight)
    if (width === this.width && height === this.height && this.clouds.length) return
    this.width = width; this.height = height
    const dpr = Math.min(devicePixelRatio,1.5)
    let previousSnowmen: HTMLCanvasElement | null = null
    if (this.snowman.completedCount) {
      previousSnowmen = document.createElement('canvas')
      previousSnowmen.width = this.completedCanvas.width; previousSnowmen.height = this.completedCanvas.height
      previousSnowmen.getContext('2d')!.drawImage(this.completedCanvas,0,0)
    }
    this.canvas.width = Math.round(width*dpr); this.canvas.height = Math.round(height*dpr)
    this.ctx.setTransform(dpr,0,0,dpr,0,0)
    this.completedCanvas.width = this.canvas.width; this.completedCanvas.height = this.canvas.height
    this.completedCtx.setTransform(dpr,0,0,dpr,0,0)
    if (previousSnowmen) this.completedCtx.drawImage(previousSnowmen,0,0,width,height)
    this.field = new HumanSnowField(width,height)
    this.physics.resize(width,height)
    this.snowman.resize(width,height)
    const scale = Math.min(1,360/width)
    this.fog = new SnowFog(Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale)))
    this.maskCanvas.width = this.fog.width; this.maskCanvas.height = this.fog.height
    this.maskImage = this.maskCtx.createImageData(this.fog.width,this.fog.height)
    for (let i = 0; i < this.maskImage.data.length; i += 4) this.maskImage.data[i] = this.maskImage.data[i+1] = this.maskImage.data[i+2] = 255
    this.fogCanvas.width = this.blurredCanvas.width = Math.max(1,Math.round(width*.6))
    this.fogCanvas.height = this.blurredCanvas.height = Math.max(1,Math.round(height*.6))
    this.smallVideo.width = Math.max(1,Math.round(this.fogCanvas.width/16)); this.smallVideo.height = Math.max(1,Math.round(this.fogCanvas.height/16))
    this.blurVideoTime = -1
    this.previous.clear(); this.inside.clear()
    const cloudWidth = Math.max(66,Math.min(158,width*.13))
    this.clouds = Array.from({length:5},(_,i) => ({
      x: width*(.12+i*.19), y: Math.max(215,height*(.28+(i%2)*.075)),
      width: cloudWidth, phase: i*1.8, rainUntil: 0, pokedAt: -10, emission: 0,
      sprites: [createSnowCloud(cloudWidth,i,false),createSnowCloud(cloudWidth,i,true)],
    }))
  }

  setOutline(show: boolean) { this.outline = show }
  setKoreanLabels(show: boolean) { this.showKorean = show }
  get snowCount() { return this.physics.particles.length }
  get snowing() { return this.clouds.some(cloud => cloud.rainUntil > this.time) }
  reset() {
    this.physics.clear(); this.fog.clear(); this.snowman.reset(); this.breathTime = 0
    this.completedCtx.clearRect(0,0,this.width,this.height)
    this.previous.clear(); this.inside.clear()
    for (const cloud of this.clouds) { cloud.rainUntil = 0; cloud.emission = 0 }
  }
  private cloudPosition(cloud: Cloud): Point {
    return { x: cloud.x+Math.sin(this.time*.16+cloud.phase)*this.width*.037, y: cloud.y+Math.cos(this.time*.35+cloud.phase)*10 }
  }

  update(dt: number, fingers: SnowFinger[], mouth: SnowMouth | null, movers: SnowMover[] = []) {
    dt = Math.min(.08,Math.max(0,dt))
    this.time += dt
    this.fog.fade(dt)
    if (mouth && mouth.openness > .05 && this.snowing) {
      this.breathTime = Math.min(3,this.breathTime+dt)
      const scale = this.fog.width/this.width
      // Warm breath starts at the mouth and expands above it as it condenses.
      const radius = Math.min(this.width*.32,Math.max(80,mouth.width*1.8)+this.breathTime*45)
      this.fog.breathe(mouth.x*scale,(mouth.y-this.breathTime*13)*scale,radius*scale,dt,mouth.openness)
    } else this.breathTime = Math.max(0,this.breathTime-dt*2)
    const current = new Map<string,Point>(), inside = new Set<string>()
    for (const finger of fingers) {
      const prev = this.previous.get(finger.id)
      const start = prev && Math.hypot(prev.x-finger.x,prev.y-finger.y) < this.width*.3 ? prev : finger
      const scale = this.fog.width/this.width
      this.fog.wipe({x:start.x*scale,y:start.y*scale},{x:finger.x*scale,y:finger.y*scale},Math.max(12,this.width*.012)*scale)
      this.clouds.forEach((cloud,i) => {
        const center = this.cloudPosition(cloud)
        // Test the whole fingertip segment so quick pokes cannot skip a cloud.
        const ax = (start.x-center.x)/(cloud.width*.55), ay = (start.y-center.y)/(cloud.width*.3)
        const dx = (finger.x-start.x)/(cloud.width*.55), dy = (finger.y-start.y)/(cloud.width*.3)
        const t = Math.max(0,Math.min(1,-(ax*dx+ay*dy)/Math.max(.00001,dx*dx+dy*dy)))
        if (Math.hypot(ax+dx*t,ay+dy*t) >= 1) return
        const key = `${finger.id}:${i}`
        inside.add(key)
        if (!this.inside.has(key) && this.time-cloud.pokedAt > 1) {
          cloud.rainUntil = this.time+11
          cloud.pokedAt = this.time
          this.emitSnow(center.x,center.y+cloud.width*.2,cloud.width*.8,12)
        }
      })
      current.set(finger.id,finger)
    }
    this.previous = current; this.inside = inside
    for (const cloud of this.clouds) if (cloud.rainUntil > this.time) {
      cloud.emission += dt*42
      const amount = Math.floor(cloud.emission)
      cloud.emission -= amount
      const point = this.cloudPosition(cloud)
      this.emitSnow(point.x,point.y+cloud.width*.22,cloud.width*.85,amount)
    }
    this.physics.update(dt,this.field)
    this.snowman.update(dt,movers,this.physics.particles)
    const completed = this.snowman.takeCompleted()
    // Flatten completed snowmen into one fixed-size layer; creation has no count cap.
    if (completed) this.drawSnowman(completed,this.completedCtx)
  }

  private emitSnow(x: number, y: number, spread: number, amount: number) {
    this.physics.emit(x,y,spread,Math.max(0,Math.min(amount,1600-this.physics.particles.length-this.snowman.collected.length)))
  }

  private drawCamera(ctx: CanvasRenderingContext2D,video: HTMLVideoElement,width: number,height: number) {
    const scale = Math.max(width/video.videoWidth,height/video.videoHeight)
    ctx.save(); ctx.translate(width,0); ctx.scale(-1,1)
    ctx.drawImage(video,(width-video.videoWidth*scale)/2,(height-video.videoHeight*scale)/2,video.videoWidth*scale,video.videoHeight*scale)
    ctx.restore()
  }

  render(video: HTMLVideoElement, live: boolean, fingers: SnowFinger[]) {
    const ctx = this.ctx, w = this.width, h = this.height
    const camera = live && video.readyState >= 2
    if (camera) this.drawCamera(ctx,video,w,h)
    else {
      const gradient = ctx.createLinearGradient(0,0,w*.4,h)
      gradient.addColorStop(0,'#2e4358'); gradient.addColorStop(.5,'#6e8c9c'); gradient.addColorStop(1,'#b5c7c9')
      ctx.fillStyle = gradient; ctx.fillRect(0,0,w,h)
      ctx.fillStyle = '#e5eeee16'
      for (let i = 0; i < 34; i++) { const y = (i*173+this.time*3)%h; ctx.beginPath(); ctx.arc((i*317)%w,y,1+(i%3),0,Math.PI*2); ctx.fill() }
    }
    ctx.fillStyle = '#13293d15'; ctx.fillRect(0,0,w,h)
    if (camera) this.drawFog(video)
    if (this.outline) this.drawOutline()
    ctx.fillStyle = '#fbffff'
    ctx.beginPath()
    for (const p of this.physics.particles) { ctx.moveTo(p.x+p.radius,p.y); ctx.arc(p.x,p.y,p.radius,0,Math.PI*2) }
    ctx.fill()
    if (this.snowman.collected.length) {
      ctx.beginPath()
      for (const particle of this.snowman.collected) { ctx.moveTo(particle.x+particle.radius,particle.y); ctx.arc(particle.x,particle.y,particle.radius,0,Math.PI*2) }
      ctx.fill()
    }
    // Delicate six-point crystals among the smaller powder particles.
    ctx.strokeStyle = '#ffffffc9'; ctx.lineWidth = .7; ctx.beginPath()
    for (let i = 0; i < this.physics.particles.length; i += 11) {
      const p = this.physics.particles[i]!
      if (p.supported) continue
      for (let a = 0; a < 3; a++) {
        const angle = a*Math.PI/3+p.phase+Math.sin(p.age)*.3, dx = Math.cos(angle)*(p.radius+2), dy = Math.sin(angle)*(p.radius+2)
        ctx.moveTo(p.x-dx,p.y-dy); ctx.lineTo(p.x+dx,p.y+dy)
      }
    }
    ctx.stroke()
    if (this.snowman.completedCount) ctx.drawImage(this.completedCanvas,0,0,w,h)
    if (this.snowman.phase !== 'complete') this.drawSnowman()
    this.clouds.forEach(cloud => this.drawCloud(cloud))
    for (const finger of fingers) {
      ctx.strokeStyle = '#f2f8e4cc'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(finger.x,finger.y,9,0,Math.PI*2); ctx.stroke()
      ctx.fillStyle = '#f2f8e4'; ctx.beginPath(); ctx.arc(finger.x,finger.y,2,0,Math.PI*2); ctx.fill()
    }
  }

  private drawCloud(cloud: Cloud) {
    const ctx = this.ctx, p = this.cloudPosition(cloud)
    const pulse = Math.max(0,1-(this.time-cloud.pokedAt)*2.7)
    ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(Math.sin(this.time*.3+cloud.phase)*.025)
    ctx.scale(1+pulse*.09,1-pulse*.13)
    const sprite = cloud.sprites[cloud.rainUntil>this.time ? 1 : 0]!
    ctx.drawImage(sprite,-cloud.width*.85,-cloud.width*1.15*.52,cloud.width*1.7,cloud.width*1.15)
    ctx.restore()
    if (!this.showKorean) return
    ctx.save(); ctx.font = '9px "Noto Sans KR", sans-serif'; ctx.textAlign = 'center'
    ctx.fillStyle = cloud.rainUntil>this.time?'#fafcffbb':'#eaf3f7c9'
    ctx.fillText(cloud.rainUntil>this.time?'눈이 내려요 ❄':'검지로 톡',p.x,p.y+cloud.width*.49)
    ctx.restore()
  }

  private drawSnowman(builder: SnowmanView = this.snowman, ctx = this.ctx) {
    const balls = builder.balls
    if (!balls.length) return
    const base = balls[0]!, middle = balls[1], head = balls[2], detail = builder.decoration
    ctx.save()
    ctx.fillStyle = '#15334f24'; ctx.beginPath()
    ctx.ellipse(builder.center.x,builder.ground+4,Math.max(12,base.radius*1.3),Math.max(3,base.radius*.16),0,0,Math.PI*2); ctx.fill()
    if (detail && middle) {
      ctx.save(); ctx.globalAlpha = detail; ctx.strokeStyle = '#795e51'; ctx.lineCap = 'round'; ctx.lineWidth = 2.5
      for (const side of [-1,1]) {
        const x = middle.x+side*middle.radius*.75, y = middle.y-middle.radius*.1
        const tipX = middle.x+side*middle.radius*2.1, tipY = y-middle.radius*.62
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(tipX,tipY)
        ctx.moveTo(tipX-side*middle.radius*.27,tipY+middle.radius*.12); ctx.lineTo(tipX-side*middle.radius*.18,tipY-middle.radius*.24)
        ctx.moveTo(tipX-side*middle.radius*.23,tipY+middle.radius*.1); ctx.lineTo(tipX+side*middle.radius*.08,tipY+middle.radius*.22); ctx.stroke()
      }
      ctx.restore()
    }
    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i]!, r = ball.radius
      if (ball.mass < .1) continue
      ctx.save(); ctx.translate(ball.x,ball.y)
      const gradient = ctx.createRadialGradient(-r*.35,-r*.45,r*.05,0,r*.14,r*1.14)
      gradient.addColorStop(0,'#ffffff'); gradient.addColorStop(.48,'#f8fcff'); gradient.addColorStop(.8,'#deebf5'); gradient.addColorStop(1,'#b8d0e3')
      ctx.shadowColor = '#20456424'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 3
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill()
      ctx.shadowColor = 'transparent'; ctx.rotate(ball.angle)
      // Fixed flecks rotate with each sphere, making the rolling visible.
      for (let j = 0; j < 22; j++) {
        const angle = j*2.399+i, distance = Math.sqrt((j+.5)/23)*r*.86
        ctx.fillStyle = j%3 ? '#b9d3e035' : '#ffffffb3'
        ctx.beginPath(); ctx.arc(Math.cos(angle)*distance,Math.sin(angle)*distance,Math.max(.45,r*.022),0,Math.PI*2); ctx.fill()
      }
      ctx.restore()
    }
    if (detail && middle && head) {
      ctx.save(); ctx.globalAlpha = detail
      const r = head.radius, mr = middle.radius
      ctx.translate(head.x,head.y)
      ctx.fillStyle = '#374f64'
      // A wool cap with a rolled brim and a small cream pom-pom.
      ctx.beginPath(); ctx.moveTo(-r*.78,-r*.64)
      ctx.bezierCurveTo(-r*.8,-r*1.65,r*.75,-r*1.82,r*.8,-r*.64); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = '#66869b'; ctx.lineWidth = r*.23; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(-r*.82,-r*.68); ctx.quadraticCurveTo(0,-r*.6,r*.83,-r*.68); ctx.stroke()
      ctx.fillStyle = '#f0eadd'; ctx.beginPath(); ctx.arc(r*.09,-r*1.46,r*.2,0,Math.PI*2); ctx.fill()
      ctx.fillStyle = '#2f414f'
      for (const x of [-.28,.28]) { ctx.beginPath(); ctx.arc(r*x,-r*.13,Math.max(1.5,r*.085),0,Math.PI*2); ctx.fill() }
      ctx.fillStyle = '#e39b63'; ctx.beginPath(); ctx.moveTo(r*.02,r*.04); ctx.lineTo(r*.75,r*.18); ctx.lineTo(r*.03,r*.27); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#cc9c9c46'
      for (const x of [-.48,.48]) { ctx.beginPath(); ctx.ellipse(r*x,r*.2,r*.14,r*.09,0,0,Math.PI*2); ctx.fill() }
      ctx.fillStyle = '#526776'
      for (let i = 0; i < 5; i++) { const angle = Math.PI*.23+i*Math.PI*.135; ctx.beginPath(); ctx.arc(Math.cos(angle)*r*.42,r*.25+Math.sin(angle)*r*.26,Math.max(.8,r*.045),0,Math.PI*2); ctx.fill() }
      ctx.restore()
      ctx.save(); ctx.globalAlpha = detail; ctx.translate(middle.x,middle.y)
      ctx.fillStyle = '#c87e77'
      ctx.beginPath(); ctx.moveTo(-mr*.79,-mr*.79); ctx.quadraticCurveTo(0,-mr*.57,mr*.79,-mr*.79)
      ctx.lineTo(mr*.76,-mr*.47); ctx.quadraticCurveTo(0,-mr*.26,-mr*.76,-mr*.47); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.moveTo(mr*.18,-mr*.5); ctx.lineTo(mr*.5,-mr*.5); ctx.lineTo(mr*.69,mr*.45); ctx.lineTo(mr*.32,mr*.55); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = '#ebaca39c'; ctx.lineWidth = 1
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(mr*(.27+i*.1),mr*.42); ctx.lineTo(mr*(.29+i*.1),mr*.61); ctx.stroke() }
      ctx.fillStyle = '#536875'
      for (const y of [-.05,.35,.68]) { ctx.beginPath(); ctx.arc(-mr*.13,mr*y,Math.max(1.8,mr*.075),0,Math.PI*2); ctx.fill() }
      ctx.restore()
    }
    if (builder.gathering && builder.phase === 'gathering') {
      ctx.strokeStyle = '#eff9ff52'; ctx.lineWidth = 1; ctx.setLineDash([3,7]); ctx.lineDashOffset = -this.time*12
      ctx.beginPath(); ctx.ellipse(builder.center.x,builder.center.y+20,Math.max(45,base.targetRadius*1.5),14,Math.sin(this.time)*.1,0,Math.PI*2); ctx.stroke()
    }
    ctx.restore()
  }

  private drawFog(video: HTMLVideoElement) {
    if (this.fog.maximum < .005) return
    const pixels = this.maskImage.data
    let maximum = 0
    for (let i = 0; i < this.fog.density.length; i++) {
      const alpha = this.fog.density[i]!
      maximum = Math.max(maximum,alpha)
      pixels[i*4+3] = Math.round(Math.min(.94,alpha)*255)
    }
    if (maximum < .005) return
    this.maskCtx.putImageData(this.maskImage,0,0)
    const ctx = this.fogCtx, w = this.fogCanvas.width, h = this.fogCanvas.height
    ctx.clearRect(0,0,w,h)
    if (video.currentTime !== this.blurVideoTime) {
      const blurred = this.blurredCtx
      blurred.clearRect(0,0,w,h)
      if (typeof blurred.filter === 'string') {
        blurred.save(); blurred.filter = 'blur(10px)'; this.drawCamera(blurred,video,w,h); blurred.restore()
      } else {
        // Older WebKit has no CanvasRenderingContext2D.filter. A low-pass image
        // keeps the condensation blurred instead of silently showing sharp video.
        const small = this.smallVideo.getContext('2d')!
        this.drawCamera(small,video,this.smallVideo.width,this.smallVideo.height)
        blurred.imageSmoothingEnabled = true
        blurred.drawImage(this.smallVideo,0,0,w,h)
      }
      this.blurVideoTime = video.currentTime
    }
    ctx.drawImage(this.blurredCanvas,0,0)
    ctx.fillStyle = '#eff7f8a6'; ctx.fillRect(0,0,w,h)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(this.maskCanvas,0,0,w,h)
    ctx.globalCompositeOperation = 'source-over'
    this.ctx.drawImage(this.fogCanvas,0,0,this.width,this.height)
  }

  private drawOutline() {
    const ctx = this.ctx, f = this.field, sx = this.width/f.columns, sy = this.height/f.rows
    ctx.strokeStyle = '#b8f3e789'; ctx.lineWidth = 1; ctx.beginPath()
    for (let y = 1; y < f.rows-1; y++) for (let x = 1; x < f.columns-1; x++) {
      const i = y*f.columns+x
      if (!f.solid[i]) continue
      if (!f.solid[i-f.columns]) { ctx.moveTo(x*sx,y*sy); ctx.lineTo((x+1)*sx,y*sy) }
      if (!f.solid[i-1]) { ctx.moveTo(x*sx,y*sy); ctx.lineTo(x*sx,(y+1)*sy) }
      if (!f.solid[i+1]) { ctx.moveTo((x+1)*sx,y*sy); ctx.lineTo((x+1)*sx,(y+1)*sy) }
    }
    ctx.stroke()
  }
  destroy() { this.observer.disconnect(); this.reset(); this.canvas.remove() }
}
