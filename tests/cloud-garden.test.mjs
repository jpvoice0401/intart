import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CloudGarden, cloudReaction, cloudPhase } from '../src/cloud-garden.ts'
import { CloudAudio } from '../src/cloud-audio.ts'

class Element extends EventTarget {
  children = []
  attributes = new Map()
  classes = new Set()
  dataset = {}
  style = {}
  disabled = false
  textContent = ''
  classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name) }
  setAttribute(key, value) { this.attributes.set(key, value) }
  appendChild(child) { this.children.push(child) }
  closest() { return this.className === 'floating-cloud' ? this : null }
}

function setup(reducedMotion = false) {
  let now = 100
  let id = 0
  const frames = new Map()
  const elements = new Map()
  const root = new Element()
  root.querySelector = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element())
    return elements.get(selector)
  }
  const window = new EventTarget()
  Object.assign(window, { innerWidth: 1280, innerHeight: 800, matchMedia: () => ({ matches: reducedMotion }) })
  const document = new EventTarget()
  Object.assign(document, { hidden: false, createElement: () => new Element() })
  Object.assign(globalThis, {
    window, document, performance: { now: () => now },
    requestAnimationFrame: callback => { frames.set(++id, callback); return id },
    cancelAnimationFrame: frame => frames.delete(frame),
  })
  const counts = []
  const garden = new CloudGarden(root, count => counts.push(count))
  const layer = elements.get('#floating-clouds')
  return {
    garden, root, layer, counts, frames, document,
    get(id) { return elements.get(`#${id}`) },
    pop(index) {
      const event = new Event('click')
      Object.defineProperty(event, 'target', { value: layer.children[index] })
      layer.dispatchEvent(event)
    },
    tick(time) {
      now = time
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach(callback => callback(time))
    },
    settle(from, until) { for (let t = from; t <= until; t += 20) this.tick(t) },
  }
}

test('clouds float and one pop triggers exactly one shout and angry reaction', () => {
  const app = setup()
  assert.equal(app.layer.children.length, 13)
  const first = app.layer.children[0]
  const initial = first.style.transform
  app.tick(200)
  assert.notEqual(first.style.transform, initial)
  app.pop(0)
  app.pop(0)
  assert.deepEqual(app.counts, [1])
  assert.equal(first.disabled, true)
  assert.ok(first.classes.has('is-burst'))
  assert.ok(app.root.classes.has('is-upset'))
  app.settle(220, 600)
  assert.ok(Number(app.get('pink-angry-brows').attributes.get('opacity')) > .98)
  assert.equal(app.get('pink-shout-mouth').attributes.get('opacity'), '1')
  assert.match(app.get('cloud-status').textContent, /NO!/)
  app.garden.destroy()
})

test('another cloud restarts the tantrum; the character later becomes calm', () => {
  const app = setup()
  app.pop(0)
  app.settle(100, 900)
  app.pop(1)
  app.settle(920, 1700)
  assert.ok(app.root.classes.has('is-upset'))
  assert.deepEqual(app.counts, [1, 2])
  app.settle(1720, 2500)
  assert.equal(app.root.classes.has('is-upset'), false)
  assert.ok(Number(app.get('pink-angry-brows').attributes.get('opacity')) < .01)
  app.garden.destroy()
})

test('popped clouds return and can be popped again', () => {
  const app = setup()
  app.pop(0)
  app.tick(4300)
  assert.equal(app.layer.children[0].disabled, false)
  assert.equal(app.layer.children[0].classes.has('is-burst'), false)
  app.pop(0)
  assert.deepEqual(app.counts, [1, 2])
  app.garden.destroy()
})

test('reduced-motion clouds remain still and respawn inside the viewport', () => {
  const app = setup(true)
  const initial = app.layer.children[0].style.transform
  app.tick(200)
  assert.equal(app.layer.children[0].style.transform, initial)
  app.pop(0)
  app.tick(4500)
  const x = Number(app.layer.children[0].style.transform.match(/translate3d\(([-\d.]+)/)[1])
  assert.ok(x >= 0 && x <= 1280)
  app.garden.destroy()
})

test('hidden scenes pause rendering and teardown removes listeners', () => {
  const app = setup()
  app.document.hidden = true
  app.document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(app.frames.size, 0)
  app.document.hidden = false
  app.document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(app.frames.size, 1)
  app.garden.destroy()
  assert.equal(app.frames.size, 0)
  app.pop(0)
  assert.deepEqual(app.counts, [])
})

test('reaction and cloud lifecycle have a bounded duration', () => {
  assert.equal(cloudReaction(-1), 0)
  assert.equal(cloudReaction(300), 1)
  assert.ok(cloudReaction(900) > 0 && cloudReaction(900) < 1)
  assert.equal(cloudReaction(1200), 0)
  assert.equal(cloudPhase(null, 5000), 'floating')
  assert.equal(cloudPhase(100, 200), 'burst')
  assert.equal(cloudPhase(100, 2000), 'waiting')
  assert.equal(cloudPhase(100, 4300), 'respawn')
})

test('NO audio plays for every pop, obeys mute and stops on scene teardown', async () => {
  const voices = []
  globalThis.Audio = class {
    plays = 0
    pauses = 0
    constructor(url) { this.src = url; voices.push(this) }
    play() { this.plays++; return Promise.resolve() }
    pause() { this.pauses++ }
    removeAttribute() { this.src = '' }
    load() { this.unloaded = true }
  }
  // Voice playback still works when the optional synthesized pop sound is unsupported.
  globalThis.AudioContext = class { constructor() { throw new Error('unsupported') } }
  const audio = new CloudAudio('/audio/no.wav')
  for (let i = 0; i < 7; i++) audio.shout()
  assert.equal(voices.reduce((total, voice) => total + voice.plays, 0), 7)
  assert.equal(voices.length, 3)
  audio.setEnabled(false)
  audio.shout()
  assert.equal(voices.reduce((total, voice) => total + voice.plays, 0), 7)
  audio.setEnabled(true)
  audio.shout()
  assert.equal(voices.reduce((total, voice) => total + voice.plays, 0), 8)
  audio.destroy()
  assert.ok(voices.every(voice => voice.pauses > 0 && voice.src === '' && voice.unloaded))
  audio.shout()
  assert.equal(voices.reduce((total, voice) => total + voice.plays, 0), 8)
  await Promise.resolve()
})
