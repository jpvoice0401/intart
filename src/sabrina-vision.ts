import {SabrinaModels} from './sabrina-models'
import type {SabrinaTask,SabrinaTracking} from './sabrina-model'

/** Independent, bounded three-model scheduler. No changes to existing sessions. */
export class SabrinaVision {
  private worker:Worker|null=null
  private main:SabrinaModels|null=null
  private ready=false;private busy=false;private closed=false;private paused=false
  private initializingMain=false;private needsMain=false
  private cancelInit:(()=>void)|undefined
  private timer:ReturnType<typeof setTimeout>|undefined
  private resize=true
  private bitmapOptions={resizeWidth:640,resizeHeight:360}
  private at:Record<SabrinaTask,number>={hands:-Infinity,pose:-Infinity,face:-Infinity}
  private intervals:Record<SabrinaTask,number>={hands:75,pose:140,face:220}
  private next=0
  private base=new URL(`${import.meta.env.BASE_URL}mediapipe/`,location.href).href
  private progress:(text:string)=>void=()=>{}
  private receive:(output:SabrinaTracking,time:number,image?:HTMLVideoElement|ImageBitmap)=>void
  error:Error|null=null
  constructor(receive:(output:SabrinaTracking,time:number,image?:HTMLVideoElement|ImageBitmap)=>void){this.receive=receive}
  async initialize(progress:(text:string)=>void){
    this.progress=progress
    if(typeof Worker!=='undefined'&&typeof OffscreenCanvas!=='undefined'&&typeof createImageBitmap==='function'){
      try{
        const worker=new Worker(new URL('./sabrina-worker.ts',import.meta.url),{type:'module'});this.worker=worker
        await new Promise<void>((resolve,reject)=>{
          const timer=setTimeout(()=>reject(new Error('마법 준비 시간이 초과됐어요.')),35000)
          this.cancelInit=()=>{clearTimeout(timer);resolve()}
          worker.onerror=()=>{clearTimeout(timer);reject(new Error('Worker unavailable'))}
          worker.onmessage=event=>{
            if(event.data.type==='progress')progress(event.data.text)
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
            clearTimeout(this.timer);this.busy=false;this.adapt(event.data.output.task,event.data.duration)
            try{if(!this.paused)this.receive(event.data.output,event.data.time,event.data.image)}finally{event.data.image?.close()}
          }else if(event.data.type==='error')void this.fallback()
        }
        this.ready=true;return
      }catch{this.worker?.terminate();this.worker=null;this.cancelInit=undefined}
    }
    if(!this.closed)await this.initializeMain()
  }
  private adapt(task:SabrinaTask,duration:number){
    const minimum=this.main?{hands:100,pose:190,face:280}:{hands:75,pose:140,face:220}
    this.intervals[task]=Math.max(minimum[task],Math.min(450,duration*2))
    this.next=performance.now()+Math.min(35,duration*.35)
  }
  private async initializeMain(){
    if(this.closed||this.initializingMain)return
    this.initializingMain=true;this.needsMain=false
    const model=new SabrinaModels();this.main=model
    try{await model.initialize(this.base,false,this.progress);if(this.closed)model.close();else{this.ready=true;this.busy=false}}
    catch(error){model.close();this.main=null;throw error}finally{this.initializingMain=false}
  }
  private async fallback(){
    if(this.closed||!this.worker||this.initializingMain)return
    clearTimeout(this.timer);this.worker.terminate();this.worker=null;this.ready=this.busy=false;this.needsMain=true
    if(this.paused)return
    try{await this.initializeMain()}catch(error){this.error=error instanceof Error?error:new Error(String(error))}
  }
  submit(video:HTMLVideoElement,time:number){
    if(!this.ready||this.busy||this.closed||this.paused||video.readyState<2||time<this.next)return false
    let task:SabrinaTask|null=null,overdue=1
    for(const candidate of ['pose','face','hands'] as const){const ratio=(time-this.at[candidate])/this.intervals[candidate];if(ratio>overdue){overdue=ratio;task=candidate}}
    if(!task)return false
    this.at[task]=time;this.busy=true
    if(this.worker){
      const worker=this.worker;this.timer=setTimeout(()=>void this.fallback(),4000)
      const scale=Math.min(1,640/Math.max(video.videoWidth,video.videoHeight))
      this.bitmapOptions.resizeWidth=Math.max(1,Math.round(video.videoWidth*scale));this.bitmapOptions.resizeHeight=Math.max(1,Math.round(video.videoHeight*scale))
      const bitmap=this.resize?createImageBitmap(video,this.bitmapOptions).catch(()=>{this.resize=false;return createImageBitmap(video)}):createImageBitmap(video)
      void bitmap.then(image=>{if(this.closed||this.worker!==worker){image.close();return}try{worker.postMessage({type:'frame',task,image,time},[image])}catch{image.close();void this.fallback()}}).catch(()=>void this.fallback())
    }else{
      const start=performance.now()
      try{this.receive(this.main!.detect(task,video,time),time,task==='pose'?video:undefined);this.adapt(task,performance.now()-start)}
      catch(error){this.error=error instanceof Error?error:new Error(String(error))}finally{this.busy=false}
    }
    return true
  }
  setVisible(visible:boolean){
    this.paused=!visible;clearTimeout(this.timer)
    if(visible){
      this.at={hands:-Infinity,pose:-Infinity,face:-Infinity};this.next=0
      if(this.busy&&this.worker)this.timer=setTimeout(()=>void this.fallback(),4000)
      if(this.needsMain)void this.initializeMain().catch(error=>{this.error=error instanceof Error?error:new Error(String(error))})
    }
  }
  close(){this.closed=true;this.ready=false;this.cancelInit?.();this.cancelInit=undefined;clearTimeout(this.timer);this.worker?.terminate();this.worker=null;this.main?.close();this.main=null}
}
