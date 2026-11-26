const FULL_TURN=Math.PI*2
// Allow a small pose-estimation error when returning to the starting direction.
const TURN_TOLERANCE=Math.PI/36

/** Signed rotation prevents left/right swaying from adding up to a turn. */
export class SabrinaTurnTracker {
  private previous:number|null=null
  private at=-Infinity
  private rotation=0
  private minimum=0
  private maximum=0

  update(yaw:number|null,now:number):boolean {
    if(yaw===null||!Number.isFinite(yaw)||!Number.isFinite(now)){this.reset();return false}
    if(this.previous===null||now<this.at||now-this.at>650){
      this.reset();this.previous=yaw;this.at=now;return false
    }
    const delta=Math.atan2(Math.sin(yaw-this.previous),Math.cos(yaw-this.previous))
    this.previous=yaw;this.at=now
    // A discontinuous pose estimate cannot establish a physical turn.
    if(Math.abs(delta)>Math.PI/2){this.rotation=this.minimum=this.maximum=0;return false}
    this.rotation+=delta
    this.minimum=Math.min(this.minimum,this.rotation)
    this.maximum=Math.max(this.maximum,this.rotation)
    if(Math.max(this.rotation-this.minimum,this.maximum-this.rotation)<FULL_TURN-TURN_TOLERANCE)return false
    this.rotation=this.minimum=this.maximum=0
    return true
  }

  reset(){this.previous=null;this.at=-Infinity;this.rotation=this.minimum=this.maximum=0}
}
