import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHURCH_HYMNS, createChurchMusic } from '../src/church-music.ts'

class FakeAudio extends EventTarget {
  src = ''; preload = ''; volume = 1; loop = true; paused = true; currentTime = 0; error = null; calls = 0; fail = null; pending = null
  load() { this.currentTime = 0 }
  play() { this.calls++; this.paused = false; return this.pending || (this.fail ? Promise.reject(this.fail) : Promise.resolve()) }
  pause() { this.paused = true }
  removeAttribute(name) { if (name === 'src') this.src = '' }
  end() { this.dispatchEvent(new Event('ended')) }
}
const flush = () => new Promise(resolve => setImmediate(resolve))

test('hymns start on entry, play in the supplied order and wrap indefinitely', async () => {
  const audio = new FakeAudio(); let state
  const music = createChurchMusic(next => { state = next }, audio)
  assert.equal(audio.calls, 0); assert.equal(audio.preload, 'metadata'); assert.equal(audio.loop, false)
  music.startOnEntry(); await flush(); assert.equal(state.playing, true)
  for (let i = 0; i < 9; i++) { assert.equal(state.index, i % 3); assert.equal(audio.src, CHURCH_HYMNS[i % 3].url); audio.end(); await flush() }
  music.dispose()
})

test('off pauses, on resumes, song selection starts that song and teardown silences playback', async () => {
  const audio = new FakeAudio(); let state
  const music = createChurchMusic(next => { state = next }, audio)
  music.startOnEntry(); await flush(); audio.currentTime = 47
  music.toggle(); assert.equal(audio.paused, true); assert.equal(state.enabled, false)
  audio.end(); await flush(); assert.equal(state.index, 0)
  music.startOnEntry(); assert.equal(state.enabled, false)
  music.toggle(); await flush(); assert.equal(audio.currentTime, 47); assert.equal(state.playing, true)
  music.select(2); await flush(); assert.equal(state.index, 2); assert.equal(audio.currentTime, 0)
  audio.end(); await flush(); assert.equal(state.index, 0)
  music.select(99); assert.equal(state.index, 0)
  music.dispose(); assert.equal(audio.paused, true); assert.equal(audio.src, '')
  const count = audio.calls; audio.end(); music.toggle(); music.select(1); assert.equal(audio.calls, count)
})

test('autoplay rejection offers retry and stale play promises cannot re-enable a muted track', async () => {
  const audio = new FakeAudio(); let state
  audio.fail = Object.assign(new Error('Blocked'), { name: 'NotAllowedError' })
  const music = createChurchMusic(next => { state = next }, audio)
  music.startOnEntry(); await flush(); assert.equal(state.enabled, false); assert.ok(state.error)
  audio.fail = null
  let resolve; audio.pending = new Promise(done => { resolve = done })
  music.toggle(); assert.equal(state.loading, true); music.toggle(); resolve(); await flush()
  assert.equal(state.enabled, false); assert.equal(state.playing, false); assert.equal(audio.paused, true)
  music.dispose()
})
