import {test} from 'node:test'
import assert from 'node:assert/strict'
import {WatchMechanism,wristWatchPose,watchLocalPoint,interpolateWatchPose,tickingFrequency} from '../src/rolex-model.ts'
import {watchTickSamples,RolexAudio} from '../src/rolex-audio.ts'

function hand(){
  const landmarks=Array.from({length:21},()=>({x:.5,y:.5,z:0}))
  landmarks[0]={x:.5,y:.65,z:0};landmarks[9]={x:.5,y:.42,z:0}
  landmarks[5]={x:.43,y:.46,z:0};landmarks[17]={x:.58,y:.47,z:0}
  return landmarks
}
const point=(angle,radius=.7)=>({x:Math.sin(angle)*radius,y:-Math.cos(angle)*radius})

test('watch attaches beyond the wrist along the forearm and scales with the hand',()=>{
  const original=hand(),pose=wristWatchPose(original,1280,720,{x:1,y:1})
  assert.ok(pose)
  assert.ok(pose.y>original[0].y*720)
  assert.ok(pose.a*pose.d-pose.b*pose.c>0,'lettering must not be mirrored')
  const smaller=original.map(p=>({x:.5+(p.x-.5)*.6,y:.5+(p.y-.5)*.6,z:p.z*.6}))
  const smallPose=wristWatchPose(smaller,1280,720,{x:1,y:1})
  assert.ok(Math.abs(smallPose.radius/pose.radius-.6)<1e-8)
  assert.equal(wristWatchPose([],1280,720,{x:1,y:1}),null)
  const invalid=hand();invalid[0].x=NaN
  assert.equal(wristWatchPose(invalid,1280,720,{x:1,y:1}),null)
})

test('projected fingertip coordinates invert the wrist plane under rotation and perspective',()=>{
  const pose={x:320,y:240,a:45,b:16,c:-8,d:29,radius:48}
  const local={x:.45,y:-.6}
  const screen={x:pose.x+pose.a*local.x+pose.c*local.y,y:pose.y+pose.b*local.x+pose.d*local.y}
  const actual=watchLocalPoint(screen,pose)
  assert.ok(Math.abs(actual.x-local.x)<1e-12&&Math.abs(actual.y-local.y)<1e-12)
  assert.equal(watchLocalPoint(screen,{...pose,a:0,b:0}),null)
})

test('wrist pose smoothing remains continuous and jumps reset instead of trailing across the screen',()=>{
  const previous={x:100,y:100,a:50,b:0,c:0,d:50,radius:50},next={...previous,x:140,y:120}
  const once=interpolateWatchPose(previous,next,1/30)
  const twice=interpolateWatchPose(interpolateWatchPose(previous,next,1/60),next,1/60)
  assert.ok(Math.abs(once.x-twice.x)<1e-10)
  assert.deepEqual(interpolateWatchPose(previous,{...next,x:900},1/60),{...next,x:900})
})

test('a quarter-turn fingertip gesture advances the minute hand by fifteen minutes',()=>{
  const watch=new WatchMechanism(),before=watch.seconds
  watch.sample('tip',point(0),0);watch.sample('tip',point(Math.PI/2),.1)
  assert.ok(Math.abs(watch.seconds-before-900)<1e-8)
  assert.ok(watch.velocity>0)
  assert.equal(watch.dragging,true)
  assert.equal(watch.gripId,'tip')
})

test('angle wrap and reverse winding never jump a full revolution',()=>{
  const watch=new WatchMechanism(),before=watch.seconds
  watch.sample('tip',point(Math.PI-.05),0);watch.sample('tip',point(-Math.PI+.05),.05)
  assert.ok(Math.abs(watch.seconds-before-.1*3600/(2*Math.PI))<1e-8)
  watch.sample('tip',point(Math.PI-.05),.1)
  assert.ok(Math.abs(watch.seconds-before)<1e-8)
  assert.ok(watch.velocity<0)
})

