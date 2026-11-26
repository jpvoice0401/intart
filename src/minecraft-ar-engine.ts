/** Public 8th Wall camera-pipeline API subset used by this example.
 * Binary engine assets are copied unmodified from @8thwall/engine-binary@1.0.0. */
export interface ARVector {x:number;y:number;z:number}
export interface ARRotation extends ARVector {w:number}
export interface ARHit {type:string;position:ARVector;rotation?:ARRotation;distance:number}
export interface ARReality {position:ARVector;rotation:ARRotation;intrinsics:ArrayLike<number>;trackingStatus?:string;trackingReason?:string}
export interface ARStart {canvas:HTMLCanvasElement;GLctx:WebGLRenderingContext|WebGL2RenderingContext;isWebgl2:boolean;canvasWidth:number;canvasHeight:number}
export interface ARPipeline {
  name:string
  onStart?:(data:ARStart)=>void
  onUpdate?:(data:{processCpuResult:{reality?:ARReality}})=>void
  onRender?:()=>void
  onCanvasSizeChange?:(data:{canvasWidth:number;canvasHeight:number})=>void
  onException?:(error:unknown)=>void
  onCameraStatusChange?:(data:{status:string})=>void
}
export interface EightWall {
  loadChunk:(name:string)=>Promise<void>
  run:(options:{canvas:HTMLCanvasElement;webgl2:boolean;cameraConfig:{direction:unknown};glContextConfig:WebGLContextAttributes;allowedDevices:unknown})=>void
  stop:()=>void
  pause:()=>void
  resume:()=>void
  addCameraPipelineModules:(modules:ARPipeline[])=>void
  removeCameraPipelineModules:(names:string[])=>void
  XrConfig:{camera:()=>{BACK:unknown};device:()=>{MOBILE:unknown}}
  XrController:{
    configure:(options:{disableWorldTracking:boolean;enableLighting:boolean;enableWorldPoints:boolean;scale:'absolute';mirroredDisplay:boolean})=>void
    pipelineModule:()=>ARPipeline
    updateCameraProjectionMatrix:(options:{origin?:ARVector;facing?:ARRotation;cam?:{pixelRectWidth:number;pixelRectHeight:number;nearClipPlane:number;farClipPlane:number}})=>void
    hitTest:(x:number,y:number,types?:string[])=>ARHit[]
  }
  GlTextureRenderer:{pipelineModule:()=>ARPipeline}
}
const sdkWindow=window as Window & {XR8?:EightWall}
let loading:Promise<EightWall>|null=null

/** Called in the AR button's event handler, before any imports/network awaits. */
export function requestMinecraftMotion():Promise<void>{
  const Orientation=window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {requestPermission?:()=>Promise<string>}
  if(!Orientation?.requestPermission)return Promise.resolve()
  return Orientation.requestPermission().then(permission=>{if(permission!=='granted')throw new Error('바닥 AR을 사용하려면 기기의 동작 및 방향 권한을 허용해주세요.')})
}
export function loadMinecraftAR():Promise<EightWall>{
  if(loading)return loading
  loading=new Promise<EightWall>((resolve,reject)=>{
    if(sdkWindow.XR8){resolve(sdkWindow.XR8);return}
    const script=document.createElement('script')
    script.src=new URL(`${import.meta.env.BASE_URL}vendor/8thwall/xr.js`,location.href).href
    script.async=true;script.dataset.preloadChunks='slam'
    const cleanup=()=>{clearTimeout(timer);window.removeEventListener('xrloaded',ready);script.onerror=null}
    const ready=()=>{if(!sdkWindow.XR8)return;cleanup();resolve(sdkWindow.XR8)}
    const timer=setTimeout(()=>{cleanup();script.remove();reject(new Error('AR 엔진을 불러오지 못했어요. 연결을 확인하고 다시 시도해주세요.'))},45000)
    script.onerror=()=>{cleanup();script.remove();reject(new Error('로컬 8th Wall 엔진 파일을 불러오지 못했어요.'))}
    window.addEventListener('xrloaded',ready);document.head.append(script)
  }).then(async engine=>{await engine.loadChunk('slam');return engine}).catch(error=>{loading=null;throw error})
  return loading
}

export function minecraftARMobile():boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(/Macintosh/i.test(navigator.userAgent)&&navigator.maxTouchPoints>1)
}
