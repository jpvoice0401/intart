import type {SabrinaPoint,SabrinaHead,SabrinaBody} from './sabrina-model'

export interface SabrinaVector3{x:number;y:number;z:number}
export const sb3={
  add:(a:SabrinaVector3,b:SabrinaVector3):SabrinaVector3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z}),
  sub:(a:SabrinaVector3,b:SabrinaVector3):SabrinaVector3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z}),
  mul:(a:SabrinaVector3,s:number):SabrinaVector3=>({x:a.x*s,y:a.y*s,z:a.z*s}),
  dot:(a:SabrinaVector3,b:SabrinaVector3)=>a.x*b.x+a.y*b.y+a.z*b.z,
  cross:(a:SabrinaVector3,b:SabrinaVector3):SabrinaVector3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x}),
  length:(a:SabrinaVector3)=>Math.hypot(a.x,a.y,a.z),
  unit:(a:SabrinaVector3,fallback:SabrinaVector3={x:1,y:0,z:0}):SabrinaVector3=>{const n=Math.hypot(a.x,a.y,a.z);return n>.0001?{x:a.x/n,y:a.y/n,z:a.z/n}:{...fallback}},
  mix:(a:SabrinaVector3,b:SabrinaVector3,t:number):SabrinaVector3=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t}),
}
const finite=(p:SabrinaPoint)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z??0)
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n))
const mid=(a:SabrinaVector3,b:SabrinaVector3)=>sb3.mul(sb3.add(a,b),.5)

export interface SabrinaHead3D{
  center:SabrinaVector3;right:SabrinaVector3;down:SabrinaVector3;front:SabrinaVector3;width:number;height:number
}
export interface SabrinaBody3D{
  body:SabrinaBody;shoulder:SabrinaVector3;waist:SabrinaVector3;hem:SabrinaVector3
  right:SabrinaVector3;down:SabrinaVector3;front:SabrinaVector3
  joints:SabrinaVector3[];head:SabrinaHead3D;yaw:number;world:boolean;aspect:number
}

/** Visible part of the front face surface, projected from the tracked head.
 * Used only when the face detector cannot see a profile; rear views return no
 * patch, so a cached front face is never pasted onto the back of the head. */
export function sabrinaFacePatch(head:SabrinaHead3D,aspect:number):SabrinaPoint[]{
  const points:SabrinaPoint[]=[]
  for(let y=0;y<=12;y++)for(let x=0;x<=16;x++){
    const phi=-Math.PI*.5+y/12*Math.PI,theta=-1.05+x/16*2.1,c=Math.cos(phi)
    if((head.right.z*Math.sin(theta)+head.front.z*Math.cos(theta))*c>.10||head.front.z>.45)continue
    const across=Math.sin(theta)*head.width*.55*c,forward=Math.cos(theta)*head.width*.56*c,down=Math.sin(phi)*head.height*.52
    points.push({x:(head.center.x+head.right.x*across+head.front.x*forward+head.down.x*down)/aspect,y:head.center.y+head.right.y*across+head.front.y*forward+head.down.y*down})
  }
  if(points.length<3)return[]
  points.sort((a,b)=>a.x-b.x||a.y-b.y)
  const cross=(a:SabrinaPoint,b:SabrinaPoint,c:SabrinaPoint)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)
  const lower:SabrinaPoint[]=[],upper:SabrinaPoint[]=[]
  for(const p of points){while(lower.length>=2&&cross(lower.at(-2)!,lower.at(-1)!,p)<=0)lower.pop();lower.push(p)}
  for(let i=points.length-1;i>=0;i--){const p=points[i]!;while(upper.length>=2&&cross(upper.at(-2)!,upper.at(-1)!,p)<=0)upper.pop();upper.push(p)}
  lower.pop();upper.pop();return lower.concat(upper)
}

/** Calibrate size from torso/metric skeleton, not projected shoulder width.
 * At 90 degrees the missing screen-space width comes from world-space depth.
 * Face data initializes head proportions; its absence never removes a turned body. */
