import type { ImageSegmenter } from '@mediapipe/tasks-vision'
import type { MinecraftMask } from './minecraft-model'

/** Person segmentation only: no hand/face models are needed for this example. */
export class MinecraftSegmenter {
  private model:ImageSegmenter|null=null
  private closed=false
  async initialize(base:string,worker:boolean){
    const {FilesetResolver,ImageSegmenter}=await import('@mediapipe/tasks-vision')
    if(this.closed)return
    const files=await FilesetResolver.forVisionTasks(base,worker)
    const options={runningMode:'VIDEO' as const,outputCategoryMask:false,outputConfidenceMasks:true}
    const model=await ImageSegmenter.createFromOptions(files,{...options,baseOptions:{modelAssetPath:`${base}selfie_segmenter_landscape.tflite`,delegate:worker?'CPU':'GPU'}})
      .catch(()=>{if(this.closed)throw new Error('Cancelled');return ImageSegmenter.createFromOptions(files,{...options,baseOptions:{modelAssetPath:`${base}selfie_segmenter_landscape.tflite`,delegate:'CPU'}})})
    if(this.closed)model.close();else this.model=model
  }
  detect(image:HTMLVideoElement|ImageBitmap,time:number):MinecraftMask {
    if(!this.model||this.closed)throw new Error('Person segmentation is not ready')
    let output:MinecraftMask={mask:new Float32Array(0),width:0,height:0}
    this.model.segmentForVideo(image,time,result=>{
      const masks=result.confidenceMasks,mask=masks?.[masks.length>1?1:0]
      if(mask)output={mask:mask.getAsFloat32Array().slice(),width:mask.width,height:mask.height}
    })
    return output
  }
  close(){this.closed=true;this.model?.close();this.model=null}
}
