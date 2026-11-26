import { MinecraftSegmenter } from './minecraft-segmenter'
const model=new MinecraftSegmenter()
const scope=self as unknown as {onmessage:(event:MessageEvent)=>void;postMessage:(data:unknown,transfer?:Transferable[])=>void}
scope.onmessage=async event=>{
  const data=event.data as {type:string;base:string;image:ImageBitmap;time:number}
  if(data.type==='init'){
    try{await model.initialize(data.base,true);scope.postMessage({type:'ready'})}
    catch(error){model.close();scope.postMessage({type:'error',message:String(error)})}
  }else if(data.type==='frame'){
    try{
      const start=performance.now(),result=model.detect(data.image,data.time)
      scope.postMessage({type:'result',result,time:data.time,duration:performance.now()-start,image:data.image},[result.mask.buffer,data.image])
    }catch(error){
      data.image.close()
      scope.postMessage({type:'error',message:String(error)})
    }
  }
}
