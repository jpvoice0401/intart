// Extract only the publicly served daeseongjeon mesh, preserving its original materials.
// Source: https://mv.fgtv.com/three/world37.glb (the official site's exterior map).
import fs from 'node:fs/promises'
const bytes = await fs.readFile(new URL('../references/church/world37.glb', import.meta.url))
const jsonLength = bytes.readUInt32LE(12)
const source = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString())
const binary = bytes.subarray(28 + jsonLength)
const node = source.nodes.find(n => n.name === 'daeseongjeon')
if (!node) throw new Error('The source contains no daeseongjeon mesh')
const result = { asset: { version: '2.0', generator: 'int_art: isolated official daeseongjeon exterior' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ ...node, mesh: 0 }], meshes: [structuredClone(source.meshes[node.mesh])], accessors: [], bufferViews: [], materials: [], buffers: [{ byteLength: 0 }], extensionsUsed: source.extensionsUsed }
const accessorMap = new Map(), viewMap = new Map(), materialMap = new Map(), chunks = []
let offset = 0
function view(id) {
  if (viewMap.has(id)) return viewMap.get(id)
  const old = source.bufferViews[id], next = result.bufferViews.length
  const data = binary.subarray(old.byteOffset ?? 0, (old.byteOffset ?? 0) + old.byteLength)
  result.bufferViews.push({ ...old, buffer: 0, byteOffset: offset }); chunks.push(data); offset += data.length
  const padding = (4 - offset % 4) % 4; if (padding) { chunks.push(Buffer.alloc(padding)); offset += padding }
  viewMap.set(id, next); return next
}
function accessor(id) {
  if (accessorMap.has(id)) return accessorMap.get(id)
  const old = source.accessors[id]
  if (old.sparse) throw new Error('Sparse accessor requires explicit extraction support')
  const next = result.accessors.length; result.accessors.push({ ...old, bufferView: view(old.bufferView) }); accessorMap.set(id, next); return next
}
for (const primitive of result.meshes[0].primitives) {
  primitive.indices = accessor(primitive.indices)
  for (const key of Object.keys(primitive.attributes)) primitive.attributes[key] = accessor(primitive.attributes[key])
  const id = primitive.material
  if (!materialMap.has(id)) {
    const material = source.materials[id]
    if (JSON.stringify(material).includes('Texture')) throw new Error('Textured material requires explicit extraction support')
    materialMap.set(id, result.materials.length); result.materials.push(material)
  }
  primitive.material = materialMap.get(id)
}
result.buffers[0].byteLength = offset
const encoded = Buffer.from(JSON.stringify(result)), json = Buffer.concat([encoded, Buffer.alloc((4 - encoded.length % 4) % 4, 32)]), bin = Buffer.concat(chunks)
const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + bin.length, 8); header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16)
const binaryHeader = Buffer.alloc(8); binaryHeader.writeUInt32LE(bin.length); binaryHeader.writeUInt32LE(0x004e4942, 4)
await fs.mkdir(new URL('../public/church/', import.meta.url), { recursive: true })
await fs.writeFile(new URL('../public/church/daeseongjeon.glb', import.meta.url), Buffer.concat([header, json, binaryHeader, bin]))
console.log(`Extracted ${result.meshes[0].primitives.length} material groups; ${bin.length} geometry bytes; no other buildings included.`)
