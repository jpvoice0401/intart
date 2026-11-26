import './style.css'
import './experiments.css'
import './navigation.css'
import { ExperimentSwitcher, type ExperimentId } from './experiment-switcher'
import { lazyExperiment } from './lazy-experiment'

const mounts = {
  animalforest: lazyExperiment(async () => (await import('./scenes/animal-forest-scene')).mountAnimalForest),
  sabrina: lazyExperiment(async () => (await import('./scenes/sabrina-scene')).mountSabrina),
  thanos: lazyExperiment(async () => (await import('./scenes/thanos-scene')).mountThanos),
  minecraft: lazyExperiment(async () => (await import('./scenes/minecraft-scene')).mountMinecraft),
  rubberhuman: lazyExperiment(async () => (await import('./scenes/rubber-human-scene')).mountRubberHuman),
  myboo: lazyExperiment(async () => (await import('./scenes/myboo-scene')).mountMyboo),
  rolex: lazyExperiment(async () => { const [scene] = await Promise.all([import('./scenes/rolex-scene'),import('./rolex.css')]); return scene.mountRolex }),
  snow: lazyExperiment(async () => { const [scene] = await Promise.all([import('./scenes/snow-scene'),import('./snow.css')]); return scene.mountSnow }),
  watertouch: lazyExperiment(async () => { const [scene] = await Promise.all([import('./scenes/water-touch-scene'),import('./water-touch.css')]); return scene.mountWaterTouch }),
  character: lazyExperiment(async () => (await import('./scenes/character-scene')).mountCharacter),
  bubbles: lazyExperiment(async () => (await import('./scenes/bubble-scene')).mountBubbles),
  fireworks: lazyExperiment(async () => (await import('./scenes/firework-scene')).mountFireworks),
  clouds: lazyExperiment(async () => { const [scene] = await Promise.all([import('./scenes/cloud-scene'),import('./cloud-garden.css')]); return scene.mountClouds }),
  golf: lazyExperiment(async () => { const [scene] = await Promise.all([import('./scenes/golf-scene'),import('./golf.css')]); return scene.mountGolf }),
  typing: lazyExperiment(async () => { const [scene] = await Promise.all([import('./scenes/typing-scene'),import('./typing-snow.css')]); return scene.mountTypingRain }),
  claw: lazyExperiment(async () => { const [scene] = await Promise.all([import('./scenes/claw-scene'),import('./claw.css')]); return scene.mountClaw }),
  sixflags: lazyExperiment(async () => { const [scene] = await Promise.all([import('./scenes/sixflags-scene'),import('./sixflags.css')]); return scene.mountSixflags }),
  church: lazyExperiment(async () => { const [scene] = await Promise.all([import('./scenes/church-scene'),import('./church.css')]); return scene.mountChurch }),
}

