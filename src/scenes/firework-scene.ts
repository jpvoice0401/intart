import { Fireworks } from '../fireworks'
import { starfield } from './stars'

export function mountFireworks(container: HTMLElement): () => void {
  container.innerHTML = `
    <section class="firework-scene" aria-label="밤하늘 폭죽 실험">
      ${starfield()}
      <div class="firework-moon" aria-hidden="true"></div>
      <div class="cloud-stage"><p class="cloud-eyebrow">A LITTLE SPARK, A LITTLE MAGIC</p><h1 class="cloud-heading"><span class="sr-only">바이브코딩워크숍</span><canvas id="cloud-title" aria-hidden="true"></canvas></h1><p class="cloud-subtitle">당신의 작은 움직임이, 밤하늘의 빛이 되는 곳.</p></div>
      <div class="firework-horizon" aria-hidden="true"><svg viewBox="0 0 1440 180" preserveAspectRatio="none"><path d="M0 130 90 107 160 120 250 72 390 130 480 101 570 115 650 83 740 117 840 77 930 113 1020 85 1110 101 1230 57 1330 95 1440 70V180H0Z" fill="#0a1020"/><path d="M0 143 130 125 260 148 390 122 510 153 620 132 740 151 850 122 990 145 1130 129 1270 146 1370 116 1440 131V180H0Z" fill="#060b16"/></svg></div>
      <canvas id="fireworks" tabindex="0" role="application" aria-label="클릭하거나 터치하면 폭죽이 터집니다. 길게 누를수록 커집니다. 드래그 후 놓으면 경로를 따라 터집니다. 스페이스 또는 엔터 키로도 실행할 수 있습니다." aria-describedby="firework-instructions"></canvas>
      <button id="clear-fireworks" class="firework-clear" type="button">하늘 비우기 <span aria-hidden="true">↺</span></button>
      <footer class="firework-footer"><p class="firework-invitation">밤하늘에, 당신만의 빛을 그려보세요</p><div id="firework-instructions" class="firework-instructions"><span>◎ 클릭 · 터치 <b>작은 불꽃</b></span><i></i><span>◴ 길게 누르기 <b>더 큰 불꽃</b></span><i></i><span>〰 드래그 후 놓기 <b>빛의 궤적</b></span></div><p id="burst-count" role="status" aria-live="polite">오늘 밤의 첫 불꽃을 기다리는 중</p></footer>
      <div id="charge-hint" aria-hidden="true"></div>
    </section>`
  const events = new AbortController()
  let disposed = false
  const cloud = container.querySelector<HTMLCanvasElement>('#cloud-title')!
  const context = cloud.getContext('2d')!
  const text = '바이브코딩워크숍'
  const paintCloud = () => {
    if (disposed) return
    const bounds = cloud.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    cloud.width = Math.round(bounds.width * ratio)
    cloud.height = Math.round(bounds.height * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    const mask = document.createElement('canvas')
    mask.width = Math.round(bounds.width)
    mask.height = Math.round(bounds.height)
    const maskContext = mask.getContext('2d', { willReadFrequently: true })!
    const fontSize = bounds.width / 8.9
    maskContext.font = `900 ${fontSize}px ${getComputedStyle(document.documentElement).fontFamily}`
    maskContext.textAlign = 'center'
    maskContext.textBaseline = 'middle'
    maskContext.fillText(text, bounds.width / 2, bounds.height * .48, bounds.width * .94)
    const pixels = maskContext.getImageData(0, 0, mask.width, mask.height).data
    const step = Math.max(2, fontSize / 27)
    for (let y = 0; y < mask.height; y += step) {
      for (let x = 0; x < mask.width; x += step) {
        if (pixels[(Math.floor(y) * mask.width + Math.floor(x)) * 4 + 3]! < 120) continue
        const radius = step * (1.1 + Math.random() * 1.3)
        const px = x + (Math.random() - .5) * step
        const py = y + (Math.random() - .5) * step
        const puff = context.createRadialGradient(px, py, 0, px, py, radius)
        puff.addColorStop(0, `rgba(221, 232, 252, ${.18 + Math.random() * .2})`)
        puff.addColorStop(.5, 'rgba(200, 217, 244, .14)')
        puff.addColorStop(1, 'rgba(180, 205, 241, 0)')
        context.fillStyle = puff
        context.fillRect(px - radius, py - radius, radius * 2, radius * 2)
      }
    }
  }
  const fireworks = new Fireworks(container.querySelector<HTMLCanvasElement>('#fireworks')!, container.querySelector<HTMLElement>('#charge-hint')!, container.querySelector<HTMLElement>('#burst-count')!)
  container.querySelector<HTMLButtonElement>('#clear-fireworks')!.addEventListener('click', () => fireworks.clear(), { signal: events.signal })
  window.addEventListener('resize', paintCloud, { signal: events.signal })
  paintCloud()
  void document.fonts.load('900 100px "Noto Sans KR"', text).then(paintCloud, paintCloud)
  return () => { disposed = true; events.abort(); fireworks.destroy() }
}
