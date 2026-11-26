// Numeric skeleton and mesh validation only: no server, camera or WebGL context.
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import * as THREE from 'three'
import {SabrinaState,sabrinaHead} from '../src/sabrina-model.ts'
import {SabrinaBodyTracker,sabrinaFacePatch,sb3} from '../src/sabrina-body3d.ts'
import {SabrinaWardrobe} from '../src/sabrina-wardrobe.ts'
import {SABRINA_DRESSES,SABRINA_HAIR,SabrinaLookDeck} from '../src/sabrina-styles.ts'
import {SabrinaTurnTracker} from '../src/sabrina-turn.ts'

function rotation(angle,aspect=1,{occluded=false}={}){
  const world=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:1}))
  for(const [i,x,y,z]of [[0,0,-.75,-.13],[7,-.08,-.75,0],[8,.08,-.75,0],[11,-.2,-.45,0],[12,.2,-.45,0],[13,-.26,-.16,0],[14,.26,-.16,0],[15,-.29,.06,0],[16,.29,.06,0],[23,-.14,0,0],[24,.14,0,0],[25,-.1,.34,0],[26,.1,.34,0],[27,-.1,.75,0],[28,.1,.75,0],[29,-.1,.81,.03],[30,.1,.81,.03],[31,-.1,.82,-.15],[32,.1,.82,-.15]])world[i]={x,y,z,visibility:1}
  const turn=p=>({x:p.x*Math.cos(angle)-p.z*Math.sin(angle),y:p.y,z:p.x*Math.sin(angle)+p.z*Math.cos(angle),visibility:p.visibility??1})
  for(let i=0;i<world.length;i++)world[i]=turn(world[i])
  const project=p=>({x:.5+p.x*.42/aspect,y:.46+p.y*.42,z:p.z*.42/aspect,visibility:p.visibility})
  const points=world.map(project)
  if(occluded){points[12].visibility=.08;points[28].visibility=.1;points[32].visibility=.1}
  const face=Array.from({length:478},()=>project(turn({x:0,y:-.75,z:-.10})))
  for(const [i,x,y,z]of [[10,0,-.86,-.1],[152,0,-.64,-.1],[234,-.08,-.75,-.1],[454,.08,-.75,-.1]])face[i]=project(turn({x,y,z}))
  return{world,points,face}
}
function bodyAt(tracker,angle,aspect=1,options={}){
  const sample=rotation(angle,aspect,options)
  const head=Math.cos(angle)>.7?sabrinaHead(sample.face,aspect):null
  const frame=tracker.fit(sample.points,sample.world,head,aspect)
  assert.ok(frame,`missing body at ${angle*180/Math.PI} degrees`)
  return{frame,sample}
}

test('two complete turns retain size, depth, orientation and a continuous yaw',()=>{
  for(const aspect of [.56,1,1.78]){
    const tracker=new SabrinaBodyTracker();let previous=-.01,width=0
    for(let step=0;step<=96;step++){
      const angle=step/96*Math.PI*4,{frame}=bodyAt(tracker,angle,aspect)
      width ||= frame.body.width
      assert.ok(frame.body.width>width*.85&&frame.body.width<width*1.15)
      assert.ok(Math.abs(frame.yaw-angle)<.015)
      assert.ok(frame.yaw>=previous-.015);previous=frame.yaw
      for(const axis of [frame.right,frame.down,frame.front])assert.ok(Math.abs(sb3.length(axis)-1)<1e-6)
      assert.ok(Math.abs(sb3.dot(frame.right,frame.down))<1e-6)
    }
  }
})

