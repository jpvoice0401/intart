import {SabrinaModels} from './sabrina-models'
import type {SabrinaTask} from './sabrina-model'
const model=new SabrinaModels()
const scope=self as unknown as{onmessage:(event:MessageEvent)=>void;postMessage:(data:unknown,transfer?:Transferable[])=>void}
scope.onmessage=async event=>{
  const data=event.data as{type:string;base:string;task:SabrinaTask;image:ImageBitmap;time:number}
  if(data.type==='init'){
    try{await model.initialize(data.base,true,text=>scope.postMessage({type:'progress',text}));scope.postMessage({type:'ready'})}
    catch(error){model.close();scope.postMessage({type:'error',message:String(error)})}
    return
  }
  if(data.type!=='frame')return
  try{
    const start=performance.now(),output=model.detect(data.task,data.image,data.time),duration=performance.now()-start
    if(output.task==='pose'){
      const transfer:Transferable[]=[data.image];if(output.person)transfer.push(output.person.mask.buffer)
      scope.postMessage({type:'result',output,time:data.time,duration,image:data.image},transfer)
    }else{data.image.close();scope.postMessage({type:'result',output,time:data.time,duration})}
  }catch(error){data.image.close();scope.postMessage({type:'error',message:String(error)})}
}
