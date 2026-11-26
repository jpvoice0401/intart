import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HumanSnowField, SnowPhysics, collideWithHuman } from '../src/snow-physics.ts'
import { SnowFog, mouthOpening } from '../src/snow-fog.ts'

function silhouette(predicate) {
  const field = new HumanSnowField(320,240,160)
  for (let y = 0; y < field.rows; y++) for (let x = 0; x < field.columns; x++) {
    field.solid[y*field.columns+x] = predicate((x+.5)*320/field.columns,(y+.5)*240/field.rows) ? 1 : 0
  }
  field.rebuild()
  return field
}
function particle(overrides = {}) {
  return { x: 160,y: 119,vx: 2,vy: 30,radius: 3,age: 0,phase: 0,supported: false,...overrides }
}
function random() {
  let state = 37
  return () => { state = (Math.imul(state,1664525)+1013904223) >>> 0; return state/4294967296 }
}

test('HumanSeg signed boundary points outward and resolves incoming snow above the body', () => {
  const field = silhouette((_x,y) => y >= 120)
  assert.ok(field.sample(160,110).distance > 0)
  assert.ok(field.sample(160,130).distance < 0)
  assert.ok(field.sample(160,119).ny < -.99)
  const p = particle()
  assert.equal(collideWithHuman(p,field,1/60),true)
  assert.ok(p.y <= 117.1)
  assert.ok(p.vy <= 0)
  assert.equal(p.supported,true)
})

test('friction holds slow snow on a shoulder while a vertical boundary lets it slide down', () => {
  const shoulder = particle({ vx: .5,vy: 0 })
  collideWithHuman(shoulder,silhouette((_x,y) => y >= 120),1/60)
  assert.equal(shoulder.vx,0)
  const side = particle({ x: 159,y: 100,vx: 0,vy: 30 })
  collideWithHuman(side,silhouette(x => x >= 160),1/60)
  assert.ok(side.vy > 29)
  assert.equal(side.supported,false)
})

test('snow accumulates in multiple layers and drops when the person moves away', () => {
  const field = silhouette((_x,y) => y >= 150)
  const snow = new SnowPhysics(320,240,random())
  snow.emit(160,50,60,100)
  for (let i = 0; i < 480; i++) snow.update(1/60,field)
  const settled = snow.particles.filter(p => p.y > 100 && p.y < 150)
  assert.ok(settled.length > 75, `expected a pile, found ${settled.length}`)
  assert.ok(Math.min(...settled.map(p => p.y)) < 138, 'snow must stack above the bottom layer')
  assert.ok(settled.every(p => p.y <= 150-p.radius+1), 'particles must remain outside the body')
  const previousMeanY = settled.reduce((sum,p) => sum+p.y,0)/settled.length
  field.clear()
  for (let i = 0; i < 45; i++) snow.update(1/60,field)
  const nextMeanY = snow.particles.reduce((sum,p) => sum+p.y,0)/snow.particles.length
  assert.ok(nextMeanY > previousMeanY+12, 'unsupported snow should fall under gravity')
})

test('snow physics uses the same fixed steps across 30 and 60 fps rendering', () => {
  const empty = new HumanSnowField(320,240)
  const a = new SnowPhysics(320,240,random()), b = new SnowPhysics(320,240,random())
  a.emit(160,20,30,10); b.emit(160,20,30,10)
  for (let i = 0; i < 60; i++) a.update(1/60,empty)
  for (let i = 0; i < 30; i++) b.update(1/30,empty)
  assert.deepEqual(a.particles,b.particles)
})

test('HumanSeg mask is mirrored and center-cropped like the camera', () => {
  const field = new HumanSnowField(320,240,64)
  const mask = new Float32Array(64*48)
  for (let y = 0; y < 48; y++) for (let x = 0; x < 20; x++) mask[y*64+x] = 1
  field.updateConfidence(mask,64,48,{x:1,y:1})
  assert.ok(field.sample(290,120).distance < 0)
  assert.ok(field.sample(30,120).distance > 0)
  field.updateConfidence(mask,64,48,{x:.3,y:1})
  assert.ok(field.sample(290,120).distance > 0, 'cropped-out silhouettes must not create invisible collisions')
})

test('breath condenses at the mouth, wiping clears continuous strokes and fog fades', () => {
  const fog = new SnowFog(120,90)
  for (let i = 0; i < 60; i++) fog.breathe(60,45,35,1/60,1)
  const center = 45*120+60, neighbour = 55*120+60
  assert.ok(fog.density[center] > .9)
  assert.equal(fog.density[0],0)
  const untouched = fog.density[neighbour]
  fog.wipe({x:40,y:45},{x:80,y:45},4)
  for (let x = 42; x < 79; x++) assert.equal(fog.density[45*120+x],0)
  assert.equal(fog.density[neighbour],untouched)
  fog.fade(6.5)
  assert.ok(Math.abs(fog.density[neighbour]/untouched-Math.exp(-1)) < 1e-6)
  fog.clear()
  assert.ok(fog.density.every(value => value === 0))
})

test('mouth opening compares inner lip gap to mouth width independent of camera aspect', () => {
  const points = Array.from({length:478},() => ({x:.5,y:.5}))
  points[78] = {x:.4,y:.5}; points[308] = {x:.6,y:.5}
  points[13] = {x:.5,y:.495}; points[14] = {x:.5,y:.505}
  assert.equal(mouthOpening(points,16/9),0)
  points[13] = {x:.5,y:.4}; points[14] = {x:.5,y:.6}
  assert.equal(mouthOpening(points,16/9),1)
})