test('tracked body turns advance both outfit pieces once per revolution',()=>{
  for(const direction of [-1,1]){
    const tracker=new SabrinaBodyTracker(),turns=new SabrinaTurnTracker(),deck=new SabrinaLookDeck(()=>.49)
    let look=deck.next(),changes=0
    for(let step=0;step<=96;step++){
      const {frame}=bodyAt(tracker,direction*step/96*Math.PI*4)
      if(turns.update(frame.yaw,step*60)){
        const next=deck.next()
        assert.notEqual(next.dress,look.dress);assert.notEqual(next.hair,look.hair)
        look=next;changes++
      }
    }
    assert.equal(changes,2)
  }
})
test('an occluded far shoulder and foot do not remove a side-view outfit',()=>{
  const tracker=new SabrinaBodyTracker();bodyAt(tracker,0)
  const {frame}=bodyAt(tracker,Math.PI*.5,1,{occluded:true})
  assert.ok(frame.body.width>.1);assert.equal(frame.body.fullBody,true)
  assert.ok(Math.abs(frame.right.z)>.95)
})
test('back views do not restore a cached front face; profiles still have a face patch',()=>{
  const tracker=new SabrinaBodyTracker()
  const front=bodyAt(tracker,0).frame,side=bodyAt(tracker,Math.PI*.5).frame,back=bodyAt(tracker,Math.PI).frame
  assert.ok(sabrinaFacePatch(front.head,1).length>=3)
  assert.ok(sabrinaFacePatch(side.head,1).length>=3)
  assert.equal(sabrinaFacePatch(back.head,1).length,0)
})
test('a transformed state keeps fitting the body when face tracking disappears',()=>{
  const state=new SabrinaState(),first=rotation(0)
  state.receive({task:'pose',points:first.points,world:first.world,person:null},0,1)
  state.receive({task:'face',points:first.face},0,1);state.update(0,.016,1)
  assert.equal(state.activate(0,1),true)
  for(let step=1;step<=48;step++){
    const now=step*60,sample=rotation(step/48*Math.PI*2)
    state.receive({task:'pose',points:sample.points,world:sample.world,person:null},now,1)
    state.receive({task:'face',points:null},now,1);state.update(now,.06,1)
    assert.equal(state.tracking(now),true);assert.equal(state.transformed,true)
    assert.equal(state.faceVisible(now),false)
  }
})
test('brief pose dropout retains the costume, prolonged loss hides fitting and reacquisition resumes it',()=>{
  const state=new SabrinaState(),sample=rotation(0)
  state.receive({task:'pose',points:sample.points,world:sample.world,person:null},0,1)
  state.receive({task:'face',points:sample.face},0,1);state.update(0,.016,1);state.activate(0,1)
  state.receive({task:'pose',points:null,world:null,person:null},200,1);state.update(250,.05,1)
  assert.equal(state.tracking(250),true)
  state.update(800,.05,1);assert.equal(state.tracking(800),false);assert.equal(state.transformed,true)
  const rear=rotation(Math.PI)
  state.receive({task:'pose',points:rear.points,world:rear.world,person:null},900,1);state.receive({task:'face',points:null},900,1);state.update(900,.1,1)
  assert.equal(state.tracking(900),true);assert.equal(state.transformed,true)
})
test('the skirt stays volumetric at every angle, all radial seams meet and mesh buffers are reused',()=>{
  const wardrobe=new SabrinaWardrobe(new THREE.Vector2(1,1));wardrobe.loaded=true
  wardrobe.profile=JSON.parse(readFileSync(new URL('../public/sabrina/surface-profile.json',import.meta.url),'utf8'))
  const tracker=new SabrinaBodyTracker(),positions=wardrobe.dress.positions
  const ray=new THREE.Ray(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),hit=new THREE.Vector3()
  let frontWidth=0
  for(let step=0;step<=16;step++){
    const {frame,sample}=bodyAt(tracker,step/16*Math.PI*2)
    const state={frame,pose:sample.points,tracking:()=>true}
    assert.equal(wardrobe.update(state,1000,1,1),true)
    assert.equal(wardrobe.dress.positions,positions)
    for(const part of wardrobe.parts){
      if(!part.mesh.visible)continue
      assert.ok(part.positions.every(Number.isFinite));assert.ok(part.normals.every(Number.isFinite))
      for(let row=0;row<=part.rows;row++)for(let channel=0;channel<3;channel++){
        const first=row*(part.segments+1)*3+channel,last=first+part.segments*3
        assert.ok(Math.abs(part.positions[first]-part.positions[last])<1e-6,'open radial seam')
      }
    }
    const dress=wardrobe.dress,geometry=dress.mesh.geometry
    geometry.computeBoundingBox();const width=geometry.boundingBox.max.x-geometry.boundingBox.min.x
    if(step===0)frontWidth=width
    assert.ok(width>frontWidth*.65,'skirt collapsed into a flat poster')
    const y=(frame.waist.y+frame.hem.y)*.5,x=(frame.waist.x+frame.hem.x)*.5
    ray.set(new THREE.Vector3(x,y,-5),new THREE.Vector3(0,0,1))
    const vertices=geometry.attributes.position,index=geometry.index
    let intersections=0
    for(let i=0;i<index.count;i+=3){a.fromBufferAttribute(vertices,index.getX(i));b.fromBufferAttribute(vertices,index.getX(i+1));c.fromBufferAttribute(vertices,index.getX(i+2));if(ray.intersectTriangle(a,b,c,false,hit))intersections++}
    assert.ok(intersections>=2,'skirt must have front and rear surfaces along the viewing ray')
  }
  wardrobe.destroy()
})

