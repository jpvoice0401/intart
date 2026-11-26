import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Fireworks, samplePath } from '../src/fireworks.ts'

// Run the real pointer handlers and animation loop without opening a development server.
function setup() {
  let now = 100
  let nextId = 0
  const frames = new Map()
  const fills = []
  const context = new Proxy({
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect: (...args) => fills.push(args),
  }, { get: (target, key) => key in target ? target[key] : () => {} })
  const canvas = new EventTarget()
  const captures = new Set()
  Object.assign(canvas, {
    getContext: () => context,
    focus() {},
    setPointerCapture: id => captures.add(id),
    hasPointerCapture: id => captures.has(id),
    releasePointerCapture: id => captures.delete(id),
  })
  const window = new EventTarget()
  Object.assign(window, { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 2, matchMedia: () => ({ matches: false }) })
  const document = new EventTarget()
  document.hidden = false
  Object.assign(globalThis, {
    window, document,
    performance: { now: () => now },
    requestAnimationFrame: callback => { frames.set(++nextId, callback); return nextId },
    cancelAnimationFrame: id => frames.delete(id),
  })
  const hint = { style: {}, classList: { remove() {}, toggle() {} } }
  const counter = { textContent: '' }
  const scene = new Fireworks(canvas, hint, counter)
  return {
    scene, counter, fills, canvas, window, document,
    time(value) { now = value },
    emit(type, props = {}) {
      const event = new Event(type, { cancelable: true })
      Object.assign(event, { pointerId: 1, button: 0, clientX: 300, clientY: 250, ...props })
      canvas.dispatchEvent(event)
    },
    tick(value) {
      now = value
      const callbacks = [...frames.values()]
      frames.clear()
      fills.length = 0
      for (const callback of callbacks) callback(value)
    },
  }
}

test('click bursts at the released position; holding increases its size', () => {
  const app = setup()
  app.emit('pointerdown')
  app.time(160)
  app.emit('pointerup')
  assert.match(app.counter.textContent, /^1개의/)
  app.tick(176)
  const [x, y, size] = app.fills[0]
  assert.ok(Math.abs(x + size / 2 - 300) < 0.001)
  assert.ok(Math.abs(y + size / 2 - 250) < 0.001)
  app.scene.clear()
  app.time(1000)
  app.emit('pointerdown')
  app.time(3500)
  app.emit('pointerup')
  app.tick(3516)
  assert.ok(app.fills[0][2] > size * 2)
  app.scene.destroy()
})

test('drag bursts wait for release and run along the entire path in order', () => {
  const app = setup()
  app.emit('pointerdown', { clientX: 100, clientY: 200 })
  app.emit('pointermove', { clientX: 196, clientY: 200 })
  app.emit('pointermove', { clientX: 196, clientY: 296 })
  app.tick(150)
  assert.equal(app.counter.textContent, '')
  app.time(200)
  app.emit('pointerup', { clientX: 196, clientY: 296 })
  app.tick(200)
  assert.match(app.counter.textContent, /^1개의/)
  app.tick(290)
  assert.match(app.counter.textContent, /^2개의/)
  app.tick(380)
  assert.match(app.counter.textContent, /^3개의/)
  app.tick(470)
  assert.match(app.counter.textContent, /^4개의/)
  app.tick(560)
  assert.match(app.counter.textContent, /^5개의/)
  const [x, y, size] = app.fills.at(-1)
  assert.ok(Math.abs(x + size / 2 - 196) < 0.001)
  assert.ok(Math.abs(y + size / 2 - 296) < 0.001)
  app.scene.destroy()
})

test('clear cancels pending chains and pointer cancellation does not burst', () => {
  const app = setup()
  app.emit('pointerdown')
  app.emit('pointercancel')
  app.emit('pointerup')
  assert.equal(app.counter.textContent, '')
  app.emit('pointerdown')
  app.emit('pointermove', { clientX: 700 })
  app.emit('pointerup', { clientX: 700 })
  app.scene.clear()
  app.tick(5000)
  assert.equal(app.counter.textContent, '오늘 밤의 첫 불꽃을 기다리는 중')
  assert.equal(app.fills.length, 0)
  app.scene.destroy()
})

test('touch pointers and keyboard can release independent fireworks', () => {
  const app = setup()
  app.emit('pointerdown', { pointerId: 7, pointerType: 'touch' })
  app.emit('pointerdown', { pointerId: 8, pointerType: 'touch', clientX: 500 })
  app.emit('pointerup', { pointerId: 7, pointerType: 'touch' })
  app.emit('pointerup', { pointerId: 8, pointerType: 'touch', clientX: 500 })
  assert.match(app.counter.textContent, /^2개의/)
  app.emit('keydown', { code: 'Space', repeat: false })
  app.emit('keydown', { code: 'Space', repeat: true })
  app.emit('keyup', { code: 'Space' })
  assert.match(app.counter.textContent, /^3개의/)
  app.scene.destroy()
})

test('hidden tabs cancel unfinished input and queued chains', () => {
  const app = setup()
  app.emit('pointerdown')
  app.document.hidden = true
  app.document.dispatchEvent(new Event('visibilitychange'))
  app.document.hidden = false
  app.document.dispatchEvent(new Event('visibilitychange'))
  app.emit('pointerup')
  app.tick(9000)
  assert.equal(app.counter.textContent, '')
  app.scene.destroy()
})

test('path sampling retains endpoints, corners and repeated-point safety', () => {
  assert.deepEqual(samplePath([]), [])
  assert.deepEqual(samplePath([{ x: 2, y: 3 }, { x: 2, y: 3 }]), [{ x: 2, y: 3 }])
  assert.deepEqual(samplePath([{ x: 0, y: 0 }, { x: 96, y: 0 }, { x: 96, y: 96 }], 48), [
    { x: 0, y: 0 }, { x: 48, y: 0 }, { x: 96, y: 0 }, { x: 96, y: 48 }, { x: 96, y: 96 },
  ])
})
