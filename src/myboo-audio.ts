import { BOO_MAX_SPEED } from './myboo-model'

/** Real, small Lamborghini engine recordings; no continuous synthesis or timers. */
export class MybooAudio {
  enabled = true
  error = ''
  private context: AudioContext | null = null
  private clips: AudioBuffer[] = []
  private loading: Promise<void> | null = null
  private voices = new Set<AudioBufferSourceNode>()
  private gains = new Set<GainNode>()
  private hornVoices = new Set<OscillatorNode>()
  private hornGains = new Set<GainNode>()
  private hornWave: PeriodicWave | null = null
  private hornRequest = 0
  private closed = false
  private pending: number | null = null
  private abort = new AbortController()

  private ensureContext(): AudioContext {
    if (!this.context) {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Context) throw new Error('이 브라우저에서는 소리를 재생할 수 없어요.')
      this.context = new Context({ latencyHint: 'interactive' })
    }
    return this.context
  }

  async unlock() {
    if (this.closed || !this.enabled) return
    try {
      const context = this.ensureContext()
      // Resume immediately inside the camera/sound button's user gesture.
      const resume = context.resume()
      if (!this.loading) {
        this.loading = Promise.all(['engine-low.wav', 'engine-mid.wav', 'engine-high.wav'].map(async name => {
          const response = await fetch(`${import.meta.env.BASE_URL}myboo/${name}`, { signal: this.abort.signal })
          if (!response.ok) throw new Error('엔진 소리를 불러오지 못했어요.')
          return context.decodeAudioData(await response.arrayBuffer())
        })).then(clips => { if (!this.closed) this.clips = clips }).catch(error => { this.loading = null; throw error })
      }
      await Promise.all([resume, this.loading])
      if (!this.closed && this.pending !== null) { const speed = this.pending; this.pending = null; this.rev(speed) }
    } catch (error) { if (!this.closed) { this.error = error instanceof Error ? error.message : String(error); this.enabled = false; this.stop() } }
  }

  rev(speed: number) {
    const context = this.context
    if (!this.enabled || this.closed) return
    if (!context || context.state !== 'running' || this.clips.length !== 3) { this.pending = speed; return }
    this.stopEngine()
    const now = context.currentTime, force = Math.max(0, Math.min(1, speed / BOO_MAX_SPEED))
    for (const [index, clip] of this.clips.entries()) {
      const source = context.createBufferSource(), gain = context.createGain()
      source.buffer = clip; source.loop = true
      // Keep the recorded 2000/4000/6000 RPM samples at their native pitch.
      // Crossfade real recordings instead of sweeping their playback rate.
      source.playbackRate.setValueAtTime(1, now)
      const peaks = [.6, .72, .8 * (.7 + force * .3)]
      const envelope = index === 0 ? [[0, 0], [.09, peaks[0]!], [.8, .38], [1.7, .08], [3.8, .2], [4.6, 0]]
        : index === 1 ? [[0, 0], [.45, 0], [1.4, peaks[1]!], [2.5, .3], [3.7, .12], [4.6, 0]]
        : [[0, 0], [1.1, 0], [2.2, peaks[2]!], [2.8, peaks[2]! * .6], [4.2, 0]]
      gain.gain.setValueAtTime(0, now)
      for (const [time, level] of envelope) gain.gain.linearRampToValueAtTime(level!, now + time!)
      source.connect(gain); gain.connect(context.destination)
      this.voices.add(source); this.gains.add(gain)
      source.onended = () => { source.disconnect(); gain.disconnect(); this.voices.delete(source); this.gains.delete(gain) }
      source.start(now); source.stop(now + 4.65)
    }
  }

  /** A pair of short, two-tone automotive horn blasts; no download or timer. */
  async horn(): Promise<boolean> {
    if (!this.enabled || this.closed) return false
    this.stopHorn()
    const request = this.hornRequest
    try {
      const context = this.ensureContext()
      // Resume inside the button gesture, independently of engine clip loading.
      if (context.state !== 'running') await context.resume()
      if (this.closed || !this.enabled || request !== this.hornRequest || context.state !== 'running') return false
      this.error = ''
      if (!this.hornWave) this.hornWave = context.createPeriodicWave(new Float32Array(6), new Float32Array([0, 1, .45, .24, .12, .07]))
      const now = context.currentTime
      for (const [delay, duration] of [[0, .18], [.29, .22]]) for (const frequency of [400, 500]) {
        const source = context.createOscillator(), gain = context.createGain(), start = now + delay!
        source.setPeriodicWave(this.hornWave); source.frequency.setValueAtTime(frequency, start)
        gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.12, start + .012)
        gain.gain.setValueAtTime(.12, start + duration! - .035); gain.gain.linearRampToValueAtTime(0, start + duration!)
        source.connect(gain); gain.connect(context.destination)
        this.hornVoices.add(source); this.hornGains.add(gain)
        source.onended = () => { source.disconnect(); gain.disconnect(); this.hornVoices.delete(source); this.hornGains.delete(gain) }
        source.start(start); source.stop(start + duration! + .01)
      }
      return true
    } catch (error) {
      if (!this.closed && request === this.hornRequest) {
        this.error = error instanceof Error ? error.message : String(error)
        this.stopHorn()
      }
      return false
    }
  }

  async toggle() { this.enabled = !this.enabled; this.error = ''; if (this.enabled) await this.unlock(); else this.stop() }
  private stopEngine() {
    this.pending = null
    for (const voice of this.voices) { try { voice.stop() } catch { /* Already ended. */ } voice.disconnect() }
    for (const gain of this.gains) gain.disconnect()
    this.voices.clear(); this.gains.clear()
  }
  private stopHorn() {
    this.hornRequest++
    for (const voice of this.hornVoices) { try { voice.stop() } catch { /* Already ended. */ } voice.disconnect() }
    for (const gain of this.hornGains) gain.disconnect()
    this.hornVoices.clear(); this.hornGains.clear()
  }
  stop() { this.stopEngine(); this.stopHorn() }
  suspend() { this.stop(); void this.context?.suspend().catch(() => {}) }
  resume() { if (this.enabled) void this.context?.resume().catch(() => {}) }
  destroy() { this.closed = true; this.abort.abort(); this.stop(); this.clips = []; void this.context?.close().catch(() => {}); this.context = null }
}
