import { readdir, readFile, writeFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { resolve, relative, extname, sep } from 'node:path'
import { gzip, brotliCompress, constants } from 'node:zlib'
import { promisify } from 'node:util'

const zip = promisify(gzip), brotli = promisify(brotliCompress)
const compressible = /\.(?:js|mjs|css|html|json|svg|wasm|task|tflite|glb|wav)$/i
const types = {'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.wasm':'application/wasm','.glb':'model/gltf-binary','.wav':'audio/wav'}

export function acceptedEncodings(header = '') {
  const quality = new Map(String(header).toLowerCase().split(',').map(part => {
    const [name,...parameters] = part.trim().split(';')
    const value = parameters.find(p => p.trim().startsWith('q='))?.trim().slice(2)
    const q = value === undefined ? 1 : Number(value)
    return [name,Number.isFinite(q) ? Math.max(0,Math.min(1,q)) : 0]
  }))
  return ['br','gzip'].map(name => ({name,q:quality.get(name) ?? quality.get('*') ?? 0}))
    .filter(item => item.q > 0).sort((a,b) => b.q-a.q).map(item => item.name)
}

async function filesIn(directory) {
  const result = []
  for (const file of await readdir(directory,{withFileTypes:true})) {
    const path = resolve(directory,file.name)
    if (file.isDirectory()) result.push(...await filesIn(path))
    else if (compressible.test(file.name)) result.push(path)
  }
  return result
}

/** Lossless sidecars and content negotiation for the production preview. */
export default function compressedAssets() {
  let output = ''
  let building = false
  return {
    name:'lossless-compressed-assets',
    configResolved(config) { output = resolve(config.root,config.build.outDir); building = config.command === 'build' },
    async closeBundle() {
      if (!output || !building) return
      let originalBytes = 0, brotliBytes = 0
      for (const path of await filesIn(output)) {
        const source = await readFile(path)
        if (source.length < 512) continue
        const [gz,br] = await Promise.all([zip(source,{level:9}),brotli(source,{params:{[constants.BROTLI_PARAM_QUALITY]:5}})])
        originalBytes += source.length; brotliBytes += Math.min(source.length,br.length)
        if (gz.length < source.length) await writeFile(`${path}.gz`,gz)
        if (br.length < source.length) await writeFile(`${path}.br`,br)
      }
      console.log(`Lossless compression: ${(originalBytes/1048576).toFixed(2)} MiB → ${(brotliBytes/1048576).toFixed(2)} MiB (Brotli); original assets retained.`)
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req,res,next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        try {
          const url = new URL(req.url ?? '/','http://localhost')
          let pathname = decodeURIComponent(url.pathname)
          if (pathname.endsWith('/')) pathname += 'index.html'
          if (!compressible.test(pathname)) return next()
          const original = resolve(output,`.${pathname}`)
          const local = relative(output,original)
          if (local.startsWith(`..${sep}`) || local === '..' || local.includes(':')) return next()
          for (const encoding of acceptedEncodings(req.headers['accept-encoding'])) {
            const path = `${original}.${encoding === 'br' ? 'br' : 'gz'}`
            const info = await stat(path).catch(() => null)
            if (!info?.isFile()) continue
            res.setHeader('Content-Type',types[extname(original)] ?? 'application/octet-stream')
            res.setHeader('Content-Encoding',encoding)
            res.setHeader('Vary','Accept-Encoding')
            res.setHeader('Content-Length',info.size)
            res.setHeader('Cache-Control',pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
            const etag = `W/"${info.size.toString(16)}-${Math.round(info.mtimeMs).toString(16)}"`
            res.setHeader('ETag',etag)
            if (req.headers['if-none-match'] === etag) { res.statusCode = 304; res.removeHeader('Content-Length'); return res.end() }
            if (req.method === 'HEAD') return res.end()
            const stream = createReadStream(path)
            res.once('close',() => stream.destroy())
            stream.on('error',() => res.destroy())
            stream.pipe(res)
            return
          }
          // Uncompressed responses also vary, so shared caches cannot confuse them.
          res.setHeader('Vary','Accept-Encoding')
          next()
        } catch { next() }
      })
    },
  }
}
