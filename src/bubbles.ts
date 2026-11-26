export type Point = { x: number; y: number }
export type BubbleState = { poppedAt: number | null; delay: number; duration: number }
type Bubble = BubbleState & { element: HTMLButtonElement; row: number; col: number }

export function inflationAt(bubble: BubbleState, now: number): number {
  if (bubble.poppedAt === null) return 1
  const progress = Math.max(0, Math.min(1, (now - bubble.poppedAt - bubble.delay) / bubble.duration))
  return progress * progress * (3 - 2 * progress)
}

/** Exact segment/circle intersection keeps fast diagonal swipes from skipping bubbles. */
export function segmentTouchesCircle(start: Point, end: Point, center: Point, radius: number): boolean {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((center.x - start.x) * dx + (center.y - start.y) * dy) / lengthSquared))
  return Math.hypot(start.x + t * dx - center.x, start.y + t * dy - center.y) <= radius
}

export class BubbleField {
  private readonly container: HTMLElement
  private readonly onPop: () => void
  private readonly controller = new AbortController()
  private bubbles: Bubble[] = []
  private recovering = new Set<Bubble>()
  private pointers = new Map<number, Point>()
  private columns = 0
  private rows = 0
  private cellWidth = 0
  private cellHeight = 0
  private origin: Point = { x: 0, y: 0 }
  private frame = 0
  private resizeFrame = 0
  private focused = 0

  constructor(container: HTMLElement, onPop: () => void) {
    this.container = container
    this.onPop = onPop
    const options = { signal: this.controller.signal }
    container.addEventListener('pointerdown', this.pointerDown, options)
    container.addEventListener('pointermove', this.pointerMove, options)
    container.addEventListener('pointerup', this.pointerUp, options)
    container.addEventListener('pointercancel', this.pointerCancel, options)
    container.addEventListener('lostpointercapture', this.pointerCancel, options)
    container.addEventListener('keydown', this.keyDown, options)
    container.addEventListener('click', this.accessibleClick, options)
    container.addEventListener('contextmenu', event => event.preventDefault(), options)
    window.addEventListener('blur', this.cancelPointers, options)
    window.addEventListener('resize', this.resize, options)
    document.addEventListener('visibilitychange', this.visibilityChange, options)
    this.layout()
  }

  private resize = () => {
    cancelAnimationFrame(this.resizeFrame)
    this.resizeFrame = requestAnimationFrame(() => this.layout())
  }

