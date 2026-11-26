const DURATIONS = [0.095, 0.14, 0.12] as const

/** Three distinct dry, low and crackly pops, generated locally with no audio downloads. */
export function createPopSamples(variant: number, sampleRate: number, random: () => number = Math.random): Float32Array {
  const duration = DURATIONS[variant] ?? DURATIONS[0]
  const samples = new Float32Array(Math.ceil(sampleRate * duration))
  let phase = 0
  let filteredNoise = 0
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate
    const noise = random() * 2 - 1
    filteredNoise = filteredNoise * 0.65 + noise * 0.35
    const attack = Math.min(1, t / 0.0006)
    let value: number
    if (variant === 1) {
      phase += 2 * Math.PI * (105 + 550 * Math.exp(-t * 85)) / sampleRate
      value = Math.sin(phase) * Math.exp(-t * 39) * 0.67 + filteredNoise * Math.exp(-t * 110) * 0.8
    } else if (variant === 2) {
      phase += 2 * Math.PI * (260 + 1050 * Math.exp(-t * 120)) / sampleRate
      const crackle = Math.exp(-Math.pow((t - 0.009) / 0.002, 2)) + Math.exp(-Math.pow((t - 0.022) / 0.003, 2))
      value = noise * (Math.exp(-t * 155) * 0.5 + crackle * 0.18) + Math.sin(phase) * Math.exp(-t * 62) * 0.48
    } else {
      phase += 2 * Math.PI * (190 + 1550 * Math.exp(-t * 170)) / sampleRate
      value = noise * Math.exp(-t * 190) * 0.58 + Math.sin(phase) * Math.exp(-t * 65) * 0.62
    }
    const release = Math.min(1, (duration - t) / 0.01)
    samples[i] = Math.tanh(value * 1.25) * attack * release
  }
  return samples
}

export class PopAudio {
  enabled = true
  private context: AudioContext | undefined
  private output: GainNode | undefined
  private buffers: AudioBuffer[] = []
  private voices = new Set<AudioBufferSourceNode>()
  private disposed = false
  private readonly onUnavailable: () => void

  constructor(onUnavailable: () => void) {
    this.onUnavailable = onUnavailable
  }

  private prepare(): AudioContext | undefined {
    try {
      if (!this.context) {
        this.context = new AudioContext()
        this.output = this.context.createGain()
        this.output.gain.value = 0.42
        const compressor = this.context.createDynamicsCompressor()
        compressor.threshold.value = -16
        compressor.knee.value = 15
        compressor.ratio.value = 6
        compressor.attack.value = 0.002
        compressor.release.value = 0.08
        this.output.connect(compressor)
        compressor.connect(this.context.destination)
        this.buffers = [0, 1, 2].map(variant => {
          const samples = createPopSamples(variant, this.context!.sampleRate)
          const buffer = this.context!.createBuffer(1, samples.length, this.context!.sampleRate)
          buffer.getChannelData(0).set(samples)
          return buffer
        })
      }
      return this.context
    } catch {
      this.unavailable()
      return undefined
    }
  }

  private unavailable = () => {
    if (this.disposed) return
    this.enabled = false
    this.onUnavailable()
  }

  play() {
    if (!this.enabled || this.disposed) return
    const context = this.prepare()
    if (!context) return
    const variant = Math.floor(Math.random() * 3)
    const start = () => {
      if (this.disposed || !this.enabled || context.state !== 'running') return
      try {
        // Bound polyphony during fast swipes and compress the mixed output.
        if (this.voices.size >= 12) {
          const oldest = this.voices.values().next().value!
          oldest.stop()
          this.voices.delete(oldest)
        }
        const source = context.createBufferSource()
        source.buffer = this.buffers[variant]!
        source.playbackRate.value = 0.96 + Math.random() * 0.08
        source.connect(this.output!)
        source.onended = () => { this.voices.delete(source); source.disconnect() }
        this.voices.add(source)
        source.start()
      } catch { this.unavailable() }
    }
    if (context.state === 'running') start()
    else void context.resume().then(start, this.unavailable)
  }

  setEnabled(enabled: boolean) {
    if (this.disposed) return
    this.enabled = enabled
    if (!enabled) {
      for (const voice of this.voices) voice.stop()
      this.voices.clear()
    } else {
      const context = this.prepare()
      if (context && context.state !== 'running') void context.resume().catch(this.unavailable)
    }
  }

  destroy() {
    this.setEnabled(false)
    this.disposed = true
    if (this.context) void this.context.close().catch(() => {})
  }
}