const icons = {
  animalforest: '<path d="m7 3-5 8h3l-4 6h12l-4-6h3L7 3ZM7 17v5m10-9v9"/><path d="m17 5-4 8h8l-4-8Z"/>',
  sabrina: '<path d="m4 20 10-10m-8 8 2 2M16 2l1.5 4.5L22 8l-4.5 1.5L16 14l-1.5-4.5L10 8l4.5-1.5L16 2ZM5 3v4M3 5h4m12 12v4m-2-2h4"/>',
  thanos: '<path d="M7 21v-3c-3-2-4-4-4-7 0-2 2-2 3 0l2 2V5c0-2 3-2 3 0v5-7c0-2 3-2 3 0v7-4c0-2 3-2 3 0v7c2-1 4 0 3 2l-3 6Z"/><path d="m19 2 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z"/>',
  minecraft: '<path d="m15 3 6 0v6L10 20l-3-3L18 6M6 12l6 6M4 17l3 3-3 2-2-2 2-3Z"/>',
  rubberhuman: '<path d="M8 4C3 5 3 19 8 20c4 1 6-3 10-1 4 2 4-5 1-5-4 0-2-9-7-10Z"/><path d="M8 10h.01M13 10h.01M8 15q2 2 4 0M18 7l3-3m-2 7h3"/>',
  myboo: '<path d="m4 10 2-5h12l2 5M3 10h18v8H3zM5 18v3m14-3v3M6 14h2m8 0h2M9 10h6"/>',
  rolex: '<circle cx="12" cy="12" r="6"/><path d="M9 6V2h6v4M9 18v4h6v-4M12 8v4l3 2M18 11h2v2h-2"/>',
  snow: '<path d="M12 2v20M3 7l18 10M3 17 21 7M8 4l4 4 4-4M8 20l4-4 4 4M3 11l5-1-1-5M17 19l-1-5 5-1"/>',
  watertouch: '<path d="M3 9q4-4 9 0t9 0M3 15q4-4 9 0t9 0M7 21q3-3 6 0t6 0"/><circle cx="12" cy="3" r="1"/>',
  character: '<circle cx="12" cy="12" r="8"/><path d="M8 10h.01M16 10h.01M9 15q3 3 6 0"/>',
  bubbles: '<circle cx="7" cy="7" r="3.5"/><circle cx="17" cy="7" r="3.5"/><circle cx="7" cy="17" r="3.5"/><circle cx="17" cy="17" r="3.5"/>',
  fireworks: '<path d="M12 2v5m0 10v5M2 12h5m10 0h5M5 5l4 4m6 6 4 4M5 19l4-4m6-6 4-4"/>',
  clouds: '<path d="M7 18a4 4 0 1 1 .7-7.9 5 5 0 0 1 9.6 0A4 4 0 1 1 18 18H7Z"/>',
  golf: '<path d="M6 21V3l12 4-12 4"/><ellipse cx="13" cy="21" rx="8" ry="1.5"/>',
  typing: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M8 16h8"/>',
  claw: '<path d="M12 2v7m-3 0h6v4H9zM9 12 4 17l3 5m8-10 5 5-3 5m-5-9v8"/>',
  sixflags: '<path d="M5 21V3l13 3-13 4M3 21h8M14 21v-8m-3 8h6"/>',
  church: '<path d="M12 2v6M9 4h6M3 21V12l9-5 9 5v9H3Zm7 0v-7h4v7"/>',
}
const experiments: { id: ExperimentId; label: string; title: string }[] = [
  { id: 'animalforest', label: '동물의 숲', title: '동물의 숲 · 우주에 피어난 작은 행성' },
  { id: 'sabrina', label: 'Sabrina', title: 'Sabrina · 손끝에서 시작되는 공주 마법' },
  { id: 'thanos', label: '타노스', title: '타노스 · 한 번의 스냅, 우주의 먼지' },
  { id: 'minecraft', label: 'MineCraft', title: 'MineCraft · 카메라 속 다이아몬드 검' },
  { id: 'rubberhuman', label: '고무 인간', title: '고무 인간 · 손끝에 잡힌 말랑한 얼굴' },
  { id: 'myboo', label: 'myboo', title: 'myboo · 손끝으로 달리는 라스베가스' },
  { id: 'rolex', label: 'rolex', title: 'rolex · 손끝으로 돌리는 시간' },
  { id: 'snow', label: 'Snow', title: 'Snow · 손끝에 찾아온 겨울' },
  { id: 'watertouch', label: 'WaterTouch', title: 'WaterTouch · 손끝으로 만드는 물결' },
  { id: 'character', label: '캐릭터', title: 'Little Sun · 눈이 마주치는 작은 우주' },
  { id: 'bubbles', label: '뽁뽁이', title: '뽁뽁, 잠깐의 여유' },
  { id: 'fireworks', label: '폭죽', title: '바이브코딩워크숍 · 상상이 빛나는 밤' },
  { id: 'clouds', label: '구름 팡!', title: '구름은 건드리지 마!' },
  { id: 'golf', label: '리듬 골프', title: 'Rhythm Golf · 리듬 타고 나이스 샷' },
  { id: 'typing', label: '타이핑 스노우', title: 'Typing Snow · 단어가 소복소복 쌓이는 겨울' },
  { id: 'claw', label: '인형뽑기', title: 'Cuddle Club · 작은 친구를 만나는 3D 인형뽑기' },
  { id: 'sixflags', label: '6flags', title: '6flags · 미국 Great Adventure 3D 테마파크' },
  { id: 'church', label: '여의도순복음교회', title: '여의도순복음교회 · 함께하는 대성전' },
]

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="lab-shell" data-experiment="character">
    <header class="lab-header" data-lab-navigation>
      <div class="lab-brand"><span class="lab-brand-mark" aria-hidden="true">✳</span><div>VIBE <span>PLAY LAB</span><small>바이브코딩워크숍</small></div></div>
      <button class="experiment-menu-toggle" type="button" aria-expanded="false" aria-controls="experiment-navigation"><span class="experiment-current-label">체험 선택</span><span class="experiment-menu-hint">전체 메뉴 <span aria-hidden="true">⌄</span></span></button>
      <nav id="experiment-navigation" class="experiment-tabs" role="tablist" aria-label="체험할 실험 선택">${experiments.map(experiment => `<button id="tab-${experiment.id}" class="experiment-tab" type="button" role="tab" data-experiment="${experiment.id}" aria-label="${experiment.label}" title="${experiment.label}" aria-controls="experiment-panel" aria-selected="false" tabindex="-1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">${icons[experiment.id]}</svg></button>`).join('')}</nav>
      <span class="lab-note"><i></i> 골라서, 자유롭게 놀아보세요</span>
    </header>
    <main id="experiment-panel" class="experiment-panel" role="tabpanel" aria-labelledby="tab-character" tabindex="0"></main>
  </div>`

const shell = document.querySelector<HTMLElement>('.lab-shell')!
const panel = document.querySelector<HTMLElement>('#experiment-panel')!
const tabs = [...document.querySelectorAll<HTMLButtonElement>('.experiment-tab')]
const switcher = new ExperimentSwitcher(panel, mounts)
const events = new AbortController()
const menuToggle = document.querySelector<HTMLButtonElement>('.experiment-menu-toggle')!
const header = document.querySelector<HTMLElement>('.lab-header')!
function closeMenu() { header.classList.remove('menu-open'); menuToggle.setAttribute('aria-expanded', 'false') }
menuToggle.addEventListener('click', () => {
  const open = header.classList.toggle('menu-open')
  menuToggle.setAttribute('aria-expanded', String(open))
}, { signal: events.signal })
menuToggle.addEventListener('keydown', event => {
  if (event.code !== 'ArrowDown') return
  event.preventDefault(); header.classList.add('menu-open'); menuToggle.setAttribute('aria-expanded', 'true')
  tabs.find(tab => tab.getAttribute('aria-selected') === 'true')?.focus()
}, { signal: events.signal })
document.addEventListener('pointerdown', event => { if (!header.contains(event.target as Node)) closeMenu() }, { signal: events.signal })
header.addEventListener('keydown', event => { if (event.code === 'Escape' && header.classList.contains('menu-open')) { event.preventDefault(); closeMenu(); menuToggle.focus() } }, { signal: events.signal })

function select(id: ExperimentId) {
  if (!switcher.show(id)) return
  shell.dataset.experiment = id
  document.querySelector<HTMLElement>('.experiment-current-label')!.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">${icons[id]}</svg>`
  menuToggle.setAttribute('aria-label', `예제 선택: ${experiments.find(experiment => experiment.id === id)!.label}`)
  panel.setAttribute('aria-labelledby', `tab-${id}`)
  for (const tab of tabs) {
    const selected = tab.dataset.experiment === id
    tab.setAttribute('aria-selected', String(selected))
    tab.tabIndex = selected ? 0 : -1
  }
  document.title = `${experiments.find(experiment => experiment.id === id)!.title} · VIBE PLAY LAB`
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!.content = id === 'rolex' ? '#102c24' : id === 'church' ? '#171e22' : id === 'sixflags' ? '#dce8dd' : id === 'claw' ? '#24232e' : id === 'typing' ? '#263d51' : id === 'golf' ? '#a8d8ef' : id === 'clouds' ? '#c6e7ef' : id === 'bubbles' ? '#d5cbdf' : '#070b17'
  tabs.find(tab => tab.dataset.experiment === id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', event => {
    // The navigation click must not become a wink in the newly mounted character scene.
    event.stopPropagation()
    select(experiments[index]!.id)
    closeMenu()
    if (matchMedia('(max-width: 799px)').matches) menuToggle.focus()
  }, { signal: events.signal })
  tab.addEventListener('keydown', event => {
    let next = index
    if (event.code === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.code === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length
    else if (event.code === 'Home') next = 0
    else if (event.code === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    event.stopPropagation()
    select(experiments[next]!.id)
    tabs[next]!.focus()
  }, { signal: events.signal })
})

const requestedExample = new URLSearchParams(location.search).get('example')
select(experiments.find(experiment => experiment.id === requestedExample)?.id ?? 'rolex')
if (import.meta.hot) import.meta.hot.dispose(() => { events.abort(); switcher.destroy() })
