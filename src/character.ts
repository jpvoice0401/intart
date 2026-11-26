export type Point = { x: number; y: number }
export type Gaze = { x: number; y: number }
export type Expression = 'curious' | 'surprised' | 'happy' | 'pout' | 'glare' | 'sleepy' | 'yawn'
type FacePose = {
  eyeOpen: number; eyeTilt: number; browY: number; browAngle: number; mouthW: number;
  mouthH: number; mouthCurve: number; mouthX: number; pupilScale: number; cheeks: number; sleep: number; tilt: number;
}

export function gazeAt(point: Point, center: Point, width: number, height: number): Gaze {
  const x = (point.x - center.x) / Math.max(width * 0.42, 1)
  const y = (point.y - center.y) / Math.max(height * 0.4, 1)
  const scale = 1 / Math.max(1, Math.hypot(x, y))
  return { x: x * scale, y: y * scale }
}

export function smoothGaze(current: Gaze, target: Gaze, seconds: number, speed = 11): Gaze {
  const weight = 1 - Math.exp(-Math.max(0, seconds) * speed)
  return { x: current.x + (target.x - current.x) * weight, y: current.y + (target.y - current.y) * weight }
}

const ease = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }

export function winkOpenness(milliseconds: number): number {
  if (milliseconds < 0 || milliseconds >= 580) return 1
  if (milliseconds < 130) return 1 - ease(milliseconds / 130) * 0.97
  if (milliseconds < 290) return 0.03
  return 0.03 + ease((milliseconds - 290) / 290) * 0.97
}

export function blinkOpenness(milliseconds: number): number {
  if (milliseconds < 0 || milliseconds > 180) return 1
  return Math.max(0.035, 1 - Math.sin(milliseconds / 180 * Math.PI))
}

const ACTIVE: Expression[] = ['curious', 'surprised', 'happy', 'pout', 'glare']
const IDLE: Expression[] = ['sleepy', 'sleepy', 'yawn', 'yawn', 'happy', 'pout', 'glare']
const LABELS: Record<Expression, string> = {
  curious: '어디로 가? 나도 볼래!', surprised: '오! 방금 뭐였어?', happy: '너랑 노는 게 제일 좋아!',
  pout: '흥… 나도 좀 봐줘.', glare: '어디 가는지 다 보고 있어.', sleepy: '꾸벅… 움직이면 깨워줘.', yawn: '하아암… 잠깐만 쉬자.',
}

/** Expression timing is separate from clicks: this director can never create a wink. */
export class ExpressionDirector {
  expression: Expression = 'curious'
  private lastMovement: number
  private nextChange: number
  private idle = false
  private readonly random: () => number

  constructor(now: number, random: () => number = Math.random) {
    this.lastMovement = now
    this.nextChange = now + 1800
    this.random = random
  }

  move(now: number) {
    const waking = this.idle || now - this.lastMovement >= 3000
    this.lastMovement = now
    if (waking) {
      this.idle = false
      this.choose(ACTIVE, now)
    }
  }

  update(now: number): Expression {
    if (now - this.lastMovement >= 3000) {
      if (!this.idle) {
        this.idle = true
        this.expression = 'sleepy'
        this.nextChange = now + 2500
      } else if (now >= this.nextChange) this.choose(IDLE, now)
    } else if (now >= this.nextChange) this.choose(ACTIVE, now)
    return this.expression
  }

  private choose(pool: Expression[], now: number) {
    const choices = pool.filter(expression => expression !== this.expression)
    this.expression = choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))]!
    this.nextChange = now + (this.idle ? 2300 : 1500) + this.random() * 1800
  }
}

