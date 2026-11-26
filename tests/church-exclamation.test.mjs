import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createChurchExclamation, CHURCH_VOICE_FILES } from '../src/church-exclamation.ts'

test('recorded exclamations use separate voices, queue, cancel superseded speech and clean up', async () => {
  const oldContext = globalThis.AudioContext, oldFetch = globalThis.fetch, sources = [], contexts = [], requested = []
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} })
  const node = () => ({ connect() {}, disconnect() {}, gain: param(), frequency: param(), Q: param(), delayTime: param() })
  globalThis.fetch = async url => { requested.push(url); return { ok: true, arrayBuffer: async () => new ArrayBuffer(16) } }
  globalThis.AudioContext = class {
    state = 'suspended'; currentTime = 0; destination = node()
    constructor() { contexts.push(this) }
    async resume() { this.state = 'running' }
    async close() { this.state = 'closed' }
    async decodeAudioData() { return { duration: 2 } }
    createGain = node; createBiquadFilter = node; createDelay = node
    createDynamicsCompressor() { return { ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() } }
    createBufferSource() {
      const source = { ...node(), playbackRate: param(), started: false, stopped: false, onended: null, start() { this.started = true }, stop() { this.stopped = true; this.onended?.() } }
      sources.push(source); return source
    }
  }
  const flush = () => new Promise(resolve => setImmediate(resolve))
  let voice
  try {
    voice = createChurchExclamation()
    assert.equal(new Set(requested).size, 4)
    assert.notEqual(CHURCH_VOICE_FILES.male.amen, CHURCH_VOICE_FILES.female.amen)
    voice.unlock()
    const first = voice.play('amen', 'male', true); await flush(); assert.equal(sources.length, 1)
    const waiting = voice.play('lord', 'female'); await flush(); assert.equal(sources.length, 1)
    const replacement = voice.play('lord', 'male', true); await flush()
    assert.equal(sources[0].stopped, true); assert.equal(sources.length, 2)
    sources[1].onended(); assert.equal(await first, true); assert.equal(await waiting, true); assert.equal(await replacement, true)
    const final = voice.play('amen', 'female'); await flush(); voice.dispose(); await final
    assert.equal(sources[2].stopped, true); assert.equal(contexts[0].state, 'closed')
    await voice.play('lord', 'male'); assert.equal(sources.length, 3)
  } finally { voice?.dispose(); globalThis.AudioContext = oldContext; globalThis.fetch = oldFetch }
})
