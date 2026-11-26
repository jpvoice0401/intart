export interface MinecraftBackgroundPixels {
  width: number
  height: number
  /** Alpha marks an actually observed background pixel, never a synthesized one. */
  data: Uint8ClampedArray<ArrayBuffer>
}

/** Immediate low-frequency preview; observed pixels stay byte-for-byte intact. */
export function previewMinecraftBackground(image: MinecraftBackgroundPixels): MinecraftBackgroundPixels {
  const levels = [{ ...image, data: image.data.slice() }]
  while (levels.at(-1)!.width > 1 || levels.at(-1)!.height > 1) {
    const child = levels.at(-1)!
    const width = Math.ceil(child.width / 2), height = Math.ceil(child.height / 2)
    const parent = { width, height, data: new Uint8ClampedArray(width * height * 4) }
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, count = 0
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const px = x * 2 + dx, py = y * 2 + dy, i = (py * child.width + px) * 4
        if (px >= child.width || py >= child.height || !child.data[i + 3]) continue
        r += child.data[i]!; g += child.data[i + 1]!; b += child.data[i + 2]!; count++
      }
      if (count) parent.data.set([r / count, g / count, b / count, 255], (y * width + x) * 4)
    }
    levels.push(parent)
  }
  const top = levels.at(-1)!
  if (!top.data[3]) top.data.set([22, 39, 30, 255])
  for (let level = levels.length - 2; level >= 0; level--) {
    const parent = levels[level + 1]!
    const child = level === 0 ? { ...image, data: image.data.slice() } : levels[level]!
    for (let y = 0; y < child.height; y++) for (let x = 0; x < child.width; x++) {
      const i = (y * child.width + x) * 4
      if (child.data[i + 3]) continue
      const px = Math.max(0, Math.min(parent.width - 1, (x - .5) / 2))
      const py = Math.max(0, Math.min(parent.height - 1, (y - .5) / 2))
      const x0 = Math.floor(px), y0 = Math.floor(py)
      const x1 = Math.min(x0 + 1, parent.width - 1), y1 = Math.min(y0 + 1, parent.height - 1)
      const fx = px - x0, fy = py - y0
      for (let c = 0; c < 3; c++) {
        const a = parent.data[(y0 * parent.width + x0) * 4 + c]! * (1 - fx) + parent.data[(y0 * parent.width + x1) * 4 + c]! * fx
        const b = parent.data[(y1 * parent.width + x0) * 4 + c]! * (1 - fx) + parent.data[(y1 * parent.width + x1) * 4 + c]! * fx
        child.data[i + c] = a * (1 - fy) + b * fy
      }
      child.data[i + 3] = 255
    }
    if (level === 0) return child
  }
  return { ...top, data: top.data.slice() }
}

/** Bounded exemplar completion: copy only complete, actually observed patches.
 * Grow inward from the hole boundary, matching its overlap and favoring nearby
 * rows so wall/floor lines continue. No neural model or network request.
 * Yields let the no-Worker fallback share the UI thread in short slices.
 * Related approach: https://gfx.cs.princeton.edu/pubs/Barnes_2009_PAR/ */
