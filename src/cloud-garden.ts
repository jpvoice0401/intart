type Point = { x: number; y: number }
type Cloud = { element: HTMLButtonElement; x: number; y: number; width: number; speed: number; phase: number; poppedAt: number | null }
const ease = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }

export function cloudReaction(elapsed: number): number {
  if (elapsed < 0 || elapsed >= 1200) return 0
  if (elapsed < 80) return ease(elapsed / 80)
  if (elapsed < 650) return 1
  return 1 - ease((elapsed - 650) / 550)
}

export function cloudPhase(poppedAt: number | null, now: number): 'floating' | 'burst' | 'waiting' | 'respawn' {
  if (poppedAt === null) return 'floating'
  if (now - poppedAt < 450) return 'burst'
  return now - poppedAt < 4200 ? 'waiting' : 'respawn'
}

export class CloudGarden {
  private readonly root: HTMLElement
  private readonly layer: HTMLElement
  private readonly onPop: (count: number) => void
  private readonly controller = new AbortController()
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  private readonly parts: Record<string, Element>
  private clouds: Cloud[] = []
  private width = 1
  private height = 1
  private frame = 0
  private previous = 0
  private lastPop = -Infinity
  private anger = 0
  private count = 0
  private gaze: Point = { x: 0, y: 0 }
  private nextBlink = performance.now() + 3200
  private blinkStart = -Infinity
  private wasUpset = false

  constructor(root: HTMLElement, onPop: (count: number) => void) {
    this.root = root
    this.layer = root.querySelector<HTMLElement>('#floating-clouds')!
    this.onPop = onPop
    const ids = ['pink-face', 'pink-left-eye', 'pink-right-eye', 'pink-angry-brows', 'pink-calm-mouth', 'pink-shout-mouth', 'pink-cheeks', 'pink-anger-mark', 'pink-body-rig', 'cloud-status']
    this.parts = Object.fromEntries(ids.map(id => [id, root.querySelector(`#${id}`)!]))
    const options = { signal: this.controller.signal }
    this.layer.addEventListener('click', this.click, options)
    window.addEventListener('resize', this.resize, options)
    document.addEventListener('visibilitychange', this.visibilityChange, options)
    this.resize()
    this.frame = requestAnimationFrame(this.animate)
  }

  private resize = () => {
    this.width = window.innerWidth
    this.height = window.innerHeight
    if (this.clouds.length) {
      for (const cloud of this.clouds) {
        cloud.x = Math.min(this.width - cloud.width * .4, Math.max(-cloud.width * .4, cloud.x))
        cloud.y = this.cloudY(this.clouds.indexOf(cloud))
      }
      return
    }
    const count = this.width < 600 ? 9 : 13
    for (let i = 0; i < count; i++) {
      const element = document.createElement('button')
      element.type = 'button'
      element.className = 'floating-cloud'
      element.dataset.cloud = String(i)
      element.setAttribute('aria-label', `${i + 1}번 구름 터뜨리기`)
      const particles = Array.from({ length: 7 }, (_, index) => {
        const angle = index / 7 * Math.PI * 2
        return `<span class="cloud-fragment" style="--dx:${(Math.cos(angle) * 75).toFixed(1)}px;--dy:${(Math.sin(angle) * 55).toFixed(1)}px"></span>`
      }).join('')
      element.innerHTML = `<span class="floating-cloud-shape" aria-hidden="true"><i></i><i></i><i></i><span></span></span><span class="cloud-fragments" aria-hidden="true">${particles}</span><span class="cloud-burst-ring" aria-hidden="true"></span>`
      const width = (this.width < 600 ? 96 : 135) + Math.random() * (this.width < 600 ? 40 : 65)
      element.style.width = `${width}px`
      element.style.height = `${width * .59}px`
      const side = i % 2 === 0 ? .04 + Math.random() * .23 : .68 + Math.random() * .22
      const cloud: Cloud = { element, x: this.width * side - width * .3, y: this.cloudY(i), width, speed: (6 + Math.random() * 12) * (i % 2 === 0 ? 1 : -1), phase: Math.random() * Math.PI * 2, poppedAt: null }
      this.clouds.push(cloud)
      this.layer.appendChild(element)
      this.positionCloud(cloud, performance.now())
    }
  }

  private cloudY(index: number): number {
    return this.height * (.19 + (index % 5) * .142) + Math.random() * 18
  }

