import { CHURCH_BOUNDS as bounds, walkable } from './church-model.ts'

export type FloorPoint = { x: number; z: number }
const step = .25, width = Math.round((bounds.maxX - bounds.minX) / step) + 1, height = Math.round((bounds.maxZ - bounds.minZ) / step) + 1
const point = (id: number): FloorPoint => ({ x: bounds.minX + id % width * step, z: bounds.minZ + Math.floor(id / width) * step })
const allowed = Uint8Array.from({ length: width * height }, (_, id) => { const p = point(id); return Number(walkable(p.x, p.z)) })
export function clearFloorSegment(a: FloorPoint, b: FloorPoint) {
  const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .06))
  for (let i = 0; i <= count; i++) if (!walkable(a.x + (b.x - a.x) * i / count, a.z + (b.z - a.z) * i / count)) return false
  return true
}
function nearest(p: FloorPoint) {
  const gx = Math.round((p.x - bounds.minX) / step), gz = Math.round((p.z - bounds.minZ) / step)
  let best = -1, distance = Infinity
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const x = gx + dx, z = gz + dz, id = z * width + x
    if (x < 0 || x >= width || z < 0 || z >= height || !allowed[id]) continue
    const q = point(id), d = Math.hypot(p.x - q.x, p.z - q.z)
    if (d < distance && clearFloorSegment(p, q)) { best = id; distance = d }
  }
  return best
}
/** A* on the same collision map used by the authoritative movement simulation. */
export function findChurchPath(start: FloorPoint, end: FloorPoint): FloorPoint[] | null {
  if (!walkable(start.x, start.z) || !walkable(end.x, end.z)) return null
  if (clearFloorSegment(start, end)) return [{ ...end }]
  const from = nearest(start), to = nearest(end)
  if (from < 0 || to < 0) return null
  const scores = new Float64Array(allowed.length).fill(Infinity), parents = new Int32Array(allowed.length).fill(-1), closed = new Uint8Array(allowed.length)
  const heap: { id: number; score: number }[] = []
  function push(id: number, score: number) {
    let i = heap.length; heap.push({ id, score })
    while (i > 0) { const parent = (i - 1) >> 1; if (heap[parent]!.score <= score) break; heap[i] = heap[parent]!; i = parent }
    heap[i] = { id, score }
  }
  function pop() {
    const first = heap[0]!, last = heap.pop()!
    if (heap.length) { let i = 0; while (i * 2 + 1 < heap.length) { let child = i * 2 + 1; if (child + 1 < heap.length && heap[child + 1]!.score < heap[child]!.score) child++; if (last.score <= heap[child]!.score) break; heap[i] = heap[child]!; i = child } heap[i] = last }
    return first.id
  }
  const goal = point(to), heuristic = (id: number) => { const p = point(id); return Math.hypot(p.x - goal.x, p.z - goal.z) }
  scores[from] = 0; push(from, heuristic(from))
  while (heap.length) {
    const id = pop(); if (closed[id]) continue; closed[id] = 1
    if (id === to) {
      const raw: FloorPoint[] = [{ ...end }]; for (let at = to; at !== -1; at = parents[at]!) raw.push(point(at)); raw.push(start); raw.reverse()
      const result: FloorPoint[] = []; let anchor = 0
      while (anchor < raw.length - 1) { let next = raw.length - 1; while (next > anchor + 1 && !clearFloorSegment(raw[anchor]!, raw[next]!)) next--; result.push(raw[next]!); anchor = next }
      return result
    }
    const x = id % width, z = Math.floor(id / width)
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dz) || x + dx < 0 || x + dx >= width || z + dz < 0 || z + dz >= height) continue
      const next = id + dz * width + dx
      if (!allowed[next] || closed[next] || !clearFloorSegment(point(id), point(next))) continue
      const score = scores[id]! + Math.hypot(dx, dz) * step
      if (score < scores[next]!) { scores[next] = score; parents[next] = id; push(next, score + heuristic(next)) }
    }
  }
  return null
}
