import { RubberHumanModels } from './rubber-human-models'
const models=new RubberHumanModels()
const scope=self as unknown as {onmessage:(event:MessageEvent)=>void;postMessage:(message:unknown)=>void}
scope.onmessage=async event=>{
  const data=event.data as {type:string;base:string;image:ImageBitmap;timestamp:number}
  if(data.type==='init'){
    try{await models.initialize(data.base,true);scope.postMessage({type:'ready'})}
    catch(error){models.close();scope.postMessage({type:'error',message:String(error)})}
  }else if(data.type==='frame'){
    try{const start=performance.now();const result=models.detect(data.image,data.timestamp);scope.postMessage({type:'result',result,timestamp:data.timestamp,duration:performance.now()-start})}
    catch(error){scope.postMessage({type:'error',message:String(error)})}
    finally{data.image.close()}
  }
}
