// Server-free rotation gesture checks.
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {SabrinaTurnTracker} from '../src/sabrina-turn.ts'

const radians=degrees=>degrees*Math.PI/180
function feed(tracker,degrees,{start=0,step=40,wrap=false}={}){
  return degrees.map((angle,i)=>tracker.update(wrap?Math.atan2(Math.sin(radians(angle)),Math.cos(radians(angle))):radians(angle),start+i*step))
}
const sequence=(from,to,step=15)=>Array.from({length:Math.round(Math.abs(to-from)/step)+1},(_,i)=>from+i*step*Math.sign(to-from))

test('each complete turn changes the look once in either direction',()=>{
  for(const direction of [-1,1]){
    const tracker=new SabrinaTurnTracker()
    const events=feed(tracker,sequence(0,direction*1080))
    assert.deepEqual(events.flatMap((changed,i)=>changed?[i]:[]),[24,48,72])
  }
})

test('crossing the signed angle boundary does not count as a turn',()=>{
  const tracker=new SabrinaTurnTracker()
  const events=feed(tracker,sequence(150,870),{wrap:true})
  assert.deepEqual(events.flatMap((changed,i)=>changed?[i]:[]),[24,48])
})

test('half turns, returning to the start and repeated left/right sway do not change the look',()=>{
  const tracker=new SabrinaTurnTracker()
  const angles=[...sequence(0,180),...sequence(165,0)]
  for(let i=0;i<50;i++)angles.push(...sequence(15,90),...sequence(75,-90),...sequence(-75,0))
  assert.equal(feed(tracker,angles).some(Boolean),false)
})

test('reversing after a complete turn requires another full turn',()=>{
  const tracker=new SabrinaTurnTracker()
  const events=feed(tracker,[...sequence(0,360),...sequence(345,0),...sequence(15,360)])
  assert.deepEqual(events.flatMap((changed,i)=>changed?[i]:[]),[24,48,72])
})

test('after a partial turn, a full turn in the opposite direction still counts',()=>{
  const tracker=new SabrinaTurnTracker()
  const events=feed(tracker,[...sequence(0,90),...sequence(75,-270)])
  assert.equal(events.filter(Boolean).length,1)
  assert.equal(events.at(-1),true)
})

test('a small measurement error at the end triggers once without boundary chatter',()=>{
  const tracker=new SabrinaTurnTracker()
  const events=feed(tracker,[...sequence(0,345),356,354,359,357,360,358])
  assert.equal(events.filter(Boolean).length,1)
})

test('missing tracking, a long gap or an explicit reset discard an incomplete turn',()=>{
  for(const interruption of ['missing','gap','reset']){
    const tracker=new SabrinaTurnTracker()
    assert.equal(feed(tracker,sequence(0,270)).some(Boolean),false)
    if(interruption==='missing')assert.equal(tracker.update(null,800),false)
    if(interruption==='reset')tracker.reset()
    assert.equal(feed(tracker,sequence(285,360),{start:interruption==='gap'?2000:840}).some(Boolean),false)
  }
})

test('invalid values and abrupt pose flips cannot complete a turn',()=>{
  for(const invalid of [NaN,Infinity]){
    const tracker=new SabrinaTurnTracker()
    feed(tracker,sequence(0,270))
    assert.equal(tracker.update(invalid,800),false)
    assert.equal(feed(tracker,sequence(285,360),{start:840}).some(Boolean),false)
  }
  const tracker=new SabrinaTurnTracker()
  assert.equal(feed(tracker,[0,150,300,450,600,750]).some(Boolean),false)
})
