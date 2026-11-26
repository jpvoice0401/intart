import * as THREE from 'three'
import { cameraCover } from './water-touch-model'
import { THANOS_DISSOLVE_MS, thanosDissolveField, type ThanosMask, type ThanosMoment } from './thanos-model'

const vertex = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}'
const fragment = `
uniform sampler2D uVideo,uSnapshot,uMask,uBackdrop;
uniform vec2 uCover,uBackdropCover,uOrigin;
uniform float uLive,uFrozen,uProgress,uElapsed,uBackdropReady;
varying vec2 vUv;
float hash(vec2 p){float i=mod(p.x*17.+p.y*131.,251.);return mod(i*i*13.,251.)/251.;}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
void main(){
  vec2 bgUv=(vUv-.5)*uBackdropCover+.5;
  vec3 bg=mix(vec3(.075,.045,.11),vec3(.39,.25,.25),1.-vUv.y);
  if(uBackdropReady>.5) bg=texture2D(uBackdrop,bgUv).rgb;
  bg*=1.-.17*uProgress;
  vec3 color=bg;
  if(uLive>.5){
    vec2 uv=vec2(1.,1.)-((vUv-.5)*uCover+.5);
    float person=smoothstep(.30,.72,texture2D(uMask,uv).r);
    vec3 human=uFrozen>.5?texture2D(uSnapshot,uv).rgb:texture2D(uVideo,uv).rgb;
    float alive=1.;
    float glow=0.;
    if(uFrozen>.5){
      float field=noise(uv*22.)*.55+noise(uv*55.)*.25+uv.y*.2;
      float edge=uProgress*1.35-.15;
      alive=1.-smoothstep(field-.035,field+.035,edge);
      glow=(1.-smoothstep(.0,.065,abs(field-edge)))*step(.001,uProgress);
    }
    human=mix(human,human*vec3(1.04,.99,1.05),.35);
    color=mix(bg,human,person*alive);
    color+=vec3(.35,.16,.055)*glow*person*alive;
  }
  if(uElapsed>=0.&&uElapsed<1.8){
    float radius=uElapsed*.7;
    float ring=exp(-pow((length(vUv-uOrigin)-radius)*38.,2.))*exp(-uElapsed*2.);
    color+=vec3(.14,.075,.18)*ring;
  }
  float vignette=1.-smoothstep(.25,.85,length((vUv-.5)*vec2(1.,.8)))*.22;
  gl_FragColor=vec4(color*vignette,1.);
}`
const dustVertex = `
attribute vec3 aColor;
attribute float aSeed,aDelay;
uniform vec2 uCover;
uniform float uElapsed,uDpr;
varying vec3 vColor;
varying float vAlpha;
void main(){
  float age=uElapsed-aDelay*${THANOS_DISSOLVE_MS / 1000};
  float t=max(0.,age);
  vec2 origin=vec2((.5-position.x)*2./uCover.x,(.5-position.y)*2./uCover.y);
  vec2 drift=vec2((.12+aSeed*.25)*t+sin(t*3.+aSeed*19.)*t*.035,(.04+aSeed*.13)*t+.09*t*t);
  gl_Position=vec4(origin+drift,0.,1.);
  vAlpha=step(0.,age)*(1.-smoothstep(.15,1.85,t));
  gl_PointSize=(1.4+aSeed*3.)*uDpr*(1.-smoothstep(.2,1.85,t));
  vColor=mix(aColor,vec3(.64,.46,.36),min(.55,t*.3));
}`
const dustFragment = `
varying vec3 vColor;varying float vAlpha;
void main(){float d=length(gl_PointCoord-.5);float a=(1.-smoothstep(.22,.5,d))*vAlpha;if(a<.01)discard;gl_FragColor=vec4(vColor,a*.85);}`

export class ThanosRenderer {
  readonly canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.Camera()
  private geometry = new THREE.PlaneGeometry(2, 2)
  private material: THREE.ShaderMaterial
  private videoTexture: THREE.VideoTexture
  private frame: CanvasRenderingContext2D
  private snapshot: THREE.CanvasTexture
  private backdrop: THREE.Texture
  private backdropAspect = 16 / 9
  private maskPixels = new Uint8Array(1)
  private maskTexture: THREE.DataTexture
  private mask: ThanosMask | null = null
  private maskAt = -Infinity
  private foreground = 0
  private frozen = false
  private cover = new THREE.Vector2(1, 1)
  private backgroundCover = new THREE.Vector2(1, 1)
  private origin = new THREE.Vector2(.5, .45)
  private dustGeometry = new THREE.BufferGeometry()
  private dustMaterial: THREE.ShaderMaterial
  private dust: THREE.Points
  private positions = new Float32Array(4800 * 3)
  private colors = new Uint8Array(4800 * 3)
  private seeds = new Float32Array(4800)
  private delays = new Float32Array(4800)
  private observer: ResizeObserver
  private root: HTMLElement
  private width = 1
  private height = 1
  private dpr = 1
  private dirty = true
  private lastDraw = -Infinity
  private lastVideo = -1
  private lastTime = -1
  private closed = false
  private notify: () => void

