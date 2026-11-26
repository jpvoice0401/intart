import type { FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision'
import type { RubberTracking } from './rubber-human-model'

/** This example loads only hands and face; no segmentation or gesture classifier. */
export class RubberHumanModels {
  private hands: HandLandmarker | null = null
  private face: FaceLandmarker | null = null
  private closed=false
  async initialize(base:string,worker:boolean) {
    const {FilesetResolver,HandLandmarker,FaceLandmarker}=await import('@mediapipe/tasks-vision')
    if (this.closed) return
    const files=await FilesetResolver.forVisionTasks(base,worker)
    const handsOptions={runningMode:'VIDEO' as const,numHands:2,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5}
    const hands=await HandLandmarker.createFromOptions(files,{...handsOptions,baseOptions:{modelAssetPath:`${base}hand_landmarker.task`,delegate:worker?'CPU':'GPU'}})
      .catch(()=>{if(this.closed)throw new Error('Cancelled');return HandLandmarker.createFromOptions(files,{...handsOptions,baseOptions:{modelAssetPath:`${base}hand_landmarker.task`,delegate:'CPU'}})})
    if(this.closed){hands.close();return} this.hands=hands
    const faceOptions={runningMode:'VIDEO' as const,numFaces:1,minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5,minTrackingConfidence:.5,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false}
    const face=await FaceLandmarker.createFromOptions(files,{...faceOptions,baseOptions:{modelAssetPath:`${base}face_landmarker.task`,delegate:worker?'CPU':'GPU'}})
      .catch(()=>{if(this.closed)throw new Error('Cancelled');return FaceLandmarker.createFromOptions(files,{...faceOptions,baseOptions:{modelAssetPath:`${base}face_landmarker.task`,delegate:'CPU'}})})
    if(this.closed){face.close();return} this.face=face
  }
  detect(image:HTMLVideoElement|ImageBitmap,time:number):RubberTracking {
    if(!this.face||!this.hands||this.closed)throw new Error('Face tracking is not ready')
    const hands=this.hands.detectForVideo(image,time)
    const face=this.face.detectForVideo(image,time).faceLandmarks[0]??null
    return {face,hands:hands.landmarks.map((points,i)=>({id:hands.handedness[i]?.[0]?.categoryName??`hand-${i}`,points}))}
  }
  close(){this.closed=true;this.hands?.close();this.face?.close();this.hands=null;this.face=null}
}