const POSES: Record<Expression, FacePose> = {
  curious: { eyeOpen: 1, eyeTilt: 0, browY: -2, browAngle: -2, mouthW: 10, mouthH: 10, mouthCurve: 2, mouthX: 0, pupilScale: 1, cheeks: 0, sleep: 0, tilt: 0 },
  surprised: { eyeOpen: 1.1, eyeTilt: 0, browY: -15, browAngle: -3, mouthW: 17, mouthH: 26, mouthCurve: 0, mouthX: 0, pupilScale: .88, cheeks: 0, sleep: 0, tilt: -2 },
  happy: { eyeOpen: .3, eyeTilt: -3, browY: -8, browAngle: -4, mouthW: 29, mouthH: 18, mouthCurve: 27, mouthX: 0, pupilScale: 1, cheeks: .7, sleep: 0, tilt: 2 },
  pout: { eyeOpen: .7, eyeTilt: -3, browY: 4, browAngle: -11, mouthW: 16, mouthH: 1, mouthCurve: -12, mouthX: 7, pupilScale: 1, cheeks: .55, sleep: 0, tilt: -4 },
  glare: { eyeOpen: .48, eyeTilt: 13, browY: 11, browAngle: 19, mouthW: 21, mouthH: 1, mouthCurve: -6, mouthX: 0, pupilScale: .94, cheeks: .15, sleep: 0, tilt: 2 },
  sleepy: { eyeOpen: .16, eyeTilt: -3, browY: 8, browAngle: -7, mouthW: 9, mouthH: 5, mouthCurve: 0, mouthX: 0, pupilScale: 1, cheeks: .1, sleep: 1, tilt: 5 },
  yawn: { eyeOpen: .035, eyeTilt: -2, browY: -2, browAngle: -9, mouthW: 24, mouthH: 38, mouthCurve: 0, mouthX: 0, pupilScale: .85, cheeks: .25, sleep: .5, tilt: -3 },
}

function blendPose(from: FacePose, to: FacePose, weight: number): FacePose {
  const pose = { ...from }
  for (const key of Object.keys(pose) as (keyof FacePose)[]) pose[key] += (to[key] - from[key]) * weight
  return pose
}

export class CharacterController {
  private readonly root: HTMLElement
  private readonly controller = new AbortController()
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  private readonly elements: Record<string, Element>
  private readonly director = new ExpressionDirector(performance.now())
  private pose: FacePose = { ...POSES.curious }
  private center: Point = { x: 0, y: 0 }
  private viewport = { width: 1, height: 1 }
  private pointer: Point | null = null
  private activityPoint: Point | null = null
  private lastPointerTime = 0
  private lastMotion = -Infinity
  private motionSpeed = 0
  private motion = 0
  private current: Gaze = { x: 0, y: 0 }
  private clicked: Gaze = { x: 0, y: 0 }
  private winkStart = -Infinity
  private lockUntil = 0
  private nextBlink = performance.now() + 3500
  private blinkStart = -Infinity
  private winking = false
  private frame = 0
  private previous = 0
  private caption = ''

  constructor(root: HTMLElement) {
    this.root = root
    const ids = ['face-rig', 'left-brow', 'right-brow', 'left-eye-rig', 'right-eye-rig', 'left-eye-open', 'right-eye-open', 'left-eye-closed', 'right-eye-closed', 'right-eye-wink', 'left-pupil', 'right-pupil', 'mouth-rig', 'mouth-open', 'mouth-mask', 'mouth-cavity', 'mouth-tongue', 'mouth-line', 'blush', 'sleep-marks', 'anger-mark', 'wink-sparkle', 'character-status']
    this.elements = Object.fromEntries(ids.map(id => [id, root.querySelector(`#${id}`)!]))
    const options = { signal: this.controller.signal }
    window.addEventListener('pointermove', this.pointerMove, options)
    window.addEventListener('click', this.click, options)
    window.addEventListener('pointerout', this.pointerOut, options)
    window.addEventListener('blur', this.resetPointer, options)
    window.addEventListener('resize', this.resize, options)
    document.addEventListener('visibilitychange', this.visibilityChange, options)
    this.resize()
    this.frame = requestAnimationFrame(this.animate)
  }

  private resize = () => {
    const bounds = this.root.querySelector<HTMLElement>('#character')!.getBoundingClientRect()
    this.center = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
    this.viewport = { width: window.innerWidth, height: window.innerHeight }
  }

