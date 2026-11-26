import type { MountExperiment } from './experiment-switcher'

/** A late module resolution must never mount over a different selected scene. */
export function lazyExperiment(load: () => Promise<MountExperiment>): MountExperiment {
  return container => {
    let disposed = false
    let cleanup: (() => void) | undefined
    const events = new AbortController()
    const loading = document.createElement('div')
    loading.className = 'experiment-loading'
    loading.setAttribute('role','status')
    container.append(loading)
    const show = async () => {
      loading.textContent = '실험을 준비하고 있어요…'
      try {
        const mount = await load()
        if (disposed) return
        loading.remove()
        cleanup = mount(container)
      } catch {
        if (disposed) return
        container.replaceChildren(loading)
        loading.textContent = '화면을 불러오지 못했어요. '
        const retry = document.createElement('button')
        retry.type = 'button'; retry.textContent = '다시 시도'
        retry.addEventListener('click',() => void show(),{signal:events.signal})
        loading.append(retry)
      }
    }
    void show()
    return () => { if (disposed) return; disposed = true; events.abort(); cleanup?.(); loading.remove() }
  }
}
