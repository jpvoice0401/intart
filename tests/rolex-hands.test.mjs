import {test} from 'node:test'
import assert from 'node:assert/strict'
import {WatchHandIdentities,projectWatchHand,selectWatchTip,watchHandMask,drawWatchForeground} from '../src/rolex-hands.ts'
import {WatchMechanism} from '../src/rolex-model.ts'
import {RolexRenderer} from '../src/rolex-renderer.ts'
import {WatchDialControl} from '../src/rolex-control.ts'

function hand(dx=0,dy=0){
  return [[.5,.75],[.43,.7],[.38,.6],[.32,.55],[.26,.5],
    [.42,.55],[.41,.4],[.4,.3],[.4,.22],[.5,.5],[.5,.34],[.5,.23],[.5,.14],
    [.57,.53],[.59,.36],[.6,.26],[.6,.18],[.64,.58],[.67,.45],[.68,.37],[.69,.3]]
    .map(([x,y])=>({x:x+dx,y:y+dy,z:0}))
}
const pose={x:320,y:240,a:60,b:0,c:0,d:60,radius:60}

test('wearing wrist and interacting hand retain identity when MediaPipe reverses result order',()=>{
  const ids=new WatchHandIdentities()
  const initial=ids.update([hand(),hand(-.25,-.1)],['Left','Right'],0)
  const reversed=ids.update([hand(-.24,-.1),hand(.01,0)],['Right','Left'],33)
  assert.equal(reversed[1].id,initial[0].id)
  assert.equal(reversed[0].id,initial[1].id)
})

test('an opposite hand approaching the wrist cannot steal the wearer identity, even during occlusion',()=>{
  const ids=new WatchHandIdentities()
  const [owner]=ids.update([hand()],['Left'],0)
  const [other]=ids.update([hand(.01,0)],['Right'],33)
  assert.notEqual(other.id,owner.id)
  const reappeared=ids.update([hand(.015,0),hand()],['Right','Left'],300)
  assert.equal(reappeared[0].id,other.id)
  assert.equal(reappeared[1].id,owner.id)
})

test('index fingertip takes contact priority and keeps its grip through result reordering',()=>{
  const thumb={id:'other:4',tip:4,x:350,y:210,sampledAt:0}
  const index={id:'other:8',tip:8,x:335,y:200,sampledAt:0}
  assert.equal(selectWatchTip([thumb,index],pose,null).tip.id,index.id)
  assert.equal(selectWatchTip([index,thumb],pose,thumb.id).tip.id,thumb.id)
  assert.equal(selectWatchTip([{...index,x:800}],pose,null),null)
})

test('a fingertip pad touching just beyond the bezel can grab and rotate the minute hand',()=>{
  const watch=new WatchMechanism(),before=watch.seconds
  const a={id:'index',tip:8,x:320,y:240-60*1.15,sampledAt:0}
  const b={...a,x:320+60*1.15*Math.sin(.4),y:240-60*1.15*Math.cos(.4),sampledAt:.05}
  for(const tip of [a,b]){
    const selected=selectWatchTip([tip],pose,watch.gripId)
    assert.ok(selected)
    assert.equal(watch.sample(tip.id,selected.local,tip.sampledAt),true)
  }
  assert.ok(watch.seconds>before)
})

test('foreground mask follows all five real fingers and the mirrored camera cover transform',()=>{
  const points=projectWatchHand(hand(),400,800,{x:.3,y:1})
  assert.equal(points[0].x,200)
  assert.equal(points[0].y,600)
  assert.ok(points[8].x>200,'camera mirroring must apply to both touch and occlusion')
  const mask=watchHandMask(points)
  assert.equal(mask.segments.length,15)
  for(const index of [4,8,12,16,20])assert.ok(mask.segments.some(segment=>segment.to===points[index]))
  assert.ok(mask.segments.every(segment=>segment.startRadius>=segment.endRadius&&segment.endRadius>0))
  assert.equal(watchHandMask([]),null)
})