  private pointerMove = (event: PointerEvent) => {
    if (!event.isPrimary) return
    const point = { x: event.clientX, y: event.clientY }
    const previous = this.activityPoint ?? this.center
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y)
    this.pointer = point
    if (distance >= 2) {
      const now = performance.now()
      this.motionSpeed = Math.min(1, distance / Math.max(16, now - this.lastPointerTime) * .8)
      this.lastPointerTime = now
      this.lastMotion = now
      this.activityPoint = point
      this.director.move(now)
    }
  }

  private click = (event: MouseEvent) => {
    if (event.button !== 0) return
    const point = event.detail === 0 ? this.pointer ?? this.center : { x: event.clientX, y: event.clientY }
    this.pointer = point
    this.clicked = gazeAt(point, this.center, this.viewport.width, this.viewport.height)
    const now = performance.now()
    this.director.move(now)
    this.winkStart = now + 150
    this.lockUntil = this.winkStart + 650
    this.blinkStart = -Infinity
    this.nextBlink = this.lockUntil + 3500 + Math.random() * 2500
    this.winking = true
    this.root.classList.add('is-winking')
  }

  private pointerOut = (event: PointerEvent) => {
    if (event.relatedTarget === null) this.resetPointer()
  }

  private resetPointer = () => { this.pointer = null; this.activityPoint = null; this.motionSpeed = 0 }

  private animate = (now: number) => {
    const dt = this.previous ? Math.min((now - this.previous) / 1000, .06) : 1 / 60
    this.previous = now
    const locked = now < this.lockUntil
    const expression = this.director.update(now)
    this.pose = blendPose(this.pose, POSES[expression], 1 - Math.exp(-dt * 7))
    const moving = now - this.lastMotion < 100 ? this.motionSpeed : 0
    this.motion += (moving - this.motion) * (1 - Math.exp(-dt * 9))
    const target = locked ? this.clicked : this.pointer ? gazeAt(this.pointer, this.center, this.viewport.width, this.viewport.height) : { x: 0, y: 0 }
    this.current = smoothGaze(this.current, target, dt, this.reducedMotion.matches ? 24 : locked ? 17 : 10)
    if (this.winking && !locked) {
      this.winking = false
      this.root.classList.remove('is-winking')
    }
    if (!locked && now >= this.nextBlink) {
      this.blinkStart = now
      this.nextBlink = now + 3500 + Math.random() * 3500
    }
    const blink = blinkOpenness(now - this.blinkStart)
    const winkTime = locked ? now - this.winkStart : -1
    const leftOpen = locked ? 1 : this.pose.eyeOpen * blink
    const rightOpen = locked ? winkOpenness(winkTime) : this.pose.eyeOpen * blink
    this.render(now, this.current, leftOpen, rightOpen, winkTime, locked)
    this.root.classList[!locked && (expression === 'sleepy' || expression === 'yawn') ? 'add' : 'remove']('is-sleepy')
    this.root.setAttribute('data-expression', locked ? 'wink' : expression)
    const caption = locked ? '찡긋! 너에게 보내는 작은 인사.' : LABELS[expression]
    if (caption !== this.caption) {
      this.elements['character-status']!.textContent = caption
      this.caption = caption
    }
    this.frame = requestAnimationFrame(this.animate)
  }

  private render(now: number, gaze: Gaze, leftOpen: number, rightOpen: number, winkTime: number, locked: boolean) {
    const { x, y } = gaze
    const wink = locked ? 1 - winkOpenness(winkTime) : 0
    const pose = locked ? blendPose(this.pose, { ...POSES.happy, eyeOpen: 1, tilt: 0 }, .95) : this.pose
    const nod = !locked ? Math.sin(now * .0018) * pose.sleep * 3 : 0
    this.attr('face-rig', 'transform', `translate(${(x * 22).toFixed(3)} ${(y * 17 + nod).toFixed(3)}) rotate(${(x * 2.8 + pose.tilt).toFixed(3)} 250 250)`)
    const pupilTransform = `translate(${(x * 10).toFixed(3)} ${(y * 8).toFixed(3)}) scale(${pose.pupilScale.toFixed(4)})`
    this.attr('left-pupil', 'transform', pupilTransform)
    this.attr('right-pupil', 'transform', pupilTransform)
    this.attr('left-eye-rig', 'transform', `translate(189 223) rotate(${locked ? 0 : pose.eyeTilt})`)
    this.attr('right-eye-rig', 'transform', `translate(311 223) rotate(${locked ? 0 : -pose.eyeTilt})`)
    this.setEye('left', leftOpen, false, pose.sleep)
    this.setEye('right', rightOpen, locked, pose.sleep)
    // The wink is an independent < path, never a scaled-down white eye or a random expression.
    this.attr('right-eye-wink', 'opacity', locked ? 1 - ease(rightOpen / .6) : 0)
    this.attr('right-eye-wink', 'transform', `scale(${.9 + wink * .1})`)
    this.attr('left-brow', 'transform', `translate(189 ${167 + y * 3 + pose.browY - wink * 3}) rotate(${-x * 3 + pose.browAngle})`)
    this.attr('right-brow', 'transform', `translate(311 ${167 + y * 3 + pose.browY + wink * 8}) rotate(${-x * 3 - pose.browAngle + wink * 9})`)
    const breath = pose.sleep > .5 ? (Math.sin(now * .002) + 1) * 1.2 : 0
    const reactsToMotion = !locked && (this.director.expression === 'curious' || this.director.expression === 'surprised')
    const height = Math.max(.5, pose.mouthH + (reactsToMotion ? this.motion * 13 : 0) + breath)
    const width = pose.mouthW + (reactsToMotion ? this.motion * 3 : 0)
    const cavityOpacity = ease((height - 2) / 5)
    this.attr('mouth-rig', 'transform', `translate(${250 + pose.mouthX} ${299 + nod})`)
    for (const id of ['mouth-open', 'mouth-mask']) {
      this.attr(id, 'rx', width)
      this.attr(id, 'ry', height)
    }
    this.attr('mouth-cavity', 'opacity', cavityOpacity)
    this.attr('mouth-tongue', 'cy', height * .72)
    this.attr('mouth-tongue', 'rx', width * .65)
    this.attr('mouth-tongue', 'ry', height * .33)
    this.attr('mouth-tongue', 'opacity', pose.mouthCurve > 10 ? .9 : .4)
    this.attr('mouth-line', 'd', `M${-width} 0Q0 ${pose.mouthCurve} ${width} 0`)
    this.attr('mouth-line', 'opacity', 1 - cavityOpacity)
    this.attr('blush', 'opacity', pose.cheeks)
    this.attr('sleep-marks', 'opacity', locked ? 0 : pose.sleep * (.7 + Math.sin(now * .002) * .2))
    this.attr('sleep-marks', 'transform', `translate(0 ${Math.sin(now * .0015) * 5})`)
    this.attr('anger-mark', 'opacity', locked ? 0 : Math.max(0, pose.browAngle / 19) * .7)
    const sparkle = winkTime > 100 && winkTime < 600 ? Math.sin((winkTime - 100) / 500 * Math.PI) : 0
    this.attr('wink-sparkle', 'opacity', Math.max(0, sparkle))
    this.root.style.setProperty('--look-x', x.toFixed(4))
    this.root.style.setProperty('--look-y', y.toFixed(4))
  }

  private attr(id: string, name: string, value: number | string) {
    this.elements[id]!.setAttribute(name, String(value))
  }

  private setEye(side: 'left' | 'right', openness: number, wink: boolean, sleep: number) {
    const eyeVisibility = wink ? ease(openness / .6) : openness < .12 ? 0 : 1
    this.attr(`${side}-eye-open`, 'transform', `scale(1 ${openness.toFixed(4)})`)
    this.attr(`${side}-eye-open`, 'opacity', eyeVisibility)
    this.attr(`${side}-eye-closed`, 'opacity', wink ? 0 : 1 - ease(openness / .3))
    this.attr(`${side}-eye-closed`, 'd', sleep > .3 ? 'M-34 0Q0 10 34 0' : 'M-36 3Q0-22 36 3')
  }

  private visibilityChange = () => {
    cancelAnimationFrame(this.frame)
    this.previous = 0
    this.resetPointer()
    if (!document.hidden) {
      this.nextBlink = performance.now() + 3500
      this.frame = requestAnimationFrame(this.animate)
    }
  }

  destroy() {
    this.controller.abort()
    cancelAnimationFrame(this.frame)
  }
}
