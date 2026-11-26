import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gazeAt, smoothGaze, winkOpenness, blinkOpenness, CharacterController, ExpressionDirector } from '../src/character.ts'

class Element {
  attributes = new Map()
  styles = new Map()
  classes = new Set()
  textContent = ''
  style = { setProperty: (key, value) => this.styles.set(key, value) }
  classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name) }
  setAttribute(key, value) { this.attributes.set(key, value) }
  getBoundingClientRect() { return { left: 440, top: 200, width: 400, height: 400 } }
}

function setup(random = () => .5) {
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
  Object.assign(window, { innerWidth: 1280, innerHeight: 800, matchMedia: () => ({ matches: false }) })
  const document = new EventTarget()
  document.hidden = false
  Object.assign(globalThis, {
    window, document, performance: { now: () => now },
    requestAnimationFrame: callback => { frames.set(++id, callback); return id },
    cancelAnimationFrame: frame => frames.delete(frame),
  })
  const originalRandom = Math.random
  Math.random = random
  let character
  try { character = new CharacterController(root) } finally { Math.random = originalRandom }
  return {
    root, character, window, document, frames,
    get(id) { return elements.get(`#${id}`) },
    emit(type, props = {}) {
      const event = new Event(type)
      Object.assign(event, { clientX: 1180, clientY: 400, isPrimary: true, button: 0, detail: 1, relatedTarget: null, ...props })
      window.dispatchEvent(event)
    },
    tick(time) {
      now = time
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach(callback => callback(time))
    },
    settle(from, until) {
      for (let t = from; t <= until; t += 20) this.tick(t)
    },
  }
}

test('gaze is centered, points in all directions and stays within the face', () => {
  const center = { x: 640, y: 400 }
  assert.deepEqual(gazeAt(center, center, 1280, 800), { x: 0, y: 0 })
  for (const point of [{ x: 1e8, y: 1e8 }, { x: -1e8, y: -1e8 }, { x: 640, y: -1000 }]) {
    const gaze = gazeAt(point, center, 1280, 800)
    assert.ok(Math.hypot(gaze.x, gaze.y) <= 1.000001)
    assert.equal(Math.sign(gaze.y), Math.sign(point.y - center.y))
  }
  const small = gazeAt({ x: 10, y: 10 }, { x: 0, y: 0 }, 0, 0)
  assert.ok(Number.isFinite(small.x) && Number.isFinite(small.y))
})

test('smoothing approaches the target without overshooting, independent of frame rate', () => {
  const target = { x: 1, y: -0.5 }
  let fast = { x: 0, y: 0 }
  let slow = { x: 0, y: 0 }
  for (let i = 0; i < 120; i++) fast = smoothGaze(fast, target, 1 / 120)
  for (let i = 0; i < 30; i++) slow = smoothGaze(slow, target, 1 / 30)
  assert.ok(Math.abs(fast.x - slow.x) < 1e-10)
  assert.ok(fast.x > 0.99 && fast.x <= 1)
  assert.ok(fast.y >= -0.5 && fast.y < -0.49)
})

test('wink closes one eye, holds briefly and reopens smoothly', () => {
  assert.equal(winkOpenness(-100), 1)
  assert.ok(winkOpenness(80) > 0.03 && winkOpenness(80) < 1)
  assert.ok(Math.abs(winkOpenness(200) - 0.03) < 1e-9)
  assert.ok(winkOpenness(400) > 0.03 && winkOpenness(400) < 1)
  assert.equal(winkOpenness(580), 1)
  assert.equal(blinkOpenness(0), 1)
  assert.ok(blinkOpenness(90) < 0.04)
})

