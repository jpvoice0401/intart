import { prepareCameraVideo } from './camera-access'
import { BOO_CRUISE_SPEED, BOO_MAX_SPEED } from './myboo-model'

interface RoadClip {
  video: HTMLVideoElement
  poster: HTMLImageElement
  active: boolean
  pending: boolean
  blocked: boolean
}

/** Actual daytime/nighttime driving footage. Decode both only during sunset. */
export class MybooRoad {
  private day: RoadClip
  private night: RoadClip
  private mix = 0
  private closed = false
  error = ''

  constructor(root: HTMLElement) {
    this.day = this.createClip(root, 'vegas-drive')
    this.night = this.createClip(root, 'vegas-night')
  }
  private createClip(root: HTMLElement, name: string): RoadClip {
    const video = document.createElement('video'), poster = new Image()
    prepareCameraVideo(video)
    video.className = 'myboo-video'; video.setAttribute('aria-hidden', 'true')
    video.loop = true; video.preload = 'metadata'
    video.src = `${import.meta.env.BASE_URL}myboo/${name}.mp4`
    poster.src = `${import.meta.env.BASE_URL}myboo/${name}-poster.jpg`
    video.onerror = () => { if (!this.closed) this.error = '라스베가스 주행 영상을 불러오지 못했어요. 새로고침해주세요.' }
    root.append(video)
    return { video, poster, active: false, pending: false, blocked: false }
  }
  private play(clip: RoadClip, force = false) {
    if (this.closed || clip.pending || (clip.blocked && !force)) return
    clip.pending = true
    void clip.video.play().then(() => {
      if (this.closed || !clip.active || document.hidden) clip.video.pause()
      clip.blocked = false
    }).catch(() => {
      if (!this.closed && clip.active && !document.hidden) {
        clip.blocked = true; this.error = '주행 영상을 재생하려면 화면을 한 번 눌러주세요.'
      }
    }).finally(() => { clip.pending = false })
  }
  unlock() {
    this.error = ''; this.day.blocked = this.night.blocked = false
    this.play(this.day, true)
    if (this.mix > 0) this.play(this.night, true)
  }
  sync(driving: boolean, speed: number, nightMix: number) {
    this.mix = Math.max(0, Math.min(1, nightMix))
    const active = driving && !document.hidden
    const rate = speed <= BOO_CRUISE_SPEED ? Math.max(.65, speed / BOO_CRUISE_SPEED)
      : 1 + Math.min(1, (speed - BOO_CRUISE_SPEED) / (BOO_MAX_SPEED - BOO_CRUISE_SPEED)) * 2.5
    for (const [clip, wanted] of [[this.day, this.mix < 1], [this.night, this.nightOpacity > 0]] as const) {
      clip.active = active && wanted
      if (!clip.active) { if (!clip.video.paused) clip.video.pause(); continue }
      if (Math.abs(clip.video.playbackRate - rate) > .03) clip.video.playbackRate = rate
      if (clip.video.paused) this.play(clip)
    }
  }
  private get nightOpacity() {
    const t = Math.max(0, Math.min(1, (this.mix - .85) / .15))
    return t * t * (3 - 2 * t)
  }
  private drawClip(ctx: CanvasRenderingContext2D, clip: RoadClip, x: number, y: number, w: number, h: number, steering: number) {
    const ready = clip.video.readyState >= 2 && clip.video.videoWidth > 0
    const source = ready ? clip.video : clip.poster
    const vw = ready ? clip.video.videoWidth : clip.poster.naturalWidth
    const vh = ready ? clip.video.videoHeight : clip.poster.naturalHeight
    if (!vw || !vh || !w || !h) return false
    const scale = Math.max(w / vw, h / vh), sw = w / scale, sh = h / scale
    const sx = Math.max(0, Math.min(vw - sw, (vw - sw) * (.5 + steering * .2)))
    ctx.drawImage(source, sx, Math.max(0, (vh - sh) * .72), sw, sh, x, y, w, h)
    return true
  }
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, steering: number) {
    const hasNight = (this.night.video.readyState >= 2 && this.night.video.videoWidth > 0) || this.night.poster.naturalWidth > 0
    const mix = hasNight ? this.nightOpacity : 0
    const dayDrawn = mix < 1 && this.drawClip(ctx, this.day, x, y, w, h, steering)
    if (dayDrawn && this.mix > 0) {
      // Let daylight dim first, then dissolve to actual night footage near the
      // end of sunset instead of superimposing two roads for the full 15 seconds.
      ctx.save(); ctx.fillStyle = `rgba(24,22,52,${this.mix * .36})`; ctx.fillRect(x, y, w, h); ctx.restore()
    }
    if (mix <= 0) return dayDrawn
    ctx.save(); ctx.globalAlpha *= dayDrawn ? mix : 1
    const nightDrawn = this.drawClip(ctx, this.night, x, y, w, h, steering)
    ctx.restore(); return dayDrawn || nightDrawn
  }
  pause() { for (const clip of [this.day, this.night]) { clip.active = false; clip.video.pause() } }
  reset() {
    this.pause(); this.mix = 0
    for (const clip of [this.day, this.night]) try { clip.video.currentTime = 0 } catch { /* Metadata is still loading. */ }
  }
  destroy() {
    this.closed = true; this.pause()
    for (const clip of [this.day, this.night]) {
      clip.video.onerror = null; clip.video.removeAttribute('src'); clip.video.load(); clip.video.remove(); clip.poster.src = ''
    }
  }
}
