import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cameraCover, landmarkToSurface, FINGERTIPS, measureFingerMotion, fingerWaveResponse } from '../src/water-touch-model.ts'

test('all five fingertip landmarks are tracked per hand', () => {
  assert.deepEqual(FINGERTIPS, [4, 8, 12, 16, 20])
})

test('mirrors camera coordinates and converts top-left origin to surface bottom-left', () => {
  const cover = cameraCover(1280,720,1280,720)
  assert.deepEqual(landmarkToSurface(.2,.3,cover), { x: .8, y: .7 })
})

test('portrait cover crop keeps hand coordinates aligned with the camera', () => {
  const cover = cameraCover(720,1280,1280,720)
  const center = landmarkToSurface(.5,.5,cover)
  assert.deepEqual(center, { x: .5, y: .5 })
  assert.equal(landmarkToSurface(.5-cover.x/2,.5,cover).x, 1)
  assert.ok(landmarkToSurface(0,.5,cover).x > 1, 'cropped-out hand must stay outside the visible surface')
})

test('wide viewport crops vertically rather than stretching the video', () => {
  const cover = cameraCover(2000,500,640,480)
  assert.equal(cover.x, 1)
  assert.equal(cover.y, 1/3)
  assert.ok(Math.abs(landmarkToSurface(.5,.5-cover.y/2,cover).y - 1) < 1e-10)
})

function swipe(speed, fps) {
  let motion
  for (let i = 0; i <= fps / 2; i++) {
    motion = measureFingerMotion({ id: '0:8', x: .1 + speed * i / fps, y: .5, sampledAt: i / fps }, motion, 1)
  }
  return motion
}

test('fast fingertips produce substantially stronger and wider waves than slow fingertips', () => {
  const gentle = fingerWaveResponse(swipe(.15, 30).speed, 0)
  const strong = fingerWaveResponse(swipe(2, 30).speed, 0)
  assert.ok(strong.force > gentle.force * 15)
  assert.ok(strong.radius > gentle.radius * 1.8)
})

test('gesture power is consistent across camera rates and repeated render samples', () => {
  const rates = [15, 30, 60].map(fps => swipe(1.2, fps))
  for (const motion of rates) {
    assert.ok(Math.abs(motion.speed - 1.2) < .001)
    const repeated = measureFingerMotion(motion, motion, 1)
    assert.equal(repeated.speed, motion.speed, 'a render frame without new camera data must not erase speed')
  }
})

test('stationary jitter and stale samples do not produce strong waves', () => {
  assert.equal(fingerWaveResponse(.03, 0).force, 0)
  assert.ok(fingerWaveResponse(2.8, .3).force < .002)
  let motion = swipe(2, 30)
  for (let i = 1; i <= 15; i++) {
    motion = measureFingerMotion({ ...motion, sampledAt: .5 + i/30 }, motion, 1)
  }
  assert.equal(fingerWaveResponse(motion.speed, 0).force, 0)
})

test('tracking gaps and landmark teleports restart gently instead of generating a splash', () => {
  const before = swipe(1,30)
  for (const point of [
    { ...before, x: before.x+.1, sampledAt: before.sampledAt+.4 },
    { ...before, x: before.x+.8, sampledAt: before.sampledAt+1/30 },
  ]) {
    const motion = measureFingerMotion(point, before, 1)
    assert.equal(motion.speed, 0)
    assert.equal(motion.continuous, false)
  }
})
