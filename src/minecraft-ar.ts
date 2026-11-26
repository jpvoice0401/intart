import * as THREE from 'three'
import { loadMinecraftImages, swordGeometry } from './minecraft-sword'
import { loadMinecraftAR, minecraftARMobile, type ARPipeline, type ARReality, type ARStart, type EightWall } from './minecraft-ar-engine'
import { findMinecraftFloor, type MinecraftFloorHit } from './minecraft-ar-placement'

let owner:MinecraftFloorAR|null=null

/** 8th Wall owns the rear camera and its run loop. The local Three.js renderer
 * uses that same WebGL2 context and the measured camera pose/projection.
 * No global THREE replacement and no simulated floor or second camera stream. */
export class MinecraftFloorAR {
  private root:HTMLElement
  private layer:HTMLElement
  private canvas:HTMLCanvasElement
  private status:HTMLElement
  private placeButton:HTMLButtonElement
  private events=new AbortController()
  private engine:EightWall|null=null
  private renderer:THREE.WebGLRenderer|null=null
  private scene=new THREE.Scene()
  private camera=new THREE.PerspectiveCamera(60,1,.03,100)
  private floorObject=new THREE.Group()
  private ringGeometry=new THREE.RingGeometry(.13,.15,48)
  private ringMaterial=new THREE.MeshBasicMaterial({color:0xa9f5a4,side:THREE.DoubleSide,depthTest:false})
  private ring=new THREE.Mesh(this.ringGeometry,this.ringMaterial)
  private bladeGeometry:THREE.BufferGeometry|null=null
  private bladeMaterial=new THREE.MeshLambertMaterial({vertexColors:true})
  private portrait:HTMLCanvasElement|null
  private portraitMesh:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>|null=null
  private observer:ResizeObserver
  private hit:MinecraftFloorHit|null=null
  private hitAt=-Infinity
  private queryAt=-Infinity
  private realityAt=-Infinity
  private ready=false
  private normal=false
  private closed=false
  private placed=false
  private names:string[]=[]
  private rejectStart:((reason:Error)=>void)|undefined
  private startTimer:ReturnType<typeof setTimeout>|undefined
  private forward=new THREE.Vector3()
  private size=1
  private yaw=0

