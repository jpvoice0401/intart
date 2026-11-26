import type { ChurchGender, ChurchPhrase } from './church-model.ts'

export const CHURCH_VOICE_FILES = {
  male: { amen: '/audio/church/male-amen.mp3', lord: '/audio/church/male-lord.mp3' },
  female: { amen: '/audio/church/female-amen.mp3', lord: '/audio/church/female-lord.mp3' },
} as const

/** Neural Korean clips, with a firm attack, sustained vowel and falling release. */
export function createChurchExclamation() {
  let context: AudioContext | undefined, output: GainNode | undefined, disposed = false, generation = 0, pending = 0
  const abort = new AbortController(), bytes = new Map<string, Promise<ArrayBuffer | null>>(), buffers = new Map<string, Promise<AudioBuffer | null>>()
  const active = new Set<AudioBufferSourceNode>()
  let chain = Promise.resolve()
  for (const files of Object.values(CHURCH_VOICE_FILES)) for (const url of Object.values(files)) bytes.set(url, fetch(url, { signal: abort.signal }).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null))
  function stop() { generation++; pending = 0; for (const source of active) { try { source.stop() } catch { /* Already ended. */ } } active.clear(); chain = Promise.resolve() }
  async function prepare() {
    if (disposed) return false
    try {
      if (!context) {
        context = new AudioContext()
        const compressor = context.createDynamicsCompressor(); compressor.threshold.value = -18; compressor.knee.value = 12; compressor.ratio.value = 4; compressor.attack.value = .006; compressor.release.value = .16
        output = context.createGain(); output.gain.value = .86; compressor.connect(output); output.connect(context.destination)
        const presence = context.createBiquadFilter(); presence.type = 'peaking'; presence.frequency.value = 2200; presence.Q.value = .8; presence.gain.value = 2.5; presence.connect(compressor)
        const highpass = context.createBiquadFilter(); highpass.type = 'highpass'; highpass.frequency.value = 85; highpass.connect(presence)
        input = highpass
        // One quiet, short reflection; the words remain intelligible.
        const delay = context.createDelay(.3), reflection = context.createGain(); delay.delayTime.value = .105; reflection.gain.value = .085
        highpass.connect(delay); delay.connect(reflection); reflection.connect(compressor)
      }
      await context.resume()
      return !disposed && context.state === 'running'
    } catch { return false }
  }
  let input: AudioNode | undefined
  function buffer(url: string) {
    if (!buffers.has(url)) buffers.set(url, bytes.get(url)!.then(data => data && context ? context.decodeAudioData(data.slice(0)).catch(() => null) : null))
    return buffers.get(url)!
  }
  async function perform(phrase: ChurchPhrase, gender: ChurchGender, token: number, ready: Promise<boolean>) {
    if (!(await ready)) return disposed || token !== generation
    const clip = await buffer(CHURCH_VOICE_FILES[gender][phrase])
    if (disposed || token !== generation) return true
    if (!clip || !context || !input) return false
    const source = context.createBufferSource(), envelope = context.createGain(), now = context.currentTime, duration = clip.duration
    source.buffer = clip
    source.playbackRate.setValueAtTime(1.04, now)
    source.playbackRate.linearRampToValueAtTime(1, now + duration * .22)
    source.playbackRate.setValueAtTime(1, now + duration * .5)
    source.playbackRate.linearRampToValueAtTime(phrase === 'lord' ? .87 : .92, now + duration * .84)
    envelope.gain.setValueAtTime(0, now); envelope.gain.linearRampToValueAtTime(1.22, now + .035)
    envelope.gain.linearRampToValueAtTime(1.08, now + duration * .45); envelope.gain.linearRampToValueAtTime(.91, now + duration)
    source.connect(envelope); envelope.connect(input); active.add(source)
    return new Promise<boolean>(resolve => {
      source.onended = () => { active.delete(source); source.disconnect(); envelope.disconnect(); resolve(true) }
      source.start()
    })
  }
  return {
    unlock() { void prepare() },
    play(phrase: ChurchPhrase, gender: ChurchGender, priority = false): Promise<boolean> {
      if (disposed) return Promise.resolve(true)
      if (priority) stop()
      if (pending >= 3) return Promise.resolve(true)
      const token = generation, ready = prepare(); pending++ // Resume in the user's click handler.
      const result = chain.then(() => perform(phrase, gender, token, ready)).catch(() => disposed || token !== generation)
      chain = result.then(() => { if (token === generation) pending = Math.max(0, pending - 1) })
      return result
    },
    dispose() { disposed = true; stop(); abort.abort(); if (context) void context.close().catch(() => {}) },
  }
}
