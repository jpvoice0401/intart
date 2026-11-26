import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setMaxListeners } from 'node:events'
import { BubbleField, inflationAt, segmentTouchesCircle } from '../src/bubbles.ts'
import { createPopSamples, PopAudio } from '../src/pop-audio.ts'

setMaxListeners(0)

class Element extends EventTarget {
  constructor() {
    super()
    this.children = []
    this.dataset = {}
    this.attributes = new Map()
    this.styles = new Map()
    this.classes = new Set()
    this.style = { setProperty: (key, value) => this.styles.set(key, value) }
    this.classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name) }
    this.captures = new Set()
    this.bounds = { left: 0, top: 0, width: 400, height: 300 }
  }
  appendChild(child) { this.children.push(child) }
  replaceChildren(fragment) { this.children = [...fragment.children] }
  getBoundingClientRect() { return this.bounds }
  setAttribute(key, value) { this.attributes.set(key, value) }
  removeAttribute(key) { this.attributes.delete(key) }
  setPointerCapture(id) { this.captures.add(id) }
  hasPointerCapture(id) { return this.captures.has(id) }
  releasePointerCapture(id) { this.captures.delete(id) }
  focus() { document.activeElement = this }
  closest() { return this.className === 'bubble-cell' ? this : null }
}

function setup() {
  const board = new Element()
  let now = 100
  let pops = 0
  let id = 0
  const frames = new Map()
  const document = new EventTarget()
  Object.assign(document, { hidden: false, activeElement: null, createElement: () => new Element(), createDocumentFragment: () => new Element() })
  const window = new EventTarget()
  Object.assign(globalThis, {
    window, document, performance: { now: () => now },
    requestAnimationFrame: callback => { frames.set(++id, callback); return id },
    cancelAnimationFrame: frame => frames.delete(frame),
  })
  const field = new BubbleField(board, () => pops++)
  return {
    board, field, document, window,
    get pops() { return pops },
    emit(type, properties = {}, target = board) {
      const event = new Event(type, { cancelable: true })
      Object.assign(event, { pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: 400 / 12, clientY: 30, ...properties })
      Object.defineProperty(event, 'target', { value: target })
      board.dispatchEvent(event)
    },
    tick(time) {
      now = time
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach(callback => callback(time))
    },
  }
}

test('grid covers the viewport and a bubble pops only once while deflated', () => {
  const app = setup()
  assert.equal(app.board.children.length, 30)
  assert.equal(app.board.styles.get('--columns'), '6')
  assert.equal(app.board.styles.get('--rows'), '5')
  app.emit('pointerdown')
  app.emit('pointerup')
  app.emit('pointerdown')
  assert.equal(app.pops, 1)
  assert.equal(app.board.children[0].styles.get('--air'), '0')
  assert.equal(app.board.children[0].attributes.get('aria-disabled'), 'true')
  app.field.destroy()
})

test('fast drag pops every intersected bubble, with no extra pops on hover', () => {
  const app = setup()
  app.emit('pointermove', { clientX: 366.6667 })
  assert.equal(app.pops, 0)
  app.emit('pointerdown')
  app.emit('pointermove', { clientX: 366.6667 })
  app.emit('pointerup', { clientX: 366.6667 })
  assert.equal(app.pops, 6)
  app.emit('pointermove', { clientY: 150 })
  assert.equal(app.pops, 6)
  app.field.destroy()
})

test('bubbles refill progressively, then become poppable again', () => {
  const app = setup()
  app.emit('pointerdown')
  app.emit('pointerup')
  app.tick(800)
  assert.equal(Number(app.board.children[0].styles.get('--air')), 0)
  app.tick(3500)
  const air = Number(app.board.children[0].styles.get('--air'))
  assert.ok(air > 0 && air < 1)
  app.tick(8000)
  assert.equal(app.board.children[0].styles.get('--air'), '1')
  assert.equal(app.board.children[0].attributes.has('aria-disabled'), false)
  app.emit('pointerdown')
  assert.equal(app.pops, 2)
  app.field.destroy()
})