  private layout() {
    this.cancelPointers()
    const bounds = this.container.getBoundingClientRect()
    this.origin = { x: bounds.left, y: bounds.top }
    const targetSize = Math.max(bounds.width < 600 ? 74 : 94, Math.sqrt(bounds.width * bounds.height / 650))
    const columns = Math.max(1, Math.ceil(bounds.width / targetSize))
    const rows = Math.max(1, Math.ceil(bounds.height / targetSize))
    this.cellWidth = bounds.width / columns
    this.cellHeight = bounds.height / rows
    this.container.style.setProperty('--columns', String(columns))
    this.container.style.setProperty('--rows', String(rows))
    this.container.style.setProperty('--bubble-size', `${Math.min(this.cellWidth, this.cellHeight) * 0.78}px`)
    if (columns === this.columns && rows === this.rows) return
    const previous = new Map(this.bubbles.map(bubble => [`${bubble.row}:${bubble.col}`, bubble]))
    const active = document.activeElement
    const fragment = document.createDocumentFragment()
    const bubbles: Bubble[] = []
    this.recovering.clear()
    this.columns = columns
    this.rows = rows
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        let bubble = previous.get(`${row}:${col}`)
        if (!bubble) {
          const element = document.createElement('button')
          element.type = 'button'
          element.className = 'bubble-cell'
          element.innerHTML = '<span class="bubble" aria-hidden="true"><span class="bubble-shine"></span><span class="bubble-creases"></span></span><span class="pop-ring" aria-hidden="true"></span>'
          element.style.setProperty('--tint', String(Math.round(Math.random() * 8 - 4)))
          bubble = { element, row, col, poppedAt: null, delay: 0, duration: 0 }
        }
        const index = bubbles.length
        bubble.element.dataset.index = String(index)
        bubble.element.tabIndex = index === 0 ? 0 : -1
        bubble.element.setAttribute('aria-label', `${index + 1}번 뽁뽁이${bubble.poppedAt === null ? ' 터뜨리기' : ', 다시 부푸는 중'}`)
        if (bubble.poppedAt !== null) this.recovering.add(bubble)
        bubbles.push(bubble)
        fragment.appendChild(bubble.element)
      }
    }
    this.bubbles = bubbles
    this.container.replaceChildren(fragment)
    this.focused = 0
    const activeIndex = bubbles.findIndex(bubble => bubble.element === active)
    if (activeIndex >= 0) this.focusBubble(activeIndex)
    this.scheduleRecovery()
  }

  private point(event: PointerEvent): Point {
    return { x: event.clientX - this.origin.x, y: event.clientY - this.origin.y }
  }

  private pointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    this.container.setPointerCapture(event.pointerId)
    const point = this.point(event)
    this.pointers.set(event.pointerId, point)
    this.popSegment(point, point)
  }

  private pointerMove = (event: PointerEvent) => {
    if (!this.pointers.has(event.pointerId)) return
    if (event.pointerType === 'mouse' && event.buttons === 0) {
      this.pointerCancel(event)
      return
    }
    const coalesced = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : []
    for (const sample of coalesced.length ? coalesced : [event]) {
      const point = this.point(sample)
      this.popSegment(this.pointers.get(event.pointerId)!, point)
      this.pointers.set(event.pointerId, point)
    }
  }

  private pointerUp = (event: PointerEvent) => {
    const previous = this.pointers.get(event.pointerId)
    if (previous) this.popSegment(previous, this.point(event))
    this.pointers.delete(event.pointerId)
    if (this.container.hasPointerCapture(event.pointerId)) this.container.releasePointerCapture(event.pointerId)
  }

  private pointerCancel = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId)
    if (this.container.hasPointerCapture(event.pointerId)) this.container.releasePointerCapture(event.pointerId)
  }

  private popSegment(start: Point, end: Point) {
    const minCol = Math.max(0, Math.floor(Math.min(start.x, end.x) / this.cellWidth))
    const maxCol = Math.min(this.columns - 1, Math.floor(Math.max(start.x, end.x) / this.cellWidth))
    const minRow = Math.max(0, Math.floor(Math.min(start.y, end.y) / this.cellHeight))
    const maxRow = Math.min(this.rows - 1, Math.floor(Math.max(start.y, end.y) / this.cellHeight))
    const radius = Math.min(this.cellWidth, this.cellHeight) * 0.39
    const now = performance.now()
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const center = { x: (col + 0.5) * this.cellWidth, y: (row + 0.5) * this.cellHeight }
        if (segmentTouchesCircle(start, end, center, radius)) this.pop(this.bubbles[row * this.columns + col]!, now)
      }
    }
  }

  private pop(bubble: Bubble, now: number) {
    if (bubble.poppedAt !== null) {
      if (inflationAt(bubble, now) < 1) return
      this.restore(bubble)
    }
    bubble.poppedAt = now
    bubble.delay = 900 + Math.random() * 700
    bubble.duration = 3800 + Math.random() * 1400
    bubble.element.style.setProperty('--air', '0')
    bubble.element.classList.add('is-popped')
    bubble.element.setAttribute('aria-disabled', 'true')
    bubble.element.setAttribute('aria-label', `${Number(bubble.element.dataset.index) + 1}번 뽁뽁이, 다시 부푸는 중`)
    this.recovering.add(bubble)
    this.onPop()
    this.scheduleRecovery()
  }

  private scheduleRecovery() {
    if (!this.frame && this.recovering.size && !document.hidden) this.frame = requestAnimationFrame(this.recover)
  }

  private recover = (now: number) => {
    this.frame = 0
    for (const bubble of this.recovering) {
      const inflation = inflationAt(bubble, now)
      if (inflation >= 1) this.restore(bubble)
      else bubble.element.style.setProperty('--air', inflation.toFixed(4))
    }
    this.scheduleRecovery()
  }

  private restore(bubble: Bubble) {
    bubble.poppedAt = null
    bubble.element.style.setProperty('--air', '1')
    bubble.element.classList.remove('is-popped')
    bubble.element.removeAttribute('aria-disabled')
    bubble.element.setAttribute('aria-label', `${Number(bubble.element.dataset.index) + 1}번 뽁뽁이 터뜨리기`)
    this.recovering.delete(bubble)
  }

  private focusBubble(index: number) {
    this.bubbles[this.focused]!.element.tabIndex = -1
    this.focused = index
    this.bubbles[index]!.element.tabIndex = 0
    this.bubbles[index]!.element.focus({ preventScroll: true })
  }

  private keyDown = (event: KeyboardEvent) => {
    const element = (event.target as HTMLElement).closest<HTMLButtonElement>('.bubble-cell')
    if (!element) return
    const index = Number(element.dataset.index)
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -this.columns, ArrowDown: this.columns }
    const move = moves[event.code]
    if (move !== undefined) {
      event.preventDefault()
      this.focusBubble(Math.max(0, Math.min(this.bubbles.length - 1, index + move)))
    } else if (event.code === 'Home' || event.code === 'End') {
      event.preventDefault()
      this.focusBubble(event.code === 'Home' ? 0 : this.bubbles.length - 1)
    } else if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault()
      if (!event.repeat) this.pop(this.bubbles[index]!, performance.now())
    }
  }

  private accessibleClick = (event: MouseEvent) => {
    if (event.detail !== 0) return
    const element = (event.target as HTMLElement).closest<HTMLButtonElement>('.bubble-cell')
    if (element) this.pop(this.bubbles[Number(element.dataset.index)]!, performance.now())
  }

  private cancelPointers = () => {
    const ids = [...this.pointers.keys()]
    this.pointers.clear()
    for (const id of ids) if (this.container.hasPointerCapture(id)) this.container.releasePointerCapture(id)
  }

  private visibilityChange = () => {
    this.cancelPointers()
    if (document.hidden) {
      cancelAnimationFrame(this.frame)
      this.frame = 0
    } else this.scheduleRecovery()
  }

  reset() {
    this.cancelPointers()
    cancelAnimationFrame(this.frame)
    this.frame = 0
    for (const bubble of this.recovering) this.restore(bubble)
  }

  destroy() {
    this.reset()
    cancelAnimationFrame(this.resizeFrame)
    this.controller.abort()
  }
}
