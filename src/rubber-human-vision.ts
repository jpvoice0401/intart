import { RubberHumanModels } from './rubber-human-models'
import type { RubberTracking } from './rubber-human-model'

/** Single frame in flight, bounded input resolution, worker with GPU/CPU fallback.
 * It is intentionally independent of the existing examples' inference setup. */
export class RubberHumanVision {
  private worker:Worker|null=null
  private main:RubberHumanModels|null=null
  private ready=false
  private busy=false
  private closed=false
  private base=new URL(`${import.meta.env.BASE_URL}mediapipe/`,location.href).href
  private timer:ReturnType<typeof setTimeout>|undefined
  private cancelInit:(()=>void)|undefined
  private resizeBitmaps=true
  private bitmapOptions={resizeWidth:640,resizeHeight:360}
  interval=66
  error:Error|null=null
  private receive:(data:RubberTracking,time:number)=>void
  constructor(receive:(data:RubberTracking,time:number)=>void){this.receive=receive}
  async initialize(){
    if(typeof Worker!=='undefined'&&typeof OffscreenCanvas!=='undefined'&&typeof createImageBitmap==='function'){
      try{
        const worker=new Worker(new URL('./rubber-human-worker.ts',import.meta.url),{type:'module'});this.worker=worker
        await new Promise<void>((resolve,reject)=>{
          const timer=setTimeout(()=>reject(new Error('Face worker timed out')),25000)
          this.cancelInit=()=>{clearTimeout(timer);resolve()}
          worker.onerror=()=>{clearTimeout(timer);reject(new Error('Face worker unavailable'))}
          worker.onmessage=event=>{
            if(event.data.type==='ready'){clearTimeout(timer);resolve()}
            if(event.data.type==='error'){clearTimeout(timer);reject(new Error(event.data.message))}
          }
          worker.postMessage({type:'init',base:this.base})
        })
        this.cancelInit=undefined
        if(this.closed)return
        worker.onerror=()=>void this.fallback()
        worker.onmessage=event=>{
          if(this.closed)return
          if(event.data.type==='result'){
            clearTimeout(this.timer);this.busy=false
            this.interval=Math.max(66,Math.min(160,event.data.duration*1.3))
            this.receive(event.data.result,event.data.timestamp)
          }else if(event.data.type==='error')void this.fallback()
        }
        this.ready=true;return
      }catch{this.worker?.terminate();this.worker=null;this.cancelInit=undefined}
    }
    if(!this.closed)await this.initializeMain()
  }
  private async initializeMain(){
    const model=new RubberHumanModels();this.main=model;this.interval=110
    try{await model.initialize(this.base,false);if(this.closed)model.close();else{this.ready=true;this.busy=false}}
    catch(error){model.close();throw error}
  }
  private async fallback(){
    if(this.closed||!this.worker)return
    this.ready=false;this.busy=true;clearTimeout(this.timer);this.worker.terminate();this.worker=null
    try{await this.initializeMain()}catch(error){this.error=error instanceof Error?error:new Error(String(error))}
  }
  submit(video:HTMLVideoElement,timestamp:number):boolean{
    if(!this.ready||this.busy||this.closed||video.readyState<2)return false
    this.busy=true
    if(this.worker){
      const worker=this.worker
      this.timer=setTimeout(()=>void this.fallback(),4000)
      this.bitmapOptions.resizeHeight=Math.round(640*video.videoHeight/video.videoWidth)
      const bitmap=this.resizeBitmaps?createImageBitmap(video,this.bitmapOptions).catch(()=>{
        // Remember unsupported resize options instead of rejecting two bitmap
        // requests on every frame in compatibility browsers.
        this.resizeBitmaps=false;return createImageBitmap(video)
      }):createImageBitmap(video)
      void bitmap.then(image=>{
        if(this.closed||worker!==this.worker){image.close();return}
        try{worker.postMessage({type:'frame',image,timestamp},[image])}catch{image.close();void this.fallback()}
      }).catch(()=>void this.fallback())
    }else{
      const start=performance.now()
      try{this.receive(this.main!.detect(video,timestamp),timestamp);this.interval=Math.max(110,Math.min(220,(performance.now()-start)*1.6))}
      catch(error){this.error=error instanceof Error?error:new Error(String(error))}
      finally{this.busy=false}
    }
    return true
  }
  close(){this.closed=true;this.ready=false;this.cancelInit?.();this.cancelInit=undefined;clearTimeout(this.timer);this.worker?.terminate();this.worker=null;this.main?.close();this.main=null}
}