export class SabrinaBodyTracker{
  private sign=0
  private width=0
  private headWidth=.58
  private headHeight=.78
  private yaw=0
  private calibrated=false
  private previousRight:SabrinaVector3={x:1,y:0,z:0}
  fit(points:SabrinaPoint[],world:SabrinaPoint[],head:SabrinaHead|null,aspect:number):SabrinaBody3D|null{
    if(points.length<33||points.some(p=>!finite(p))||!Number.isFinite(aspect)||aspect<=0)return null
    const metric=world.length===33&&world.every(finite)
    const shoulderConfidence=[11,12].map(i=>points[i]!.visibility??1)
    if(metric?Math.max(...shoulderConfidence)<.45:Math.min(...shoulderConfidence)<.45)return null
    const projectedShoulder={x:(points[11]!.x+points[12]!.x)*aspect*.5,y:(points[11]!.y+points[12]!.y)*.5,z:0}
    const projectedHip={x:(points[23]!.x+points[24]!.x)*aspect*.5,y:(points[23]!.y+points[24]!.y)*.5,z:0}
    let imageTorso=Math.hypot(projectedHip.x-projectedShoulder.x,projectedHip.y-projectedShoulder.y)
    const screenWidth=Math.hypot((points[12]!.x-points[11]!.x)*aspect,points[12]!.y-points[11]!.y)
    if(imageTorso<.025)imageTorso=(this.width||screenWidth)*1.1
    if(imageTorso<.025||imageTorso>1.8)return null
    const worldShoulder=metric?{x:(world[11]!.x+world[12]!.x)*.5,y:(world[11]!.y+world[12]!.y)*.5,z:((world[11]!.z??0)+(world[12]!.z??0))*.5}:null
    const worldHip=metric?{x:(world[23]!.x+world[24]!.x)*.5,y:(world[23]!.y+world[24]!.y)*.5,z:((world[23]!.z??0)+(world[24]!.z??0))*.5}:null
    const worldTorso=metric?Math.hypot(worldHip!.x-worldShoulder!.x,worldHip!.y-worldShoulder!.y):0
    const scale=metric&&worldTorso>.08?imageTorso/worldTorso:aspect
    const joints=points.map((p,i)=>({x:p.x*aspect,y:p.y,z:metric?((world[i]!.z??0)-worldShoulder!.z)*scale:((p.z??0)-((points[11]!.z??0)+(points[12]!.z??0))*.5)*aspect}))
    const shoulder=mid(joints[11]!,joints[12]!),hip=mid(joints[23]!,joints[24]!)
    const rawAcross=sb3.sub(joints[12]!,joints[11]!)
    if(!this.sign&&head&&Math.abs(rawAcross.x)>.025)this.sign=Math.sign(rawAcross.x)
    const sign=this.sign||(rawAcross.x<0?-1:1)
    const down=sb3.unit(sb3.sub(hip,shoulder),{x:0,y:1,z:0})
    const across=sb3.mul(rawAcross,sign)
    const right=sb3.unit(sb3.sub(across,sb3.mul(down,sb3.dot(across,down))),this.previousRight)
    this.previousRight=right
    const front=sb3.unit(sb3.mul(sb3.cross(right,down),-1),{x:0,y:0,z:-1})
    let size=sb3.length(rawAcross)
    if(metric){
      const a=world[11]!,b=world[12]!
      size=Math.hypot(b.x-a.x,b.y-a.y,(b.z??0)-(a.z??0))*scale
    }
    if(size<.025)size=this.width
    if(size<.025)return null
    // A single depth estimate may flatten at the side. Keep the calibrated
    // width instead of collapsing the skirt and head to a line.
    if(this.width&&Math.abs(right.x)<.35)size=Math.max(size,this.width*.8)
    this.width=this.width?this.width*.82+size*.18:size
    const torso=clamp(sb3.length(sb3.sub(hip,shoulder)),this.width*.55,this.width*1.8)
    const waist=sb3.add(shoulder,sb3.mul(down,torso*.82))
    const footVisible=(side:number)=>[side?28:27,side?32:31].every(i=>(points[i]!.visibility??1)>.5&&points[i]!.y>-.05&&points[i]!.y<1.05)
    const inFrame=[27,28,31,32].every(i=>points[i]!.y>-.08&&points[i]!.y<1.08)
    const fullBody=inFrame&&(metric?(footVisible(0)||footVisible(1)):(footVisible(0)&&footVisible(1)))
    const hem=fullBody?sb3.add(mid(joints[27]!,joints[28]!),sb3.mul(down,this.width*.04)):sb3.add(waist,sb3.mul(down,torso*2.15))
    let yaw=Math.atan2(right.z,right.x)
    if(this.calibrated){while(yaw-this.yaw>Math.PI)yaw-=Math.PI*2;while(yaw-this.yaw<-Math.PI)yaw+=Math.PI*2}
    this.yaw=yaw;this.calibrated=true
    // Only near-frontal face measurements update proportions; projected face
    // width must not shrink the hair during a profile or rear view.
    if(head&&head.width/head.height>.5){
      this.headWidth=this.headWidth*.85+clamp((head.width3d??head.width)/this.width,.36,.95)*.15
      this.headHeight=this.headHeight*.85+clamp(head.height/this.width,.45,1.3)*.15
    }
    const hw=this.width*this.headWidth,hh=this.width*this.headHeight
    const ears=sb3.sub(joints[8]!,joints[7]!)
    let headRight=sb3.unit(sb3.mul(ears,sign),right)
    const headDown=head?sb3.unit({x:head.down.x,y:head.down.y,z:0},down):down
    headRight=sb3.unit(sb3.sub(headRight,sb3.mul(headDown,sb3.dot(headRight,headDown))),right)
    const headFront=sb3.unit(sb3.mul(sb3.cross(headRight,headDown),-1),front)
    let center=mid(joints[7]!,joints[8]!)
    const earDistance=sb3.length(sb3.sub(center,shoulder))
    if(earDistance<this.width*.2||earDistance>this.width*1.9)center=sb3.add(shoulder,sb3.mul(down,-hh*.85))
    if(head){
      const projected={x:head.center.x*aspect-headFront.x*hw*.43,y:head.center.y-headFront.y*hw*.43,z:center.z}
      center=sb3.mix(center,projected,.7)
    }
    const body:SabrinaBody={shoulder:{x:shoulder.x/aspect,y:shoulder.y},waist:{x:waist.x/aspect,y:waist.y},hem:{x:hem.x/aspect,y:hem.y},right:{x:right.x,y:right.y},down:{x:down.x,y:down.y},width:this.width,torso,fullBody}
    return{body,shoulder,waist,hem,right,down,front,joints,head:{center,right:headRight,down:headDown,front:headFront,width:hw,height:hh},yaw,world:metric,aspect}
  }
  reset(){this.sign=0;this.width=0;this.headWidth=.58;this.headHeight=.78;this.yaw=0;this.calibrated=false;this.previousRight={x:1,y:0,z:0}}
}
