import { synthesizeMinecraftBackground, type MinecraftBackgroundPixels } from './minecraft-inpaint'

const scope = self as unknown as {
  onmessage: (event: MessageEvent<MinecraftBackgroundPixels & { revision: number }>) => void
  postMessage: (data: unknown, transfer?: Transferable[]) => void
}
scope.onmessage = event => {
  const { revision } = event.data
  try {
    const job = synthesizeMinecraftBackground(event.data)
    let step = job.next()
    while (!step.done) step = job.next()
    const result = step.value
    scope.postMessage({ ...result, revision }, [result.data.buffer])
  } catch { scope.postMessage({ revision, error: true }) }
}
