import { VisionModels, type VisionMode, type VisionTask } from './vision-models'

const models = new VisionModels()
const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null
  postMessage: (message: unknown, transfer?: Transferable[]) => void
}
scope.onmessage = async event => {
  const message = event.data as { type: string; base: string; mode: VisionMode; task: VisionTask; image: ImageBitmap; timestamp: number }
  if (message.type === 'init') {
    try {
      await models.initialize(message.base,message.mode,true,text => scope.postMessage({type:'progress',text}))
      scope.postMessage({type:'ready'})
    } catch (error) { models.close(); scope.postMessage({type:'error',message:error instanceof Error ? error.message : String(error)}) }
    return
  }
  if (message.type !== 'frame') return
  try {
    const output = models.detect(message.task,message.image,message.timestamp)
    scope.postMessage({type:'result',output,timestamp:message.timestamp},output.task === 'segment' ? [output.mask.buffer] : [])
  } catch (error) {
    scope.postMessage({type:'error',message:error instanceof Error ? error.message : String(error)})
  } finally { message.image.close() }
}
