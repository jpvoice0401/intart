export interface SabrinaPoint { x:number; y:number; z?:number; visibility?:number }
export interface SabrinaHand { points:SabrinaPoint[]; id:string }
export interface SabrinaMask { width:number; height:number; mask:Float32Array }
export type SabrinaTask='hands'|'pose'|'face'
export type SabrinaTracking=
  | {task:'hands';hands:SabrinaHand[]}
  | {task:'face';points:SabrinaPoint[]|null}
  | {task:'pose';points:SabrinaPoint[]|null;person:SabrinaMask|null;world?:SabrinaPoint[]|null}
export const SABRINA_FACE_OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
export const SABRINA_FINGERTIPS=[4,8,12,16,20]
export const sabrinaClamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x))
export function sabrinaDistance(a:SabrinaPoint,b:SabrinaPoint,aspect:number){return Math.hypot((a.x-b.x)*aspect,a.y-b.y)}
export function sabrinaOpenPalm(points:SabrinaPoint[],aspect=1){
  if(points.length<21||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return false
  const palm=(sabrinaDistance(points[0]!,points[9]!,aspect)+sabrinaDistance(points[5]!,points[17]!,aspect))*.5
  if(palm<.025)return false
  let extended=0
  for(const tip of [8,12,16,20]){
    const t=points[tip]!,pip=points[tip-2]!,mcp=points[tip-3]!
    const toward=(t.x-pip.x)*(pip.x-mcp.x)*aspect*aspect+(t.y-pip.y)*(pip.y-mcp.y)
    if(sabrinaDistance(t,points[0]!,aspect)>sabrinaDistance(pip,points[0]!,aspect)*1.12&&toward>0)extended++
  }
  return extended===4&&sabrinaDistance(points[4]!,points[5]!,aspect)>palm*.40
}
export interface SabrinaBody {
  shoulder:SabrinaPoint; waist:SabrinaPoint; hem:SabrinaPoint
  right:{x:number;y:number}; down:{x:number;y:number}; width:number; torso:number; fullBody:boolean
}
export function sabrinaBody(points:SabrinaPoint[],aspect=1):SabrinaBody|null{
  if(points.length<33||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))||![11,12].every(i=>(points[i]!.visibility??1)>.45))return null
  const a=points[11]!,b=points[12]!,width=sabrinaDistance(a,b,aspect)
  if(width<.035)return null
  const shoulder={x:(a.x+b.x)*.5,y:(a.y+b.y)*.5}
  const hips=[23,24].every(i=>(points[i]!.visibility??1)>.45)
  const hip=hips?{x:(points[23]!.x+points[24]!.x)*.5,y:(points[23]!.y+points[24]!.y)*.5}:{x:shoulder.x,y:shoulder.y+width*1.15}
  let dx=(hip.x-shoulder.x)*aspect,dy=hip.y-shoulder.y
  const torso=sabrinaClamp(Math.hypot(dx,dy),width*.55,width*1.65),length=Math.hypot(dx,dy)
  if(length<.001){dx=0;dy=1}else{dx/=length;dy/=length}
  const down={x:dx,y:dy},right={x:dy,y:-dx}
  const waist={x:shoulder.x+down.x/aspect*torso*.82,y:shoulder.y+down.y*torso*.82}
  const fullBody=hips&&[27,28,31,32].every(i=>(points[i]!.visibility??1)>.5&&points[i]!.y<1.05&&points[i]!.y>-.05)
  const hem=fullBody?{x:(points[27]!.x+points[28]!.x)*.5,y:(points[27]!.y+points[28]!.y)*.5+width*.035}
    :{x:waist.x+down.x/aspect*torso*2.15,y:waist.y+down.y*torso*2.15}
  return{shoulder,waist,hem,right,down,width,torso,fullBody}
}
export interface SabrinaHead { center:SabrinaPoint; right:{x:number;y:number}; down:{x:number;y:number}; width:number;height:number;width3d?:number }
export function sabrinaHead(face:SabrinaPoint[],aspect=1):SabrinaHead|null{
  if(face.length<455||SABRINA_FACE_OVAL.some(i=>!Number.isFinite(face[i]!.x)||!Number.isFinite(face[i]!.y)))return null
  const top=face[10]!,bottom=face[152]!,left=face[234]!,right=face[454]!
  const width=sabrinaDistance(left,right,aspect),height=sabrinaDistance(top,bottom,aspect)
  if(width<.015||height<.02)return null
  const down={x:(bottom.x-top.x)*aspect/height,y:(bottom.y-top.y)/height}
  const width3d=Math.hypot((right.x-left.x)*aspect,right.y-left.y,((right.z??0)-(left.z??0))*aspect)
  return{center:{x:(top.x+bottom.x)*.5,y:(top.y+bottom.y)*.5},down,right:{x:down.y,y:-down.x},width,height,width3d}
}

