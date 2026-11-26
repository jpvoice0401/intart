import { drawRolexLogo } from './rolex-logo.ts'
import type { WatchMechanism, WatchPose, WatchPoint } from './rolex-model'
import { drawWatchForeground, type WatchHandMask } from './rolex-hands.ts'
import { drawRaisedWatchHand, type RaisedWatchHand } from './rolex-control.ts'

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath(); ctx.moveTo(x+radius,y); ctx.lineTo(x+width-radius,y); ctx.quadraticCurveTo(x+width,y,x+width,y+radius)
  ctx.lineTo(x+width,y+height-radius); ctx.quadraticCurveTo(x+width,y+height,x+width-radius,y+height)
  ctx.lineTo(x+radius,y+height); ctx.quadraticCurveTo(x,y+height,x,y+height-radius)
  ctx.lineTo(x,y+radius); ctx.quadraticCurveTo(x,y,x+radius,y); ctx.closePath()
}
function metal(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, gold = false) {
  const gradient = ctx.createLinearGradient(x1,y1,x2,y2)
  const colors = gold ? ['#6d5529','#d9c58b','#fff7d7','#b5a06a','#f4e6b7','#7a673f'] : ['#39434b','#b0bbc5','#f8fbfd','#76818c','#d4dce1','#454e58']
  colors.forEach((color,i) => gradient.addColorStop(i/(colors.length-1),color))
  return gradient
}

function bracelet(worn: boolean) {
  const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 1000
  const ctx = canvas.getContext('2d')!; ctx.translate(180,500); ctx.scale(150,150)
  const count = worn ? 3 : 9
  for (const sign of [-1,1]) for (let i = count-1; i >= 0; i--) {
    const center = sign*(1.11+i*.226), width = 1.08-i*.012
    const y = center-.108
    const columns = [{x:-width*.5,w:width*.25},{x:-width*.22,w:width*.44},{x:width*.25,w:width*.25}]
    for (const [column,link] of columns.entries()) {
      ctx.fillStyle = metal(ctx,0,y,0,y+.22)
      rounded(ctx,link.x,y,link.w,.21,.025); ctx.fill()
      ctx.strokeStyle = '#15212c70'; ctx.lineWidth = .008; ctx.stroke()
      ctx.fillStyle = column === 1 ? '#ffffff30' : '#ffffff18'; ctx.fillRect(link.x+.018,y+.04,link.w-.036,.007)
      ctx.fillStyle = '#15212b35'; ctx.fillRect(link.x+.008,y+.188,link.w-.016,.013)
    }
    if (worn) { ctx.fillStyle = `rgba(10,24,26,${i*.13})`; rounded(ctx,-width*.5,y,width,.21,.025); ctx.fill() }
  }
  return canvas
}

