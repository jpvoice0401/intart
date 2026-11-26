import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { FOREST_ANIMALS } from './animal-forest-model.ts'

/** Original toy-like geometry; no game screenshots, logos or third-party models. */
export class ForestArt {
  private geometries = new Set<THREE.BufferGeometry>()
  private materials = new Map<number,THREE.MeshStandardMaterial>()
  private sphere = this.keep(new THREE.SphereGeometry(1,14,10))
  private box = this.keep(new THREE.BoxGeometry(1,1,1))
  private cone = this.keep(new THREE.ConeGeometry(1,1,7))
  private cylinder = this.keep(new THREE.CylinderGeometry(1,1,1,10))
  keep<T extends THREE.BufferGeometry>(geometry:T):T {this.geometries.add(geometry);return geometry}
  material(color:number) {
    let material=this.materials.get(color)
    if(!material){material=new THREE.MeshStandardMaterial({color,roughness:.88});this.materials.set(color,material)}
    return material
  }
  mesh(parent:THREE.Object3D,geometry:THREE.BufferGeometry,color:number,p:number[],s:number[]) {
    const mesh=new THREE.Mesh(geometry,this.material(color));mesh.position.set(p[0]!,p[1]!,p[2]!);mesh.scale.set(s[0]!,s[1]!,s[2]!);parent.add(mesh);return mesh
  }
  ball(parent:THREE.Object3D,color:number,p:number[],s:number[]){return this.mesh(parent,this.sphere,color,p,s)}
  block(parent:THREE.Object3D,color:number,p:number[],s:number[]){return this.mesh(parent,this.box,color,p,s)}
  peak(parent:THREE.Object3D,color:number,p:number[],s:number[]){return this.mesh(parent,this.cone,color,p,s)}
  pole(parent:THREE.Object3D,color:number,p:number[],s:number[]){return this.mesh(parent,this.cylinder,color,p,s)}
  curve(parent:THREE.Object3D,color:number,points:number[][],radius:number) {
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p[0],p[1],p[2])))
    return this.mesh(parent,this.keep(new THREE.TubeGeometry(curve,16,radius,5,false)),color,[0,0,0],[1,1,1])
  }
  /** All parts of one toy move together; batch matching colors into one draw. */
  private batch(group:THREE.Group){
    const buckets=new Map<THREE.Material,THREE.BufferGeometry[]>()
    for(const child of [...group.children]){
      if(!(child instanceof THREE.Mesh)||Array.isArray(child.material))continue
      child.updateMatrix()
      const geometry=child.geometry.clone().applyMatrix4(child.matrix)
      const bucket=buckets.get(child.material)??[];bucket.push(geometry);buckets.set(child.material,bucket);group.remove(child)
    }
    for(const [material,parts] of buckets){
      const geometry=mergeGeometries(parts)
      if(geometry)group.add(new THREE.Mesh(this.keep(geometry),material))
      for(const part of parts)part.dispose()
    }
    return group
  }
  animal(index:number) {
    const spec=FOREST_ANIMALS[index]!,g=new THREE.Group(),skin=spec.color,cream=0xffedcf,dark=0x353330
    if(index!==5){
      this.ball(g,spec.coat,[0,.32,0],[.22,.27,.17])
      for(const sign of [-1,1]){
        this.ball(g,skin,[sign*.24,.35,.015],[.075,.16,.075]).rotation.z=sign*.3
        this.ball(g,index===1||index===6?0x59463c:skin,[sign*.11,.075,.055],[.085,.09,.115])
      }
    }else{
      this.curve(g,skin,[[-.19,.09,.05],[.15,.09,.15],[.25,.16,-.04],[-.12,.19,-.09],[-.15,.32,.03],[0,.5,.02]],.13)
      this.ball(g,0xd8e5ae,[0,.35,.12],[.12,.2,.04])
    }
    const head=this.ball(g,skin,[0,.76,.02],[.3,index===6?.32:.28,.25])
    head.userData.animal=index
    if(index!==9){
      this.ball(g,index===11?0xe48f9b:cream,[0,.665,.245],[index===1||index===11?.15:.12,.09,index===6?.18:.075])
      if(index===1||index===11){for(const sign of [-1,1])this.ball(g,0x965f61,[sign*.055,.68,index===11?.318:.313],[.023,.027,.015])}
      else this.ball(g,dark,[0,.7,index===6?.42:.32],[.035,.025,.022])
    }else{
      this.peak(g,0xf2b150,[0,.7,.32],[.09,.17,.085]).rotation.x=Math.PI/2
      for(let i=0;i<3;i++)this.ball(g,0xe37b6d,[(i-1)*.085,1.055,.02],[.06,.1,.065])
      this.ball(g,0xe37b6d,[0,.58,.27],[.05,.075,.04])
    }
    for(const sign of [-1,1]){
      this.ball(g,0xfffbec,[sign*.108,.81,.243],[.064,.074,.026])
      this.ball(g,dark,[sign*.108,.8,.268],[.037,.046,.017])
      this.ball(g,0xffffff,[sign*.108-.01,.817,.284],[.013,.015,.009])
      this.ball(g,0xf0b1a4,[sign*.19,.69,.237],[.04,.025,.012])
      if(index===3){
        this.ball(g,skin,[sign*.135,1.15,0],[.085,.3,.065]).rotation.z=-sign*.12
        this.ball(g,0xeab4ae,[sign*.135,1.17,.053],[.043,.21,.022]).rotation.z=-sign*.12
      }else if(index===1||index===4){
        this.ball(g,skin,[sign*.28,.89,0],[.13,.085,.08])
        this.peak(g,0xf2dbab,[sign*.21,1.08,-.02],[.065,.23,.065]).rotation.z=-sign*.35
      }else if(index===6){
        this.ball(g,skin,[sign*.16,1.065,0],[.065,.16,.055])
      }else if(index===10){
        this.ball(g,0x9a7252,[sign*.265,.79,-.005],[.11,.2,.08]).rotation.z=sign*.15
      }else if(index===11){
        this.peak(g,skin,[sign*.19,1,.01],[.13,.18,.09]).rotation.z=-sign*.3
      }else if(index!==5&&index!==9){
        this.ball(g,skin,[sign*.245,.98,0],[.11,.115,.07])
        this.ball(g,index===8?cream:0xdab5b0,[sign*.245,.985,.055],[.065,.07,.025])
      }
    }
    if(index===0)this.curve(g,0xd7abae,[[0,.2,-.12],[.17,.17,-.35],[.35,.28,-.3],[.3,.36,-.25]],.025)
    if(index===2){
      for(const sign of [-1,1])for(let i=0;i<2;i++)this.block(g,dark,[sign*.255,.82-i*.09,.15],[.085,.025,.045]).rotation.z=-sign*.2
      for(let i=0;i<3;i++)this.block(g,dark,[(i-1)*.07,.985,.13],[.025,.07,.04])
      this.curve(g,skin,[[0,.2,-.1],[.12,.19,-.3],[.23,.4,-.3]],.045)
    }
    if(index===4){
      for(const sign of [-1,1])this.peak(g,0xe4c986,[sign*.28,.4,-.08],[.16,.32,.055]).rotation.z=-sign*.65
      for(let i=0;i<3;i++)this.peak(g,0xe4c986,[0,.2+i*.12,-.2],[.05,.08,.08]).rotation.x=-.6
    }
    if(index===5)this.curve(g,0xdc8c8c,[[0,.66,.32],[0,.65,.42],[.035,.64,.45]],.011)
    if(index===6){for(let i=0;i<5;i++)this.ball(g,0x6c4d41,[0,1.02-i*.12,-.16],[.08,.095,.12])}
    if(index===7){
      for(let i=0;i<8;i++){const a=i*Math.PI/4;this.ball(g,skin,[Math.sin(a)*.25,.77+Math.cos(a)*.25,-.05],[.13,.13,.12])}
      for(const sign of [-1,1])this.curve(g,0xc7aa80,[[sign*.26,.88,.03],[sign*.36,.99,.07],[sign*.4,.85,.13],[sign*.3,.8,.15]],.05)
    }
    if(index===8)this.curve(g,skin,[[0,.2,-.1],[-.17,.21,-.34],[-.34,.44,-.31],[-.21,.52,-.3]],.04)
    if(index===9){for(let i=0;i<3;i++)this.ball(g,[0x87aca0,0xe1bd77,0xd99c96][i]!,[(i-1)*.09,.4,-.18],[.065,.23,.055]).rotation.x=-.5}
    if(index===10)this.ball(g,skin,[.15,.25,-.21],[.065,.065,.18]).rotation.x=.7
    if(index===11)this.curve(g,skin,[[0,.2,-.15],[.1,.22,-.28],[.14,.31,-.26],[.07,.32,-.25]],.025)
    g.userData.animal=index
    return this.batch(g)
  }
  tree(kind:number) {
    const g=new THREE.Group()
    this.pole(g,0x927553,[0,.3,0],[.085,.6,.085])
    if(kind===0){
      this.peak(g,0x315e4d,[0,.67,0],[.38,.65,.38]);this.peak(g,0x4c8060,[0,.96,0],[.3,.55,.3]);this.peak(g,0x75a473,[0,1.2,0],[.2,.43,.2])
    }else{
      const colors=kind===1?[0xe6abb8,0xf3c2cc,0xd998b1]:[0x6fa06a,0x91b779,0x568c65]
      for(let i=0;i<4;i++){const a=i*Math.PI*.5;this.ball(g,colors[i%3]!,[Math.sin(a)*.22,.8+(i%2)*.16,Math.cos(a)*.2],[.36,.34,.32])}
      if(kind===2)for(const x of [-.22,0,.22])this.ball(g,0xf0b18c,[x,.72,.29],[.085,.09,.085])
    }
    return this.batch(g)
  }
  house(index:number) {
    const g=new THREE.Group(),wall=[0xf2d6a9,0xe2baab,0xdbe0bf,0xd8c6af][index%4]!,roof=[0xc27b67,0x769e9c,0x9e8ba7,0xd1a66e][index%4]!
    this.block(g,wall,[0,.28,0],[.63,.55,.54])
    const cap=this.peak(g,roof,[0,.73,0],[.56,.38,.5]);cap.geometry=this.keep(new THREE.ConeGeometry(1,1,4));cap.rotation.y=Math.PI/4
    this.block(g,0x91785e,[0,.2,.284],[.16,.34,.035])
    this.ball(g,0xf1d69a,[.055,.19,.31],[.016,.016,.016])
    for(const x of [-.22,.22]){
      this.block(g,0x8f977b,[x,.32,.278],[.13,.16,.025]);this.block(g,0xffdf94,[x,.32,.295],[.095,.12,.014])
      this.block(g,wall,[x,.32,.305],[.012,.13,.01])
    }
    this.block(g,0xb4a381,[0,.015,.39],[.27,.035,.17])
    this.block(g,0x9c8e81,[.21,.8,-.12],[.095,.3,.1])
    return this.batch(g)
  }
  flower(index:number) {
    const g=new THREE.Group(),colors=[0xf0acba,0xffdfa2,0xc6b4e7,0xe9f2dc,0xefb68e]
    this.pole(g,0x6a9960,[0,.09,0],[.012,.18,.012])
    this.ball(g,0x72a268,[.05,.07,0],[.065,.018,.025]).rotation.z=.35
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5;this.ball(g,colors[index%5]!,[Math.sin(a)*.052,.18,Math.cos(a)*.052],[.045,.025,.045])}
    this.ball(g,0xffd378,[0,.2,0],[.027,.022,.027]);return this.batch(g)
  }
  destroy(){for(const g of this.geometries)g.dispose();for(const m of this.materials.values())m.dispose();this.geometries.clear();this.materials.clear()}
}
