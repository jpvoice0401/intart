import type { MinecraftMask } from './minecraft-model'

/** Keep the hit count and fade attached to an overlapping silhouette. The
 * selfie model is semantic, so people touching can form one component. */
export class MinecraftSubject {
  private previous: MinecraftMask | null = null
  private labels = new Int32Array(0)
  private queue = new Int32Array(0)
  private buffers = [new Float32Array(0), new Float32Array(0)]

  lock(mask: MinecraftMask) {
    this.previous = this.select(mask, null)
    return this.previous
  }

  follow(mask: MinecraftMask) {
    if (!this.previous) return null
    const next = this.select(mask, this.previous)
    if (next) this.previous = next
    return next
  }

  clear() {
    this.previous = null
  }

  private select(input: MinecraftMask, previous: MinecraftMask | null): MinecraftMask | null {
    const { width, height, mask } = input
    const count = width * height
    if (this.labels.length !== count) {
      this.labels = new Int32Array(count)
      this.queue = new Int32Array(count)
      this.buffers = [new Float32Array(count), new Float32Array(count)]
    }
    if (previous && (previous.width !== width || previous.height !== height)) return null
    const labels = this.labels
    const queue = this.queue
    labels.fill(0)
    let expected = 0
    if (previous) for (const value of previous.mask) if (value >= .5) expected++
    let center = Math.floor(height / 2) * width + Math.floor(width / 2)
    if (!previous) {
      // Use the same four central samples as the crosshair's bilinear test.
      for (let y = Math.floor((height - 1) / 2); y <= Math.floor(height / 2); y++) {
        for (let x = Math.floor((width - 1) / 2); x <= Math.floor(width / 2); x++) {
          const pixel = y * width + x
          if (mask[pixel]! > mask[center]!) center = pixel
        }
      }
    }
    let id = 0
    let bestId = 0
    let bestScore = 0
    for (let seed = 0; seed < count; seed++) {
      if (labels[seed] || mask[seed]! < .35) continue
      labels[seed] = ++id
      queue[0] = seed
      let end = 1
      let overlap = 0
      for (let i = 0; i < end; i++) {
        const point = queue[i]!
        if (previous && mask[point]! >= .5 && previous.mask[point]! >= .5) overlap++
        const x = point % width
        for (let direction = 0; direction < 4; direction++) {
          if ((direction === 0 && x === 0) || (direction === 1 && x === width - 1)) continue
          const next = point + (direction === 0 ? -1 : direction === 1 ? 1 : direction === 2 ? -width : width)
          if (next < 0 || next >= count || labels[next] || mask[next]! < .35) continue
          labels[next] = id
          queue[end++] = next
        }
      }
      if (!previous && labels[center] === id) {
        bestId = id
        break
      }
      const score = overlap / Math.max(expected, end, 1)
      if (previous && score > bestScore && overlap >= expected * .15) {
        bestId = id
        bestScore = score
      }
    }
    if (!bestId) return null
    const selected = (previous?.mask === this.buffers[0] ? this.buffers[1] : this.buffers[0])!
    for (let i = 0; i < count; i++) selected[i] = labels[i] === bestId ? mask[i]! : 0
    return { mask: selected, width, height }
  }
}
