export function watchTickSamples(sampleRate: number, alternate: boolean) {
  const samples = new Float32Array(Math.ceil(sampleRate*.028))
  let seed = alternate ? 41 : 17
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed,1664525)+1013904223) >>> 0
    const t = i/sampleRate, noise = seed/4294967296*2-1
    const click = noise*Math.exp(-t*450)*.55
    const metal = Math.sin(t*Math.PI*2*(alternate ? 2900 : 3700))*Math.exp(-t*240)*.3
    samples[i] = (click+metal)*Math.min(1,t*sampleRate/3)
  }
  return samples
}

/** Short precomputed alternating clicks, scheduled against the audio clock. */
export class RolexAudio {
  enabled = true
  private context: AudioContext | null = null
  private buffers: AudioBuffer[] = []
  private gain: GainNode | null = null
  private voices = new Set<AudioBufferSourceNode>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private active = false
  private disposed = false
  private rate = 2
  private next = 0
  private lastTick = -Infinity
  private alternating = 0

  async unlock() {
    if (this.disposed || !this.enabled) return
    try {
      if (!this.context) {
        const Constructor = window.AudioContext ?? (window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext
        if (!Constructor) { this.enabled = false; return }
        this.context = new Constructor({latencyHint:'interactive'})
        this.gain = this.context.createGain(); this.gain.gain.value = .13; this.gain.connect(this.context.destination)
        for (const alternate of [false,true]) {
          const samples = watchTickSamples(this.context.sampleRate,alternate)
          const buffer = this.context.createBuffer(1,samples.length,this.context.sampleRate)
          buffer.copyToChannel(samples,0); this.buffers.push(buffer)
        }
      }
      if (this.context.state === 'suspended') await this.context.resume()
      if (!this.disposed && this.active) this.schedule()
    } catch { this.enabled = false; this.stopVoices() }
  }
  setRate(rate: number) {
    this.rate = Math.max(2,Math.min(30,Number.isFinite(rate) ? rate : 2))
    if (this.context) this.next = Math.max(this.context.currentTime,this.lastTick+1/this.rate)
  }
  setActive(active: boolean) {
    if (this.active === active) return
    this.active = active
    if (!active) this.stopVoices()
    else this.schedule()
  }
  async toggle() { this.enabled = !this.enabled; if (this.enabled) await this.unlock(); else this.stopVoices() }
  private schedule = () => {
    clearTimeout(this.timer)
    const ctx = this.context
    if (!ctx || ctx.state !== 'running' || !this.enabled || !this.active || this.disposed) return
    const now = ctx.currentTime
    this.next = Math.max(now,this.next)
    while (this.next < now+.085) {
      const source = ctx.createBufferSource()
      source.buffer = this.buffers[this.alternating++%2]!
      source.connect(this.gain!); this.voices.add(source)
      source.onended = () => { source.disconnect(); this.voices.delete(source) }
      source.start(this.next); this.lastTick = this.next; this.next += 1/this.rate
    }
    this.timer = setTimeout(this.schedule,30)
  }
  private stopVoices() {
    clearTimeout(this.timer); this.timer = undefined
    for (const source of this.voices) { try { source.stop() } catch { /* A finished source is already silent. */ } source.disconnect() }
    this.voices.clear(); this.next = 0; this.lastTick = -Infinity
  }
  destroy() { this.disposed = true; this.active = false; this.stopVoices(); this.gain?.disconnect(); void this.context?.close().catch(() => {}); this.context = null }
}