  constructor(root: HTMLElement, video: HTMLVideoElement, notify: () => void, warning: (text: string) => void) {
    this.root = root; this.notify = notify
    const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('영상 효과를 시작할 수 없어요.')
    this.frame = context; context.canvas.width = context.canvas.height = 1
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, stencil: false, powerPreference: 'low-power' })
    this.renderer.setPixelRatio(1); this.renderer.setClearColor('#150e20')
    this.canvas = this.renderer.domElement; this.canvas.className = 'th-canvas'; this.canvas.setAttribute('aria-label', '타노스 · 카메라 속 사람이 우주의 먼지로 사라지는 화면')
    root.prepend(this.canvas)
    this.videoTexture = new THREE.VideoTexture(video); this.videoTexture.flipY = false; this.videoTexture.colorSpace = THREE.NoColorSpace
    this.videoTexture.generateMipmaps = false; this.videoTexture.minFilter = this.videoTexture.magFilter = THREE.LinearFilter
    this.snapshot = this.createSnapshot()
    this.maskTexture = this.createMask(1, 1)
    this.material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, depthTest: false, depthWrite: false,
      uniforms: { uVideo: { value: this.videoTexture }, uSnapshot: { value: this.snapshot }, uMask: { value: this.maskTexture }, uBackdrop: { value: null }, uCover: { value: this.cover }, uBackdropCover: { value: this.backgroundCover }, uLive: { value: 0 }, uFrozen: { value: 0 }, uProgress: { value: 0 }, uElapsed: { value: -1 }, uOrigin: { value: new THREE.Vector2(.5, .5) }, uBackdropReady: { value: 0 } } })
    const plane = new THREE.Mesh(this.geometry, this.material); plane.frustumCulled = false; this.scene.add(plane)
    this.dustGeometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.dustGeometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3, true))
    this.dustGeometry.setAttribute('aSeed', new THREE.BufferAttribute(this.seeds, 1))
    this.dustGeometry.setAttribute('aDelay', new THREE.BufferAttribute(this.delays, 1))
    this.dustMaterial = new THREE.ShaderMaterial({ vertexShader: dustVertex, fragmentShader: dustFragment, transparent: true, depthTest: false, depthWrite: false,
      uniforms: { uCover: { value: this.cover }, uElapsed: { value: -1 }, uDpr: { value: 1 } } })
    this.dust = new THREE.Points(this.dustGeometry, this.dustMaterial); this.dust.frustumCulled = false; this.dust.visible = false; this.dust.renderOrder = 1; this.scene.add(this.dust)
    this.backdrop = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}thanos/titan.webp`, texture => {
      if (this.closed) { texture.dispose(); return }
      this.backdropAspect = texture.image.width / texture.image.height
      this.material.uniforms.uBackdrop!.value = texture; this.material.uniforms.uBackdropReady!.value = 1
      this.dirty = true; this.notify()
    }, undefined, () => { if (!this.closed) warning('배경 이미지를 불러오지 못했어요. 새로고침해주세요.') })
    this.backdrop.generateMipmaps = false; this.backdrop.minFilter = this.backdrop.magFilter = THREE.LinearFilter
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(root); this.resize()
  }
  private createSnapshot() {
    const texture = new THREE.CanvasTexture(this.frame.canvas); texture.flipY = false; texture.generateMipmaps = false
    texture.minFilter = texture.magFilter = THREE.LinearFilter; return texture
  }
  private createMask(width: number, height: number) {
    const texture = new THREE.DataTexture(this.maskPixels, width, height, THREE.RedFormat, THREE.UnsignedByteType)
    texture.flipY = false; texture.unpackAlignment = 1; texture.generateMipmaps = false
    texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true; return texture
  }
  updatePerson(mask: ThanosMask, image: HTMLVideoElement | ImageBitmap, time: number) {
    if (this.closed || this.frozen || !mask.width || !mask.height || mask.mask.length !== mask.width * mask.height) return
    const isVideo = image instanceof HTMLVideoElement, sw = isVideo ? image.videoWidth : image.width, sh = isVideo ? image.videoHeight : image.height
    if (!sw || !sh) return
    const scale = Math.min(1, 640 / Math.max(sw, sh)), width = Math.max(1, Math.round(sw * scale)), height = Math.max(1, Math.round(sh * scale))
    if (this.frame.canvas.width !== width || this.frame.canvas.height !== height) {
      this.frame.canvas.width = width; this.frame.canvas.height = height
      this.snapshot.dispose(); this.snapshot = this.createSnapshot(); this.material.uniforms.uSnapshot!.value = this.snapshot
    }
    this.frame.drawImage(image, 0, 0, width, height)
    if (this.maskTexture.image.width !== mask.width || this.maskTexture.image.height !== mask.height) {
      this.maskTexture.dispose(); this.maskPixels = new Uint8Array(mask.mask.length)
      this.maskTexture = this.createMask(mask.width, mask.height); this.material.uniforms.uMask!.value = this.maskTexture
    }
    this.foreground = 0
    for (let i = 0; i < mask.mask.length; i++) { this.maskPixels[i] = Math.round(Math.max(0, Math.min(1, mask.mask[i]!)) * 255); if (mask.mask[i]! > .55) this.foreground++ }
    this.mask = mask; this.maskAt = time; this.maskTexture.needsUpdate = true; this.dirty = true
  }
  freeze(now: number, x = .5, y = .45) {
    if (this.frozen || !this.mask || now - this.maskAt > 700 || this.foreground < 24) return false
    this.frozen = true; this.snapshot.needsUpdate = true; this.material.uniforms.uFrozen!.value = 1
    this.origin.set(x, y)
    this.buildDust(); this.dirty = true; return true
  }
  private buildDust() {
    const mask = this.mask!, { width, height } = this.frame.canvas, image = this.frame.getImageData(0, 0, width, height).data
    const candidates: number[] = []
    for (let y = 1; y < height; y += 4) for (let x = 1; x < width; x += 4) {
      const mx = Math.min(mask.width - 1, Math.floor(x / width * mask.width)), my = Math.min(mask.height - 1, Math.floor(y / height * mask.height))
      if (mask.mask[my * mask.width + mx]! >= .55) candidates.push(y * width + x)
    }
    const count = Math.min(4800, candidates.length)
    for (let i = 0; i < count; i++) {
      const p = candidates[Math.floor(i * candidates.length / count)]!, x = (p % width + .5) / width, y = (Math.floor(p / width) + .5) / height
      this.positions.set([x, y, 0], i * 3); this.colors.set(image.subarray(p * 4, p * 4 + 3), i * 3)
      this.seeds[i] = ((i * 71) % 997) / 997
      this.delays[i] = (thanosDissolveField(x, y) + .15) / 1.35
    }
    for (const attribute of Object.values(this.dustGeometry.attributes)) attribute.needsUpdate = true
    this.dustGeometry.setDrawRange(0, count)
  }
  private resize() {
    if (this.closed) return
    this.width = Math.max(1, this.root.clientWidth); this.height = Math.max(1, this.root.clientHeight)
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1, 1600 / this.width, 1200 / this.height)
    this.renderer.setSize(Math.round(this.width * this.dpr), Math.round(this.height * this.dpr), false)
    this.dustMaterial.uniforms.uDpr!.value = this.dpr; this.dirty = true; this.notify()
  }
  render(video: HTMLVideoElement, live: boolean, moment: ThanosMoment, now: number) {
    if (this.closed) return
    const elapsed = moment.elapsed(now), moving = moment.snapped && !moment.finished(now)
    const newVideo = typeof video.requestVideoFrameCallback === 'function' ? this.lastVideo !== this.videoTexture.version : this.lastTime !== video.currentTime
    if (!this.dirty && ((!moving && (!live || moment.snapped || !newVideo)) || now - this.lastDraw < 1000 / 30)) return
    const sourceWidth = this.frozen ? this.frame.canvas.width : video.videoWidth || 16, sourceHeight = this.frozen ? this.frame.canvas.height : video.videoHeight || 9
    const cover = cameraCover(this.width, this.height, sourceWidth, sourceHeight), bg = cameraCover(this.width, this.height, this.backdropAspect, 1)
    this.cover.set(cover.x, cover.y); this.backgroundCover.set(bg.x, bg.y)
    this.material.uniforms.uOrigin!.value.set((.5-this.origin.x)/cover.x+.5,(.5-this.origin.y)/cover.y+.5)
    this.material.uniforms.uLive!.value = live && (this.frozen || now - this.maskAt < 650) ? 1 : 0
    this.material.uniforms.uProgress!.value = moment.progress(now); this.material.uniforms.uElapsed!.value = elapsed
    this.dustMaterial.uniforms.uElapsed!.value = elapsed; this.dust.visible = moving
    this.renderer.render(this.scene, this.camera)
    this.lastVideo = this.videoTexture.version; this.lastTime = video.currentTime; this.lastDraw = now; this.dirty = false
  }
  reset() {
    this.frozen = false; this.mask = null; this.maskAt = -Infinity; this.foreground = 0
    this.maskPixels.fill(0); this.maskTexture.needsUpdate = true; this.frame.clearRect(0, 0, this.frame.canvas.width, this.frame.canvas.height)
    this.material.uniforms.uFrozen!.value = 0; this.dust.visible = false; this.dirty = true
  }
  invalidate() { this.dirty = true }
  destroy() {
    this.closed = true; this.observer.disconnect(); this.scene.clear()
    this.videoTexture.dispose(); this.snapshot.dispose(); this.maskTexture.dispose(); this.backdrop.dispose()
    this.geometry.dispose(); this.material.dispose(); this.dustGeometry.dispose(); this.dustMaterial.dispose()
    this.frame.canvas.width = this.frame.canvas.height = 1; this.mask = null
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.canvas.remove()
  }
}
