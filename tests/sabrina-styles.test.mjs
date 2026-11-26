// Pure style selection checks; no server, browser or camera.
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {SabrinaLookDeck,SABRINA_DRESSES,SABRINA_HAIR} from '../src/sabrina-styles.ts'

test('every cycle visits all 25 looks and changes both dress and hair, including cycle boundaries',()=>{
  for(const seed of [1,19,2026,0xffffffff]){
    let value=seed
    const deck=new SabrinaLookDeck(()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/2**32})
    let previous=null
    for(let cycle=0;cycle<4;cycle++){
      const seen=new Set(),dresses=new Map(),hair=new Map()
      for(let i=0;i<25;i++){
        const look=deck.next()
        assert.ok(SABRINA_DRESSES[look.dress]);assert.ok(SABRINA_HAIR[look.hair])
        if(previous){assert.notEqual(look.dress,previous.dress);assert.notEqual(look.hair,previous.hair)}
        seen.add(`${look.dress}:${look.hair}`)
        dresses.set(look.dress,(dresses.get(look.dress)??0)+1)
        hair.set(look.hair,(hair.get(look.hair)??0)+1)
        previous=look
      }
      assert.equal(seen.size,25)
      assert.deepEqual([...dresses.values()],[5,5,5,5,5])
      assert.deepEqual([...hair.values()],[5,5,5,5,5])
    }
  }
})

test('constant shuffle samples still cover every look without immediate repeats',()=>{
  for(const random of [()=>0,()=>.999999]){
    const deck=new SabrinaLookDeck(random),seen=new Set()
    let previous=null
    for(let i=0;i<50;i++){
      const look=deck.next()
      if(previous){assert.notEqual(look.dress,previous.dress);assert.notEqual(look.hair,previous.hair)}
      if(i<25)seen.add(`${look.dress}:${look.hair}`)
      previous=look
    }
    assert.equal(seen.size,25)
  }
})
