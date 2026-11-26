import { test } from 'node:test'
import assert from 'node:assert/strict'
import { beatOffset, calculateShot, danceAt, flightAt, renderHipHop, GOLF_BPM } from '../src/golf-model.ts'
import { GolfAudio } from '../src/golf-audio.ts'
import { RhythmGolf } from '../src/rhythm-golf.ts'
import { GOLF_REACTIONS } from '../src/golf-reactions.ts'

test('dance contacts the ground on the musical downbeat and jumps between beats', () => {
  for (let beat = 0; beat < 8; beat++) {
    assert.equal(danceAt(beat).hop, 0)
    assert.ok(danceAt(beat).scaleY < 1)
    assert.ok(danceAt(beat + .5).hop > .8)
  }
  assert.ok(Math.abs(beatOffset(12.98) + .02) < 1e-10)
  const first = danceAt(.25), repeated = danceAt(4.25)
  for (const key of Object.keys(first)) assert.ok(Math.abs(first[key] - repeated[key]) < 1e-10)
})

test('shot timing changes direction while power and aim control landing', () => {
  const perfect = calculateShot({ aim: 0, power: .64, beat: 4, wind: 0 })
  assert.equal(perfect.timing, 'perfect')
  assert.equal(perfect.outcome, 'good')
  assert.ok(perfect.points > 0)
  const late = calculateShot({ aim: 0, power: .64, beat: 4.4, wind: 0 })
  assert.equal(late.timing, 'miss')
  assert.ok(late.landing.x > perfect.landing.x)
  assert.equal(calculateShot({ aim: 1, power: .64, beat: 0 }).outcome, 'ob')
  assert.equal(calculateShot({ aim: 0, power: 1, beat: 0 }).outcome, 'ob')
})

test('bunkers, water, fairway and hole-in-one are reachable with controlled shots', () => {
  assert.equal(calculateShot({ aim: (.67 - .54) / .45, power: .4, beat: 2 }).outcome, 'bunker')
  assert.equal(calculateShot({ aim: (.21 - .54) / .45, power: (.79 - .63 - .12) / .35, beat: 2 }).outcome, 'water')
  assert.equal(calculateShot({ aim: 0, power: .3, beat: 2 }).outcome, 'fairway')
  const hole = calculateShot({ aim: 0, power: .6, beat: 8, wind: 0 })
  assert.equal(hole.outcome, 'hole')
  assert.ok(hole.points >= 1000)
  assert.notEqual(calculateShot({ aim: 0, power: .6, beat: 8.2 }).outcome, 'hole')
})

test('flight has an arc and returns exactly to the computed landing position', () => {
  const start = { x: 500, y: 720 }, end = { x: 540, y: 460 }
  assert.equal(flightAt(start, end, 0, 300).y, start.y)
  assert.ok(flightAt(start, end, .5, 300).y < Math.min(start.y, end.y))
  const landed = flightAt(start, end, 1, 300)
  assert.ok(Math.abs(landed.x - end.x) < 1e-9 && Math.abs(landed.y - end.y) < 1e-9)
  assert.ok(Math.abs(landed.scale - .18) < 1e-9)
})

test('the original hip-hop loop spans exactly eight beats with finite, bounded audio', () => {
  let seed = 17
  const audio = renderHipHop(22050, () => { seed = seed * 16807 % 2147483647; return seed / 2147483647 })
  assert.equal(audio.length, Math.round(60 / GOLF_BPM * 8 * 22050))
  let energy = 0, peak = 0
  for (const sample of audio) {
    assert.ok(Number.isFinite(sample))
    peak = Math.max(peak, Math.abs(sample))
    energy += sample * sample
  }
  assert.ok(peak > .4 && peak <= .85)
  assert.ok(Math.sqrt(energy / audio.length) > .07)
})

function audioSetup(deferred = false) {
  let release
  const resumePromise = deferred ? new Promise(resolve => { release = resolve }) : Promise.resolve()
  const sources = []
  const contexts = []
  const parameter = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} })
  class Context {
    state = 'suspended'
    currentTime = 10
    destination = {}
    constructor() { contexts.push(this) }
    async resume() { await resumePromise; if (this.state !== 'closed') this.state = 'running' }
    suspend() { this.state = 'suspended'; return Promise.resolve() }
    close() { this.state = 'closed'; return Promise.resolve() }
    createGain() { return { gain: parameter(), connect() {}, disconnect() {} } }
    createDynamicsCompressor() { return { threshold: parameter(), ratio: parameter(), connect() {} } }
    createBuffer(_, length, rate) { return { length, duration: length / rate, getChannelData: () => new Float32Array(length) } }
    decodeAudioData(bytes) { return Promise.resolve({ duration: 2.4, url: new TextDecoder().decode(bytes) }) }
    createBufferSource() {
      const source = { loop: false, connect() {}, disconnect() {}, start(time = 0) { this.started = true; this.time = time }, stop() { this.stopped = true } }
      sources.push(source)
      return source
    }
    createOscillator() { return { frequency: parameter(), connect() {}, disconnect() {}, start() {}, stop() {} } }
  }
  globalThis.AudioContext = Context
  globalThis.fetch = async url => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode(url).buffer })
  const audio = new GolfAudio('/audio/')
  return { audio, sources, contexts, release: () => release?.() }
}

