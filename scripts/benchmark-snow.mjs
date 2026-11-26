import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const { HumanSnowField, SnowPhysics } = await import(pathToFileURL(resolve(process.argv[2] ?? 'src/snow-physics.ts')).href)
const field = new HumanSnowField(1280,720)
for (let y = 0; y < field.rows; y++) for (let x = 0; x < field.columns; x++) {
  const px = (x+.5)*1280/field.columns, py = (y+.5)*720/field.rows
  field.solid[y*field.columns+x] = py > 460 && px > 250 && px < 1030 ? 1 : 0
}
field.rebuild()
let seed = 37
const random = () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed/4294967296 }
const snow = new SnowPhysics(1280,720,random)
for (let i = 0; i < 8; i++) snow.emit(640,80+i*42,760,200)
for (let i = 0; i < 90; i++) snow.update(1/60,field)
const samples = []
for (let i = 0; i < 240; i++) {
  const start = performance.now(); snow.update(1/60,field); samples.push(performance.now()-start)
}
samples.sort((a,b) => a-b)
console.log(JSON.stringify({ particles: snow.particles.length, steps: samples.length,
  meanMs: samples.reduce((a,b) => a+b,0)/samples.length,
  p95Ms: samples[Math.floor(samples.length*.95)], maxMs: samples.at(-1),
}))
