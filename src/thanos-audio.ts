/** Short synthesized cinematic effects, not film audio. No recording permission. */
export class ThanosAudio {
  enabled = true
  private context: AudioContext | null = null
  private sources = new Set<AudioScheduledSourceNode>()
  private nodes = new Set<AudioNode>()
  private noise: AudioBuffer | null = null
  unlock() {
    if (!this.enabled) return
    try {
      const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Constructor) return
      this.context ??= new Constructor()
      void this.context.resume().catch(() => {})
    } catch { /* Sound is optional; camera effects remain available. */ }
  }
  private track(source: AudioScheduledSourceNode) {
    this.sources.add(source)
    source.onended = () => { this.sources.delete(source); source.disconnect() }
  }
  play() {
    if (!this.enabled || !this.context || this.context.state !== 'running') return
    this.stop()
    const context = this.context, now = context.currentTime
    if (!this.noise) {
      this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * 1.4), context.sampleRate)
      const data = this.noise.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    }
    const click = context.createBufferSource(), clickGain = context.createGain(), high = context.createBiquadFilter()
    click.buffer = this.noise; high.type = 'highpass'; high.frequency.value = 1800
    clickGain.gain.setValueAtTime(.22, now); clickGain.gain.exponentialRampToValueAtTime(.001, now + .075)
    click.connect(high).connect(clickGain).connect(context.destination); this.track(click); click.start(now); click.stop(now + .09)
    const boom = context.createOscillator(), bassGain = context.createGain()
    boom.frequency.setValueAtTime(65, now); boom.frequency.exponentialRampToValueAtTime(26, now + 1.4)
    bassGain.gain.setValueAtTime(.001, now); bassGain.gain.linearRampToValueAtTime(.16, now + .035); bassGain.gain.exponentialRampToValueAtTime(.001, now + 1.5)
    boom.connect(bassGain).connect(context.destination); this.track(boom); boom.start(now); boom.stop(now + 1.6)
    const wind = context.createBufferSource(), low = context.createBiquadFilter(), windGain = context.createGain()
    wind.buffer = this.noise; wind.loop = true; low.type = 'lowpass'; low.frequency.value = 650
    windGain.gain.setValueAtTime(0, now); windGain.gain.linearRampToValueAtTime(.09, now + .8); windGain.gain.linearRampToValueAtTime(0, now + 5.5)
    wind.connect(low).connect(windGain).connect(context.destination); this.track(wind); wind.start(now); wind.stop(now + 5.6)
    for (const node of [clickGain, high, bassGain, low, windGain]) this.nodes.add(node)
  }
  stop() {
    for (const source of this.sources) { try { source.stop() } catch { /* Already stopped. */ } source.disconnect() }
    this.sources.clear(); for (const node of this.nodes) node.disconnect(); this.nodes.clear()
  }
  suspend() { this.stop(); void this.context?.suspend().catch(() => {}) }
  async close() { this.stop(); this.noise = null; const context = this.context; this.context = null; await context?.close().catch(() => {}) }
}