export function* synthesizeMinecraftBackground(image: MinecraftBackgroundPixels): Generator<void, MinecraftBackgroundPixels> {
  const { width: w, height: h, data: source } = image, count = w * h, radius = 3
  const output = previewMinecraftBackground(image), pixels = output.data
  yield
  if (w < 7 || h < 7) return output
  const stride = w + 1, integral = new Int32Array(stride * (h + 1))
  const filled = new Uint8Array(count), valid = new Uint8Array(count)
  for (let y = 0; y < h; y++) {
    let sum = 0
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      filled[p] = source[p * 4 + 3] ? 1 : 0
      sum += 1 - filled[p]!
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1]! + sum
    }
  }
  const centers = new Int32Array(count), rows = new Int32Array(h + 1)
  let total = 0
  for (let y = 0; y < h; y++) {
    rows[y] = total
    if (y < radius || y >= h - radius) continue
    for (let x = radius; x < w - radius; x++) {
      const x0 = x - radius, x1 = x + radius + 1, y0 = y - radius, y1 = y + radius + 1
      if (integral[y1 * stride + x1]! - integral[y0 * stride + x1]! - integral[y1 * stride + x0]! + integral[y0 * stride + x0]!) continue
      valid[y * w + x] = 1
      centers[total++] = y * w + x
    }
  }
  rows[h] = total
  if (!total) return output
  yield
  // Multi-source distance order and nearest legal exemplar lookup, O(pixels).
  const nearest = new Int32Array(count).fill(-1), queue = new Int32Array(count)
  let end = total
  for (let i = 0; i < total; i++) { const p = centers[i]!; queue[i] = p; nearest[p] = p }
  for (let i = 0; i < end; i++) {
    const p = queue[i]!, x = p % w
    for (let d = 0; d < 4; d++) {
      if ((d === 0 && x === 0) || (d === 1 && x === w - 1)) continue
      const next = p + (d === 0 ? -1 : d === 1 ? 1 : d === 2 ? -w : w)
      if (next < 0 || next >= count || nearest[next] !== -1) continue
      nearest[next] = nearest[p]!; queue[end++] = next
    }
    if ((i & 8191) === 0) yield
  }
  const matches = new Int32Array(count).fill(-1)
  const periods = new Int16Array(Math.ceil(h / 16))
  // Recognize strongly repeating horizontal textures before patch growth.
  // Otherwise a small greedy patch can extend a flat brick interior forever,
  // losing all vertical grout. Require a strong, measured repeat in real pixels.
  for (let band = 0; band < h; band += 16) {
    let mean = 0, square = 0, observations = 0
    const last = Math.min(h, band + 16)
    for (let y = band; y < last; y += 3) for (let x = 0; x < w; x += 3) {
      const i = (y * w + x) * 4
      if (!source[i + 3]) continue
      const value = (source[i]! + source[i + 1]! + source[i + 2]!) / 3
      mean += value; square += value * value; observations++
    }
    const variance = observations ? square / observations - (mean / observations) ** 2 : 0
    if (variance < 25) continue
    let period = 0, bestError = Infinity
    for (let lag = 8; lag <= Math.min(128, Math.floor(w / 3)); lag++) {
      let error = 0, samples = 0
      for (let y = band; y < last; y += 3) for (let x = 0; x + lag < w; x += 3) {
        const a = (y * w + x) * 4, b = a + lag * 4
        if (!source[a + 3] || !source[b + 3]) continue
        for (let c = 0; c < 3; c++) error += (source[a + c]! - source[b + c]!) ** 2
        samples++
      }
      if (samples >= 64 && error / (samples * 3) < bestError) { bestError = error / (samples * 3); period = lag }
    }
    if (period && bestError < Math.max(4, variance * .06)) periods[band / 16] = period
    yield
  }
  // At a wall/floor boundary one band can contain two different repeats.
  // Validate neighboring detected periods against each actual row instead of
  // extending the wall's pattern into the floor or blurring that transition.
  for (let y = 0; y < h; y++) {
    const band = Math.floor(y / 16)
    let period = 0, bestError = Infinity, mean = 0, square = 0, observations = 0
    for (let x = 0; x < w; x += 3) {
      const i = (y * w + x) * 4
      if (!source[i + 3]) continue
      const value = (source[i]! + source[i + 1]! + source[i + 2]!) / 3
      mean += value; square += value * value; observations++
    }
    const variance = observations ? square / observations - (mean / observations) ** 2 : 0
    for (const index of [band, band - 1, band + 1]) {
      const lag = periods[index]
      if (!lag) continue
      let error = 0, samples = 0
      for (let x = 0; x + lag < w; x += 3) {
        const a = (y * w + x) * 4, b = a + lag * 4
        if (!source[a + 3] || !source[b + 3]) continue
        for (let c = 0; c < 3; c++) error += (source[a + c]! - source[b + c]!) ** 2
        samples++
      }
      if (samples >= 24 && error / (samples * 3) < bestError) { bestError = error / (samples * 3); period = lag }
    }
    if (period && bestError < Math.max(4, variance * .06)) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x
        if (filled[p]) continue
        for (let distance = period; distance < w; distance += period) {
          const sx = x - distance >= 0 && source[(p - distance) * 4 + 3] ? x - distance
            : x + distance < w && source[(p + distance) * 4 + 3] ? x + distance : -1
          if (sx < 0) continue
          const s = y * w + sx, i = p * 4, j = s * 4
          pixels[i] = source[j]!; pixels[i + 1] = source[j + 1]!; pixels[i + 2] = source[j + 2]!
          pixels[i + 3] = 255; filled[p] = 1; matches[p] = s
          break
        }
      }
    }
    if ((y & 15) === 0) yield
  }
  const deltas = new Int32Array(49), values = new Float32Array(147), weights = new Float32Array(49)
  let seed = 0x734f211, patches = 0
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296 }
  for (let order = 0; order < end; order++) {
    const target = queue[order]!
    if (filled[target]) continue
    const tx = target % w, ty = Math.floor(target / w)
    let samples = 0, weightSum = 0
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (tx + dx < 0 || tx + dx >= w || ty + dy < 0 || ty + dy >= h) continue
      const p = target + dy * w + dx, j = p * 4
      deltas[samples] = dy * w + dx
      const weight = source[j + 3] ? 1 : filled[p] ? .4 : .025
      weights[samples] = weight; weightSum += weight
      values[samples * 3] = pixels[j]!; values[samples * 3 + 1] = pixels[j + 1]!; values[samples * 3 + 2] = pixels[j + 2]!
      samples++
    }
    let best = nearest[target]!, bestError = Infinity
    const consider = (p: number) => {
      if (p < 0 || p >= count || !valid[p]) return
      const dx = p % w - tx, dy = Math.floor(p / w) - ty
      let error = (.004 * dx * dx + .45 * dy * dy) * weightSum
      for (let s = 0; s < samples; s++) {
        const j = (p + deltas[s]!) * 4, v = s * 3
        const r = source[j]! - values[v]!, g = source[j + 1]! - values[v + 1]!, b = source[j + 2]! - values[v + 2]!
        error += (r * r + g * g + b * b) * weights[s]!
        if (error >= bestError) return
      }
      bestError = error; best = p
    }
    consider(best)
    for (const offset of [-1, 1, -w, w, -4, 4, -4 * w, 4 * w]) {
      const neighbor = target + offset
      if (neighbor >= 0 && neighbor < count && Math.abs(neighbor % w - tx) <= 4 && matches[neighbor]! >= 0) consider(matches[neighbor]! - offset)
    }
    // Same-row candidates retain horizontal grout, shelves and wall boundaries.
    for (const row of [ty, Math.max(0, ty - 4), Math.min(h - 1, ty + 4)]) {
      const start = rows[row]!, length = rows[row + 1]! - start
      for (let i = 0; i < Math.min(16, length); i++) consider(centers[start + Math.floor((i + .5) * length / Math.min(16, length))]!)
    }
    for (let i = 0; i < 24; i++) consider(centers[Math.floor(random() * total)]!)
    for (let range = Math.max(w, h); range >= 2; range = Math.floor(range / 2)) {
      const x = Math.max(0, Math.min(w - 1, best % w + Math.round((random() * 2 - 1) * range)))
      const y = Math.max(0, Math.min(h - 1, Math.floor(best / w) + Math.round((random() * 2 - 1) * range)))
      consider(nearest[y * w + x]!)
    }
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (tx + dx < 0 || tx + dx >= w || ty + dy < 0 || ty + dy >= h) continue
      const p = target + dy * w + dx
      if (filled[p]) continue
      const s = best + dy * w + dx, j = p * 4, k = s * 4
      pixels[j] = source[k]!; pixels[j + 1] = source[k + 1]!; pixels[j + 2] = source[k + 2]!
      pixels[j + 3] = 255; filled[p] = 1; matches[p] = s
    }
    if ((++patches & 15) === 0) yield
  }
  return output
}
