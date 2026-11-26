import {test,before,after} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'

let server, CameraVision, VisionModels
before(async () => {
  server = await createServer({configFile:false,cacheDir:'.tools/vision-test-cache',server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,include:[],exclude:['@mediapipe/tasks-vision']}})
  ;({CameraVision} = await server.ssrLoadModule('/src/camera-vision.ts'))
  ;({VisionModels} = await server.ssrLoadModule('/src/vision-models.ts'))
})
after(async () => {await server?.close()})

async function environment(run,{fail=false}={}) {
  const keys = ['Worker','OffscreenCanvas','createImageBitmap','location']
  const originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis,key))
  const workers=[],images=[]
  class WorkerMock {
    terminated=false
    frames=[]
    constructor(){workers.push(this)}
    postMessage(message) {
      if(message.type==='init')queueMicrotask(() => this.onmessage?.({data:fail?{type:'error',message:'unsupported worker'}:{type:'ready'}}))
      else this.frames.push(message)
    }
    terminate(){this.terminated=true}
    complete(){const message=this.frames.at(-1);this.onmessage?.({data:{type:'result',output:{task:'hands',result:{landmarks:[],handedness:[]}},timestamp:message.timestamp}})}
  }
  Object.defineProperties(globalThis,{
    Worker:{value:WorkerMock,configurable:true,writable:true},
    OffscreenCanvas:{value:class {},configurable:true,writable:true},
    createImageBitmap:{value:async()=>{const image={closed:false,close(){this.closed=true}};images.push(image);return image},configurable:true,writable:true},
    location:{value:new URL('https://example.test/'),configurable:true,writable:true},
  })
  try {await run(workers,images)}
  finally {keys.forEach((key,i)=>{if(originals[i])Object.defineProperty(globalThis,key,originals[i]);else delete globalThis[key]})}
}

test('vision permits only one in-flight frame and releases the next frame after a result',async()=>{
  await environment(async(workers)=>{
    const results=[],vision=new CameraVision('hands',(output,time)=>results.push({output,time}))
    await vision.initialize(()=>{})
    const video={readyState:2,currentTime:1}
    assert.equal(vision.submit('hands',video,100),true)
    assert.equal(vision.submit('hands',video,101),false)
    await new Promise(done=>setImmediate(done))
    assert.equal(workers[0].frames.length,1)
    workers[0].complete()
    assert.equal(results.length,1)
    assert.equal(results[0].time,100)
    assert.equal(vision.submit('hands',video,102),true)
    vision.close()
    await new Promise(done=>setImmediate(done))
    assert.equal(workers[0].terminated,true)
  })
})

test('closing a pending bitmap capture closes the bitmap without sending it to a dead worker',async()=>{
  await environment(async(workers,images)=>{
    const vision=new CameraVision('hands',()=>{throw new Error('late result')})
    await vision.initialize(()=>{})
    vision.submit('hands',{readyState:2,currentTime:1},100)
    vision.close()
    await new Promise(done=>setImmediate(done))
    assert.equal(images[0].closed,true)
    assert.equal(workers[0].frames.length,0)
  })
})

test('unsupported workers initialize the main-thread compatibility path and clean it up',async()=>{
  const original={initialize:VisionModels.prototype.initialize,detect:VisionModels.prototype.detect,close:VisionModels.prototype.close}
  let initialized=0,closed=0,received=0
  VisionModels.prototype.initialize=async()=>{initialized++}
  VisionModels.prototype.detect=()=>({task:'hands',result:{landmarks:[],handedness:[]}})
  VisionModels.prototype.close=()=>{closed++}
  try{
    await environment(async(workers)=>{
      const vision=new CameraVision('hands',()=>{received++})
      await vision.initialize(()=>{})
      assert.equal(initialized,1)
      assert.equal(workers[0].terminated,true)
      assert.equal(vision.submit('hands',{readyState:2,currentTime:1},100),true)
      assert.equal(received,1)
      vision.close()
      assert.equal(closed,1)
    },{fail:true})
  }finally{Object.assign(VisionModels.prototype,original)}
})

test('closing during worker initialization settles the pending initialization',async()=>{
  await environment(async(workers)=>{
    const vision=new CameraVision('hands',()=>{})
    const initialization=vision.initialize(()=>{})
    vision.close()
    await initialization
    assert.equal(workers[0].terminated,true)
    assert.equal(vision.available,false)
  })
})
