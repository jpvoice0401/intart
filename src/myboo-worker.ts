import { MybooRecognizer } from './myboo-recognizer'
const recognizer = new MybooRecognizer()
const scope = self as unknown as { onmessage: (event: MessageEvent) => void; postMessage: (message: unknown, transfer?: Transferable[]) => void }
scope.onmessage = async event => {
  const data = event.data as { type: string; base: string; image: ImageBitmap; timestamp: number }
  if (data.type === 'init') {
    try { await recognizer.initialize(data.base, true); scope.postMessage({ type: 'ready' }) }
    catch (error) { recognizer.close(); scope.postMessage({ type: 'error', message: String(error) }) }
  } else if (data.type === 'frame') {
    let transferred = false
    try {
      scope.postMessage({ type: 'result', result: recognizer.detect(data.image, data.timestamp), timestamp: data.timestamp, image: data.image }, [data.image])
      transferred = true
    }
    catch (error) { scope.postMessage({ type: 'error', message: String(error) }) }
    finally { if (!transferred) data.image.close() }
  }
}
