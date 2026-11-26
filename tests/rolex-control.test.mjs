import {test} from 'node:test'
import assert from 'node:assert/strict'
import {WatchMechanism,wrapWatchAngle,tickingFrequency} from '../src/rolex-model.ts'
import {WatchDialControl} from '../src/rolex-control.ts'

const pose={x:320,y:240,a:30,b:0,c:0,d:30,radius:30}
const tip=(angle,radius,time,id='opposite:8')=>({id,tip:8,x:pose.x+Math.sin(angle)*radius,y:pose.y-Math.cos(angle)*radius,sampledAt:time})
function setup(){const mechanism=new WatchMechanism();return{mechanism,control:new WatchDialControl(mechanism)}}

test('touching the watch center immediately generates a visible control hand',()=>{
  const {mechanism,control}=setup()
  control.update([{id:'other:8',tip:8,x:320,y:240,sampledAt:1}],pose,1)
  assert.equal(control.active,true)
  assert.equal(mechanism.dragging,true)
  assert.ok(control.visual)
  assert.ok(Math.hypot(control.visual.tip.x-320,control.visual.tip.y-240)>=48)
  assert.ok(control.visual.strength>=.3)
})

test('small wrist dials accept a nearby fingertip without requiring an exact hit on the needle',()=>{
  const {mechanism,control}=setup(),small={...pose,a:18,d:18,radius:18}
  control.update([tip(Math.PI/2,52,1)],small,1)
  assert.equal(control.active,true)
  assert.ok(Math.abs(wrapWatchAngle(mechanism.angles.minute-Math.PI/2))<1e-10)
})

test('after capture, two full large circles outside the dial continuously turn real watch hands',()=>{
  const {mechanism,control}=setup()
  control.update([tip(0,30,1)],pose,1)
  const start=mechanism.seconds
  for(let i=1;i<=120;i++){
    const angle=i/120*Math.PI*4,time=1+i/60
    control.update([tip(angle,150,time)],pose,time)
    mechanism.update(1/60,time)
    assert.equal(control.active,true)
    assert.equal(mechanism.dragging,true)
    assert.ok(Math.abs(wrapWatchAngle(mechanism.angles.minute-angle))<.001)
  }
  assert.ok(Math.abs(mechanism.seconds-start-7200)<1)
  assert.ok(tickingFrequency(mechanism.velocity)>8)
  assert.equal(control.visual.tip.x,tip(Math.PI*4,150,3).x)
})

test('fast turns larger than the old angle cutoff still update the visible minute hand',()=>{
  const {mechanism,control}=setup()
  control.update([tip(0,30,1)],pose,1)
  control.update([tip(2.4,100,1.04)],pose,1.04)
  assert.ok(Math.abs(wrapWatchAngle(mechanism.angles.minute-2.4))<1e-10)
  assert.ok(mechanism.velocity>10)
  control.update([tip(.4,100,1.08)],pose,1.08)
  assert.ok(Math.abs(wrapWatchAngle(mechanism.angles.minute-.4))<1e-10)
  assert.ok(mechanism.velocity<0)
})

test('brief tracking gaps preserve the generated hand and reconnect without re-entering the dial',()=>{
  const {mechanism,control}=setup()
  control.update([tip(0,30,1)],pose,1)
  control.update([tip(.3,100,1.04)],pose,1.04)
  for(let i=1;i<=15;i++){
    const time=1.04+i/60
    control.update([],pose,time);mechanism.update(1/60,time)
    assert.equal(control.active,true)
    assert.equal(mechanism.dragging,true)
  }
  control.update([tip(1.1,130,1.32)],pose,1.32)
  assert.ok(Math.abs(wrapWatchAngle(mechanism.angles.minute-1.1))<1e-10)
})

test('a renamed hand id keeps controlling the same generated needle',()=>{
  const {mechanism,control}=setup()
  control.update([tip(0,30,1,'old:8')],pose,1)
  control.update([tip(.4,90,1.04,'new:8')],pose,1.04)
  assert.equal(control.active,true)
  assert.ok(Math.abs(wrapWatchAngle(mechanism.angles.minute-.4))<1e-10)
  assert.equal(mechanism.gripId,'raised-watch-hand')
})

test('removing the hand releases capture and leaves decaying momentum',()=>{
  const {mechanism,control}=setup()
  control.update([tip(0,30,1)],pose,1)
  control.update([tip(.8,110,1.04)],pose,1.04)
  const speed=mechanism.velocity
  control.update([],pose,1.6)
  assert.equal(control.active,false)
  assert.equal(control.visual,null)
  assert.equal(mechanism.dragging,false)
  mechanism.update(.05,1.6)
  assert.ok(mechanism.velocity>0&&mechanism.velocity<speed)
})

test('a distant hand cannot create a control needle before touching the watch',()=>{
  const {mechanism,control}=setup(),before=mechanism.seconds
  control.update([tip(0,250,1)],pose,1)
  assert.equal(control.active,false)
  assert.equal(control.visual,null)
  assert.equal(mechanism.seconds,before)
  control.update([tip(0,30,1.1)],pose,1.1)
  control.update([],null,1.2)
  assert.equal(control.active,false)
})

test('a tilted wrist with a nearly edge-on dial still accepts fingertip rotation',()=>{
  const {mechanism,control}=setup(),tilted={...pose,a:0,b:30,c:-1,d:0}
  control.update([{id:'index',tip:8,x:320,y:240,sampledAt:1}],tilted,1)
  assert.equal(control.active,true)
  control.update([{id:'index',tip:8,x:430,y:240,sampledAt:1.05}],tilted,1.05)
  const expected=Math.PI/2-Math.atan2(-tilted.c,tilted.d)
  assert.ok(Math.abs(wrapWatchAngle(mechanism.angles.minute-expected))<1e-10)
})

test('a rotated perspective wrist maps the generated needle back to the actual minute-hand angle',()=>{
  const {mechanism,control}=setup(),perspective={x:320,y:240,a:30,b:18,c:-10,d:24,radius:40}
  control.update([{id:'index',tip:8,x:320,y:240,sampledAt:1}],perspective,1)
  const x=.8,y=-1.2
  control.update([{id:'index',tip:8,x:320+perspective.a*x+perspective.c*y,y:240+perspective.b*x+perspective.d*y,sampledAt:1.05}],perspective,1.05)
  assert.ok(Math.abs(wrapWatchAngle(mechanism.angles.minute-Math.atan2(x,-y)))<1e-10)
})
