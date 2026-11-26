import { CloudGarden } from '../cloud-garden'
import { CloudAudio } from '../cloud-audio'

export function mountClouds(container: HTMLElement): () => void {
  container.innerHTML = `
    <section class="cloud-garden" aria-label="구름을 터뜨리면 화내는 분홍 캐릭터">
      <div class="garden-sunlight" aria-hidden="true"></div>
      <div class="garden-intro"><p>HANDLE WITH A LITTLE MISCHIEF</p><h1>구름은 건드리지 마<span>!</span></h1></div>
      <div id="floating-clouds" class="floating-clouds" role="group" aria-label="클릭하거나 터치해서 터뜨릴 수 있는 구름"></div>
      <div class="pink-stage">
        <div class="pink-halo" aria-hidden="true"></div>
        <div class="pink-character" role="img" aria-label="머리 장식 없이 동그란 분홍 캐릭터">
          <svg viewBox="0 0 500 500" fill="none" aria-hidden="true">
            <defs>
              <radialGradient id="pink-skin" cx="66%" cy="28%" r="83%"><stop stop-color="#fff2e9"/><stop offset=".34" stop-color="#f8d8d8"/><stop offset=".7" stop-color="#e8b4c1"/><stop offset="1" stop-color="#cf8fa8"/></radialGradient>
              <radialGradient id="pink-limb" cx="65%" cy="25%" r="85%"><stop stop-color="#f9d4d7"/><stop offset=".7" stop-color="#e5a8b9"/><stop offset="1" stop-color="#cb86a3"/></radialGradient>
              <radialGradient id="pink-eye-shade" cx="65%" cy="20%"><stop stop-color="#65505a"/><stop offset=".5" stop-color="#3e2d36"/><stop offset="1" stop-color="#2e232b"/></radialGradient>
              <radialGradient id="pink-blush"><stop stop-color="#ed978f" stop-opacity=".8"/><stop offset="1" stop-color="#ed978f" stop-opacity="0"/></radialGradient>
              <radialGradient id="pink-body-shine"><stop stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
              <clipPath id="pink-mouth-clip"><ellipse rx="28" ry="38"/></clipPath>
            </defs>
            <g id="pink-body-rig">
              <ellipse cx="190" cy="425" rx="32" ry="23" fill="url(#pink-limb)" transform="rotate(8 190 425)"/>
              <ellipse cx="310" cy="425" rx="32" ry="23" fill="url(#pink-limb)" transform="rotate(-8 310 425)"/>
              <circle cx="250" cy="248" r="185" fill="url(#pink-skin)"/>
              <ellipse cx="313" cy="112" rx="106" ry="54" fill="url(#pink-body-shine)" transform="rotate(25 313 112)"/>
              <ellipse cx="132" cy="326" rx="29" ry="36" fill="url(#pink-limb)" transform="rotate(-35 132 326)"/>
              <ellipse cx="368" cy="326" rx="29" ry="36" fill="url(#pink-limb)" transform="rotate(35 368 326)"/>
              <g id="pink-face">
                <g id="pink-cheeks" opacity=".5"><ellipse cx="149" cy="274" rx="41" ry="35" fill="url(#pink-blush)"/><ellipse cx="351" cy="274" rx="41" ry="35" fill="url(#pink-blush)"/><g fill="#fff3df" opacity=".65"><circle cx="137" cy="271" r="4"/><circle cx="152" cy="275" r="3"/><circle cx="346" cy="275" r="4"/><circle cx="361" cy="271" r="3"/></g></g>
                <g id="pink-left-eye" transform="translate(187 221)"><ellipse rx="30" ry="35" fill="url(#pink-eye-shade)"/><circle cx="11" cy="-16" r="8" fill="#fff"/><circle cx="-10" cy="16" r="4" fill="#eec4cd" opacity=".7"/></g>
                <g id="pink-right-eye" transform="translate(313 221)"><ellipse rx="30" ry="35" fill="url(#pink-eye-shade)"/><circle cx="11" cy="-16" r="8" fill="#fff"/><circle cx="-10" cy="16" r="4" fill="#eec4cd" opacity=".7"/></g>
                <g id="pink-angry-brows" stroke="#654451" stroke-width="9" stroke-linecap="round" opacity="0"><path d="m161 167 48 15m82 0 48-15"/></g>
                <g id="pink-calm-mouth"><path d="M223 260Q235 268 250 263Q265 268 277 260Q275 295 250 297Q225 295 223 260Z" fill="#713c46"/><path d="M231 284Q250 272 269 284Q261 297 250 297Q239 297 231 284Z" fill="#ed9b9e"/><path d="M223 260Q235 268 250 263Q265 268 277 260" stroke="#573d42" stroke-width="4" stroke-linecap="round"/></g>
                <g id="pink-shout-mouth" transform="translate(250 289)" opacity="0"><ellipse rx="28" ry="38" fill="#6c3146"/><g clip-path="url(#pink-mouth-clip)"><ellipse cy="27" rx="22" ry="15" fill="#ed879f"/><path d="M-24-35H24V-22Q0-16-24-22Z" fill="#fff1e8"/></g></g>
                <path id="pink-anger-mark" d="M369 159q-10 0-10-11m17 11q10 0 10-11m-17 18q-10 0-10 11m17-11q10 0 10 11" stroke="#c66a81" stroke-width="4" stroke-linecap="round" opacity="0"/>
              </g>
            </g>
          </svg>
        </div>
        <div class="pink-speech" aria-hidden="true">NO<span>!</span><i></i></div>
        <div class="pink-ground" aria-hidden="true"></div>
      </div>
      <div class="garden-controls"><button id="garden-sound" type="button" aria-pressed="true" aria-label="구름 터지는 소리와 목소리 끄기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m11 5-5 4H3v6h3l5 4V5Z"/><path class="garden-sound-on" d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/><path class="garden-sound-off" d="m16 9 6 6m0-6-6 6"/></svg><span>소리 켜짐</span></button></div>
      <footer class="garden-footer"><p id="cloud-status" role="status" aria-live="polite">쉿, 구름이 쉬고 있어요.</p><div class="garden-guide"><span aria-hidden="true">☁</span> 구름을 클릭 · 터치해보세요 <i></i><span id="cloud-pop-count">아직은 평화로운 하늘</span></div><p class="garden-footnote">SOFT CLOUDS. SHORT TEMPER.</p></footer>
    </section>`
  const events = new AbortController()
  const audio = new CloudAudio(`${import.meta.env.BASE_URL}audio/no.wav`)
  const garden = new CloudGarden(container.querySelector<HTMLElement>('.cloud-garden')!, count => {
    container.querySelector<HTMLElement>('#cloud-pop-count')!.textContent = `${count}개의 구름이 팡!`
    audio.shout()
  })
  const soundButton = container.querySelector<HTMLButtonElement>('#garden-sound')!
  soundButton.addEventListener('click', () => {
    audio.setEnabled(!audio.enabled)
    soundButton.classList.toggle('is-muted', !audio.enabled)
    soundButton.setAttribute('aria-pressed', String(audio.enabled))
    soundButton.setAttribute('aria-label', audio.enabled ? '구름 터지는 소리와 목소리 끄기' : '구름 터지는 소리와 목소리 켜기')
    soundButton.querySelector('span')!.textContent = audio.enabled ? '소리 켜짐' : '소리 꺼짐'
  }, { signal: events.signal })
  return () => { events.abort(); garden.destroy(); audio.destroy() }
}
