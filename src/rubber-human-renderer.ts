import * as THREE from 'three'
import { cameraCover } from './water-touch-model'
import type { RubberHumanModel } from './rubber-human-model'

const LEFT_CHEEK=[50,101,205] as const
const RIGHT_CHEEK=[280,330,425] as const
const ascending=(a:number,b:number)=>a-b

const vertex = `
uniform vec2 uCover;
attribute float aRadial;
varying vec2 vUv;
varying float vRadial;
void main() {
  vUv=uv; vRadial=aRadial;
  vec2 p=position.xy;
  gl_Position=vec4((.5-p.x)*2./uCover.x,(.5-p.y)*2./uCover.y,0.,1.);
}`
const faceFragment = `
uniform sampler2D uImage;
uniform float uEffect;
varying vec2 vUv;
varying float vRadial;
void main() {
  // Feather inside the actual face boundary, without an expanded skin rim.
  float alpha=(1.-smoothstep(.90,1.,vRadial))*uEffect;
  gl_FragColor=vec4(texture2D(uImage,vUv).rgb,alpha);
}`
const skinFragment = `
uniform vec3 uLeft, uRight;
uniform vec2 uCheeks;
uniform float uEffect;
varying vec2 vUv;
varying float vRadial;
void main() {
  float mixAmount=smoothstep(uCheeks.x,uCheeks.y,vUv.x);
  // The under-mask contains cheek colors only: no camera texture or features.
  // Features remain opaque in the interior. Fade to the live camera before the
  // outer face edge, so skin color can never paint a ring onto hair/background.
  float alpha=(1.-smoothstep(.76,.94,vRadial))*uEffect;
  gl_FragColor=vec4(mix(uLeft,uRight,mixAmount),alpha);
}`
const cameraVertex = `varying vec2 vUv; void main(){ vUv=uv;gl_Position=vec4(position.xy,0.,1.); }`
const cameraFragment = `
uniform sampler2D uImage;
uniform vec2 uCover;
varying vec2 vUv;
void main(){
  vec2 p=(vUv-.5)*uCover+.5;
  gl_FragColor=vec4(texture2D(uImage,vec2(1.-p.x,1.-p.y)).rgb,1.);
}`

/** Three draw calls: live camera, opaque featureless skin, curved face texture.
 * The still texture is captured before fingers obscure the face and retained
 * throughout the pull and rebound; the actual camera background remains live. */
export class RubberHumanRenderer {
  readonly canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.Camera()
  private videoTexture: THREE.VideoTexture
  private capture = document.createElement('canvas')
  private captureContext: CanvasRenderingContext2D
  private snapshot: THREE.CanvasTexture
  private sampler = document.createElement('canvas')
  private sampleContext: CanvasRenderingContext2D
  private cameraGeometry = new THREE.PlaneGeometry(2,2)
  private faceGeometry = new THREE.BufferGeometry()
  private skinGeometry = new THREE.BufferGeometry()
  private cameraMaterial: THREE.ShaderMaterial
  private faceMaterial: THREE.ShaderMaterial
  private skinMaterial: THREE.ShaderMaterial
  private skinMesh: THREE.Mesh
  private faceMesh: THREE.Mesh
  private cover = new THREE.Vector2(1,1)
  private effect = {value:0}
  private observer: ResizeObserver
  private snapshotReady = false
  private capturedAt = -Infinity
  private sampledAt = -Infinity
  private wasActive = false
  private left = new THREE.Vector3(.62,.45,.36)
  private right = new THREE.Vector3(.62,.45,.36)
  private skinReady = false
  private width=1
  private height=1
  private dpr=1
  private root: HTMLElement
  private model: RubberHumanModel
  private forceDraw=true
  private cleared=false
  private videoWidth=0
  private videoHeight=0
  private lastVideoFrame=-1
  private lastVideoTime=-1
  private drawnPosition=-1
  private drawnSource=-1
  private drawnSkin=-1
  private drawnSnapshot=-1
  private drawnEffect=-1
  private drawnOverlay=false
  private uploadedPosition=-1
  private uploadedSource=-1
  private skinRevision=0
  private snapshotRevision=0
  private boundsRevision=-1
  private bounds={minX:0,maxX:0,minY:0,maxY:0}
  private channels:number[][]=[[],[],[]]
  private sampledLeft=new THREE.Vector3()
  private sampledRight=new THREE.Vector3()

