import { ThanosModels, type ThanosTask } from './thanos-models'
const model = new ThanosModels()
const scope = self as unknown as { onmessage: (event: MessageEvent) => void; postMessage: (data: unknown, transfer?: Transferable[]) => void }
scope.onmessage = async event => {
  const data = event.data as { type: string; base: string; task: ThanosTask; image: ImageBitmap; time: number }
  if (data.type === 'init') {
    try { await model.initialize(data.base, true, text => scope.postMessage({ type: 'progress', text })); scope.postMessage({ type: 'ready' }) }
    catch (error) { model.close(); scope.postMessage({ type: 'error', message: String(error) }) }
  } else if (data.type === 'frame') {
    try {
      const start = performance.now(), output = model.detect(data.task, data.image, data.time)
      if (output.task === 'segment') {
        scope.postMessage({ type: 'result', output, time: data.time, duration: performance.now() - start, image: data.image }, [output.mask.buffer, data.image])
      } else {
        data.image.close()
        scope.postMessage({ type: 'result', output, time: data.time, duration: performance.now() - start })
      }
    } catch (error) { data.image.close(); scope.postMessage({ type: 'error', message: String(error) }) }
  }
}
