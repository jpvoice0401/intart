export const CHURCH_HYMNS = [
  { title: '구주의 십자가 보혈로', url: '/audio/hymns/cross-blood.mp3' },
  { title: '너 근심 걱정 말아라', url: '/audio/hymns/be-not-dismayed.mp3' },
  { title: '주 예수 보다 더 귀한것은 없네', url: '/audio/hymns/rather-have-jesus.mp3' },
] as const

export type ChurchMusicState = { index: number; enabled: boolean; playing: boolean; loading: boolean; error: string }
/** One streaming element: even the long third recording is not decoded into memory. */
export function createChurchMusic(onChange: (state: ChurchMusicState) => void, audio: HTMLAudioElement = new Audio()) {
  let index = 0, enabled = true, playing = false, loading = false, error = '', disposed = false, generation = 0, started = false
  const notify = () => { if (!disposed) onChange({ index, enabled, playing, loading, error }) }
  audio.preload = 'metadata'; audio.volume = .38; audio.loop = false
  function loadTrack() { audio.src = CHURCH_HYMNS[index]!.url; audio.load() }
  async function play() {
    if (disposed || !enabled) return
    const token = ++generation
    error = ''; loading = true; notify()
    try {
      await audio.play()
      if (disposed || token !== generation) return
      playing = true; loading = false; notify()
    } catch (reason) {
      if (disposed || token !== generation) return
      playing = false; loading = false
      error = reason instanceof Error && reason.name === 'NotAllowedError' ? '음악 켜기를 눌러 재생해 주세요.' : '음악을 재생하지 못했어요. 곡을 다시 선택해 주세요.'
      enabled = false; notify()
    }
  }
  function ended() {
    if (disposed || !enabled) return
    generation++; index = (index + 1) % CHURCH_HYMNS.length; playing = false; loadTrack(); void play()
  }
  function failed() {
    if (disposed || !audio.error) return
    generation++; playing = loading = false; enabled = false; error = '음악 파일을 불러오지 못했어요. 다른 곡을 선택하거나 다시 켜 주세요.'; notify()
  }
  audio.addEventListener('ended', ended); audio.addEventListener('error', failed)
  loadTrack(); notify()
  return {
    startOnEntry() { if (started || disposed) return; started = true; if (enabled) void play() },
    toggle() {
      if (disposed) return
      if (enabled && (started || playing || loading)) {
        generation++; enabled = false; playing = loading = false; error = ''; audio.pause(); notify()
      } else {
        started = true; enabled = true
        if (audio.error) loadTrack()
        void play()
      }
    },
    select(next: number) {
      if (disposed || !Number.isInteger(next) || next < 0 || next >= CHURCH_HYMNS.length) return
      generation++; audio.pause(); index = next; playing = false; started = true; enabled = true; loadTrack(); void play()
    },
    dispose() { if (disposed) return; disposed = true; generation++; audio.removeEventListener('ended', ended); audio.removeEventListener('error', failed); audio.pause(); audio.removeAttribute('src'); audio.load() },
  }
}