test('pointer movement changes facial features, pupils and brows together', () => {
  const app = setup()
  app.emit('pointermove')
  app.settle(100, 1100)
  assert.ok(Number(app.root.styles.get('--look-x')) > 0.99)
  assert.match(app.get('face-rig').attributes.get('transform'), /translate\(21\./)
  const pupilX = Number(app.get('left-pupil').attributes.get('transform').match(/translate\(([-\d.]+)/)[1])
  assert.ok(pupilX > 9.9 && pupilX <= 10)
  assert.equal(app.get('left-pupil').attributes.get('transform'), app.get('right-pupil').attributes.get('transform'))
  app.character.destroy()
})

test('click locks gaze at the clicked point while winking, then follows the pointer again', () => {
  const app = setup()
  app.emit('click', { clientX: 0, clientY: 0 })
  app.emit('pointermove', { clientX: 1280, clientY: 800 })
  app.settle(100, 440)
  assert.ok(Number(app.root.styles.get('--look-x')) < 0)
  assert.equal(app.get('left-eye-open').attributes.get('transform'), 'scale(1 1.0000)')
  assert.equal(app.get('right-eye-open').attributes.get('transform'), 'scale(1 0.0300)')
  assert.ok(Number(app.get('right-eye-wink').attributes.get('opacity')) > .98)
  assert.ok(Number(app.get('right-eye-open').attributes.get('opacity')) < .01)
  assert.equal(app.get('right-eye-closed').attributes.get('opacity'), '0')
  assert.ok(app.root.classes.has('is-winking'))
  app.settle(460, 1700)
  assert.ok(Number(app.root.styles.get('--look-x')) > 0)
  assert.equal(app.get('right-eye-open').attributes.get('transform'), 'scale(1 1.0000)')
  assert.equal(app.root.classes.has('is-winking'), false)
  app.character.destroy()
})

test('rapid new clicks target the latest point; keyboard clicks retain the current gaze', () => {
  const app = setup()
  app.emit('click', { clientX: 0 })
  app.tick(120)
  app.emit('click', { clientX: 1280 })
  app.settle(140, 400)
  assert.ok(Number(app.root.styles.get('--look-x')) > 0.95)
  app.emit('click', { detail: 0, clientX: 0, clientY: 0 })
  app.settle(420, 700)
  assert.ok(Number(app.root.styles.get('--look-x')) > 0.99)
  app.character.destroy()
})

test('leaving the window recenters the face and a natural blink never shows the wink eye', () => {
  const app = setup()
  app.emit('pointermove')
  app.settle(100, 800)
  app.emit('pointerout')
  app.settle(820, 1800)
  assert.ok(Math.abs(Number(app.root.styles.get('--look-x'))) < 0.001)
  app.tick(3600)
  app.tick(3690)
  assert.equal(app.get('right-eye-wink').attributes.get('opacity'), '0')
  assert.ok(Number(app.get('left-eye-closed').attributes.get('opacity')) > 0.9)
  app.character.destroy()
})

test('movement opens the mouth and it gently settles when movement stops', () => {
  const app = setup()
  app.tick(100)
  const resting = Number(app.get('mouth-open').attributes.get('ry'))
  app.emit('pointermove')
  app.settle(116, 196)
  assert.ok(Number(app.get('mouth-open').attributes.get('ry')) > resting + 2)
  app.settle(216, 1700)
  assert.ok(Math.abs(Number(app.get('mouth-open').attributes.get('ry')) - resting) < .1)
  app.character.destroy()
})

test('stillness leads to sleepy eyes and moving the pointer wakes the character', () => {
  const app = setup(() => 0)
  app.settle(100, 5000)
  assert.equal(app.root.attributes.get('data-expression'), 'sleepy')
  assert.ok(Number(app.get('sleep-marks').attributes.get('opacity')) > .4)
  assert.ok(app.root.classes.has('is-sleepy'))
  app.emit('pointermove')
  app.settle(5020, 6000)
  assert.equal(app.root.attributes.get('data-expression'), 'curious')
  assert.equal(app.root.classes.has('is-sleepy'), false)
  assert.ok(Number(app.get('sleep-marks').attributes.get('opacity')) < .01)
  assert.equal(app.get('right-eye-wink').attributes.get('opacity'), '0')
  app.character.destroy()
})

test('idle yawning opens the mouth wide and closes both eyes without winking', () => {
  const app = setup(() => 0)
  app.settle(100, 6600)
  assert.equal(app.root.attributes.get('data-expression'), 'yawn')
  assert.ok(Number(app.get('mouth-open').attributes.get('ry')) > 35)
  assert.equal(app.get('left-eye-open').attributes.get('transform'), app.get('right-eye-open').attributes.get('transform'))
  assert.equal(app.get('right-eye-wink').attributes.get('opacity'), '0')
  app.character.destroy()
})

test('random expression pools include laughs, pouts, glares, surprise and yawns, never a wink', () => {
  let seed = 17
  const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647 }
  const active = new ExpressionDirector(0, random)
  const idle = new ExpressionDirector(0, random)
  const seen = new Set()
  for (let t = 0; t < 300000; t += 4000) {
    active.move(t)
    seen.add(active.update(t))
    seen.add(idle.update(t))
  }
  assert.deepEqual([...seen].sort(), ['curious', 'surprised', 'happy', 'pout', 'glare', 'sleepy', 'yawn'].sort())
  assert.equal(seen.has('wink'), false)
})

test('automatic expressions keep both eyes coordinated; only a click can wink', () => {
  const app = setup()
  for (let t = 100; t < 18000; t += 100) {
    if (t < 7000) app.emit('pointermove', { clientX: 650 + t % 300 })
    app.tick(t)
    assert.equal(app.get('left-eye-open').attributes.get('transform'), app.get('right-eye-open').attributes.get('transform'))
    assert.equal(app.get('right-eye-wink').attributes.get('opacity'), '0')
  }
  app.emit('click')
  app.settle(18000, 18320)
  assert.ok(Number(app.get('right-eye-wink').attributes.get('opacity')) > .98)
  assert.equal(app.get('left-eye-open').attributes.get('transform'), 'scale(1 1.0000)')
  app.character.destroy()
})

test('hidden pages stop rendering; disposal removes animation and listeners', () => {
  const app = setup()
  app.document.hidden = true
  app.document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(app.frames.size, 0)
  app.document.hidden = false
  app.document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(app.frames.size, 1)
  app.character.destroy()
  assert.equal(app.frames.size, 0)
  app.emit('click')
  assert.equal(app.root.classes.has('is-winking'), false)
})
