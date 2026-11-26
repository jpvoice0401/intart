import { CharacterController } from '../character'
import { starfield } from './stars'

export function mountCharacter(container: HTMLElement): () => void {
  container.innerHTML = `
  <section class="universe" aria-labelledby="page-title">
    ${starfield()}
    <div class="ambient-light" aria-hidden="true"></div>
    <div class="intro"><h1 id="page-title">눈이 마주치는 작은 우주<span>.</span></h1></div>
    <section class="character-stage" aria-label="마우스를 바라보는 노란 구형 캐릭터">
      <div class="orb-container">
          <button class="sun" id="character" type="button" aria-label="노란 구형 캐릭터. 클릭하거나 엔터 키를 누르면 윙크합니다." aria-describedby="instructions">
            <svg class="face" viewBox="0 0 500 500" fill="none" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
              <defs>
                <radialGradient id="character-skin" cx="32%" cy="24%" r="82%"><stop stop-color="#ffffb3"/><stop offset=".28" stop-color="#fff584"/><stop offset=".57" stop-color="#ffe94c"/><stop offset=".82" stop-color="#f5cc22"/><stop offset="1" stop-color="#cf920e"/></radialGradient>
                <radialGradient id="skin-highlight"><stop stop-color="#ffffe8" stop-opacity=".5"/><stop offset="1" stop-color="#ffffe8" stop-opacity="0"/></radialGradient>
                <radialGradient id="eye-white"><stop offset="0.7" stop-color="#fffef6"/><stop offset="1" stop-color="#e4f2ed"/></radialGradient>
                <radialGradient id="pupil-shade" cx="35%" cy="30%"><stop stop-color="#24362d"/><stop offset="0.7" stop-color="#14201b"/><stop offset="1" stop-color="#0c1713"/></radialGradient>
                <radialGradient id="cheek-light"><stop stop-color="#fffbd5" stop-opacity=".8"/><stop offset="1" stop-color="#fff9be" stop-opacity="0"/></radialGradient>
                <clipPath id="eye-clip"><ellipse rx="49" ry="57"/></clipPath>
                <clipPath id="mouth-clip"><ellipse id="mouth-mask" rx="12" ry="12"/></clipPath>
              </defs>
              <circle cx="250" cy="250" r="250" fill="url(#character-skin)"/>
              <ellipse cx="143" cy="91" rx="132" ry="79" fill="url(#skin-highlight)" transform="rotate(-25 143 91)"/>
              <ellipse cx="454" cy="299" rx="33" ry="68" fill="url(#cheek-light)" opacity=".35"/>
              <g id="face-rig">
                <ellipse cx="126" cy="292" rx="25" ry="27" fill="url(#cheek-light)"/>
                <ellipse cx="374" cy="292" rx="25" ry="27" fill="url(#cheek-light)"/>
                <g id="blush" opacity="0"><ellipse cx="134" cy="286" rx="24" ry="13" fill="#ed9967" opacity=".5"/><ellipse cx="366" cy="286" rx="24" ry="13" fill="#ed9967" opacity=".5"/></g>
                <g id="left-brow" transform="translate(189 167)"><path d="M-44 11Q-2-40 45 14" stroke="#2d301b" stroke-width="12" stroke-linecap="round"/></g>
                <g id="right-brow" transform="translate(311 167)"><path d="M-45 14Q0-38 44 11" stroke="#2d301b" stroke-width="12" stroke-linecap="round"/></g>
                <g id="left-eye-rig" transform="translate(189 223)">
                  <g id="left-eye-open"><ellipse rx="49" ry="57" fill="url(#eye-white)"/><g clip-path="url(#eye-clip)"><g id="left-pupil"><ellipse rx="35" ry="45" fill="url(#pupil-shade)" stroke="#48665c" stroke-width="1.5"/><ellipse cx="-12" cy="-20" rx="5" ry="7" fill="#fff" opacity=".65"/><circle cx="10" cy="20" r="2" fill="#fff" opacity=".15"/></g></g></g>
                  <path id="left-eye-closed" d="M-36 3Q0-19 36 3" stroke="#27301b" stroke-width="10" stroke-linecap="round" opacity="0"/>
                </g>
                <g id="right-eye-rig" transform="translate(311 223)">
                  <g id="right-eye-open"><ellipse rx="49" ry="57" fill="url(#eye-white)"/><g clip-path="url(#eye-clip)"><g id="right-pupil"><ellipse rx="35" ry="45" fill="url(#pupil-shade)" stroke="#48665c" stroke-width="1.5"/><ellipse cx="-12" cy="-20" rx="5" ry="7" fill="#fff" opacity=".65"/><circle cx="10" cy="20" r="2" fill="#fff" opacity=".15"/></g></g></g>
                  <path id="right-eye-closed" d="M-36 3Q0-19 36 3" stroke="#27301b" stroke-width="10" stroke-linecap="round" opacity="0"/>
                  <path id="right-eye-wink" d="M24 -24 L-16 0 L24 24" stroke="#27301b" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" opacity="0"/>
                </g>
                <g id="mouth-rig" transform="translate(250 299)">
                  <g id="mouth-cavity"><ellipse id="mouth-open" rx="12" ry="12" fill="#49331d"/><g clip-path="url(#mouth-clip)"><ellipse id="mouth-tongue" cy="10" rx="8" ry="5" fill="#e79575"/></g></g>
                  <path id="mouth-line" d="M-14 0Q0 6 14 0" stroke="#49401d" stroke-width="7" stroke-linecap="round" opacity="0"/>
                </g>
                <g id="sleep-marks" fill="#fff2af" opacity="0" font-family="Noto Sans KR, sans-serif" font-weight="600"><text x="369" y="141" font-size="22">z</text><text x="397" y="119" font-size="29">z</text><text x="430" y="87" font-size="37">z</text></g>
                <path id="anger-mark" d="M390 154q-9 0-9-10m15 10q9 0 9-10m-15 16q-9 0-9 10m15-10q9 0 9 10" stroke="#a2642c" stroke-width="5" stroke-linecap="round" opacity="0"/>
                <g id="wink-sparkle" opacity="0"><path d="m390 188 4 12 12 4-12 4-4 12-4-12-12-4 12-4Z" fill="#fffbd7"/><path d="m411 176 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="#fffbd7" opacity=".6"/></g>
              </g>
            </svg>
          </button>
      </div>
      <div class="ground-shadow" aria-hidden="true"></div>
    </section>
    <footer class="footer">
      <div class="character-caption"><span class="caption-dot"></span><span id="character-status" role="status" aria-live="polite">안녕, 눈이 마주쳤네요!</span></div>
      <div id="instructions" class="instructions"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="m5 3 14 9-7 1-3 7Z"/></svg>움직이면 표정도 따라와요</span><i aria-hidden="true"></i><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 3v7"/></svg>클릭하면 찡긋!</span></div>
      <button id="wink-button" class="wink-button" type="button">윙크 보내기 <span aria-hidden="true">↗</span></button>
      <div class="footer-bottom"><span>VIBE CODING WORKSHOP</span><span>SMALL MOMENTS, WARM CONNECTIONS <i aria-hidden="true">✦</i></span></div>
    </footer>
  </section>
`
  const controller = new CharacterController(container.querySelector<HTMLElement>('.universe')!)
  return () => controller.destroy()
}
