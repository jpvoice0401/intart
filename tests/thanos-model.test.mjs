// Numeric checks only. No server, MediaPipe initialization, camera or browser.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ThanosSnapDetector, ThanosMoment, THANOS_EFFECT_MS, thanosDissolveField } from '../src/thanos-model.ts'

function hand({ id = 'Left', pose = 'contact', scale = 1, dx = 0, dy = 0, mirror = false, rotation = 0, mix = 1 } = {}) {
  const points = Array.from({ length: 21 }, () => ({ x: .5, y: .6, z: 0 }))
  Object.assign(points[0], { x: .5, y: .8 }); Object.assign(points[9], { x: .5, y: .5 })
  Object.assign(points[5], { x: .35, y: .55 }); Object.assign(points[17], { x: .65, y: .55 })
  Object.assign(points[12], { x: .5, y: .30 }); Object.assign(points[4], { x: .49, y: .31 })
  if (pose === 'recoil') {
    Object.assign(points[12], { x: .5 + .02 * mix, y: .30 + .23 * mix })
    Object.assign(points[4], { x: .49 - .24 * mix, y: .31 - .06 * mix })
  }
  if (pose === 'thumb-only') Object.assign(points[4], { x: .25, y: .25 })
  if (pose === 'open') { Object.assign(points[12], { x: .5, y: .06 }); Object.assign(points[4], { x: .23, y: .35 }) }
  if (pose === 'index-pinch') { Object.assign(points[4], { x: .3, y: .3 }); Object.assign(points[8], { x: .3, y: .3 }); Object.assign(points[12], { x: .5, y: .1 }) }
  for (const point of points) {
    const x = (point.x - .5) * scale, y = (point.y - .5) * scale
    point.x = .5 + (mirror ? -1 : 1) * (x * Math.cos(rotation) - y * Math.sin(rotation)) + dx
    point.y = .5 + x * Math.sin(rotation) + y * Math.cos(rotation) + dy
  }
  return { id, points }
}
function prepare(detector, options = {}, start = 0) {
  assert.equal(detector.update([hand(options)], start), null)
  assert.equal(detector.update([hand(options)], start + 40), null)
}

test('either hand and a mirrored image can snap', () => {
  for (const id of ['Left', 'Right']) for (const mirror of [false, true]) {
    const detector = new ThanosSnapDetector(); prepare(detector, { id, mirror })
    assert.equal(detector.update([hand({ id, mirror, pose: 'recoil' })], 80)?.hand, id)
  }
})
test('snap detection is independent of hand size and aspect ratio', () => {
  for (const scale of [.4, 1, 1.5]) for (const aspect of [.56, 1, 1.78]) {
    const detector = new ThanosSnapDetector()
    detector.update([hand({ scale })], 0, aspect); detector.update([hand({ scale })], 40, aspect)
    assert.ok(detector.update([hand({ scale, pose: 'recoil' })], 80, aspect))
  }
})
test('swapping the result order of two hands keeps their preparations separate', () => {
  const detector = new ThanosSnapDetector()
  const left = hand({ dx: -.25, scale: .5 }), right = hand({ id: 'Right', dx: .25, scale: .5, pose: 'open' })
  detector.update([left, right], 0); detector.update([right, left], 40)
  assert.equal(detector.update([right, hand({ dx: -.25, scale: .5, pose: 'recoil' })], 80)?.hand, 'Left')
})
test('index pinches, thumb-only release and open palms are not snaps', () => {
  for (const pose of ['index-pinch', 'thumb-only', 'open']) {
    const detector = new ThanosSnapDetector()
    if (pose === 'index-pinch') prepare(detector, { pose }); else prepare(detector)
    assert.equal(detector.update([hand({ pose })], 80), null)
  }
})
test('moving or rotating the whole hand cannot trigger a snap', () => {
  const detector = new ThanosSnapDetector(); prepare(detector)
  assert.equal(detector.update([hand({ dx: .15, dy: -.12, rotation: .65 })], 80), null)
})
test('slow release and expired preparations are rejected', () => {
  const detector = new ThanosSnapDetector(); prepare(detector)
  for (let i = 1; i <= 8; i++) assert.equal(detector.update([hand({ pose: 'recoil', mix: i / 8 })], 40 + i * 80), null)
  const stale = new ThanosSnapDetector(); prepare(stale)
  assert.equal(stale.update([hand({ pose: 'recoil' })], 500), null)
})
test('a brief fingertip occlusion can be bridged, but leaving the frame cannot', () => {
  const detector = new ThanosSnapDetector(); prepare(detector)
  detector.update([], 80); assert.equal(detector.handCount, 0)
  assert.ok(detector.update([hand({ pose: 'recoil' })], 120))
  detector.reset(); prepare(detector); detector.update([], 220)
  assert.equal(detector.update([hand({ pose: 'recoil' })], 260), null)
})
test('one-frame contact, invalid input and cooldown cannot create repeated triggers', () => {
  const detector = new ThanosSnapDetector()
  detector.update([hand()], 0); assert.equal(detector.update([hand({ pose: 'recoil' })], 40), null)
  detector.reset(); prepare(detector); assert.ok(detector.update([hand({ pose: 'recoil' })], 80))
  prepare(detector, {}, 160); assert.equal(detector.update([hand({ pose: 'recoil' })], 240), null)
  const invalid = hand(); invalid.points[12].x = NaN
  assert.equal(detector.update([invalid, { id: 'bad', points: [] }], 280), null)
  detector.reset(); prepare(detector, {}, 300); assert.ok(detector.update([hand({ pose: 'recoil' })], 380))
})
test('the disappearance completes and only reset permits another snap', () => {
  const moment = new ThanosMoment()
  assert.equal(moment.progress(100), 0); assert.equal(moment.snap(100), true); assert.equal(moment.snap(200), false)
  assert.equal(moment.progress(4300), 1); assert.equal(moment.finished(100 + THANOS_EFFECT_MS), true)
  moment.reset(); assert.equal(moment.snapped, false); assert.equal(moment.snap(7000), true)
})
test('dust release field stays bounded and deterministic across the image', () => {
  for (let x = 0; x <= 1; x += .037) for (let y = 0; y <= 1; y += .053) {
    const value = thanosDissolveField(x, y)
    assert.ok(value >= 0 && value <= 1); assert.equal(value, thanosDissolveField(x, y))
  }
})