test('multitouch pointers are independent and reset cancels held drags', () => {
  const app = setup()
  app.emit('pointerdown', { pointerId: 1, pointerType: 'touch' })
  app.emit('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 366.6667 })
  assert.equal(app.pops, 2)
  app.emit('pointercancel', { pointerId: 1 })
  app.emit('pointermove', { pointerId: 1, clientY: 270 })
  assert.equal(app.pops, 2)
  app.field.reset()
  app.emit('pointermove', { pointerId: 2, clientY: 270 })
  assert.equal(app.pops, 2)
  assert.ok(app.board.children.every(cell => !cell.attributes.has('aria-disabled')))
  app.field.destroy()
})

test('resizing preserves surviving bubble state; keyboard and assistive clicks work', () => {
  const app = setup()
  app.emit('pointerdown')
  app.emit('pointerup')
  const first = app.board.children[0]
  app.board.bounds.width = 900
  app.window.dispatchEvent(new Event('resize'))
  app.tick(200)
  assert.equal(app.board.children[0], first)
  assert.equal(first.attributes.get('aria-disabled'), 'true')
  const second = app.board.children[1]
  app.emit('keydown', { code: 'Space', repeat: false }, second)
  assert.equal(app.pops, 2)
  app.emit('keydown', { code: 'ArrowRight' }, second)
  assert.equal(app.document.activeElement, app.board.children[2])
  app.emit('click', { detail: 0 }, app.board.children[2])
  assert.equal(app.pops, 3)
  app.field.destroy()
})

test('hidden tabs stop held drags and refill according to elapsed time on return', () => {
  const app = setup()
  app.emit('pointerdown')
  app.document.hidden = true
  app.document.dispatchEvent(new Event('visibilitychange'))
  app.emit('pointermove', { clientX: 366.6667 })
  assert.equal(app.pops, 1)
  app.document.hidden = false
  app.document.dispatchEvent(new Event('visibilitychange'))
  app.tick(12000)
  assert.equal(app.board.children[0].styles.get('--air'), '1')
  app.field.destroy()
})

test('refill easing is continuous and geometry handles fast diagonal strokes', () => {
  const state = { poppedAt: 0, delay: 1000, duration: 4000 }
  assert.equal(inflationAt(state, 500), 0)
  assert.equal(inflationAt(state, 3000), 0.5)
  assert.equal(inflationAt(state, 5000), 1)
  assert.equal(segmentTouchesCircle({ x: 0, y: 0 }, { x: 1000, y: 1000 }, { x: 500, y: 500 }, 20), true)
  assert.equal(segmentTouchesCircle({ x: 0, y: 0 }, { x: 1000, y: 1000 }, { x: 500, y: 600 }, 20), false)
})

test('all three pop sounds are finite, distinct and fade out cleanly', () => {
  const sounds = [0, 1, 2].map(variant => {
    let seed = 7
    return createPopSamples(variant, 44100, () => { seed = seed * 16807 % 2147483647; return seed / 2147483647 })
  })
  for (const sound of sounds) {
    assert.ok(sound.every(sample => Number.isFinite(sample) && Math.abs(sample) < 1))
    assert.ok(Math.max(...sound.map(Math.abs)) > 0.3)
    assert.equal(Math.abs(sound[0]), 0)
    assert.ok(Math.abs(sound.at(-1)) < 0.001)
  }
  assert.equal(new Set(sounds.map(sound => sound.length)).size, 3)
})

test('audio limits overlapping voices, mutes and handles unavailable playback', () => {
  const sources = []
  let failure = 0
  class Context {
    state = 'running'
    sampleRate = 44100
    destination = {}
    createGain() { return { gain: {}, connect() {} } }
    createDynamicsCompressor() { return { threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect() {} } }
    createBuffer(_, length) { const data = new Float32Array(length); return { getChannelData: () => data } }
    createBufferSource() {
      const source = { playbackRate: {}, connect() {}, disconnect() {}, start() { this.started = true }, stop() { this.stopped = true } }
      sources.push(source)
      return source
    }
    close() { return Promise.resolve() }
  }
  globalThis.AudioContext = Context
  const audio = new PopAudio(() => failure++)
  for (let i = 0; i < 20; i++) audio.play()
  assert.equal(sources.length, 20)
  assert.equal(sources.filter(source => source.started && !source.stopped).length, 12)
  audio.setEnabled(false)
  assert.ok(sources.every(source => source.stopped))
  audio.play()
  assert.equal(sources.length, 20)
  audio.destroy()
  globalThis.AudioContext = class { constructor() { throw new Error('not supported') } }
  const unavailable = new PopAudio(() => failure++)
  unavailable.play()
  assert.equal(failure, 1)
  assert.equal(unavailable.enabled, false)
  unavailable.destroy()
})
