import type { ARHit, ARVector, EightWall } from './minecraft-ar-engine'

export interface MinecraftFloorHit {position:ARVector;source:'surface'|'feature-plane'}
const valid=(p:ARVector)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)
const acceptable=(hit:ARHit,camera:ARVector)=>valid(hit.position)&&hit.position.y<camera.y-.15&&hit.distance>=.15&&hit.distance<=8

/** Only tracked horizontal surfaces or a coplanar cluster of real feature
 * points are accepted. There is no screen-space/imaginary-floor fallback. */
export function findMinecraftFloor(engine:EightWall,x:number,y:number,camera:ARVector):MinecraftFloorHit|null {
  const center=engine.XrController.hitTest(x,y)
  for(const hit of center){
    if(!acceptable(hit,camera)||!['DETECTED_SURFACE','ESTIMATED_SURFACE'].includes(hit.type))continue
    const q=hit.rotation
    if(!q||!Number.isFinite(q.w))continue
    // Dot of the rotated surface normal with gravity-aligned world up.
    const vertical=1-2*(q.x*q.x+q.z*q.z)
    if(!Number.isFinite(vertical)||vertical<.9)continue
    return {position:{...hit.position},source:'surface'}
  }
  const first=center.find(hit=>hit.type==='FEATURE_POINT'&&acceptable(hit,camera))
  if(!first)return null
  const points:ARVector[]=[first.position]
  for(const [dx,dy] of [[-.07,0],[.07,0],[0,-.05],[0,.05]]){
    const px=x+dx!,py=y+dy!
    if(px<0||px>1||py<0||py>1)continue
    const hit=engine.XrController.hitTest(px,py,['FEATURE_POINT']).find(item=>acceptable(item,camera)&&Math.abs(item.position.y-first.position.y)<.08)
    if(hit)points.push(hit.position)
  }
  if(points.length<3)return null
  // A horizontal patch must span two independent ground directions; a row of
  // points along a wall or a single repeated feature cannot qualify.
  let area=0,normalX=0,normalY=0,normalZ=0
  for(let a=1;a<points.length;a++)for(let b=a+1;b<points.length;b++){
    const p=points[a]!,q=points[b]!,o=points[0]!
    const ux=p.x-o.x,uy=p.y-o.y,uz=p.z-o.z,vx=q.x-o.x,vy=q.y-o.y,vz=q.z-o.z
    const projected=Math.abs(ux*vz-uz*vx)
    if(projected>area){area=projected;normalX=uy*vz-uz*vy;normalY=uz*vx-ux*vz;normalZ=ux*vy-uy*vx}
  }
  if(area<.0025)return null
  const length=Math.hypot(normalX,normalY,normalZ)
  if(Math.abs(normalY)/length<.94)return null
  for(const point of points){
    const error=Math.abs(normalX*(point.x-first.position.x)+normalY*(point.y-first.position.y)+normalZ*(point.z-first.position.z))/length
    if(error>.025)return null
  }
  return {position:{...first.position},source:'feature-plane'}
}