  private click = (event: MouseEvent) => {
    const element = (event.target as HTMLElement).closest<HTMLButtonElement>('.floating-cloud')
    if (!element) return
    const cloud = this.clouds[Number(element.dataset.cloud)]
    if (!cloud || cloud.poppedAt !== null) return
    const now = performance.now()
    cloud.poppedAt = now
    cloud.element.disabled = true
    cloud.element.classList.add('is-burst')
    this.lastPop = now
    this.gaze = { x: Math.max(-1, Math.min(1, (cloud.x + cloud.width / 2 - this.width / 2) / (this.width * .4))), y: Math.max(-1, Math.min(1, (cloud.y - this.height * .51) / (this.height * .4))) }
    this.root.classList.add('is-upset')
    this.wasUpset = true
    this.parts['cloud-status']!.textContent = 'NO! 내 구름을 터뜨리지 마!'
    this.onPop(++this.count)
  }

  private positionCloud(cloud: Cloud, now: number) {
    const sway = this.reducedMotion.matches ? 0 : Math.sin(now * .0007 + cloud.phase) * 10
    cloud.element.style.transform = `translate3d(${cloud.x.toFixed(2)}px, ${(cloud.y + sway).toFixed(2)}px, 0)`
  }

  private animate = (now: number) => {
    const dt = this.previous ? Math.min((now - this.previous) / 1000, .05) : 1 / 60
    this.previous = now
    for (const cloud of this.clouds) {
      const phase = cloudPhase(cloud.poppedAt, now)
      if (phase === 'respawn') {
        cloud.poppedAt = null
        cloud.element.disabled = false
        cloud.element.classList.remove('is-burst')
        cloud.x = this.reducedMotion.matches ? this.width * (cloud.speed > 0 ? .12 : .73) - cloud.width * .3 : cloud.speed > 0 ? -cloud.width * .6 : this.width - cloud.width * .4
        cloud.y = this.cloudY(this.clouds.indexOf(cloud))
      } else if (phase !== 'floating') continue
      if (!this.reducedMotion.matches) cloud.x += cloud.speed * dt
      if (cloud.x > this.width + cloud.width) cloud.x = -cloud.width
      if (cloud.x < -cloud.width * 1.2) cloud.x = this.width
      this.positionCloud(cloud, now)
    }
    const elapsed = now - this.lastPop
    const target = cloudReaction(elapsed)
    this.anger += (target - this.anger) * (1 - Math.exp(-dt * 22))
    if (this.wasUpset && elapsed >= 1300) {
      this.wasUpset = false
      this.root.classList.remove('is-upset')
      this.parts['cloud-status']!.textContent = '휴… 이제 좀 조용해졌네.'
    }
    if (this.anger < .1 && now >= this.nextBlink) {
      this.blinkStart = now
      this.nextBlink = now + 3500 + Math.random() * 3000
    }
    const blinkTime = now - this.blinkStart
    const blink = blinkTime >= 0 && blinkTime < 170 && this.anger < .1 ? 1 - Math.sin(blinkTime / 170 * Math.PI) * .96 : 1
    this.render(now, blink)
    this.frame = requestAnimationFrame(this.animate)
  }

  private render(now: number, blink: number) {
    const anger = this.anger
    const shake = this.reducedMotion.matches ? 0 : Math.sin(now * .075) * anger * 4
    this.parts['pink-body-rig']!.setAttribute('transform', `translate(${shake} 0) rotate(${shake * .65} 250 260)`)
    this.parts['pink-face']!.setAttribute('transform', `translate(${this.gaze.x * anger * 9} ${this.gaze.y * anger * 6})`)
    this.parts['pink-left-eye']!.setAttribute('transform', `translate(187 221) rotate(${anger * 15}) scale(1 ${(1 - anger * .56) * blink})`)
    this.parts['pink-right-eye']!.setAttribute('transform', `translate(313 221) rotate(${-anger * 15}) scale(1 ${(1 - anger * .56) * blink})`)
    this.parts['pink-angry-brows']!.setAttribute('opacity', String(anger))
    this.parts['pink-calm-mouth']!.setAttribute('opacity', String(1 - ease(anger * 1.8)))
    this.parts['pink-shout-mouth']!.setAttribute('opacity', String(ease(anger * 1.8)))
    this.parts['pink-shout-mouth']!.setAttribute('transform', `translate(250 289) scale(${.75 + anger * .25} ${.5 + anger * .5})`)
    this.parts['pink-cheeks']!.setAttribute('opacity', String(.5 + anger * .4))
    this.parts['pink-anger-mark']!.setAttribute('opacity', String(anger))
  }

  private visibilityChange = () => {
    cancelAnimationFrame(this.frame)
    this.previous = 0
    if (!document.hidden) this.frame = requestAnimationFrame(this.animate)
  }

  destroy() {
    cancelAnimationFrame(this.frame)
    this.controller.abort()
  }
}
