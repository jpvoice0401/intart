import {test} from 'node:test'
import assert from 'node:assert/strict'
import {SnowmanBuilder} from '../src/snowman.ts'

function snow(count=240){return Array.from({length:count},(_,i)=>({
  x:260+(i%20)*6,y:260+Math.floor(i/20)*6,vx:0,vy:0,radius:2.8,age:0,phase:i,supported:true,
}))}
function drift(flakes){for(const p of flakes){p.x+=p.vx/60;p.y+=p.vy/60;p.vx*=.96;p.vy*=.96}}
function sweep(builder,flakes,clock={time:0},id='finger'){
  const target=builder.completedCount+1
  let travelling=false,rolling=false,assembling=false
  for(let i=0;i<1200&&builder.completedCount<target;i++){
    clock.time+=1/60;drift(flakes)
    const movers=i<60?[{id,x:250+Math.min(1,i/35)*135,y:300,radius:id==='palm'?42:20,sampledAt:clock.time}]:[]
    builder.update(1/60,movers,flakes)
    travelling ||= builder.collected.length>0
    rolling ||= builder.balls.some(ball=>Math.abs(ball.angle)>.2)
    assembling ||= builder.phase==='assembling'
  }
  return {travelling,rolling,assembling}
}

test('stationary hands, including two close palms, cannot attract snow or trigger a snowman',()=>{
  const builder=new SnowmanBuilder(640,480),flakes=snow()
  for(let i=0;i<600;i++)builder.update(1/60,[
    {id:'left',x:300,y:300,radius:45,sampledAt:i/60},
    {id:'right',x:330,y:300,radius:45,sampledAt:i/60},
  ],flakes)
  assert.equal(builder.phase,'waiting')
  assert.equal(builder.balls.length,0)
  assert.equal(flakes.length,240)
  assert.ok(flakes.every(p=>p.vx===0&&p.vy===0))
})

test('a moving fingertip pushes nearby snow in its travel direction without affecting distant snow',()=>{
  const builder=new SnowmanBuilder(640,480)
  const near={...snow(1)[0],x:105,y:100},far={...snow(1)[0],x:300,y:100}
  const flakes=[near,far]
  builder.update(.05,[{id:'tip',x:80,y:100,radius:18,sampledAt:0}],flakes)
  builder.update(.05,[{id:'tip',x:115,y:100,radius:18,sampledAt:.05}],flakes)
  assert.ok(near.vx>0)
  assert.equal(near.vy,0)
  assert.equal(far.vx,0)
  assert.equal(far.vy,0)
  const speed=near.vx
  builder.update(.016,[{id:'tip',x:115,y:100,radius:18,sampledAt:.05}],flakes)
  assert.equal(near.vx,speed,'re-rendering a held camera sample must not add force')
})

test('one finger or one palm can concentrate real snow and finish the existing three-ball animation',()=>{
  for(const input of ['finger','palm']){
    const builder=new SnowmanBuilder(640,480),flakes=snow()
    const seen=sweep(builder,flakes,{time:0},input)
    assert.equal(builder.phase,'complete',input)
    assert.equal(builder.completedCount,1)
    assert.ok(seen.travelling&&seen.rolling&&seen.assembling)
    assert.equal(builder.progress,1)
    assert.equal(builder.collected.length,0)
    const [base,middle,head]=builder.balls
    assert.ok(base.radius>middle.radius&&middle.radius>head.radius)
    assert.ok(base.y>middle.y&&middle.y>head.y)
    for(const ball of builder.balls){assert.equal(ball.x,builder.center.x);assert.ok(Math.abs(ball.radius-ball.targetRadius)<.01)}
    const mass=builder.balls.reduce((sum,ball)=>sum+ball.mass,0)
    assert.ok(mass<=(240-flakes.length)*2.8**2*2.1+.001)
    const snapshot=builder.takeCompleted()
    assert.equal(snapshot.decoration,1)
    assert.equal(snapshot.balls.length,3)
    assert.equal(builder.takeCompleted(),null)
  }
})

test('snowmen can be made repeatedly without reset while previous completed views remain independent',()=>{
  const builder=new SnowmanBuilder(640,480),clock={time:0}
  let first,firstJson
  const positions=new Set()
  for(let i=0;i<24;i++){
    const flakes=snow()
    sweep(builder,flakes,clock)
    assert.equal(builder.completedCount,i+1)
    const snapshot=builder.takeCompleted()
    assert.ok(snapshot)
    positions.add(snapshot.center.x)
    if(!first){first=snapshot;firstJson=JSON.stringify(first)}
    assert.equal(JSON.stringify(first),firstJson,'later rolling must not mutate the frozen first snowman')
    assert.equal(builder.balls.length,3)
    assert.ok(builder.collected.length<=160)
  }
  assert.ok(positions.size>3,'new snowmen must roll to different positions rather than all cover the first')
})

test('snow elsewhere and sparse swept flakes never become a timer-only snowman',()=>{
  const distant=new SnowmanBuilder(640,480),flakes=snow()
  for(let i=0;i<600;i++){
    distant.update(1/60,[{id:'tip',x:20+i%20,y:20,radius:12,sampledAt:i/60}],flakes)
  }
  assert.equal(distant.phase,'waiting')
  const sparse=new SnowmanBuilder(640,480)
  sweep(sparse,snow(2))
  assert.equal(sparse.balls.length,0)
  assert.equal(sparse.completedCount,0)
})

test('tracking gaps and landmark teleports do not fling snow',()=>{
  const builder=new SnowmanBuilder(640,480),flakes=[{...snow(1)[0],x:300,y:100}]
  builder.update(.05,[{id:'tip',x:20,y:100,radius:20,sampledAt:0}],flakes)
  builder.update(.05,[{id:'tip',x:400,y:100,radius:20,sampledAt:.05}],flakes)
  assert.equal(flakes[0].vx,0)
  builder.update(.05,[{id:'tip',x:300,y:100,radius:20,sampledAt:1}],flakes)
  assert.equal(flakes[0].vx,0)
})

test('reset clears completed count and active snowmen, and resize preserves a completed stack',()=>{
  const builder=new SnowmanBuilder(640,480)
  sweep(builder,snow())
  builder.resize(360,640)
  for(const ball of builder.balls)assert.equal(ball.x,builder.center.x)
  assert.ok(builder.balls[0].y>builder.balls[1].y&&builder.balls[1].y>builder.balls[2].y)
  builder.reset()
  assert.equal(builder.phase,'waiting')
  assert.equal(builder.balls.length,0)
  assert.equal(builder.collected.length,0)
  assert.equal(builder.completedCount,0)
  assert.equal(builder.takeCompleted(),null)
})
