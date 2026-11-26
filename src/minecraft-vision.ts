import { MinecraftSegmenter } from './minecraft-segmenter'
import type { MinecraftMask } from './minecraft-model'

export class MinecraftVision {
  private worker:Worker|null=null
  private main:MinecraftSegmenter|null=null
  private ready=false
  private busy=false
  private closed=false
  private timer:ReturnType<typeof setTimeout>|undefined
  private cancelInit:(()=>void)|undefined
  private base=new URL(`${import.meta.env.BASE_URL}mediapipe/`,location.href).href
  private resize=true
  private bitmapOptions={resizeWidth:512,resizeHeight:288}
  private receive:(mask:MinecraftMask,time:number,image:HTMLVideoElement|ImageBitmap)=>void
  error:Error|null=null
  interval=80
  constructor(receive:(mask:MinecraftMask,time:number,image:HTMLVideoElement|ImageBitmap)=>void){this.receive=receive}
  async initialize(){
    if(typeof Worker!=='undefined'&&typeof OffscreenCanvas!=='undefined'&&typeof createImageBitmap==='function'){
      try{
        const worker=new Worker(new URL('./minecraft-worker.ts',import.meta.url),{type:'module'});this.worker=worker
        await new Promise<void>((resolve,reject)=>{
          const timer=setTimeout(()=>reject(new Error('Segmentation initialization timed out')),20000)
          this.cancelInit=()=>{clearTimeout(timer);resolve()}
          worker.onerror=()=>{clearTimeout(timer);reject(new Error('Segmentation worker unavailable'))}
          worker.onmessage=event=>{
            if(event.data.type==='ready'){clearTimeout(timer);resolve()}
            if(event.data.type==='error'){clearTimeout(timer);reject(new Error(event.data.message))}
          }
          worker.postMessage({type:'init',base:this.base})
        })
        this.cancelInit=undefined;if(this.closed)return
        worker.onerror=()=>void this.fallback()
        worker.onmessage=event=>{
          if(this.closed||this.worker!==worker){event.data.image?.close();return}
          if(event.data.type==='result'){
            clearTimeout(this.timer);this.busy=false
            this.interval=Math.max(80,Math.min(180,event.data.duration*1.5))
            const image:ImageBitmap=event.data.image
            try{this.receive(event.data.result,event.data.time,image)}
            finally{image.close()}
          }else if(event.data.type==='error')void this.fallback()
        }
        this.ready=true;return
      }catch{this.worker?.terminate();this.worker=null;this.cancelInit=undefined}
    }
    if(!this.closed)await this.initializeMain()
  }
  private async initializeMain(){
    const model=new MinecraftSegmenter();this.main=model;this.interval=120
    try{await model.initialize(this.base,false);if(this.closed)model.close();else{this.ready=true;this.busy=false}}
    catch(error){model.close();throw error}
  }
  private async fallback(){
    if(this.closed||!this.worker)return
    this.ready=false;this.busy=true;clearTimeout(this.timer);this.worker.terminate();this.worker=null
    try{await this.initializeMain()}catch(error){this.error=error instanceof Error?error:new Error(String(error))}
  }
  submit(video:HTMLVideoElement,time:number):boolean {
    if(this.closed||!this.ready||this.busy||video.readyState<2)return false
    this.busy=true
    if(this.worker){
      const worker=this.worker;this.timer=setTimeout(()=>void this.fallback(),3000)
      this.bitmapOptions.resizeHeight=Math.round(512*video.videoHeight/video.videoWidth)
      const bitmap=this.resize?createImageBitmap(video,this.bitmapOptions).catch(()=>{this.resize=false;return createImageBitmap(video)}):createImageBitmap(video)
      void bitmap.then(image=>{
        if(this.closed||worker!==this.worker){image.close();return}
        try{worker.postMessage({type:'frame',image,time},[image])}catch{image.close();void this.fallback()}
      }).catch(()=>void this.fallback())
    }else{
      const start=performance.now()
      try{this.receive(this.main!.detect(video,time),time,video);this.interval=Math.max(120,Math.min(220,(performance.now()-start)*1.7))}
      catch(error){this.error=error instanceof Error?error:new Error(String(error))}
      finally{this.busy=false}
    }
    return true
  }
  close(){this.closed=true;this.ready=false;this.cancelInit?.();this.cancelInit=undefined;clearTimeout(this.timer);this.worker?.terminate();this.worker=null;this.main?.close();this.main=null}
}
