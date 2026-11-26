export interface MinecraftMask { mask:Float32Array; width:number; height:number }
export interface MinecraftStrike { x:number; y:number; started:number }
export const MC_SWING_SECONDS=.3
export const MC_HURT_SECONDS=.5
export const MC_HITS_TO_CAPTURE=10
const degrees=Math.PI/180
const sin=(value:number)=>Math.sin(value*degrees)

/** Camera-space person mask, independent of display mirroring/cover cropping. */
export class MinecraftCombat {
  strike:MinecraftStrike={x:0,y:0,started:-Infinity}
  private hurtStarted=-Infinity
  private mask:Float32Array|null=null
  private maskWidth=0
  private maskHeight=0
  private maskAt=-Infinity
  hits=0
  swings=0
  private capturedAt=-Infinity
  get defeated(){return this.hits>=MC_HITS_TO_CAPTURE}
  updateMask(data:MinecraftMask,time:number){this.mask=data.mask;this.maskWidth=data.width;this.maskHeight=data.height;this.maskAt=time}
  target(now:number):boolean {
    if(this.defeated||!this.mask||!this.maskWidth||!this.maskHeight||now-this.maskAt>350)return false
    // The fixed central crosshair maps to camera center with any cover crop.
    const x=(this.maskWidth-1)*.5,y=(this.maskHeight-1)*.5,ix=Math.floor(x),iy=Math.floor(y)
    const x1=Math.min(ix+1,this.maskWidth-1),y1=Math.min(iy+1,this.maskHeight-1),fx=x-ix,fy=y-iy
    const a=this.mask[iy*this.maskWidth+ix]!*(1-fx)+this.mask[iy*this.maskWidth+x1]!*fx
    const b=this.mask[y1*this.maskWidth+ix]!*(1-fx)+this.mask[y1*this.maskWidth+x1]!*fx
    return a*(1-fy)+b*fy>=.55
  }
  attack(now:number,x=0,y=0):boolean {
    // During this six-tick stroke, early repeated presses do not interrupt
    // the forward stroke; once halfway through, another swing can restart it.
    if(now-this.strike.started<MC_SWING_SECONDS*1000*.5)return false
    this.strike.x=Math.max(-1,Math.min(1,x));this.strike.y=Math.max(-1,Math.min(1,y));this.strike.started=now;this.swings++
    if(this.target(now)){
      this.hurtStarted=now;this.hits++
      if(this.defeated)this.capturedAt=now
      return true
    }
    return false
  }
  progress(now:number){return Math.max(0,Math.min(1,(now-this.strike.started)/(MC_SWING_SECONDS*1000)))}
  hurt(now:number):number {
    if(now-this.maskAt>350)return 0
    const elapsed=(now-this.hurtStarted)/1000
    if(elapsed<0||elapsed>=MC_HURT_SECONDS)return 0
    // Entity-local red flash, followed by a short release. No full-screen tint.
    return elapsed<.4 ? .42 : .42*(MC_HURT_SECONDS-elapsed)/.1
  }
  disappearance(now:number){
    if(!this.defeated||now-this.maskAt>350)return 0
    const t=Math.max(0,Math.min(1,(now-this.capturedAt-70)/260))
    return t*t*(3-2*t)
  }
  retryCapture(){
    if(this.defeated){this.hits--;this.capturedAt=-Infinity}
  }
  clearMask(){this.mask=null;this.maskWidth=this.maskHeight=0;this.maskAt=-Infinity;this.hurtStarted=-Infinity}
  reset(){this.strike.started=-Infinity;this.hurtStarted=-Infinity;this.capturedAt=-Infinity;this.swings=this.hits=0}
}

export interface MinecraftPose { x:number;y:number;z:number;rx:number;ry:number;rz:number }
/** Mojang Bedrock first_person.attack_rotation reference. Molang trigonometry
 * uses degrees; normalize attack_time and its published rotation factor here.
 * Avatar-bone offsets are converted from 1/16 blocks to renderer units. */
export function minecraftSwing(progress:number,aimX:number,aimY:number,out:MinecraftPose):MinecraftPose {
  const p=Math.max(0,Math.min(1,progress)),factor=sin((1-p)*180)
  const sideways=sin(factor*p*112),arc=sin(factor*(1-p)*(1-p)*280)
  out.x=Math.max(-7,-15.5*sideways)*sideways/16
  out.y=(sin(factor*(1-p)*(1-p)*200)*7.5-factor*p*15)/16
  out.z=sin(factor*p*120)*1.75/16
  const direction=Math.sin(p*Math.PI)
  out.rx=(-60*arc+aimY*12*direction)*degrees
  out.ry=(40*arc+aimX*14*direction)*degrees
  out.rz=20*arc*degrees
  return out
}
