import type {HandLandmarker,PoseLandmarker,FaceLandmarker} from '@mediapipe/tasks-vision'
import type {SabrinaTask,SabrinaTracking} from './sabrina-model'

export class SabrinaModels {
  private hands:HandLandmarker|null=null
  private pose:PoseLandmarker|null=null
  private face:FaceLandmarker|null=null
  private closed=false
  async initialize(base:string,worker:boolean,progress:(text:string)=>void){
    const {FilesetResolver,HandLandmarker,PoseLandmarker,FaceLandmarker}=await import('@mediapipe/tasks-vision')
    const files=await FilesetResolver.forVisionTasks(base,worker)
    const load=async<T>(create:(delegate:'CPU'|'GPU')=>Promise<T>)=>{
      if(this.closed)throw new Error('Cancelled')
      try{return await create(worker?'CPU':'GPU')}catch(error){if(this.closed||worker)throw error;return create('CPU')}
    }
    progress('손바닥 마법 준비 중 · 1 / 3')
    const hands=await load(delegate=>HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:`${base}hand_landmarker.task`,delegate},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5}))
    if(this.closed){hands.close();return}this.hands=hands
    progress('전신 의상 준비 중 · 2 / 3')
    const pose=await load(delegate=>PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('../sabrina/pose_landmarker_lite.task',base).href,delegate},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5,outputSegmentationMasks:true}))
    if(this.closed){pose.close();return}this.pose=pose
    progress('얼굴 보호 준비 중 · 3 / 3')
    const face=await load(delegate=>FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:`${base}face_landmarker.task`,delegate},runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5,minTrackingConfidence:.5,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false}))
    if(this.closed)face.close();else this.face=face
  }
  detect(task:SabrinaTask,image:HTMLVideoElement|ImageBitmap,time:number):SabrinaTracking{
    if(this.closed||!this.hands||!this.pose||!this.face)throw new Error('마법 인식이 준비되지 않았어요.')
    if(task==='hands'){
      const r=this.hands.detectForVideo(image,time)
      return{task,hands:r.landmarks.map((points,i)=>({points,id:r.handedness[i]?.[0]?.categoryName??`hand-${i}`}))}
    }
    if(task==='face')return{task,points:this.face.detectForVideo(image,time).faceLandmarks[0]??null}
    let output:SabrinaTracking={task,points:null,person:null}
    this.pose.detectForVideo(image,time,r=>{
      const mask=r.segmentationMasks?.[0]
      output={task,points:r.landmarks[0]??null,world:r.worldLandmarks[0]??null,person:mask?{mask:mask.getAsFloat32Array().slice(),width:mask.width,height:mask.height}:null}
    })
    return output
  }
  close(){this.closed=true;this.hands?.close();this.pose?.close();this.face?.close();this.hands=null;this.pose=null;this.face=null}
}