  constructor(root:HTMLElement,onExit:()=>void,portrait:HTMLCanvasElement|null=null){
    this.root=root
    this.portrait=portrait
    const subject=portrait?'보관한 모습':'검'
    this.layer=document.createElement('section');this.layer.className='mc-ar-layer';this.layer.setAttribute('aria-label','MineCraft 바닥 AR')
    this.layer.innerHTML=`<canvas class="mc-ar-canvas" aria-label="후면 카메라로 바닥을 찾아 터치하면 ${subject} 배치"></canvas>
      <div class="mc-ar-heading"><span>MineCraft <b>바닥 AR</b></span><button class="mc-ar-close" type="button">게임으로 돌아가기</button></div>
      <div class="mc-ar-aim" aria-hidden="true"><i></i></div>
      <div class="mc-ar-bottom"><p class="mc-ar-status" role="status">AR 엔진을 준비하고 있어요…</p><div class="mc-ar-controls"><button class="mc-ar-place" type="button" disabled>여기에 설치</button><button class="mc-ar-again" type="button">다시 설치</button><button class="mc-ar-rotate-left" type="button" aria-label="${subject} 왼쪽 회전">↶</button><button class="mc-ar-rotate-right" type="button" aria-label="${subject} 오른쪽 회전">↷</button><label>크기 <input class="mc-ar-size" type="range" min=".4" max="2" step=".05" value="1" aria-label="${subject} 크기"></label></div></div>
      <a class="mc-ar-credit" href="${import.meta.env.BASE_URL}vendor/8thwall/LICENSE" target="_blank" rel="noopener" title="8th Wall engine by Niantic Spatial. © 2026 Niantic Spatial, Inc. Licensed under the XR Engine License Agreement, provided AS IS without warranties.">8th Wall · Niantic Spatial © 2026 · License / AS IS</a>`
    root.append(this.layer)
    this.canvas=this.layer.querySelector<HTMLCanvasElement>('canvas')!
    this.status=this.layer.querySelector<HTMLElement>('.mc-ar-status')!
    this.placeButton=this.layer.querySelector<HTMLButtonElement>('.mc-ar-place')!
    this.floorObject.visible=false;this.ring.visible=false;this.ring.rotation.x=-Math.PI/2
    this.scene.add(this.floorObject,this.ring,new THREE.AmbientLight(0xffffff,1.5))
    const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(-1,3,2);this.scene.add(light)
    this.camera.position.set(0,1.6,0)
    const options={signal:this.events.signal}
    this.layer.querySelector('.mc-ar-close')!.addEventListener('click',onExit,options)
    this.placeButton.addEventListener('click',()=>this.place(),options)
    this.layer.querySelector('.mc-ar-again')!.addEventListener('click',()=>{
      this.placed=false;this.floorObject.visible=false;this.hit=null;this.queryAt=-Infinity;this.placeButton.disabled=true
      this.layer.classList.remove('mc-ar-placed');this.say('바닥을 천천히 비춰 새 설치 위치를 찾아주세요.')
    },options)
    this.layer.querySelector('.mc-ar-rotate-left')!.addEventListener('click',()=>{this.yaw+=Math.PI/8;this.floorObject.rotation.y=this.yaw},options)
    this.layer.querySelector('.mc-ar-rotate-right')!.addEventListener('click',()=>{this.yaw-=Math.PI/8;this.floorObject.rotation.y=this.yaw},options)
    this.layer.querySelector<HTMLInputElement>('.mc-ar-size')!.addEventListener('input',event=>{
      this.size=Number((event.target as HTMLInputElement).value)
      this.floorObject.scale.setScalar((this.portrait ? 1 : .75)*this.size)
    },options)
    this.canvas.addEventListener('pointerdown',event=>{
      if(event.button!==0||!this.ready||this.placed)return
      event.preventDefault()
      const bounds=this.canvas.getBoundingClientRect()
      this.query((event.clientX-bounds.left)/bounds.width,(event.clientY-bounds.top)/bounds.height,performance.now())
      this.place()
    },options)
    this.canvas.addEventListener('webglcontextlost',()=>{
      if(!this.closed){this.say('AR 그래픽 연결이 끊겼어요. 게임으로 돌아간 뒤 다시 시작해주세요.');this.placeButton.disabled=true}
    },options)
    document.addEventListener('visibilitychange',()=>{
      if(this.closed||owner!==this||!this.ready)return
      this.hit=null;this.ring.visible=false;this.placeButton.disabled=true
      if(document.hidden)this.engine?.pause()
      else{this.normal=false;this.queryAt=-Infinity;this.engine?.resume();this.say('추적을 다시 맞추고 있어요. 바닥을 천천히 비춰주세요.')}
    },options)
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(root);this.resize()
  }
  private say(message:string){if(this.status.textContent!==message)this.status.textContent=message}
  private resize(){
    if(this.closed)return
    const width=Math.max(1,this.root.clientWidth),height=Math.max(1,this.root.clientHeight)
    const ratio=Math.min(window.devicePixelRatio||1,1.5,1600/width,1200/height)
    this.canvas.width=Math.round(width*ratio);this.canvas.height=Math.round(height*ratio)
    this.renderer?.setSize(this.canvas.width,this.canvas.height,false)
    if(this.ready)this.configureProjection()
  }
  private configureProjection(){
    this.engine?.XrController.updateCameraProjectionMatrix({origin:{x:0,y:1.6,z:0},facing:{x:0,y:0,z:0,w:1},cam:{pixelRectWidth:this.canvas.width,pixelRectHeight:this.canvas.height,nearClipPlane:.03,farClipPlane:100}})
  }
  async start(motionPermission:Promise<void>){
    if(!isSecureContext)throw new Error('바닥 AR은 신뢰할 수 있는 HTTPS 주소에서 열어주세요.')
    if(!minecraftARMobile())throw new Error('바닥 AR은 휴대폰 또는 태블릿의 후면 카메라로 사용해주세요. PC 화면에서는 바닥 추적을 시작하지 않습니다.')
    const [engine,images]=await Promise.all([loadMinecraftAR(),this.portrait?null:loadMinecraftImages(),motionPermission])
    if(this.closed)throw new Error('AR 시작 취소')
    if(owner&&owner!==this)throw new Error('다른 AR 세션이 종료된 뒤 다시 시도해주세요.')
    this.engine=engine;owner=this
    if(this.portrait){
      const height=1.55
      const geometry=new THREE.PlaneGeometry(height*this.portrait.width/this.portrait.height,height)
      const map=new THREE.CanvasTexture(this.portrait)
      map.colorSpace=THREE.SRGBColorSpace
      map.minFilter=THREE.LinearFilter
      map.generateMipmaps=false
      const material=new THREE.MeshBasicMaterial({map,transparent:true,alphaTest:.05,depthWrite:false,side:THREE.DoubleSide})
      this.portraitMesh=new THREE.Mesh(geometry,material)
      this.portraitMesh.position.y=height/2
      this.floorObject.add(this.portraitMesh)
    }else if(images){
      this.bladeGeometry=swordGeometry(images.sword)
      const blade=new THREE.Mesh(this.bladeGeometry,this.bladeMaterial)
      blade.rotation.x=-Math.PI/2;blade.scale.setScalar(1.12);blade.updateMatrixWorld(true)
      const bounds=new THREE.Box3().setFromObject(blade),center=bounds.getCenter(new THREE.Vector3())
      blade.position.set(-center.x,-bounds.min.y+.004,-center.z)
      this.floorObject.add(blade)
    }
    this.floorObject.scale.setScalar((this.portrait?1:.75)*this.size)
    engine.XrController.configure({disableWorldTracking:false,enableLighting:false,enableWorldPoints:false,scale:'absolute',mirroredDisplay:false})
    const tracker=engine.XrController.pipelineModule(),feed=engine.GlTextureRenderer.pipelineModule()
    await new Promise<void>((resolve,reject)=>{
      this.rejectStart=reject
      this.startTimer=setTimeout(()=>reject(new Error('AR 카메라를 시작하지 못했어요. 카메라·동작 권한과 HTTPS 인증서를 확인해주세요.')),40000)
      const finish=()=>{clearTimeout(this.startTimer);this.rejectStart=undefined;resolve()}
      const module:ARPipeline={
        name:'minecraft-floor-placement',
        onStart:(data)=>{
          if(this.closed){if(owner===this)engine.stop();return}
          try{this.attach(data);finish()}catch(error){reject(error instanceof Error?error:new Error(String(error)))}
        },
        onUpdate:({processCpuResult})=>this.update(processCpuResult.reality),
        onRender:()=>this.render(),
        onCanvasSizeChange:()=>{if(this.ready)this.configureProjection()},
        onCameraStatusChange:({status})=>{if(status==='failed')reject(new Error('후면 카메라를 열지 못했어요. 카메라 권한과 다른 앱의 사용 여부를 확인해주세요.'))},
        onException:(error)=>{
          if(this.closed)return
          const failure=error instanceof Error?error:new Error(String(error))
          if(this.rejectStart)reject(failure)
          else{this.normal=false;this.hit=null;this.ring.visible=false;this.floorObject.visible=false;this.placeButton.disabled=true;this.say(`AR 추적 오류: ${failure.message}`)}
        },
      }
      this.names=[tracker.name,feed.name,module.name]
      try{
        engine.addCameraPipelineModules([tracker,feed,module])
        engine.run({canvas:this.canvas,webgl2:true,cameraConfig:{direction:engine.XrConfig.camera().BACK},allowedDevices:engine.XrConfig.device().MOBILE,
          glContextConfig:{alpha:false,antialias:false,preserveDrawingBuffer:false,powerPreference:'low-power'}})
      }catch(error){reject(error instanceof Error?error:new Error(String(error)))}
    })
  }
  private attach(data:ARStart){
    if(!data.isWebgl2)throw new Error('이 브라우저에서는 필요한 WebGL2를 사용할 수 없어요. 최신 Safari 또는 Chrome에서 열어주세요.')
    this.renderer=new THREE.WebGLRenderer({canvas:data.canvas,context:data.GLctx as WebGL2RenderingContext,antialias:false,alpha:false})
    this.renderer.autoClear=false;this.renderer.setPixelRatio(1);this.renderer.setSize(data.canvasWidth,data.canvasHeight,false)
    this.engine!.XrController.updateCameraProjectionMatrix({origin:{x:0,y:1.6,z:0},facing:{x:0,y:0,z:0,w:1},cam:{pixelRectWidth:data.canvasWidth,pixelRectHeight:data.canvasHeight,nearClipPlane:.03,farClipPlane:100}})
    this.ready=true;this.say('후면 카메라로 무늬가 있는 바닥을 천천히 비춰주세요.')
    if(document.hidden)this.engine?.pause()
  }
  private update(reality:ARReality|undefined){
    if(this.closed||!this.ready||!reality)return
    this.realityAt=performance.now()
    this.camera.position.copy(reality.position);this.camera.quaternion.copy(reality.rotation)
    if(reality.intrinsics.length===16){this.camera.projectionMatrix.fromArray(reality.intrinsics);this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert()}
    this.camera.updateMatrixWorld(true)
    this.normal=reality.trackingStatus==='NORMAL'&&reality.trackingReason!=='INITIALIZING'
    if(!this.normal){
      this.hit=null;this.ring.visible=false;this.placeButton.disabled=true
      this.floorObject.visible=false;this.say('바닥을 천천히 비춰 추적을 맞춰주세요. 밝고 무늬가 있는 바닥이 좋아요.');return
    }
    if(this.placed){this.floorObject.visible=true;this.say('바닥에 설치했어요. 휴대폰을 움직여 다른 각도에서 보세요.');return}
    const now=performance.now()
    if(now-this.queryAt>=140)this.query(.5,.62,now)
  }
  private query(x:number,y:number,now:number){
    if(!this.engine||!this.normal||this.closed)return
    this.queryAt=now
    try{this.hit=findMinecraftFloor(this.engine,x,y,this.camera.position)}catch{this.hit=null}
    this.hitAt=now;this.ring.visible=!!this.hit;this.placeButton.disabled=!this.hit
    this.layer.classList.toggle('mc-ar-surface',!!this.hit)
    if(this.hit){this.ring.position.set(this.hit.position.x,this.hit.position.y+.006,this.hit.position.z);this.say('설치할 바닥을 찾았어요. 바닥을 터치하거나 설치 버튼을 누르세요.')}
    else this.say('바닥에 조준한 채 휴대폰을 조금 움직여주세요. 아직 설치할 수평면을 찾지 못했어요.')
  }
  private place(){
    if(!this.ready||!this.normal||this.placed||!this.hit||performance.now()-this.hitAt>300)return
    this.floorObject.position.copy(this.hit.position)
    if(this.portrait)this.forward.copy(this.camera.position).sub(this.floorObject.position)
    else this.camera.getWorldDirection(this.forward)
    this.yaw=Math.atan2(this.forward.x,this.forward.z)
    this.floorObject.rotation.y=this.yaw;this.floorObject.visible=true;this.placed=true;this.ring.visible=false;this.placeButton.disabled=true
    this.layer.classList.add('mc-ar-placed');this.say('바닥에 설치했어요. 크기와 방향을 조절할 수 있어요.')
  }
  private render(){
    if(this.closed||!this.ready||!this.renderer||document.hidden)return
    if(performance.now()-this.realityAt>500){
      this.normal=false;this.hit=null;this.ring.visible=false;this.floorObject.visible=false;this.placeButton.disabled=true
    }
    // GlTextureRenderer has already drawn the live feed on this same canvas.
    // Reset shared GL state, clear depth only, and leave its color buffer intact.
    this.renderer.resetState();this.renderer.setRenderTarget(null)
    this.renderer.setViewport(0,0,this.canvas.width,this.canvas.height)
    this.renderer.clearDepth();this.renderer.render(this.scene,this.camera);this.renderer.resetState()
  }
  destroy(){
    if(this.closed)return
    this.closed=true;clearTimeout(this.startTimer);this.rejectStart?.(new Error('AR 시작 취소'));this.rejectStart=undefined
    this.events.abort();this.observer.disconnect()
    if(owner===this){try{this.engine?.stop()}finally{this.engine?.removeCameraPipelineModules(this.names);owner=null}}
    this.ready=false;this.bladeGeometry?.dispose();this.bladeMaterial.dispose();this.ringGeometry.dispose();this.ringMaterial.dispose();this.scene.clear()
    this.portraitMesh?.geometry.dispose()
    this.portraitMesh?.material.map?.dispose()
    this.portraitMesh?.material.dispose()
    this.portraitMesh=null
    this.renderer?.dispose();this.renderer?.forceContextLoss();this.renderer=null;this.layer.remove()
  }
}
