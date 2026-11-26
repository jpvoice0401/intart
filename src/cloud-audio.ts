import { PopAudio } from './pop-audio.ts'

export class CloudAudio {
  enabled = true
  private disposed = false
  private index = 0
  private readonly voices: HTMLAudioElement[]
  private readonly pop = new PopAudio(() => {})

  constructor(url: string) {
    this.voices = Array.from({ length: 3 }, () => {
      const voice = new Audio(url)
      voice.preload = 'auto'
      voice.volume = .9
      voice.playbackRate = 1.13
      return voice
    })
  }

  shout() {
    if (!this.enabled || this.disposed) return
    this.pop.play()
    const voice = this.voices[this.index++ % this.voices.length]!
    voice.pause()
    voice.currentTime = 0
    void voice.play().catch(() => {})
  }

  setEnabled(enabled: boolean) {
    if (this.disposed) return
    this.enabled = enabled
    this.pop.setEnabled(enabled)
    if (!enabled) for (const voice of this.voices) { voice.pause(); voice.currentTime = 0 }
  }

  destroy() {
    this.setEnabled(false)
    this.disposed = true
    this.pop.destroy()
    for (const voice of this.voices) { voice.removeAttribute('src'); voice.load() }
  }
}
