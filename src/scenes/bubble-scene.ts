import { BubbleField } from '../bubbles'
import { PopAudio } from '../pop-audio'

const speaker = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path class="wrap-sound-waves" d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/><path class="wrap-sound-muted" d="m16 9 6 6m0-6-6 6"/></svg>`
const refill = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1.4 7M4 4v6h6"/></svg>`

export function mountBubbles(container: HTMLElement): () => void {
  container.innerHTML = `
    <section class="wrap-scene" aria-label="뽁뽁이 실험">
      <div id="bubble-field" class="bubble-field" role="group" aria-label="화면 가득 뽁뽁이" aria-describedby="wrap-instructions"></div>
      <div class="wrap-toolbar">
        <div class="wrap-counter"><span>오늘의 뽁</span><strong id="pop-count">000</strong></div>
        <span class="wrap-divider" aria-hidden="true"></span>
        <button id="sound-toggle" class="wrap-tool" type="button" aria-pressed="true" aria-label="소리 끄기">${speaker}<span id="sound-label">소리 켜짐</span></button>
        <button id="reset-bubbles" class="wrap-tool wrap-refill" type="button" aria-label="모든 뽁뽁이 다시 부풀리기">${refill}<span>다시 부풀리기</span></button>
      </div>
      <footer class="wrap-footer"><div class="wrap-guide"><span class="wrap-spark" aria-hidden="true">✧</span><div><h1>뽁뽁, 잠깐의 여유.</h1><p id="wrap-instructions">클릭 · 터치 · 드래그로 톡톡 터뜨려보세요.</p></div><span class="wrap-divider" aria-hidden="true"></span><span class="wrap-refill-note"><i></i>천천히 다시 부풀어요</span></div><p class="wrap-footnote">A LITTLE PAUSE, A LITTLE POP.</p></footer>
      <p id="wrap-announcement" class="sr-only" role="status" aria-live="polite"></p>
    </section>`
  const events = new AbortController()
  const options = { signal: events.signal }
  const soundButton = container.querySelector<HTMLButtonElement>('#sound-toggle')!
  const soundLabel = container.querySelector<HTMLElement>('#sound-label')!
  const counter = container.querySelector<HTMLElement>('#pop-count')!
  const announcement = container.querySelector<HTMLElement>('#wrap-announcement')!
  let count = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const updateSound = () => {
    soundButton.classList.toggle('is-muted', !audio.enabled)
    soundButton.setAttribute('aria-pressed', String(audio.enabled))
    soundButton.setAttribute('aria-label', audio.enabled ? '소리 끄기' : '소리 켜기')
    soundLabel.textContent = audio.enabled ? '소리 켜짐' : '소리 꺼짐'
  }
  const audio = new PopAudio(() => {
    updateSound()
    announcement.textContent = '소리를 재생할 수 없어요. 소리 버튼을 눌러 다시 시도해보세요.'
  })
  const field = new BubbleField(container.querySelector<HTMLElement>('#bubble-field')!, () => {
    count++
    counter.textContent = String(count).padStart(3, '0')
    audio.play()
    clearTimeout(timer)
    timer = setTimeout(() => { announcement.textContent = `${count}개의 뽁뽁이를 터뜨렸어요.` }, 450)
  })
  soundButton.addEventListener('click', () => { audio.setEnabled(!audio.enabled); updateSound() }, options)
  container.querySelector<HTMLButtonElement>('#reset-bubbles')!.addEventListener('click', () => {
    field.reset()
    count = 0
    counter.textContent = '000'
    clearTimeout(timer)
    announcement.textContent = '모든 뽁뽁이가 다시 부풀었어요.'
  }, options)
  return () => { events.abort(); field.destroy(); audio.destroy(); clearTimeout(timer) }
}
