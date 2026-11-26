import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drawMinecraftHud } from '../src/minecraft-sword.ts'

test('armor, health and hunger use equally sized, non-overlapping icon cells', () => {
  const draws = []
  const context = { clearRect() {}, fillRect() {}, drawImage(...args) { draws.push(args) } }
  const canvas = { getContext: () => context }
  const images = { icons: {}, gui: {}, sword: {} }
  drawMinecraftHud(canvas, images)
  const rows = [9, 0, 27].map(y => draws.filter(([image, x, sy]) => image === images.icons && x === 16 && sy === y))
  for (const row of rows) {
    assert.equal(row.length, 10)
    for (let i = 0; i < row.length; i++) {
      const [, , , , , x, y, width, height] = row[i]
      assert.equal(width, 9)
      assert.equal(height, 9)
      assert.ok(x >= 0 && y >= 0 && x + width <= canvas.width && y + height <= canvas.height)
      if (i) assert.ok(row[i - 1][5] + row[i - 1][7] <= x, 'Adjacent icons must not overlap')
    }
  }
  const health = rows[1], hunger = rows[2]
  const span = row => row.at(-1)[5] + row.at(-1)[7] - row[0][5]
  assert.equal(span(health), span(hunger))
  assert.equal(health[0][6], hunger[0][6])
  assert.ok(health.at(-1)[5] + health.at(-1)[7] < hunger[0][5])
  assert.equal(context.imageSmoothingEnabled, false)
})
