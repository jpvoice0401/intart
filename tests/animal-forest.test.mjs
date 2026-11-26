import {test} from 'node:test'
import assert from 'node:assert/strict'
import {FOREST_ANIMALS,FOREST_ACTIVITIES,ForestLife,forestBirth,readForestSave} from '../src/animal-forest-model.ts'
import {ForestArt} from '../src/animal-forest-art.ts'
import {Box3} from 'three'
const today=new Date(2026,10,26)
function advance(life,seconds){const events=[];for(let i=0;i<Math.round(seconds*60);i++)events.push(life.update(1/60));return events}

test('all twelve birth-year animals repeat every twelve years',()=>{
  assert.deepEqual(FOREST_ANIMALS.map(animal=>animal.name),['쥐','소','호랑이','토끼','용','뱀','말','양','원숭이','닭','개','돼지'])
  for(let i=0;i<12;i++){
    assert.equal(forestBirth(`${1984+i}-06-15`,today).animal,i)
    assert.equal(forestBirth(`${1996+i}-06-15`,today).animal,i)
  }
})
test('birthdays reject invalid dates, future dates and out-of-range years',()=>{
  for(const value of ['','2000-02-30','2001-02-29','2027-01-01','2026-11-27','1899-12-31','2020-13-01','2020-00-10','2000-2-4'])assert.equal(forestBirth(value,today),null,value)
  assert.equal(forestBirth('2000-02-29',today).animal,4)
  assert.ok(forestBirth('2026-11-26',today))
})
test('moving in lands once and blocks activities before touchdown',()=>{
  const life=new ForestLife()
  assert.equal(life.begin('fish'),false)
  assert.equal(life.moveIn('  별이  ','2000-02-29',today),true)
  assert.equal(life.resident.name,'별이')
  assert.equal(life.begin('fruit'),false)
  const events=advance(life,5)
  assert.equal(events.filter(event=>event.landed).length,1)
  assert.equal(life.landing,0)
  assert.equal(life.begin('fish'),true)
})
test('activities take time, award once, and cannot be started twice',()=>{
  const life=new ForestLife();life.moveIn('나무','1996-01-01',today);advance(life,5)
  for(const [kind,spec] of Object.entries(FOREST_ACTIVITIES)){
    assert.equal(life.begin(kind),true)
    assert.equal(life.begin('fruit'),false)
    advance(life,spec.duration-1)
    assert.equal(life.activity,kind)
    const events=advance(life,2)
    assert.equal(events.filter(event=>event.completed===kind).length,1)
    assert.equal(life.activity,null)
  }
  assert.deepEqual(life.inventory,{fruit:3,fish:1,flower:1,stars:2})
})
test('meteors arrive every thirty active seconds and ships every sixty',()=>{
  const life=new ForestLife(),events=advance(life,181)
  assert.equal(events.filter(event=>event.meteor).length,6)
  assert.equal(events.filter(event=>event.ship).length,3)
})
test('large resumed frames cannot replay missed space events or finish an activity',()=>{
  const life=new ForestLife();life.moveIn('별','2000-01-01',today)
  life.update(600)
  assert.ok(life.landing>4)
  assert.ok(life.elapsed<=.25)
  assert.deepEqual(life.update(NaN),{meteor:false,ship:false,landed:false,completed:null})
})
test('saving restores resident and rewards without retaining a birthday',()=>{
  const life=new ForestLife();life.moveIn('달','1999-04-05',today);advance(life,5);life.begin('flower');advance(life,6)
  const raw=JSON.stringify(life.save()),save=readForestSave(raw),restored=new ForestLife(save)
  assert.equal(raw.includes('1999'),false)
  assert.deepEqual(restored.resident,life.resident)
  assert.deepEqual(restored.inventory,life.inventory)
  assert.equal(restored.landing,0)
  assert.equal(restored.activity,null)
})
test('corrupt or unsupported saved residents cannot crash the scene',()=>{
  for(const raw of [null,'bad','null','{}','{"version":2}',JSON.stringify({version:1,resident:{name:'x',animal:99,flower:0},inventory:{fruit:0,fish:0,flower:0,stars:0}})])assert.equal(readForestSave(raw),null)
  const life=new ForestLife();life.moveIn('새싹','1984-01-01',today)
  const save=life.save();save.inventory.fruit=-1
  assert.equal(readForestSave(JSON.stringify(save)),null)
})
test('all twelve 3D animals have finite visible geometry after batching and release their resources',()=>{
  const art=new ForestArt(),geometries=new Set(),materials=new Set(),disposed=new Set()
  for(let i=0;i<12;i++){
    const animal=art.animal(i),bounds=new Box3().setFromObject(animal)
    assert.equal(animal.userData.animal,i)
    assert.ok(bounds.max.y-bounds.min.y>.8)
    assert.ok(bounds.max.x-bounds.min.x>.4)
    assert.ok(animal.children.length<=12,'colored parts are batched for mobile rendering')
    animal.traverse(object=>{if(!object.isMesh)return;geometries.add(object.geometry);materials.add(object.material);assert.ok([...object.geometry.attributes.position.array].every(Number.isFinite))})
  }
  for(const object of [...geometries,...materials])object.addEventListener('dispose',()=>disposed.add(object))
  art.destroy()
  assert.equal(disposed.size,geometries.size+materials.size)
})
