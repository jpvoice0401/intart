import assert from 'node:assert/strict'
import { open, readdir, readFile, stat } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'

// File-only verification: never starts Vite, a preview server, or a browser.
const base = process.argv[2] ?? process.env.VITE_BASE_PATH ?? '/intart/'
assert.ok(base.startsWith('/') && base.endsWith('/') && !base.includes('..'), 'Expected an absolute base path ending in /')
const output = resolve('dist')
const files = []
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    assert.ok(!entry.isSymbolicLink(), `Pages artifacts cannot contain symbolic links: ${path}`)
    if (entry.isDirectory()) await collect(path)
    else files.push(path)
  }
}
await collect(output)
const available = new Set(files)
const assetExtension = /\.(?:js|mjs|css|html|svg|png|jpe?g|webp|gif|ico|mp3|wav|mp4|woff2?|wasm|task|tflite|glb|json)(?:[?#].*)?$/i
const checked = new Set()
function checkUrl(url, from) {
  if (!url || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)) return
  if (!assetExtension.test(url)) return
  const pathname = decodeURIComponent(url.split(/[?#]/, 1)[0])
  let path
  if (pathname.startsWith('/')) {
    assert.ok(pathname.startsWith(base), `Asset bypasses ${base}: ${url} in ${relative(output, from)}`)
    path = resolve(output, pathname.slice(base.length))
  } else path = resolve(dirname(from), pathname)
  assert.ok(available.has(path), `Missing asset: ${url} in ${relative(output, from)}`)
  checked.add(path)
}

const html = await readFile(resolve(output, 'index.html'), 'utf8')
assert.ok(html.includes(`${base}assets/`), `index.html must use the configured base ${base}`)
let totalBytes = 0
for (const file of files) {
  const info = await stat(file)
  totalBytes += info.size
  const handle = await open(file, 'r')
  try {
    const header = Buffer.alloc(128)
    const { bytesRead } = await handle.read(header, 0, header.length, 0)
    assert.ok(!header.subarray(0, bytesRead).toString().startsWith('version https://git-lfs.github.com/spec/v1'), `Unresolved LFS pointer: ${file}. Check out LFS assets before building.`)
  } finally { await handle.close() }

  // Vendor engines contain their own loaders; inspect the Vite output and entry HTML.
  const bundled = file.startsWith(`${resolve(output, 'assets')}${sep}`)
  if (extname(file) === '.html' || (bundled && extname(file) === '.css')) {
    const text = await readFile(file, 'utf8')
    for (const match of text.matchAll(/(?:src|href)=["']([^"']+)["']|url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) checkUrl(match[1] ?? match[2], file)
  } else if (bundled && extname(file) === '.js') {
    const text = await readFile(file, 'utf8')
    for (const match of text.matchAll(/(["'`])((?:\/|\.{1,2}\/|assets\/)[^"'`\\\r\n$]*)\1/g)) {
      // Vite's preload map stores assets/... paths relative to the site base.
      checkUrl(match[2].startsWith('assets/') ? `${base}${match[2]}` : match[2], file)
    }
  }
}
assert.ok(totalBytes < 1024 ** 3, 'Published Pages output must be smaller than 1 GiB')
for (const asset of [
  'mediapipe/vision_wasm_internal.wasm',
  'mediapipe/vision_wasm_module_internal.wasm',
  'mediapipe/hand_landmarker.task',
  'vendor/8thwall/xr.js',
  'church/daeseongjeon.glb',
  'audio/hymns/rather-have-jesus.mp3',
]) assert.ok(available.has(resolve(output, asset)), `Missing runtime asset: ${asset}`)
console.log(`Pages check passed: base ${base}, ${checked.size} asset references, ${files.length} files, ${(totalBytes / 1048576).toFixed(2)} MiB; no LFS pointers.`)
