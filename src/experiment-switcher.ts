export type ExperimentId = 'animalforest' | 'sabrina' | 'thanos' | 'minecraft' | 'rubberhuman' | 'myboo' | 'rolex' | 'snow' | 'watertouch' | 'character' | 'bubbles' | 'fireworks' | 'clouds' | 'golf' | 'typing' | 'claw' | 'sixflags' | 'church'
export type MountExperiment = (container: HTMLElement) => () => void
export type ExperimentMounts = Record<ExperimentId, MountExperiment>

/** Own exactly one scene, including its event listeners, animation frames and audio. */
export class ExperimentSwitcher {
  private active: ExperimentId | null = null
  private cleanup: (() => void) | null = null
  private readonly container: HTMLElement
  private readonly mounts: ExperimentMounts

  constructor(container: HTMLElement, mounts: ExperimentMounts) {
    this.container = container
    this.mounts = mounts
  }

  show(id: ExperimentId): boolean {
    if (this.active === id) return false
    this.cleanup?.()
    this.cleanup = null
    this.active = null
    this.container.replaceChildren()
    this.cleanup = this.mounts[id](this.container)
    this.active = id
    return true
  }

  destroy() {
    this.cleanup?.()
    this.cleanup = null
    this.active = null
    this.container.replaceChildren()
  }
}