function contextRecorder(){
  const calls=[]
  const context=new Proxy({calls,globalAlpha:1},{get(target,key){
    if(key in target)return target[key]
    if(key==='createLinearGradient'||key==='createRadialGradient')return()=>({addColorStop(){}})
    return(...args)=>calls.push({method:key,args})
  }})
  return context
}

test('foreground composition intersects the watch and hand masks before restoring camera pixels',()=>{
  const context=contextRecorder(),video={readyState:2,videoWidth:1280,videoHeight:720}
  const mask=watchHandMask(projectWatchHand(hand(),640,480,{x:1,y:1}))
  drawWatchForeground(context,video,pose,[mask],640,480)
  const clips=context.calls.map((call,i)=>call.method==='clip'?i:-1).filter(i=>i>=0)
  const draw=context.calls.findIndex(call=>call.method==='drawImage')
  assert.equal(clips.length,2)
  assert.ok(draw>clips[1])
  assert.deepEqual(context.calls.find(call=>call.method==='scale').args,[-1,1])
  assert.equal(context.calls[draw].args[0],video)
  assert.equal(context.calls.at(-1).method,'restore')
})

test('renderer draws the opposite hand video after the watch, so the finger cannot hide behind the dial',()=>{
  const keys=['document','ResizeObserver','devicePixelRatio']
  const previous=keys.map(key=>Object.getOwnPropertyDescriptor(globalThis,key))
  const canvases=[]
  Object.defineProperties(globalThis,{
    document:{configurable:true,value:{createElement(){
      const context=contextRecorder(),canvas={width:1,height:1,tabIndex:0,setAttribute(){},remove(){},getContext(){return context},context}
      canvases.push(canvas);return canvas
    }}},
    ResizeObserver:{configurable:true,value:class{observe(){}disconnect(){}}},
    devicePixelRatio:{configurable:true,value:1},
  })
  let renderer
  try{
    renderer=new RolexRenderer({clientWidth:640,clientHeight:480,prepend(){}})
    const video={readyState:2,videoWidth:1280,videoHeight:720},watch=new WatchMechanism()
    const mask=watchHandMask(projectWatchHand(hand(),640,480,{x:1,y:1}))
    const context=renderer.canvas.context
    renderer.render(video,true,pose,watch,1,1,null,[mask])
    const images=context.calls.filter(call=>call.method==='drawImage').map(call=>call.args[0])
    assert.equal(images[0],video,'camera background is the first layer')
    assert.notEqual(images[1],video,'bracelet renders above the background')
    assert.notEqual(images[2],video,'watch case renders above the background')
    assert.equal(images.at(-1),video,'real opposite fingers must be the final watch-area layer')
    assert.equal(images.filter(source=>source===video).length,2)
    context.calls.length=0
    renderer.render(video,true,pose,watch,1,1,null,[])
    assert.equal(context.calls.filter(call=>call.method==='drawImage'&&call.args[0]===video).length,1,'wearer alone must not erase the watch')
    context.calls.length=0
    const control=new WatchDialControl(watch)
    control.update([{id:'other:8',tip:8,x:320,y:210,sampledAt:1}],pose,1)
    assert.ok(control.visual,'bringing the other fingertip near the wrist must generate a hand')
    renderer.render(video,true,pose,watch,1,1,null,[mask],control.visual)
    const lastVideo=context.calls.findLastIndex(call=>call.method==='drawImage'&&call.args[0]===video)
    const afterVideo=context.calls.slice(lastVideo+1)
    assert.ok(afterVideo.some(call=>call.method==='lineTo'&&call.args[0]===control.visual.tip.x&&call.args[1]===control.visual.tip.y),'generated watch needle must reach the fingertip above its video layer')
    assert.ok(afterVideo.some(call=>call.method==='fill'),'generated watch needle must remain visible even if a palm covers the dial')
  }finally{
    renderer?.destroy()
    keys.forEach((key,i)=>{if(previous[i])Object.defineProperty(globalThis,key,previous[i]);else delete globalThis[key]})
  }
})