test('audio time drives the beat without drift even after thousands of loop repeats', async () => {
  const app = audioSetup()
  assert.equal(await app.audio.start(), true)
  const music = app.sources.find(source => source.loop)
  const context = app.contexts[0]
  context.currentTime = music.time + music.buffer.duration * 10000
  assert.ok(Math.abs(app.audio.beat() - 80000) < 1e-8)
  assert.equal(app.audio.isPlaying, true)
  app.audio.pause()
  assert.equal(app.audio.isPlaying, false)
  await app.audio.start()
  assert.equal(app.sources.filter(source => source.loop).length, 1)
  app.audio.destroy()
  assert.equal(context.state, 'closed')
  assert.equal(music.stopped, true)
})

test('concurrent playback starts share one source; teardown cancels a pending resume', async () => {
  const app = audioSetup(true)
  const first = app.audio.start()
  assert.equal(first, app.audio.start())
  app.audio.destroy()
  app.release()
  assert.equal(await first, false)
  assert.equal(app.sources.filter(source => source.loop).length, 0)
  assert.equal(app.audio.isPlaying, false)
})

test('hits only play impact sounds; landing outcomes choose the matching voice and teardown stops speech', async () => {
  const app = audioSetup()
  await app.audio.start()
  await new Promise(resolve => setImmediate(resolve))
  app.audio.hit()
  assert.equal(app.sources.filter(source => !source.loop).length, 0)
  for (const outcome of ['rough', 'fairway', 'good', 'hole']) app.audio.result(outcome)
  const speech = app.sources.filter(source => !source.loop)
  assert.equal(speech.length, 4)
  assert.deepEqual(speech.map(source => source.buffer.url), ['rough', 'fairway', 'good', 'hole'].map(outcome => `/audio/${GOLF_REACTIONS[outcome].file}`))
  assert.equal(speech.filter(source => !source.stopped).length, 3)
  for (const outcome of ['bunker', 'water', 'ob']) app.audio.result(outcome)
  assert.equal(app.sources.filter(source => !source.loop).length, 4)
  app.audio.destroy()
  assert.ok(speech.every(source => source.stopped))
  app.audio.hit()
  app.audio.result('good')
  assert.equal(app.sources.filter(source => !source.loop).length, 4)
})

class Element extends EventTarget {
  attributes = new Map()
  classes = new Set()
  captures = new Set()
  styles = new Map()
  style = { setProperty: (key, value) => this.styles.set(key, value) }
  textContent = ''
  classList = {
    add: name => this.classes.add(name), remove: name => this.classes.delete(name),
    toggle: (name, enabled) => { if (enabled) this.classes.add(name); else this.classes.delete(name) },
  }
  setAttribute(key, value) { this.attributes.set(key, value) }
  hasPointerCapture(id) { return this.captures.has(id) }
  setPointerCapture(id) { this.captures.add(id) }
  releasePointerCapture(id) { this.captures.delete(id) }
  closest() { return null }
  focus() {}
}

function gameSetup() {
  let now = 100, id = 0
  const frames = new Map(), elements = new Map()
  const root = new Element()
  root.querySelector = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element())
    return elements.get(selector)
  }
  const window = new EventTarget(), document = new EventTarget()
  Object.assign(window, { innerWidth: 1280, innerHeight: 800, matchMedia: () => ({ matches: false }) })
  document.hidden = false
  Object.assign(globalThis, {
    window, document, performance: { now: () => now },
    requestAnimationFrame: callback => { frames.set(++id, callback); return id },
    cancelAnimationFrame: frame => frames.delete(frame),
  })
  const audio = { isPlaying: false, beats: 0, hits: 0, results: [], beat() { return this.beats }, async start() { this.isPlaying = true; return true }, pause() { this.isPlaying = false }, hit() { this.hits++ }, result(outcome) { this.results.push(outcome) } }
  const game = new RhythmGolf(root, audio)
  return {
    game, root, audio, frames, document,
    get(id) { return elements.get(`#${id}`) },
    emit(id, type, props = {}) {
      const event = new Event(type, { cancelable: true })
      Object.assign(event, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 640, clientY: 580, ...props })
      const target = id === 'root' ? root : elements.get(`#${id}`)
      target.dispatchEvent(event)
    },
    tick(time, beat = audio.beats) {
      now = time
      audio.beats = beat
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach(callback => callback(time))
    },
  }
}