test('faster fingertip rotation produces faster bounded ticking and momentum decays naturally',()=>{
  const slow=new WatchMechanism(),fast=new WatchMechanism()
  for(const [watch,angle]of[[slow,.06],[fast,.8]]){watch.sample('tip',point(0),0);watch.sample('tip',point(angle),.1);watch.release()}
  assert.ok(tickingFrequency(fast.velocity)>tickingFrequency(slow.velocity)*2)
  assert.equal(tickingFrequency(0),2)
  assert.equal(tickingFrequency(10000),30)
  assert.equal(tickingFrequency(-5),tickingFrequency(5))
  assert.equal(tickingFrequency(NaN),2)
  const initial=fast.velocity
  for(let i=0;i<120;i++)fast.update(1/60,.1+i/60)
  assert.ok(fast.velocity<initial*.04)
})

test('inertial winding is independent of 30 vs 60 fps rendering',()=>{
  const a=new WatchMechanism(),b=new WatchMechanism()
  a.fling(15);b.fling(15)
  for(let i=0;i<60;i++)a.update(1/60,i/60)
  for(let i=0;i<30;i++)b.update(1/30,i/30)
  assert.ok(Math.abs(a.velocity-b.velocity)<1e-10)
  assert.ok(Math.abs(a.seconds-b.seconds)<1e-6)
})

test('off-dial fingertips and reacquisition gaps do not wind the watch accidentally',()=>{
  const watch=new WatchMechanism(),before=watch.seconds
  assert.equal(watch.sample('tip',{x:2,y:0},0),false)
  watch.sample('tip',point(0),0);watch.sample('tip',point(1),.5)
  assert.equal(watch.seconds,before)
  watch.update(.05,1)
  assert.equal(watch.dragging,false)
  watch.reset()
  assert.equal(watch.velocity,0)
  assert.equal(watch.gripId,null)
})

test('alternating tick and tock buffers are finite, different, short and decay to silence',()=>{
  const tick=watchTickSamples(48000,false),tock=watchTickSamples(48000,true)
  assert.equal(tick.length,Math.ceil(48000*.028))
  assert.notDeepEqual(tick,tock)
  assert.ok(tick.every(value=>Number.isFinite(value)&&Math.abs(value)<1))
  const energy=samples=>samples.reduce((sum,value)=>sum+value*value,0)/samples.length
  assert.ok(energy(tick.slice(-100))<energy(tick.slice(0,100))*.001)
})

test('audio remains safe to stop and dispose before a user gesture unlocks sound',()=>{
  const audio=new RolexAudio()
  audio.setRate(30);audio.setActive(true);audio.setActive(false)
  audio.destroy();audio.destroy()
  assert.equal(audio.enabled,true)
})

test('audio schedules tighter alternating ticks on a faster turn and teardown cancels pending voices',async()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'window')
  const sources=[]
  let closed=0
  class Context {
    sampleRate=48000;currentTime=0;state='running';destination={}
    createGain(){return{gain:{value:0},connect(){},disconnect(){}}}
    createBuffer(){return{copyToChannel(){}}}
    createBufferSource(){const voice={buffer:null,startTime:0,stopped:false,connect(){},disconnect(){},start(time){this.startTime=time},stop(){this.stopped=true}};sources.push(voice);return voice}
    resume(){return Promise.resolve()}
    close(){closed++;return Promise.resolve()}
  }
  Object.defineProperty(globalThis,'window',{value:{AudioContext:Context},configurable:true})
  const audio=new RolexAudio()
  try{
    audio.setActive(true);await audio.unlock()
    assert.equal(sources.length,1)
    audio.setRate(30)
    await new Promise(done=>setTimeout(done,45))
    assert.ok(sources.length>=3)
    assert.ok(sources[2].startTime-sources[1].startTime<.034)
    assert.notEqual(sources[0].buffer,sources[1].buffer)
    const queued=sources.length
    for(let i=0;i<10;i++)audio.setRate(30)
    await new Promise(done=>setTimeout(done,40))
    assert.equal(sources.length,queued,'render frames must not enqueue duplicate ticks at the same audio time')
    audio.destroy()
    assert.ok(sources.every(source=>source.stopped))
    assert.equal(closed,1)
  }finally{audio.destroy();if(original)Object.defineProperty(globalThis,'window',original);else delete globalThis.window}
})
