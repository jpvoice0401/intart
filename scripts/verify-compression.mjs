import assert from 'node:assert/strict'
import {readdir,readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {brotliDecompressSync,gunzipSync} from 'node:zlib'
import {request} from 'node:http'
import {preview} from 'vite'

let verified=0
async function verify(directory) {
  for(const file of await readdir(directory,{withFileTypes:true})){
    const path=resolve(directory,file.name)
    if(file.isDirectory()){await verify(path);continue}
    if(!/\.(br|gz)$/.test(file.name))continue
    const compressed=await readFile(path),source=await readFile(path.replace(/\.(br|gz)$/,''))
    assert.deepEqual(file.name.endsWith('.br')?brotliDecompressSync(compressed):gunzipSync(compressed),source)
    verified++
  }
}
await verify(resolve('dist'))
const server=await preview({preview:{port:0,strictPort:false,open:false}})
const port=server.httpServer.address().port
function get(path,encoding,etag){
  return new Promise((resolve,reject)=>{
    const headers={'Accept-Encoding':encoding}
    if(etag)headers['If-None-Match']=etag
    const req=request({host:'127.0.0.1',port,path,headers},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}))
    });req.on('error',reject);req.end()
  })
}
try{
  const html=await readFile('dist/index.html')
  for(const [accept,expected] of [['br, gzip','br'],['br;q=0,gzip','gzip'],['identity',undefined]]){
    const response=await get('/',accept)
    assert.equal(response.status,200)
    assert.equal(response.headers['content-encoding'],expected)
    const decoded=expected==='br'?brotliDecompressSync(response.body):expected==='gzip'?gunzipSync(response.body):response.body
    assert.deepEqual(decoded,html)
  }
  const wasm=await get('/mediapipe/vision_wasm_module_internal.wasm','br')
  assert.equal(wasm.headers['content-type'],'application/wasm')
  assert.equal(wasm.headers['content-encoding'],'br')
  const cached=await get('/mediapipe/vision_wasm_module_internal.wasm','br',wasm.headers.etag)
  assert.equal(cached.status,304)
  const entry=html.toString().match(/src="([^"]+\.js)"/)?.[1]
  assert.ok(entry)
  const js=await get(entry,'gzip')
  assert.equal(js.headers['content-type'],'text/javascript')
  assert.equal(js.headers['content-encoding'],'gzip')
  assert.match(js.headers['cache-control'],/immutable/)
  console.log(`Verified ${verified} lossless sidecars, HTTP encoding negotiation, WASM MIME, JS caching and conditional 304 responses.`)
}finally{await new Promise(resolve=>server.httpServer.close(resolve))}
