import { CHURCH_PHRASES, type ChurchGender, type ChurchPhrase, type ChurchSnapshot } from './church-model.ts'
import { createChurchExclamation } from './church-exclamation.ts'

type VoiceInfo = Pick<SpeechSynthesisVoice, 'name' | 'lang'>
export function churchVoiceSettings<T extends VoiceInfo>(voices: T[], gender: ChurchGender) {
  const korean = voices.filter(v => /^ko(?:-|_)/i.test(v.lang))
  const male = /injoon|bongjin|gookmin|hyunsu|male\b|남성|남자/i, female = /sunhi|heami|ji.?min|seohyeon|yuna|female|여성|여자/i
  const voice = korean.find(v => (gender === 'male' ? male.test(v.name) && !female.test(v.name) : female.test(v.name)))
  return { voice: voice ?? korean[0], pitch: voice ? 1.08 : gender === 'male' ? .95 : 1.18, rate: .96 }
}

/** Snapshots repeat at 20 Hz: play each new utterance once, never replay on entry. */
export function createChurchSpeechInbox() {
  const seen = new Map<string, number>()
  return { clear: () => seen.clear(), read(state: ChurchSnapshot) {
    const events: { id: string; nickname: string; gender: ChurchGender; phrase: ChurchPhrase }[] = []
    const present = new Set(state.players.map(p => p.id))
    for (const id of seen.keys()) if (!present.has(id)) seen.delete(id)
    for (const p of state.players) {
      const previous = seen.get(p.id), seq = p.speech?.seq ?? 0
      if (previous !== undefined && seq > previous && p.speech && state.time - p.speech.at < 2) events.push({ id: p.id, nickname: p.nickname, gender: p.gender, phrase: p.speech.phrase })
      seen.set(p.id, seq)
    }
    return events
  } }
}

export function createChurchVoice(onError: (message: string) => void) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
  const exclamation = createChurchExclamation()
  let disposed = false, unlocked = false, queued = 0, generation = 0
  function fallback(phrase: ChurchPhrase, gender: ChurchGender, priority = false) {
    if (disposed) return
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') { onError('이 브라우저에서는 음성을 지원하지 않아요. Chrome이나 Edge에서 열어 주세요.'); return }
    if (priority) { generation++; synth.cancel(); queued = 0 }
    if (queued >= 4) return
    const settings = churchVoiceSettings(synth.getVoices(), gender), utterance = new SpeechSynthesisUtterance(`${CHURCH_PHRASES[phrase].replace('!', '')}!`), current = generation
    utterance.lang = 'ko-KR'; utterance.pitch = settings.pitch; utterance.rate = settings.rate; if (settings.voice) utterance.voice = settings.voice
    queued++
    utterance.onend = () => { if (current === generation) queued = Math.max(0, queued - 1) }
    utterance.onerror = event => { if (current !== generation || disposed) return; queued = Math.max(0, queued - 1); if (!['canceled', 'interrupted'].includes(event.error)) onError('음성을 재생하지 못했어요. 아멘 버튼을 다시 누르거나 기기의 한국어 음성을 확인해 주세요.') }
    synth.speak(utterance)
  }
  return {
    speak(phrase: ChurchPhrase, gender: ChurchGender, priority = false) {
      if (disposed) return
      if (priority) { generation++; synth?.cancel(); queued = 0 }
      const token = generation
      void exclamation.play(phrase, gender, priority).then(success => { if (!success && !disposed && token === generation) fallback(phrase, gender, priority) })
    },
    unlock() {
      exclamation.unlock()
      if (unlocked || !synth || typeof SpeechSynthesisUtterance === 'undefined') return
      unlocked = true
      // Called synchronously from the entry gesture, enabling subsequent remote speech.
      const silent = new SpeechSynthesisUtterance(' '); silent.volume = 0; synth.speak(silent)
    },
    dispose() { disposed = true; generation++; exclamation.dispose(); synth?.cancel() },
  }
}
