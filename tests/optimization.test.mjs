import {test} from 'node:test'
import assert from 'node:assert/strict'
import {acceptedEncodings} from '../server/compressed-assets.mjs'
import {lazyExperiment} from '../src/lazy-experiment.ts'

test('compressed transport honors q=0, priorities and wildcard negotiation',() => {
  assert.deepEqual(acceptedEncodings('gzip, br'),['br','gzip'])
  assert.deepEqual(acceptedEncodings('br;q=0,gzip;q=.8'),['gzip'])
  assert.deepEqual(acceptedEncodings('gzip;q=1,br;q=.5'),['gzip','br'])
  assert.deepEqual(acceptedEncodings('identity'),[])
  assert.deepEqual(acceptedEncodings('*;q=.5,br;q=0'),['gzip'])
})

function documentStub() {
  return {createElement() {return {textContent:'',setAttribute(){},append(){},remove(){},addEventListener(){}}}}
}

test('late scene imports cannot start an abandoned experiment or its camera',async () => {
  const original = globalThis.document
  globalThis.document = documentStub()
  try {
    let resolve, mounts = 0
    const loader = lazyExperiment(() => new Promise(done => {resolve=done}))
    const dispose = loader({append(){}})
    dispose()
    resolve(() => {mounts++;return()=>{}})
    await new Promise(done => setImmediate(done))
    assert.equal(mounts,0)
  } finally {globalThis.document=original}
})

test('loaded experiments dispose their resources once when switching',async () => {
  const original = globalThis.document
  globalThis.document = documentStub()
  try {
    let mounts=0,cleanups=0
    const loader = lazyExperiment(async () => () => {mounts++;return()=>{cleanups++}})
    const dispose = loader({append(){}})
    await new Promise(done => setImmediate(done))
    assert.equal(mounts,1)
    dispose()
    dispose()
    assert.equal(cleanups,1)
  } finally {globalThis.document=original}
})
