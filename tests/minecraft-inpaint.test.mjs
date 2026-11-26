// Pure pixel checks only: no Vite server, browser, camera or network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { previewMinecraftBackground, synthesizeMinecraftBackground } from '../src/minecraft-inpaint.ts'

function complete(image) {
  const job = synthesizeMinecraftBackground(image)
  let step = job.next()
  while (!step.done) step = job.next()
  return step.value
}
function room(hole) {
  const width = 512, height = 288, data = new Uint8ClampedArray(width * height * 4)
  const truth = data.slice()
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const brick = y < 194 ? Math.floor(x / 44 + (Math.floor(y / 28) % 2) * .5) : Math.floor(x / 24)
    const line = y < 194 ? y % 28 < 2 || (x + (Math.floor(y / 28) % 2) * 22) % 44 < 2 : y % 20 < 2 || x % 24 < 2
    const tint = line ? 48 : (brick % 2 ? 158 : 183) + (x % 4 === 0 ? 8 : 0)
    const i = (y * width + x) * 4
    truth.set([tint, tint + 8, tint + 13, 255], i)
    // Hidden RGB deliberately contains a red person, not the true room.
    data.set(hole(x, y) ? [255, 0, 0, 0] : truth.subarray(i, i + 4), i)
  }
  return { width, height, data, truth }
}
function checkObserved(image, result) {
  for (let i = 0; i < image.data.length; i += 4) {
    assert.equal(result.data[i + 3], 255, 'completion must be opaque')
    if (image.data[i + 3]) assert.deepEqual(result.data.subarray(i, i + 4), image.data.subarray(i, i + 4), 'real background must remain unchanged')
    else assert.ok(result.data[i + 1] > 0, 'unobserved person RGB must not become a source patch')
  }
}
function squaredError(image, result) {
  let error = 0, count = 0
  for (let i = 0; i < image.data.length; i += 4) if (!image.data[i + 3]) {
    for (let c = 0; c < 3; c++) error += (result.data[i + c] - image.truth[i + c]) ** 2
    count += 3
  }
  return error / count
}

test('repeat recognition preserves wall and floor texture across an obscured boundary', () => {
  const image = room((x, y) => x > 170 && x < 342 && y > 24), source = image.data.slice()
  const result = complete(image), preview = previewMinecraftBackground(image)
  checkObserved(image, result)
  assert.deepEqual(image.data, source, 'completion must not modify its observed/source mask')
  assert.ok(squaredError(image, result) < squaredError(image, preview) * .05, 'repeating texture must be substantially closer to the original than color diffusion')
})
test('a silhouette touching the frame edge still fills without changing the visible room', () => {
  const image = room((x, y) => x < 230 && y > 60)
  checkObserved(image, complete(image))
})
test('irregular textures use only observed patches, without leaking masked RGB', () => {
  const width = 96, height = 64, data = new Uint8ClampedArray(width * height * 4)
  let state = 12345
  for (let p = 0; p < width * height; p++) {
    state = (Math.imul(state, 1664525) + 1013904223) | 0
    const value = 32 + ((state >>> 0) % 180), x = p % width, y = Math.floor(p / width)
    data.set(x > 30 && x < 67 && y > 10 ? [255, 0, 0, 0] : [value, value + 1, value + 2, 255], p * 4)
  }
  checkObserved({ width, height, data }, complete({ width, height, data }))
})
test('unoccluded room is unchanged', () => {
  const image = room(() => false)
  assert.deepEqual(complete(image).data, image.data)
})
test('fully occluded and tiny images have a safe opaque fallback without source mutation', () => {
  for (const [width, height] of [[1, 1], [3, 2], [64, 48]]) {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < data.length; i += 4) data[i] = 255
    const source = data.slice(), image = { width, height, data }
    checkObserved(image, complete(image)); checkObserved(image, previewMinecraftBackground(image))
    assert.deepEqual(data, source)
  }
})
test('abandoning a sliced completion leaves its input intact', () => {
  const image = room((x, y) => x > 170 && x < 342 && y > 24), source = image.data.slice()
  const job = synthesizeMinecraftBackground(image)
  job.next(); job.next(); job.return()
  assert.deepEqual(image.data, source)
})
