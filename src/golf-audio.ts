import { GOLF_BPM, renderHipHop } from './golf-model.ts'
import type { GolfOutcome } from './golf-model.ts'
import { GOLF_REACTIONS, type GolfReactionOutcome } from './golf-reactions.ts'

export interface GolfSound {
  readonly isPlaying: boolean
  beat(): number
  start(): Promise<boolean>
  pause(): void
  hit(): void
  result(outcome: GolfOutcome): void
}

export class GolfAudio implements GolfSound {
  private context: AudioContext | undefined
  private source: AudioBufferSourceNode | undefined
  private gain: GainNode | undefined
  private voiceGain: GainNode | undefined
  private origin = 0
  private loopSeconds = 8 * 60 / GOLF_BPM
  private wantsMusic = false
  private disposed = false
  private starting: Promise<boolean> | null = null
  private readonly voiceBytes = new Map<GolfReactionOutcome, Promise<ArrayBuffer | null>>()
  private voiceReady = new Map<GolfReactionOutcome, Promise<void>>()
  private voiceBuffers = new Map<GolfReactionOutcome, AudioBuffer>()
  private voices = new Set<AudioBufferSourceNode>()
  private effects = new Set<OscillatorNode>()

  constructor(audioBaseUrl: string) {
    for (const outcome of Object.keys(GOLF_REACTIONS) as GolfReactionOutcome[]) {
      this.voiceBytes.set(outcome, fetch(`${audioBaseUrl}${GOLF_REACTIONS[outcome].file}`).then(response => response.ok ? response.arrayBuffer() : null).catch(() => null))
    }
  }

  get isPlaying() { return this.wantsMusic && this.context?.state === 'running' && !!this.source }

  beat(): number {
    return this.context && this.source ? Math.max(0, this.context.currentTime - this.origin) * 8 / this.loopSeconds : 0
  }

  start(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false)
    this.wantsMusic = true
    if (this.starting) return this.starting
    this.starting = this.prepare().finally(() => { this.starting = null })
    return this.starting
  }

  private async prepare(): Promise<boolean> {
    try {
      if (!this.context) {
        this.context = new AudioContext()
        this.gain = this.context.createGain()
        this.gain.gain.value = .65
        const compressor = this.context.createDynamicsCompressor()
        compressor.threshold.value = -12
        compressor.ratio.value = 4
        this.gain.connect(compressor)
        this.voiceGain = this.context.createGain()
        this.voiceGain.gain.value = 1.35
        this.voiceGain.connect(compressor)
        compressor.connect(this.context.destination)
        for (const outcome of this.voiceBytes.keys()) this.voiceReady.set(outcome, this.loadVoice(outcome))
      }
      await this.context.resume()
      if (this.disposed || !this.wantsMusic) {
        if (!this.disposed && this.context.state === 'running') await this.context.suspend()
        return false
      }
      if (!this.source) {
        const samples = renderHipHop(22050)
        const buffer = this.context.createBuffer(1, samples.length, 22050)
        this.loopSeconds = samples.length / 22050
        buffer.getChannelData(0).set(samples)
        this.source = this.context.createBufferSource()
        this.source.buffer = buffer
        this.source.loop = true
        this.source.connect(this.gain!)
        this.origin = this.context.currentTime + .045
        this.source.start(this.origin)
      }
      return true
    } catch { this.wantsMusic = false; return false }
  }

  pause() {
    this.wantsMusic = false
    if (this.context && this.context.state !== 'closed') void this.context.suspend().catch(() => {})
    for (const voice of this.voices) voice.stop()
    this.voices.clear()
    for (const effect of this.effects) effect.stop()
    this.effects.clear()
  }

  private async loadVoice(outcome: GolfReactionOutcome) {
    const bytes = await this.voiceBytes.get(outcome)
    if (!bytes || this.disposed || !this.context) return
    try {
      const buffer = await this.context.decodeAudioData(bytes)
      if (!this.disposed) this.voiceBuffers.set(outcome, buffer)
    } catch { /* Gameplay continues if a voice file cannot be decoded. */ }
  }

  private playVoice(outcome: GolfReactionOutcome) {
    const buffer = this.voiceBuffers.get(outcome)
    if (this.disposed || !this.wantsMusic || !this.context || !buffer || !this.voiceGain) return
    if (this.voices.size >= 3) {
      const oldest = this.voices.values().next().value!
      oldest.stop()
      this.voices.delete(oldest)
    }
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.connect(this.voiceGain)
    source.onended = () => { this.voices.delete(source); source.disconnect() }
    this.voices.add(source)
    source.start()
    const now = this.context.currentTime
    this.gain!.gain.cancelScheduledValues(now)
    this.gain!.gain.setTargetAtTime(.38, now, .04)
    this.gain!.gain.setTargetAtTime(.65, now + Math.max(1.2, buffer.duration - .2), .25)
  }

  result(outcome: GolfOutcome) {
    if (this.disposed || !(outcome in GOLF_REACTIONS)) return
    const reaction = outcome as GolfReactionOutcome
    if (this.voiceBuffers.has(reaction)) this.playVoice(reaction)
    else void this.voiceReady.get(reaction)?.then(() => this.playVoice(reaction))
  }

  hit() {
    if (this.disposed) return
    if (!this.context || !this.gain || this.context.state !== 'running') return
    const now = this.context.currentTime
    const effect = this.context.createOscillator()
    const envelope = this.context.createGain()
    effect.type = 'triangle'
    effect.frequency.setValueAtTime(550, now)
    effect.frequency.exponentialRampToValueAtTime(85, now + .06)
    envelope.gain.setValueAtTime(.4, now)
    envelope.gain.exponentialRampToValueAtTime(.001, now + .075)
    effect.connect(envelope)
    envelope.connect(this.gain)
    this.effects.add(effect)
    effect.onended = () => { this.effects.delete(effect); effect.disconnect(); envelope.disconnect() }
    effect.start(now)
    effect.stop(now + .08)
  }

  destroy() {
    this.disposed = true
    this.pause()
    this.source?.stop()
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {})
  }
}