test('rendered ball movement and the timing meter use the audio beat, not elapsed wall time', () => {
  const app = gameSetup()
  app.audio.isPlaying = true
  app.tick(100, 0)
  const grounded = parseFloat(app.get('golf-ball').style.top)
  app.tick(100000, .5)
  assert.ok(parseFloat(app.get('golf-ball').style.top) < grounded - 40)
  assert.equal(app.get('golf-beat-cursor').style.left, '93%')
  app.tick(100020, 1)
  assert.ok(Math.abs(parseFloat(app.get('golf-ball').style.top) - grounded) < .01)
  app.game.destroy()
})

test('one click launches once, scores once, and automatically tees up the next ball', () => {
  const app = gameSetup()
  app.tick(100)
  app.emit('golf-ball', 'pointerdown')
  app.emit('golf-ball', 'pointerup')
  app.emit('golf-ball', 'pointerup')
  app.tick(120)
  assert.equal(app.audio.hits, 1)
  assert.deepEqual(app.audio.results, [])
  assert.equal(app.get('golf-voice').classes.has('is-visible'), false)
  assert.equal(app.root.attributes.get('data-golf-state'), 'flight')
  assert.equal(app.get('golf-shots').textContent, '01')
  app.tick(2100)
  assert.equal(app.root.attributes.get('data-golf-state'), 'result')
  assert.equal(app.get('golf-result-title').textContent, 'GOOD SHOT!')
  assert.deepEqual(app.audio.results, ['good'])
  assert.equal(app.get('golf-voice').textContent, '너뿐이야~')
  assert.equal(app.get('golf-voice').classes.has('is-visible'), true)
  const score = app.get('golf-score').textContent
  app.tick(2200)
  assert.equal(app.get('golf-score').textContent, score)
  assert.deepEqual(app.audio.results, ['good'])
  app.tick(5000)
  assert.equal(app.root.attributes.get('data-golf-state'), 'ready')
  app.game.destroy()
})

test('rough, fairway, good shot and hole-in-one speak their own phrases only after landing', () => {
  for (const entry of [
    { outcome: 'rough', power: .64, aim: -.6, text: '아잉~' },
    { outcome: 'fairway', power: .3, aim: 0, text: 'I love you~' },
    { outcome: 'good', power: .64, aim: 0, text: '너뿐이야~' },
    { outcome: 'hole', power: .6, aim: -.01, text: '싸랑훼~' },
  ]) {
    const app = gameSetup()
    app.get('golf-power').value = String(entry.power)
    app.emit('golf-power', 'input')
    app.get('golf-aim').value = String(entry.aim)
    app.emit('golf-aim', 'input')
    app.tick(100)
    app.emit('golf-ball', 'pointerdown')
    app.emit('golf-ball', 'pointerup')
    app.tick(200)
    assert.deepEqual(app.audio.results, [])
    app.tick(2100)
    assert.deepEqual(app.audio.results, [entry.outcome])
    assert.equal(app.get('golf-voice').textContent, entry.text)
    app.tick(2200)
    assert.equal(app.audio.results.length, 1)
    app.game.destroy()
  }
})

test('dragging changes shot power and pointer cancellation does not fire a shot', () => {
  const app = gameSetup()
  app.tick(100)
  app.emit('golf-ball', 'pointerdown')
  app.emit('golf-ball', 'pointermove', { clientX: 600, clientY: 740 })
  app.tick(200)
  assert.ok(parseInt(app.get('golf-power-value').textContent) > 64)
  assert.match(app.get('golf-aim-value').textContent, /R/)
  app.emit('golf-ball', 'pointercancel')
  app.emit('golf-ball', 'pointerup')
  assert.equal(app.audio.hits, 0)
  app.tick(220)
  assert.equal(app.root.attributes.get('data-golf-state'), 'ready')
  app.game.destroy()
})

test('a fast mouse sweep strikes the ball once while the beat is playing', () => {
  const app = gameSetup()
  app.audio.isPlaying = true
  app.tick(100, 0)
  const x = parseFloat(app.get('golf-ball').style.left), y = parseFloat(app.get('golf-ball').style.top)
  app.emit('root', 'pointermove', { clientX: x - 110, clientY: y })
  app.tick(110, .02)
  app.emit('root', 'pointermove', { clientX: x + 110, clientY: y })
  assert.equal(app.audio.hits, 1)
  app.emit('root', 'pointermove', { clientX: x - 110, clientY: y })
  assert.equal(app.audio.hits, 1)
  app.game.destroy()
})

test('keyboard shots work and hidden pages pause music and animation', async () => {
  const app = gameSetup()
  app.tick(100)
  app.emit('golf-ball', 'keydown', { code: 'Space', repeat: false })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(app.audio.hits, 1)
  app.document.hidden = true
  app.document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(app.frames.size, 0)
  assert.equal(app.audio.isPlaying, false)
  app.document.hidden = false
  app.document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(app.frames.size, 1)
  app.game.destroy()
  assert.equal(app.frames.size, 0)
})