  constructor(root: HTMLElement, video: HTMLVideoElement, model: RubberHumanModel) {
    this.root=root; this.model=model
    this.renderer=new THREE.WebGLRenderer({alpha:false,antialias:false,powerPreference:'low-power',depth:false,stencil:false})
    this.renderer.setClearColor('#201e20'); this.renderer.setPixelRatio(1)
    this.canvas=this.renderer.domElement; this.canvas.className='rubber-canvas'; this.canvas.setAttribute('aria-label','실시간 고무 얼굴 카메라')
    root.prepend(this.canvas)
    this.capture.width=640; this.capture.height=360
    this.captureContext=this.capture.getContext('2d',{alpha:false})!
    this.sampler.width=96; this.sampler.height=72
    this.sampleContext=this.sampler.getContext('2d',{willReadFrequently:true,alpha:false})!
    this.videoTexture=new THREE.VideoTexture(video)
    this.videoTexture.minFilter=this.videoTexture.magFilter=THREE.LinearFilter
    this.videoTexture.colorSpace=THREE.NoColorSpace; this.videoTexture.generateMipmaps=false
    this.snapshot=new THREE.CanvasTexture(this.capture)
    this.snapshot.flipY=false; this.snapshot.colorSpace=THREE.NoColorSpace; this.snapshot.generateMipmaps=false
    this.snapshot.minFilter=this.snapshot.magFilter=THREE.LinearFilter
    // Source UVs are top-left camera coordinates for both HTML video and canvas.
    this.videoTexture.flipY=false
    this.cameraMaterial=new THREE.ShaderMaterial({vertexShader:cameraVertex,fragmentShader:cameraFragment,uniforms:{uImage:{value:this.videoTexture},uCover:{value:this.cover}},depthTest:false,depthWrite:false})
    const background=new THREE.Mesh(this.cameraGeometry,this.cameraMaterial)
    background.frustumCulled=false; background.renderOrder=0; this.scene.add(background)
    const geometry=(target:THREE.BufferGeometry,positions:Float32Array,uv:Float32Array) => {
      const position=new THREE.BufferAttribute(positions,2).setUsage(THREE.DynamicDrawUsage)
      target.setAttribute('position',position)
      target.setAttribute('uv',uv===positions?position:new THREE.BufferAttribute(uv,2).setUsage(THREE.DynamicDrawUsage))
      target.setAttribute('aRadial',new THREE.BufferAttribute(model.radial,1)); target.setIndex(new THREE.BufferAttribute(model.indices,1))
      // Positions are 2D camera UVs; generic 3D bounding-sphere computation
      // assumes three components. Projection is entirely inside our shader.
      target.boundingSphere=new THREE.Sphere(new THREE.Vector3(),4)
    }
    geometry(this.faceGeometry,model.positions,new Float32Array(model.source.length))
    geometry(this.skinGeometry,model.source,model.source)
    const common={uCover:{value:this.cover},uEffect:this.effect}
    this.faceMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:faceFragment,uniforms:{...common,uImage:{value:this.snapshot}},transparent:true,side:THREE.DoubleSide,forceSinglePass:true,depthTest:false,depthWrite:false})
    this.skinMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:skinFragment,uniforms:{...common,uLeft:{value:this.left},uRight:{value:this.right},uCheeks:{value:new THREE.Vector2(.35,.65)}},transparent:true,side:THREE.DoubleSide,forceSinglePass:true,depthTest:false,depthWrite:false})
    this.skinMesh=new THREE.Mesh(this.skinGeometry,this.skinMaterial); this.skinMesh.renderOrder=1; this.skinMesh.frustumCulled=false
    this.faceMesh=new THREE.Mesh(this.faceGeometry,this.faceMaterial); this.faceMesh.renderOrder=2; this.faceMesh.frustumCulled=false
    this.scene.add(this.skinMesh,this.faceMesh)
    this.observer=new ResizeObserver(()=>this.resize()); this.observer.observe(root); this.resize()
  }

  private resize() {
    this.width=Math.max(1,this.root.clientWidth); this.height=Math.max(1,this.root.clientHeight)
    this.dpr=Math.min(1.5,window.devicePixelRatio||1)
    // Bound mobile fragment work even on high-resolution displays.
    this.dpr=Math.min(this.dpr,1600/this.width,1200/this.height)
    const width=Math.round(this.width*this.dpr),height=Math.round(this.height*this.dpr)
    if(this.canvas.width!==width||this.canvas.height!==height) this.renderer.setSize(width,height,false)
    this.videoWidth=0;this.forceDraw=true
    if(this.cleared)this.renderer.clear()
  }
  pointer(clientX:number,clientY:number) {
    const bounds=this.canvas.getBoundingClientRect()
    return {x:.5-(clientX-bounds.left-bounds.width/2)/bounds.width*this.cover.x,y:.5+(clientY-bounds.top-bounds.height/2)/bounds.height*this.cover.y}
  }
  private unobscured() {
    const face=this.model.face
    if (!face) return false
    if(this.boundsRevision!==this.model.sourceRevision){
      let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity
      for(const p of face){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y)}
      this.bounds.minX=minX;this.bounds.maxX=maxX;this.bounds.minY=minY;this.bounds.maxY=maxY
      this.boundsRevision=this.model.sourceRevision
    }
    const {minX,maxX,minY,maxY}=this.bounds
    for(const hand of this.model.hands)for(const p of hand.points)if(p.x>minX-.035&&p.x<maxX+.035&&p.y>minY-.025&&p.y<maxY+.025)return false
    return true
  }
  private captureFace(video:HTMLVideoElement,now:number) {
    const height=Math.round(640*video.videoHeight/video.videoWidth)
    if (this.capture.height!==height) this.capture.height=height
    this.captureContext.drawImage(video,0,0,640,height)
    const uv=this.faceGeometry.getAttribute('uv') as THREE.BufferAttribute
    ;(uv.array as Float32Array).set(this.model.source); uv.needsUpdate=true
    this.snapshot.needsUpdate=true; this.snapshotReady=true; this.capturedAt=now
    this.snapshotRevision++
  }
  private readSkin(ids:readonly number[],pixels:Uint8ClampedArray,target:THREE.Vector3):boolean {
    const face=this.model.face!,channels=this.channels
    for(const channel of channels)channel.length=0
    for(const id of ids){
      const point=face[id]!,cx=Math.round(point.x*95),cy=Math.round(point.y*71)
      let occluded=false
      for(const hand of this.model.hands){
        for(const p of hand.points)if(Math.hypot((p.x-point.x)*this.model.aspect,p.y-point.y)<.065){occluded=true;break}
        if(occluded)break
      }
      if(occluded)continue
      for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){
        const index=(Math.max(0,Math.min(71,cy+y))*96+Math.max(0,Math.min(95,cx+x)))*4
        for(let c=0;c<3;c++)channels[c]!.push(pixels[index+c]!/255)
      }
    }
    if(!channels[0]!.length)return false
    for(const channel of channels)channel.sort(ascending)
    const median=Math.floor(channels[0]!.length/2)
    target.set(channels[0]![median]!,channels[1]![median]!,channels[2]![median]!)
    return true
  }
  private sampleSkin(video:HTMLVideoElement,now:number) {
    const face=this.model.face
    if (!face || now-this.sampledAt<160) return
    this.sampleContext.drawImage(video,0,0,96,72)
    const pixels=this.sampleContext.getImageData(0,0,96,72).data
    const left=this.readSkin(LEFT_CHEEK,pixels,this.sampledLeft),right=this.readSkin(RIGHT_CHEEK,pixels,this.sampledRight)
    if (left) this.left.lerp(this.sampledLeft,this.skinReady ? .16 : 1)
    if (right) this.right.lerp(this.sampledRight,this.skinReady ? .16 : 1)
    if (!this.skinReady) { if (!left&&right) this.left.copy(this.sampledRight); if (!right&&left) this.right.copy(this.sampledLeft) }
    this.skinReady ||= !!(left||right)
    const a=face[50]!.x,b=face[280]!.x
    this.skinMaterial.uniforms.uCheeks!.value.set(Math.min(a,b),Math.max(a,b))
    this.sampledAt=now
    this.skinRevision++
  }

  render(video:HTMLVideoElement,live:boolean,now:number) {
    if (!live || video.readyState<2) {
      if(!this.cleared)this.renderer.clear()
      this.cleared=true;this.forceDraw=true;return
    }
    if(this.videoWidth!==video.videoWidth||this.videoHeight!==video.videoHeight){
      const cover=cameraCover(this.width,this.height,video.videoWidth,video.videoHeight)
      this.cover.set(cover.x,cover.y);this.videoWidth=video.videoWidth;this.videoHeight=video.videoHeight;this.forceDraw=true
    }
    // Merely pinching, or the final settled spring, must look exactly like the
    // camera. Bring in the composite only when there is a measurable pull.
    this.effect.value=THREE.MathUtils.smoothstep(this.model.stretchAmount,.008,.055)
    if (this.model.visible) {
      this.sampleSkin(video,now)
      // Do not replace a frozen face during its elastic return.
      if (!this.snapshotReady || (!this.model.active && !this.wasActive && now-this.capturedAt>120 && this.unobscured())) this.captureFace(video,now)
    }
    const overlay=this.model.visible&&this.model.active&&this.snapshotReady&&this.effect.value>0
    this.skinMesh.visible=this.faceMesh.visible=overlay
    this.wasActive=this.model.active
    // VideoTexture already receives decoded-frame callbacks from Three.js. Use
    // that version when supported; currentTime is the compatibility fallback.
    const videoChanged=typeof video.requestVideoFrameCallback==='function'
      ?this.videoTexture.version!==this.lastVideoFrame:video.currentTime!==this.lastVideoTime
    const changed=this.forceDraw||videoChanged||overlay!==this.drawnOverlay||(overlay&&(
      this.model.positionRevision!==this.drawnPosition||this.model.sourceRevision!==this.drawnSource||
      this.skinRevision!==this.drawnSkin||this.snapshotRevision!==this.drawnSnapshot||this.effect.value!==this.drawnEffect))
    if(!changed)return
    if(overlay){
      if(this.uploadedPosition!==this.model.positionRevision){this.faceGeometry.getAttribute('position').needsUpdate=true;this.uploadedPosition=this.model.positionRevision}
      if(this.uploadedSource!==this.model.sourceRevision){this.skinGeometry.getAttribute('position').needsUpdate=true;this.uploadedSource=this.model.sourceRevision}
    }
    this.renderer.render(this.scene,this.camera)
    this.lastVideoFrame=this.videoTexture.version;this.lastVideoTime=video.currentTime
    this.drawnPosition=this.model.positionRevision;this.drawnSource=this.model.sourceRevision
    this.drawnSkin=this.skinRevision;this.drawnSnapshot=this.snapshotRevision;this.drawnEffect=this.effect.value;this.drawnOverlay=overlay
    this.forceDraw=false;this.cleared=false
  }
  reset() { this.snapshotReady=false; this.skinReady=false; this.wasActive=false; this.capturedAt=this.sampledAt=-Infinity;this.forceDraw=true;this.boundsRevision=-1 }
  destroy() {
    this.observer.disconnect(); this.videoTexture.dispose(); this.snapshot.dispose()
    this.cameraGeometry.dispose(); this.faceGeometry.dispose(); this.skinGeometry.dispose()
    this.cameraMaterial.dispose(); this.skinMaterial.dispose(); this.faceMaterial.dispose()
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.canvas.remove()
    this.capture.width=this.sampler.width=1
  }
}