export class SabrinaState {
  hands:SabrinaHand[]=[];pose:SabrinaPoint[]=[];face:SabrinaPoint[]=[]
  world:SabrinaPoint[]=[]
  frame:SabrinaBody3D|null=null
  private bodyTracker=new SabrinaBodyTracker()
  private worldTarget:SabrinaPoint[]=[]
  private poseTarget:SabrinaPoint[]=[];private faceTarget:SabrinaPoint[]=[]
  poseAt=-Infinity;faceAt=-Infinity;handsAt=-Infinity
  private held=-Infinity;private lastPalm=-Infinity;private transformedAt=-Infinity
  openHands=0
  get transformed(){return Number.isFinite(this.transformedAt)}
  receive(output:SabrinaTracking,time:number,aspect:number){
    if(output.task==='hands'){
      this.hands=output.hands;this.handsAt=time
      this.openHands=output.hands.filter(hand=>sabrinaOpenPalm(hand.points,aspect)).length
      if(this.openHands){if(time-this.lastPalm>180)this.held=time;this.lastPalm=time}else if(time-this.lastPalm>180)this.held=-Infinity
    }else if(output.task==='pose'){
      if(!output.points)return
      this.poseTarget=output.points;this.worldTarget=output.world??[];this.poseAt=time
      if(!this.pose.length)this.pose=this.poseTarget.map(p=>({...p}))
      if(!this.world.length)this.world=this.worldTarget.map(p=>({...p}))
    }else{
      this.faceTarget=output.points??[];this.faceAt=time
      if(!this.face.length)this.face=this.faceTarget.map(p=>({...p}))
    }
  }
  ready(now:number,aspect:number){return now-this.faceAt<650&&now-this.poseAt<650&&!!sabrinaHead(this.faceTarget,aspect)&&!!sabrinaBody(this.poseTarget,aspect)}
  tracking(now:number){return now-this.poseAt<650&&!!this.frame}
  faceVisible(now:number){return now-this.faceAt<650&&this.faceTarget.length>454}
  activate(now:number,aspect:number){if(this.transformed||!this.ready(now,aspect))return false;this.transformedAt=now;return true}
  update(now:number,dt:number,aspect:number){
    const blend=1-Math.exp(-Math.min(.1,dt)*18)
    for(const [current,target]of [[this.pose,this.poseTarget],[this.world,this.worldTarget],[this.face,this.faceTarget]]){
      if(current.length!==target.length){current.length=0;current.push(...target.map(p=>({...p})));continue}
      for(let i=0;i<current.length;i++){
        const a=current[i]!,b=target[i]!
        a.x+=(b.x-a.x)*blend;a.y+=(b.y-a.y)*blend;a.z=(a.z??0)+((b.z??0)-(a.z??0))*blend;a.visibility=b.visibility
      }
    }
    this.frame=now-this.poseAt<650?this.bodyTracker.fit(this.pose,this.world,this.faceVisible(now)?sabrinaHead(this.face,aspect):null,aspect):null
    if(now-this.handsAt>350){this.hands=[];this.openHands=0;this.held=-Infinity}
    if(!this.transformed&&now-this.lastPalm<180&&now-this.held>=380)return this.activate(now,aspect)
    return false
  }
  progress(now:number){const t=this.transformed?sabrinaClamp((now-this.transformedAt)/1800):0;return t*t*(3-2*t)}
  glow(now:number){return this.openHands?1:sabrinaClamp(1-(now-this.lastPalm)/260)}
  clearHands(){this.hands=[];this.openHands=0;this.held=this.lastPalm=this.handsAt=-Infinity}
  reset(){this.transformedAt=-Infinity;this.clearHands()}
  clear(){this.reset();this.pose=[];this.face=[];this.world=[];this.poseTarget=[];this.faceTarget=[];this.worldTarget=[];this.poseAt=this.faceAt=-Infinity;this.frame=null;this.bodyTracker.reset()}
}
import {SabrinaBodyTracker,type SabrinaBody3D} from './sabrina-body3d.ts'
