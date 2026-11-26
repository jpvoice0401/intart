import * as THREE from 'three'
import { cameraCover, measureFingerMotion, fingerWaveResponse, type FingerMotion, type WaterContact } from './water-touch-model'

const vertexShader = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`

// Height + velocity wave equation. Each contact deposits a continuous segment,
// so fast gestures leave a wake instead of disconnected circles.
const simulationShader = `
varying vec2 vUv;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uAspect, uTime;
uniform vec4 uContacts[10];
uniform float uForces[10];
uniform float uRadii[10];
void main() {
  vec2 state = texture2D(uState, vUv).rg;
  float lap = texture2D(uState, vUv + vec2(uTexel.x, 0.)).r
    + texture2D(uState, vUv - vec2(uTexel.x, 0.)).r
    + texture2D(uState, vUv + vec2(0., uTexel.y)).r
    + texture2D(uState, vUv - vec2(0., uTexel.y)).r - 4. * state.r;
  float velocity = (state.g + lap * .46) * .988;
  float height = state.r + velocity;
  for (int i = 0; i < 10; i++) {
    if (uForces[i] <= 0.) continue;
    vec2 p = vUv * vec2(uAspect, 1.);
    vec2 a = uContacts[i].xy * vec2(uAspect, 1.);
    vec2 b = uContacts[i].zw * vec2(uAspect, 1.);
    vec2 ab = b - a;
    float t = clamp(dot(p-a, ab) / max(dot(ab, ab), .000001), 0., 1.);
    float distanceToTrail = length(p - a - ab * t);
    float radius = uRadii[i];
    float core = exp(-pow(distanceToTrail / radius, 2.));
    float rim = exp(-pow((distanceToTrail - radius * 1.9) / (radius * .85), 2.));
    height += (rim * .28 - core) * uForces[i];
  }
  // Absorb at the edges instead of reflecting a bright rectangular border.
  float edge = min(min(vUv.x, 1.-vUv.x), min(vUv.y, 1.-vUv.y));
  float absorption = mix(.78, .999, smoothstep(0., .035, edge));
  gl_FragColor = vec4(clamp(height * absorption, -2., 2.), velocity * absorption, 0., 1.);
}`

const displayShader = `
varying vec2 vUv;
uniform sampler2D uWater, uVideo;
uniform vec2 uTexel, uCover;
uniform float uCamera, uStrength, uAspect, uTime;
vec3 background(vec2 uv) {
  if (uCamera > .5) {
    vec2 cameraUV = (uv - .5) * uCover + .5;
    cameraUV.x = 1. - cameraUV.x;
    return texture2D(uVideo, clamp(cameraUV, .001, .999)).rgb;
  }
  vec2 p = uv * vec2(uAspect, 1.);
  vec3 color = mix(vec3(.018, .12, .17), vec3(.12, .36, .39), uv.y);
  float light = exp(-length((uv - vec2(.66,.7)) * vec2(1.,1.2)) * 2.8);
  color += vec3(.12, .27, .25) * light;
  vec2 tile = abs(fract(p * 13.) - .5);
  float grid = smoothstep(.482,.495,max(tile.x,tile.y));
  color *= 1. - grid * .13;
  float caustic = sin(p.x*24. + sin(p.y*17.+uTime*.18))
    * sin(p.y*25.-sin(p.x*19.-uTime*.12));
  color += vec3(.04,.12,.1) * pow(abs(caustic), 12.);
  return color;
}
void main() {
  float h = texture2D(uWater, vUv).r;
  vec2 gradient = vec2(
    texture2D(uWater, vUv + vec2(uTexel.x,0.)).r - texture2D(uWater, vUv - vec2(uTexel.x,0.)).r,
    texture2D(uWater, vUv + vec2(0.,uTexel.y)).r - texture2D(uWater, vUv - vec2(0.,uTexel.y)).r);
  vec2 offset = gradient * .085 * uStrength;
  offset.x /= uAspect;
  vec2 refracted = clamp(vUv + offset, .002, .998);
  vec3 color = background(refracted);
  vec3 normal = normalize(vec3(-gradient * 3.5 * uStrength, 1.));
  float spec = pow(max(dot(normal, normalize(vec3(-.4,.6,1.))),0.), 38.);
  color += vec3(.68,.92,.96) * spec * .38 * min(length(gradient)*5.,1.);
  color += vec3(.08,.18,.19) * h * .1 * uStrength;
  float vignette = smoothstep(.88,.25,length((vUv-.5)*vec2(.8,1.)));
  color *= mix(.74,1.,vignette);
  gl_FragColor = vec4(color,1.);
}`

export class WaterTouchRenderer {
  readonly canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.Camera()
  private geometry = new THREE.PlaneGeometry(2, 2)
  private simulation: THREE.ShaderMaterial
  private display: THREE.ShaderMaterial
  private quad: THREE.Mesh
  private targets: THREE.WebGLRenderTarget[] = []
  private texture: THREE.VideoTexture
  private previous = new Map<string, FingerMotion>()
  private contacts: WaterContact[] = []
  private accumulator = 0
  private width = 1
  private height = 1
  private cameraReady = false
  private observer: ResizeObserver

  constructor(host: HTMLElement, video: HTMLVideoElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    if (!this.renderer.extensions.has('EXT_color_buffer_float')) {
      this.renderer.dispose()
      throw new Error('이 브라우저는 물결 효과에 필요한 WebGL 부동소수점 텍스처를 지원하지 않아요.')
    }
    this.canvas = this.renderer.domElement
    this.canvas.className = 'water-canvas'
    this.canvas.setAttribute('aria-label', '손끝 움직임에 반응하는 물 표면')
    this.canvas.style.touchAction = 'none'
    host.prepend(this.canvas)
    this.texture = new THREE.VideoTexture(video)
    this.simulation = new THREE.ShaderMaterial({ vertexShader, fragmentShader: simulationShader, uniforms: {
      uState: { value: null }, uTexel: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uTime: { value: 0 },
      uContacts: { value: Array.from({ length: 10 }, () => new THREE.Vector4(-10,-10,-10,-10)) },
      uForces: { value: new Float32Array(10) },
      uRadii: { value: new Float32Array(10).fill(.009) },
    }, depthTest: false, depthWrite: false })
    this.display = new THREE.ShaderMaterial({ vertexShader, fragmentShader: displayShader, uniforms: {
      uWater: { value: null }, uVideo: { value: this.texture }, uTexel: { value: new THREE.Vector2() },
      uCover: { value: new THREE.Vector2(1,1) }, uCamera: { value: 0 }, uStrength: { value: 1 },
      uAspect: { value: 1 }, uTime: { value: 0 },
    }, depthTest: false, depthWrite: false })
    this.quad = new THREE.Mesh(this.geometry, this.display)
    this.quad.frustumCulled = false
    this.scene.add(this.quad)
    this.observer = new ResizeObserver(() => this.resize(host.clientWidth, host.clientHeight))
    this.observer.observe(host)
    this.resize(host.clientWidth, host.clientHeight)
  }

  private resize(width: number, height: number) {
    if (this.targets.length && this.width === Math.max(1,width) && this.height === Math.max(1,height) && this.renderer.getPixelRatio() === Math.min(devicePixelRatio,1.75)) return
    this.width = Math.max(1, width); this.height = Math.max(1, height)
    const aspect = this.width / this.height
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
    this.renderer.setSize(this.width, this.height)
    for (const target of this.targets) target.dispose()
    const w = Math.max(64, Math.round(512 * Math.min(1, aspect)))
    const h = Math.max(64, Math.round(512 * Math.min(1, 1 / aspect)))
    this.targets = Array.from({ length: 2 }, () => new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: false, stencilBuffer: false,
    }))
    this.simulation.uniforms.uTexel.value.set(1/w, 1/h)
    this.display.uniforms.uTexel.value.set(1/w, 1/h)
    this.simulation.uniforms.uAspect.value = this.display.uniforms.uAspect.value = aspect
    this.clear()
  }

  cover(videoWidth: number, videoHeight: number) {
    return cameraCover(this.width, this.height, videoWidth || 1280, videoHeight || 720)
  }

  setCamera(ready: boolean) { this.cameraReady = ready }
  setStrength(value: number) { this.display.uniforms.uStrength.value = value }
  setContacts(contacts: WaterContact[]) { this.contacts = contacts.slice(0, 10) }

  clear() {
    for (const target of this.targets) { this.renderer.setRenderTarget(target); this.renderer.clear() }
    this.renderer.setRenderTarget(null)
    this.previous.clear()
  }

  render(dt: number, time: number, videoWidth: number, videoHeight: number) {
    const cover = this.cover(videoWidth, videoHeight)
    this.display.uniforms.uCover.value.set(cover.x, cover.y)
    this.display.uniforms.uCamera.value = this.cameraReady ? 1 : 0
    this.display.uniforms.uTime.value = time
    this.accumulator += Math.min(dt, .05)
    while (this.accumulator >= 1/60) {
      this.accumulator -= 1/60
      const forces = this.simulation.uniforms.uForces.value as Float32Array
      forces.fill(0)
      const current = new Map<string, FingerMotion>()
      this.contacts.forEach((point, i) => {
        const prev = this.previous.get(point.id)
        const motion = measureFingerMotion(point, prev, this.width / this.height)
        const response = fingerWaveResponse(motion.speed, time - point.sampledAt)
        const start = motion.continuous && prev ? prev : point
        this.simulation.uniforms.uContacts.value[i].set(start.x,start.y,point.x,point.y)
        forces[i] = !prev ? .08 : response.force + .003 * (1 + Math.sin(time*6+i))
        this.simulation.uniforms.uRadii.value[i] = response.radius
        current.set(point.id, motion)
      })
      this.previous = current
      this.simulation.uniforms.uTime.value = time
      this.simulation.uniforms.uState.value = this.targets[0]!.texture
      this.quad.material = this.simulation
      this.renderer.setRenderTarget(this.targets[1]!)
      this.renderer.render(this.scene, this.camera)
      this.targets.reverse()
    }
    this.quad.material = this.display
    this.display.uniforms.uWater.value = this.targets[0]!.texture
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.scene, this.camera)
  }

  destroy() {
    this.observer.disconnect()
    for (const target of this.targets) target.dispose()
    this.simulation.dispose(); this.display.dispose(); this.geometry.dispose(); this.texture.dispose()
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.canvas.remove()
  }
}
