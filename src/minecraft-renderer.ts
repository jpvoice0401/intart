import * as THREE from 'three'
import { cameraCover } from './water-touch-model'
import { minecraftSwing, type MinecraftCombat, type MinecraftMask, type MinecraftPose } from './minecraft-model'
import { MinecraftSword, type MinecraftImages } from './minecraft-sword'

const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`
const fragment=`
uniform sampler2D uVideo,uMask,uBackground;
uniform vec2 uCover;
uniform float uLive,uHurt,uVanish;
varying vec2 vUv;
void main(){
  vec2 cameraUv=(vUv-.5)*uCover+.5;
  cameraUv=vec2(1.-cameraUv.x,1.-cameraUv.y);
  vec3 color;
  if(uLive>.5){
    color=texture2D(uVideo,cameraUv).rgb;
    vec2 masks=texture2D(uMask,cameraUv).rg;
    float mask=masks.r;
    float person=smoothstep(.45,.65,mask);
    color=mix(color,vec3(1.,0.,0.),person*uHurt);
    if(uVanish>0.){
      // G contains the dilated hair/clothes rim, packed with the normal mask
      // at inference rate. One texture read, rather than nine per display pixel.
      color=mix(color,texture2D(uBackground,cameraUv).rgb,smoothstep(.08,.45,masks.g)*uVanish);
    }
  }else{
    vec2 cell=floor(vUv*vec2(36.,24.));
    float grain=fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);
    color=mix(vec3(.055,.085,.075),vec3(.10,.15,.12),vUv.y)+grain*.018;
  }
  gl_FragColor=vec4(color,1.);
}`

export class MinecraftRenderer {
  readonly canvas:HTMLCanvasElement
  private renderer:THREE.WebGLRenderer
  private background=new THREE.Scene()
  private backgroundCamera=new THREE.Camera()
  private world=new THREE.Scene()
  private camera=new THREE.PerspectiveCamera(70,1,.05,10)
  private geometry=new THREE.PlaneGeometry(2,2)
  private material:THREE.ShaderMaterial
  private videoTexture:THREE.VideoTexture
  private maskTexture:THREE.DataTexture
  private maskPixels=new Uint8Array(2)
  private maskScratch=new Uint8Array(1)
  private cleanBackground:THREE.CanvasTexture|null=null
  private backgroundWidth=0
  private backgroundHeight=0
  private cover=new THREE.Vector2(1,1)
  private sword:MinecraftSword|null=null
  private pose:MinecraftPose={x:0,y:0,z:0,rx:0,ry:0,rz:0}
  private observer:ResizeObserver
  private root:HTMLElement
  private width=1
  private height=1
  private dirty=true
  private lastFrame=-1
  private lastTime=-1
  private lastProgress=-1
  private lastHurt=-1
  private lastVanish=-1
  private lastLive=false
  private masked=false
  private closed=false
  private notify:()=>void
  constructor(root:HTMLElement,video:HTMLVideoElement,notify:()=>void){
    this.root=root
    this.notify=notify
    this.renderer=new THREE.WebGLRenderer({alpha:false,antialias:false,powerPreference:'low-power',stencil:false})
    this.renderer.setPixelRatio(1);this.renderer.setClearColor('#16271e');this.renderer.autoClear=false
    this.canvas=this.renderer.domElement;this.canvas.className='mc-canvas';this.canvas.tabIndex=0;this.canvas.setAttribute('aria-label','카메라와 3D 다이아몬드 검 · 클릭, 터치 또는 Space로 공격')
    root.prepend(this.canvas)
    this.videoTexture=new THREE.VideoTexture(video);this.videoTexture.flipY=false;this.videoTexture.colorSpace=THREE.NoColorSpace
    this.videoTexture.minFilter=this.videoTexture.magFilter=THREE.LinearFilter;this.videoTexture.generateMipmaps=false
    this.maskTexture=this.createMaskTexture(1,1)
    this.material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,depthTest:false,depthWrite:false,
      uniforms:{uVideo:{value:this.videoTexture},uMask:{value:this.maskTexture},uBackground:{value:null},uCover:{value:this.cover},uLive:{value:0},uHurt:{value:0},uVanish:{value:0}}})
    const plane=new THREE.Mesh(this.geometry,this.material);plane.frustumCulled=false;this.background.add(plane)
    this.world.add(new THREE.AmbientLight(0xffffff,1.5))
    const light=new THREE.DirectionalLight(0xffffff,2.0);light.position.set(-1,2,3);this.world.add(light)
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(root);this.resize()
  }
  private createMaskTexture(width:number,height:number){
    const texture=new THREE.DataTexture(this.maskPixels,width,height,THREE.RGFormat,THREE.UnsignedByteType)
    texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.flipY=false;texture.unpackAlignment=1;texture.needsUpdate=true
    return texture
  }
  setAssets(images:MinecraftImages){
    if(this.closed)return
    if(this.sword){this.world.remove(this.sword.group);this.sword.destroy()}
    this.sword=new MinecraftSword(images);this.world.add(this.sword.group);this.dirty=true;this.notify()
  }
  updateMask(data:MinecraftMask,erase=false){
    if(!data.width||!data.height||data.width*data.height!==data.mask.length)return
    if(this.maskTexture.image.width!==data.width||this.maskTexture.image.height!==data.height){
      this.maskTexture.dispose();this.maskPixels=new Uint8Array(data.mask.length*2);this.maskScratch=new Uint8Array(data.mask.length)
      this.maskTexture=this.createMaskTexture(data.width,data.height);this.material.uniforms.uMask!.value=this.maskTexture
    }
    for(let i=0;i<data.mask.length;i++){
      this.maskPixels[i*2]=Math.round(Math.max(0,Math.min(1,data.mask[i]!))*255)
      this.maskPixels[i*2+1]=0
    }
    if(erase){
      const {width,height}=data
      // Separable five-pixel maximum, only when a defeated person is tracked.
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        let value=0
        for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<width)value=Math.max(value,this.maskPixels[(y*width+x+dx)*2]!)
        this.maskScratch[y*width+x]=value
      }
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        let value=0
        for(let dy=-2;dy<=2;dy++)if(y+dy>=0&&y+dy<height)value=Math.max(value,this.maskScratch[(y+dy)*width+x]!)
        this.maskPixels[(y*width+x)*2+1]=value
      }
    }
    this.maskTexture.needsUpdate=true;this.masked=true;this.dirty=true
  }
  clearMask(){this.maskPixels.fill(0);this.maskTexture.needsUpdate=true;this.masked=false;this.dirty=true}
  setCleanBackground(image:HTMLCanvasElement|null){
    if(image&&this.cleanBackground?.image===image&&this.backgroundWidth===image.width&&this.backgroundHeight===image.height){
      this.cleanBackground.needsUpdate=true;this.dirty=true
      return
    }
    this.cleanBackground?.dispose()
    this.cleanBackground=image?new THREE.CanvasTexture(image):null
    this.backgroundWidth=image?.width??0;this.backgroundHeight=image?.height??0
    if(this.cleanBackground){
      this.cleanBackground.flipY=false
      this.cleanBackground.generateMipmaps=false
      this.cleanBackground.minFilter=THREE.LinearFilter
    }
    this.material.uniforms.uBackground!.value=this.cleanBackground
    this.dirty=true
  }
  private resize(){
    if(this.closed)return
    this.width=Math.max(1,this.root.clientWidth);this.height=Math.max(1,this.root.clientHeight)
    const dpr=Math.min(1.5,window.devicePixelRatio||1,1600/this.width,1200/this.height)
    this.renderer.setSize(Math.round(this.width*dpr),Math.round(this.height*dpr),false)
    this.camera.aspect=this.width/this.height;this.camera.updateProjectionMatrix();this.dirty=true;this.notify()
  }
  render(video:HTMLVideoElement,live:boolean,combat:MinecraftCombat,now:number):boolean {
    const cameraLive=live&&video.readyState>=2,progress=combat.progress(now),hurt=cameraLive&&this.masked?combat.hurt(now):0
    const newVideo=typeof video.requestVideoFrameCallback==='function'?this.videoTexture.version!==this.lastFrame:video.currentTime!==this.lastTime
    const vanish=cameraLive&&this.masked&&this.cleanBackground?combat.disappearance(now):0
    if(!this.dirty&&(!cameraLive||!newVideo)&&progress===this.lastProgress&&hurt===this.lastHurt&&vanish===this.lastVanish&&cameraLive===this.lastLive)return progress<1||hurt>0
    if(cameraLive){const cover=cameraCover(this.width,this.height,video.videoWidth,video.videoHeight);this.cover.set(cover.x,cover.y)}
    this.material.uniforms.uLive!.value=cameraLive?1:0;this.material.uniforms.uHurt!.value=hurt
    this.material.uniforms.uVanish!.value=vanish
    if(this.sword){
      const pose=minecraftSwing(progress,combat.strike.x,combat.strike.y,this.pose)
      const distance=.95,halfHeight=Math.tan(THREE.MathUtils.degToRad(35))*distance,halfWidth=halfHeight*this.camera.aspect
      this.sword.group.position.set(halfWidth*.68+pose.x,-halfHeight*.88+pose.y,-distance+pose.z)
      this.sword.group.rotation.set(pose.rx,pose.ry,pose.rz,'ZYX')
    }
    this.renderer.clear();this.renderer.render(this.background,this.backgroundCamera);this.renderer.clearDepth();this.renderer.render(this.world,this.camera)
    this.lastFrame=this.videoTexture.version;this.lastTime=video.currentTime;this.lastProgress=progress;this.lastHurt=hurt;this.lastVanish=vanish;this.lastLive=cameraLive;this.dirty=false
    return progress<1||hurt>0
  }
  invalidate(){this.dirty=true}
  destroy(){
    this.closed=true;this.observer.disconnect();this.sword?.destroy();this.sword=null;this.world.clear()
    this.setCleanBackground(null)
    this.videoTexture.dispose();this.maskTexture.dispose();this.geometry.dispose();this.material.dispose()
    this.renderer.dispose();this.renderer.forceContextLoss();this.canvas.remove()
  }
}
