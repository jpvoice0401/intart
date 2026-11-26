import ballImage from '../assets/golf-face.png'
import { GolfAudio } from '../golf-audio'
import { RhythmGolf } from '../rhythm-golf'
import { BUNKERS, WATER } from '../golf-model'

function course(): string {
  const trees = [[31, 424, 1.4], [75, 397, 1.2], [128, 420, 1.7], [185, 394, 1.1], [235, 423, 1.1], [290, 405, .9], [334, 421, .7], [678, 413, .8], [729, 401, 1], [780, 420, 1.1], [831, 395, 1.2], [881, 420, 1.8], [936, 393, 1.2], [984, 425, 1.5]].map(([x, y, scale]) => `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M-2 0v-47h4V0Z" fill="#637442"/><ellipse cy="-51" rx="16" ry="31" fill="#538a69"/><ellipse cx="-8" cy="-44" rx="12" ry="24" fill="#608f69"/><ellipse cx="7" cy="-53" rx="9" ry="22" fill="#79a376"/></g>`).join('')
  return `<svg class="golf-course" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="golf-sky" x2="0" y2="1"><stop stop-color="#a8d8ef"/><stop offset="1" stop-color="#e9f2dc"/></linearGradient>
      <linearGradient id="golf-grass" x2="0" y2="1"><stop stop-color="#8eb97a"/><stop offset="1" stop-color="#478a55"/></linearGradient>
      <linearGradient id="golf-fairway" x2="0" y2="1"><stop stop-color="#b9d293"/><stop offset="1" stop-color="#8db76d"/></linearGradient>
      <radialGradient id="golf-water"><stop stop-color="#95d6d8"/><stop offset="1" stop-color="#6ab9c8"/></radialGradient>
      <clipPath id="fairway-clip"><path d="M265 1000C285 834 350 701 390 605S386 474 455 437Q539 397 615 441C708 484 649 544 643 611S745 833 797 1000Z"/></clipPath>
      <clipPath id="pond-clip"><ellipse cx="210" cy="630" rx="135" ry="65"/></clipPath>
    </defs>
    <rect width="1000" height="1000" fill="url(#golf-sky)"/>
    <circle cx="809" cy="190" r="31" fill="#fff8c9" opacity=".7"/>
    <g fill="#fff" opacity=".55"><ellipse cx="130" cy="232" rx="72" ry="14"/><ellipse cx="163" cy="224" rx="36" ry="20"/><ellipse cx="671" cy="194" rx="63" ry="10"/><ellipse cx="700" cy="188" rx="29" ry="15"/></g>
    <path d="M0 362Q80 285 191 351T380 333T574 348T784 318T1000 350V500H0Z" fill="#a7c6ad"/>
    <path d="M0 404Q80 345 190 382T380 373T575 389T783 368T1000 391V500H0Z" fill="#81ae8b"/>
    <path d="M0 430Q270 384 500 430T1000 416V1000H0Z" fill="url(#golf-grass)"/>
    ${trees}
    <path d="M265 1000C285 834 350 701 390 605S386 474 455 437Q539 397 615 441C708 484 649 544 643 611S745 833 797 1000Z" fill="url(#golf-fairway)"/>
    <g clip-path="url(#fairway-clip)" fill="#d1e4ad" opacity=".15"><path d="M120 480h760v28H120ZM120 539h760v35H120ZM100 618h800v45H100ZM80 720h840v57H80ZM30 853h940v74H30Z"/></g>
    <ellipse cx="540" cy="460" rx="130" ry="45" fill="#bbd996"/><ellipse cx="540" cy="460" rx="117" ry="37" fill="#b2d48d"/>
    ${BUNKERS.map(b => `<ellipse cx="${b.x * 1000}" cy="${b.y * 1000 + 3}" rx="${b.rx * 1000 + 4}" ry="${b.ry * 1000 + 3}" fill="#6f925a"/><ellipse cx="${b.x * 1000}" cy="${b.y * 1000}" rx="${b.rx * 1000}" ry="${b.ry * 1000}" fill="#f0dba0" stroke="#dbbd7e" stroke-width="3"/><ellipse cx="${b.x * 1000 + 5}" cy="${b.y * 1000 - 3}" rx="${b.rx * 1000 - 12}" ry="${b.ry * 1000 - 8}" fill="#f5e3af"/>`).join('')}
    <ellipse cx="${WATER.x * 1000}" cy="${WATER.y * 1000}" rx="${WATER.rx * 1000 + 4}" ry="${WATER.ry * 1000 + 5}" fill="#709a60"/>
    <ellipse cx="210" cy="630" rx="135" ry="65" fill="url(#golf-water)"/>
    <g clip-path="url(#pond-clip)" stroke="#d3f0e8" stroke-width="2" opacity=".4"><path d="M71 607h140m-70 17h150m-206 17h140m-77 19h180m-131 13h100"/></g>
    <path d="M910 1000Q798 774 813 638T791 478" fill="none" stroke="#d2d1ac" stroke-width="13" opacity=".65"/>
    <g fill="#fff7d8" stroke="#d8d9bd" stroke-width="1">${[.58, .67, .77, .9].map(y => `<path d="M${80 + y * 55} ${y * 1000}v-18h4v18Zm${765 - y * 20} 0v-18h4v18Z"/>`).join('')}</g>
    <ellipse cx="540" cy="461" rx="7" ry="2.8" fill="#3e7046"/><path d="M540 460v-83" stroke="#fff9d9" stroke-width="2.5"/><path d="m542 377 40 12-40 10Z" fill="#e98169"/>
    <ellipse cx="500" cy="796" rx="65" ry="13" fill="#78a75e" opacity=".7"/><path d="M498 788v-16h4v16" stroke="#e4d9b8" stroke-width="2"/>
    <g fill="#32654f" opacity=".3"><path d="m45 920 5-12 3 14 7-9-2 13m852 28 5-13 4 14 9-8-5 13M174 805l4-10 3 12 6-6-3 9"/></g>
  </svg>`
}