function watchCase() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 768
  const ctx = canvas.getContext('2d')!; ctx.translate(384,384); ctx.scale(250,250)
  // Four sculpted steel lugs join the case to the Oyster-style bracelet.
  for (const side of [-1,1]) for (const end of [-1,1]) {
    ctx.save(); ctx.scale(side,end)
    ctx.fillStyle = metal(ctx,.38,.7,.9,1.38)
    ctx.beginPath(); ctx.moveTo(.36,.76); ctx.lineTo(.73,.73); ctx.quadraticCurveTo(.85,1.04,.66,1.38)
    ctx.lineTo(.45,1.38); ctx.lineTo(.36,.76); ctx.fill()
    ctx.strokeStyle = '#e2e8e9a0'; ctx.lineWidth = .012; ctx.stroke(); ctx.restore()
  }
  ctx.shadowColor = '#00120f70'; ctx.shadowBlur = 15; ctx.shadowOffsetY = 7
  ctx.fillStyle = metal(ctx,-1,-.5,1.1,.9); ctx.beginPath(); ctx.arc(0,0,1.115,0,Math.PI*2); ctx.fill(); ctx.shadowColor = 'transparent'
  ctx.fillStyle = metal(ctx,1.03,0,1.3,0,true); rounded(ctx,1.04,-.14,.27,.28,.05); ctx.fill()
  ctx.strokeStyle = '#6e5834'; ctx.lineWidth = .012
  for (let x = 1.1; x < 1.3; x += .034) { ctx.beginPath(); ctx.moveTo(x,-.125); ctx.lineTo(x,.125); ctx.stroke() }
  drawRolexLogo(ctx,1.3,0,.13,true,'#f1dfb1')
  const bezel = ctx.createRadialGradient(-.22,-.3,.7,0,0,1.065)
  for (const [position,color] of [[0,'#ae9968'],[.64,'#f9edc8'],[.76,'#af9762'],[.87,'#e6d5a5'],[.95,'#fff6d8'],[1,'#a58e5a']] as const) bezel.addColorStop(position,color)
  ctx.fillStyle = bezel; ctx.beginPath(); ctx.arc(0,0,1.06,0,Math.PI*2); ctx.fill()
  ctx.strokeStyle = '#fff6d6'; ctx.lineWidth = .013; ctx.beginPath(); ctx.arc(0,0,1.028,0,Math.PI*2); ctx.stroke()
  ctx.fillStyle = '#a6aaa5'; ctx.beginPath(); ctx.arc(0,0,.916,0,Math.PI*2); ctx.fill()
  ctx.fillStyle = '#131b1b'; ctx.beginPath(); ctx.arc(0,0,.895,0,Math.PI*2); ctx.fill()
  ctx.save(); ctx.beginPath(); ctx.arc(0,0,.87,0,Math.PI*2); ctx.clip()
  const dial = ctx.createLinearGradient(-.7,-.6,.8,.7)
  dial.addColorStop(0,'#727674'); dial.addColorStop(.28,'#363d3c'); dial.addColorStop(.55,'#595e5c'); dial.addColorStop(.78,'#252d2c'); dial.addColorStop(1,'#777c78')
  ctx.fillStyle = dial; ctx.fillRect(-1,-1,2,2)
  for (let i = 0; i < 220; i++) {
    const angle = i*Math.PI*2/220
    ctx.strokeStyle = i%3 ? '#e3e9df0b' : '#020b0b18'; ctx.lineWidth = .005
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.sin(angle),Math.cos(angle)); ctx.stroke()
  }
  ctx.restore()
  for (let i = 0; i < 60; i++) {
    ctx.save(); ctx.rotate(i*Math.PI/30); ctx.strokeStyle = i%5 ? '#e9eee1aa' : '#c7d7b9'; ctx.lineWidth = i%5 ? .006 : .012
    ctx.beginPath(); ctx.moveTo(0,-.825); ctx.lineTo(0,i%5 ? -.8 : -.785); ctx.stroke(); ctx.restore()
  }
  for (let i = 1; i < 12; i++) {
    ctx.save(); ctx.rotate(i*Math.PI/6)
    const double = i%3 === 0
    for (const offset of double ? [-.032,.032] : [0]) {
      ctx.shadowColor = '#0009'; ctx.shadowBlur = 5; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3
      ctx.fillStyle = metal(ctx,-.04,-.78,.05,-.57,true); ctx.fillRect(offset-.029,-.764,.058,.193)
      ctx.shadowColor = 'transparent'; ctx.fillStyle = '#f1f0db'; ctx.fillRect(offset-.017,-.746,.034,.151)
    }
    ctx.fillStyle = '#318059'; ctx.fillRect(-.015,-.856,.03,.025); ctx.restore()
  }
  drawRolexLogo(ctx,0,-.57,.43,false,'#e4d7a9','#4c9871')
  ctx.textAlign = 'center'
  ctx.fillStyle = '#f0f3e7'; ctx.font = '500 .038px Arial, sans-serif'; ctx.fillText('OYSTER PERPETUAL',0,-.355)
  ctx.font = '.028px Arial, sans-serif'; ctx.fillText('SUPERLATIVE CHRONOMETER',0,.39); ctx.fillText('OFFICIALLY CERTIFIED',0,.435)
  ctx.font = '.022px Arial, sans-serif'; ctx.fillText('SWISS MADE',0,.824)
  return canvas
}