test('all 25 looks fit front, profile and rear views with distinct cuts and hair details',()=>{
  const wardrobe=new SabrinaWardrobe(new THREE.Vector2(1,1));wardrobe.loaded=true
  wardrobe.profile=JSON.parse(readFileSync(new URL('../public/sabrina/surface-profile.json',import.meta.url),'utf8'))
  const buffers=wardrobe.parts.map(part=>part.positions),skirtWidths=[],hairLengths=[]
  for(let dress=0;dress<SABRINA_DRESSES.length;dress++)for(let hair=0;hair<SABRINA_HAIR.length;hair++){
    wardrobe.setLook({dress,hair})
    const tracker=new SabrinaBodyTracker()
    for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5,Math.PI*2]){
      const {frame,sample}=bodyAt(tracker,angle)
      assert.ok(wardrobe.update({frame,pose:sample.points,tracking:()=>true},1000,1,1))
      for(let i=0;i<wardrobe.parts.length;i++){
        const part=wardrobe.parts[i]
        assert.equal(part.positions,buffers[i])
        if(part.mesh.visible){assert.ok(part.positions.every(Number.isFinite));assert.ok(part.normals.every(Number.isFinite))}
      }
      const detailCount=wardrobe.hairDetail.filter(part=>part.mesh.visible).length
      assert.equal(detailCount,hair<2?0:hair===2?3:1)
      assert.equal(wardrobe.dress.mesh.material.uniforms.uStyle.value,dress)
      assert.equal(wardrobe.hair.mesh.material.uniforms.uStyle.value,hair)
      if(angle===0){
        wardrobe.dress.mesh.geometry.computeBoundingBox();wardrobe.hair.mesh.geometry.computeBoundingBox()
        if(hair===0)skirtWidths.push(wardrobe.dress.mesh.geometry.boundingBox.max.x-wardrobe.dress.mesh.geometry.boundingBox.min.x)
        if(dress===0)hairLengths.push(wardrobe.hair.mesh.geometry.boundingBox.max.y-wardrobe.hair.mesh.geometry.boundingBox.min.y)
      }
    }
  }
  assert.equal(new Set(skirtWidths.map(width=>width.toFixed(4))).size,5)
  assert.equal(new Set(hairLengths.map(length=>length.toFixed(4))).size,5)
  wardrobe.destroy()
})

test('a style cycle visits all 25 pairs and changes both pieces at every cast',()=>{
  for(const random of [()=>0,()=>.49,()=>.999,Math.random]){
    const deck=new SabrinaLookDeck(random)
    let previous
    for(let cycle=0;cycle<3;cycle++){
      const seen=new Set()
      for(let i=0;i<25;i++){
        const look=deck.next()
        assert.ok(SABRINA_DRESSES[look.dress]);assert.ok(SABRINA_HAIR[look.hair])
        if(previous){assert.notEqual(look.dress,previous.dress);assert.notEqual(look.hair,previous.hair)}
        seen.add(`${look.dress}:${look.hair}`);previous=look
      }
      assert.equal(seen.size,25)
    }
  }
})

test('each style changes the mesh shape, and rear hair details remain attached during a turn',()=>{
  const wardrobe=new SabrinaWardrobe(new THREE.Vector2(1,1));wardrobe.loaded=true
  wardrobe.profile=JSON.parse(readFileSync(new URL('../public/sabrina/surface-profile.json',import.meta.url),'utf8'))
  const tracker=new SabrinaBodyTracker(),dresses=new Set(),hair=new Set()
  for(let style=0;style<5;style++){
    wardrobe.setLook({dress:style,hair:style})
    const front=bodyAt(tracker,0)
    wardrobe.update({frame:front.frame,pose:front.sample.points,tracking:()=>true},1000,1,1)
    const hemSide=(wardrobe.dress.rows*(wardrobe.dress.segments+1)+wardrobe.dress.segments/4)*3
    dresses.add(wardrobe.dress.positions[hemSide])
    hair.add(wardrobe.hair.positions[wardrobe.hair.positions.length-2])
    assert.equal(wardrobe.hairDetail.filter(part=>part.mesh.visible).length,[0,0,3,1,1][style])
    for(const angle of [Math.PI*.5,Math.PI,Math.PI*1.5,Math.PI*2]){
      const view=bodyAt(tracker,angle)
      assert.ok(wardrobe.update({frame:view.frame,pose:view.sample.points,tracking:()=>true},1000,1,1))
      assert.deepEqual(wardrobe.look,{dress:style,hair:style})
      assert.ok(wardrobe.parts.every(part=>part.positions.every(Number.isFinite)))
      for(const part of wardrobe.hairDetail.filter(part=>part.mesh.visible)){
        const middle=Math.floor(part.rows/2)*(part.segments+1)*3
        const offset=sb3.sub({x:part.positions[middle],y:part.positions[middle+1],z:part.positions[middle+2]},view.frame.head.center)
        assert.ok(sb3.dot(offset,view.frame.head.front)<0,'hair detail must be behind the tracked head')
      }
    }
  }
  assert.equal(dresses.size,5);assert.equal(hair.size,5)
  wardrobe.destroy()
})