export function mountGolf(container: HTMLElement): () => void {
  container.innerHTML = `
    <section class="golf-scene" data-golf-state="ready" aria-label="힙합 리듬 골프 게임">
      ${course()}
      <div class="golf-heading"><p>92 BPM · ORIGINAL BOOM BAP</p><h1>리듬 타고,<br>나이스 샷<span>.</span></h1><span>공은 춤추고, 드라이버는 당신의 손끝에.</span></div>
      <div class="golf-hud" data-golf-control><div class="golf-hole"><span>THE SUNNY CLUB</span><strong>01 <small>PAR 3 · 235m</small></strong></div><div class="golf-stats"><div><span>SCORE</span><strong id="golf-score">0</strong></div><div><span>SHOTS</span><strong id="golf-shots">00</strong></div><div><span>COMBO</span><strong id="golf-combo">0×</strong></div></div><div class="golf-weather"><span>☀ 맑음 · 22°C</span><span id="golf-wind">↗ 2.0m/s</span></div></div>
      <div class="golf-result" id="golf-result" aria-hidden="true"><strong id="golf-result-title">GOOD SHOT!</strong><span id="golf-result-detail"></span></div>
      <div id="golf-feedback" class="golf-feedback">PERFECT BEAT!</div>
      <svg class="golf-aim-overlay" aria-hidden="true"><line id="golf-aim-line" stroke="#fff9d5" stroke-width="2" stroke-dasharray="5 9"/></svg>
      <div id="golf-shadow" class="golf-ball-shadow" aria-hidden="true"></div>
      <button id="golf-ball" class="golf-ball" type="button" aria-label="얼굴 골프공. 클릭하거나 당긴 뒤 놓으면 드라이버 샷. 스페이스나 엔터 키로도 칠 수 있습니다." aria-describedby="golf-message"><img src="${ballImage}" alt="첨부한 남자의 얼굴이 입혀진 골프공" draggable="false"/></button>
      <div class="golf-voice" id="golf-voice" aria-hidden="true"></div>
      <div class="golf-driver" id="golf-driver" aria-hidden="true"><svg class="golf-driver-club" viewBox="0 0 90 180" fill="none"><defs><linearGradient id="driver-metal"><stop stop-color="#dae6e4"/><stop offset=".45" stop-color="#809795"/><stop offset="1" stop-color="#263d40"/></linearGradient></defs><path d="m29 8 36 130" stroke="#40545a" stroke-width="3"/><path d="m29 8 7 25" stroke="#1b343a" stroke-width="5" stroke-linecap="round"/><path d="M49 128q25-8 32 9t-14 24q-28 7-31-8t13-25Z" fill="url(#driver-metal)" stroke="#506e73"/><path d="m42 144 32-6m-29 12 30-6m-25 12 23-6" stroke="#b9d0ce" stroke-width="1" opacity=".6"/></svg></div>
      <footer class="golf-footer" data-golf-control>
        <p id="golf-message" role="status" aria-live="polite">비트를 켜고 공을 클릭! 당겼다 놓으면 방향과 파워를 조절할 수 있어요.</p>
        <div class="golf-dock">
          <div class="golf-music-control"><button id="golf-music" type="button" aria-pressed="false">▶ 비트 켜기</button><span><i></i> 92 BPM</span></div>
          <label class="golf-range"><span>POWER <b id="golf-power-value">64%</b></span><input id="golf-power" type="range" min="0.1" max="1" value="0.64" step="0.01" aria-label="샷 파워"/></label>
          <div class="golf-timing"><span>초록선에서 샷!</span><div class="golf-beat-meter"><i></i><b id="golf-beat-cursor"></b></div><small>RIDE THE BEAT</small></div>
          <label class="golf-range"><span>AIM <b id="golf-aim-value">CENTER</b></span><input id="golf-aim" type="range" min="-1" max="1" value="0" step="0.01" aria-label="샷 방향. 왼쪽과 오른쪽 조절"/></label>
          <div class="golf-next-control"><button id="golf-next" type="button">다시 티업 ↗</button><span id="golf-distance">READY TO DRIVE</span></div>
        </div>
        <p class="golf-footnote">클릭 · 당겨서 놓기 · 마우스로 툭 치기 <span>굿샷 / 벙커 / 러프 / 워터 / OB / 홀인원</span></p>
      </footer>
    </section>`
  const audio = new GolfAudio(`${import.meta.env.BASE_URL}audio/`)
  const game = new RhythmGolf(container.querySelector<HTMLElement>('.golf-scene')!, audio)
  return () => { game.destroy(); audio.destroy() }
}