function hand(ctx: CanvasRenderingContext2D, angle: number, length: number, width: number, second = false) {
  ctx.save(); ctx.rotate(angle)
  ctx.shadowColor = '#0009'; ctx.shadowBlur = 4; ctx.shadowOffsetX = .015; ctx.shadowOffsetY = .025
  ctx.fillStyle = metal(ctx,-width,0,width,0,true)
  ctx.beginPath(); ctx.moveTo(-width,.19); ctx.lineTo(-width*.65,-length+.07); ctx.lineTo(0,-length)
  ctx.lineTo(width*.65,-length+.07); ctx.lineTo(width,.19); ctx.closePath(); ctx.fill()
  ctx.shadowColor = 'transparent'
  if (!second) { ctx.strokeStyle = '#faf8e4'; ctx.lineWidth = width*.65; ctx.beginPath(); ctx.moveTo(0,-.15); ctx.lineTo(0,-length+.1); ctx.stroke() }
  else { ctx.beginPath(); ctx.arc(0,.19,.038,0,Math.PI*2); ctx.fill() }
  ctx.restore()
}

export class RolexRenderer {
  readonly canvas = document.createElement('canvas')
  width = 1
  height = 1
  private ctx: CanvasRenderingContext2D
  private body = watchCase()
  private fullBand = bracelet(false)
  private wristBand = bracelet(true)
  private observer: ResizeObserver
  private host: HTMLElement
  constructor(host: HTMLElement) {
    this.host = host
    this.canvas.className = 'rolex-canvas'; this.canvas.tabIndex = 0
    this.canvas.setAttribute('aria-label','손목 시계. 다이얼을 드래그하거나 방향키로 시계바늘을 돌리세요.')
    const ctx = this.canvas.getContext('2d',{alpha:false})
    if (!ctx) throw new Error('카메라 화면을 그릴 수 없어요.')
    this.ctx = ctx; host.prepend(this.canvas)
    this.resize(); this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host)
  }
  private resize() {
    const width = Math.max(1,this.host.clientWidth), height = Math.max(1,this.host.clientHeight)
    if (this.width === width && this.height === height) return
    this.width = width; this.height = height
    const dpr = Math.min(devicePixelRatio || 1,1.5)
    this.canvas.width = Math.round(width*dpr); this.canvas.height = Math.round(height*dpr)
    this.ctx.setTransform(dpr,0,0,dpr,0,0)
  }
  previewPose(): WatchPose {
    const portrait = this.width < 800 && this.height > this.width
    const radius = Math.min(this.width*(portrait ? .19 : .14),this.height*(portrait ? .105 : .15))
    const angle = -.055
    return {x:this.width*(portrait ? .5 : .68),y:this.height*(portrait ? .67 : .54),a:Math.cos(angle)*radius,b:Math.sin(angle)*radius,c:-Math.sin(angle)*radius,d:Math.cos(angle)*radius,radius}
  }
  render(video: HTMLVideoElement, live: boolean, pose: WatchPose | null, mechanism: WatchMechanism, time: number, opacity = 1, contact: WatchPoint | null = null, foreground: WatchHandMask[] = [], control: RaisedWatchHand | null = null) {
    const ctx = this.ctx, w = this.width, h = this.height
    if (live && video.readyState >= 2) {
      const scale = Math.max(w/video.videoWidth,h/video.videoHeight)
      ctx.save(); ctx.translate(w,0); ctx.scale(-1,1)
      ctx.drawImage(video,(w-video.videoWidth*scale)/2,(h-video.videoHeight*scale)/2,video.videoWidth*scale,video.videoHeight*scale); ctx.restore()
    } else {
      const background = ctx.createLinearGradient(0,0,w,h)
      background.addColorStop(0,'#102f28'); background.addColorStop(.55,'#1f4235'); background.addColorStop(1,'#071b17')
      ctx.fillStyle = background; ctx.fillRect(0,0,w,h)
      const glow = ctx.createRadialGradient(w*.66,h*.48,0,w*.66,h*.48,h*.7)
      glow.addColorStop(0,'#a5ab7730'); glow.addColorStop(1,'#a5ab7700'); ctx.fillStyle = glow; ctx.fillRect(0,0,w,h)
    }
    if (!pose || opacity <= 0) return
    if (!live) { ctx.save(); ctx.fillStyle = '#00000023'; ctx.filter = 'blur(18px)'; ctx.beginPath(); ctx.ellipse(pose.x+20,pose.y+50,pose.radius*.85,pose.radius*2.4,0,0,Math.PI*2); ctx.fill(); ctx.restore() }
    ctx.save(); ctx.globalAlpha = opacity; ctx.transform(pose.a,pose.b,pose.c,pose.d,pose.x,pose.y)
    ctx.drawImage(live || this.width < 800 ? this.wristBand : this.fullBand,-1.2,-10/3,2.4,20/3)
    ctx.drawImage(this.body,-1.536,-1.536,3.072,3.072)
    const angles = mechanism.angles
    hand(ctx,angles.hour,.57,.046); hand(ctx,angles.minute,.79,.032); hand(ctx,angles.second,.83,.006,true)
    ctx.fillStyle = '#ede0b7'; ctx.beginPath(); ctx.arc(0,0,.055,0,Math.PI*2); ctx.fill()
    ctx.fillStyle = '#777c69'; ctx.beginPath(); ctx.arc(0,0,.018,0,Math.PI*2); ctx.fill()
    ctx.save(); ctx.beginPath(); ctx.arc(0,0,1.045,0,Math.PI*2); ctx.clip()
    const sweep = Math.sin(time*.43)*1.7
    const reflection = ctx.createLinearGradient(sweep-.65,-1,sweep+.25,1)
    reflection.addColorStop(0,'#ffffff00'); reflection.addColorStop(.45,'#ffffff00'); reflection.addColorStop(.52,'#ffffff28'); reflection.addColorStop(.64,'#ffffff06'); reflection.addColorStop(1,'#ffffff00')
    ctx.fillStyle = reflection; ctx.fillRect(-1.1,-1.1,2.2,2.2); ctx.restore()
    for (let i = 0; i < 3; i++) {
      const phase = time*.48+i*2.15, alpha = Math.pow(Math.max(0,Math.sin(time*1.35+i*1.9)),7)
      const x = Math.sin(phase)*1.025, y = Math.cos(phase)*1.025
      ctx.save(); ctx.globalAlpha *= alpha*.85
      const glow = ctx.createRadialGradient(x,y,0,x,y,.18)
      glow.addColorStop(0,'#fff9e4bf'); glow.addColorStop(1,'#fff9e400'); ctx.fillStyle = glow; ctx.fillRect(x-.18,y-.18,.36,.36)
      ctx.strokeStyle = '#fff9df'; ctx.lineWidth = .009
      ctx.beginPath(); ctx.moveTo(x-.12,y); ctx.lineTo(x+.12,y); ctx.moveTo(x,y-.12); ctx.lineTo(x,y+.12); ctx.stroke(); ctx.restore()
    }
    if (mechanism.dragging) { ctx.strokeStyle = '#d1e7b654'; ctx.lineWidth = .012; ctx.beginPath(); ctx.arc(0,0,1.16,0,Math.PI*2); ctx.stroke() }
    if (contact && mechanism.dragging) {
      ctx.strokeStyle = '#f4e9cdbf'; ctx.fillStyle = '#d8e8b742'; ctx.lineWidth = .012
      ctx.beginPath(); ctx.arc(contact.x,contact.y,.065,0,Math.PI*2); ctx.fill(); ctx.stroke()
    }
    ctx.restore()
    if (live) drawWatchForeground(ctx,video,pose,foreground,w,h)
    if (control) drawRaisedWatchHand(ctx,control)
  }
  destroy() { this.observer.disconnect(); this.canvas.remove(); this.body.width = this.fullBand.width = this.wristBand.width = 1 }
}
