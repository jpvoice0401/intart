import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TypingRain, touchesLetter } from '../src/typing-rain.ts'
import { SnowWordChallenge, wordUnits } from '../src/snow-words.ts'
import { mountTypingRain } from '../src/scenes/typing-scene.ts'

test('Korean progress includes consonants, vowels, final consonants and compound jamo', () => {
  assert.deepEqual(wordUnits('눈사람'), [...'ㄴㅜㄴㅅㅏㄹㅏㅁ'])
  assert.deepEqual(wordUnits('과'), [...'ㄱㅗㅏ'])
  assert.deepEqual(wordUnits('읽'), [...'ㅇㅣㄹㄱ'])
  assert.deepEqual(wordUnits('겨울'.normalize('NFD')), wordUnits('겨울'))
  const challenge = new SnowWordChallenge(() => 0)
  assert.equal(challenge.word, '눈사람')
  for (const [i, input] of ['ㄴ', '누', '눈', '눈ㅅ', '눈사', '눈사ㄹ', '눈사라'].entries()) {
    assert.equal(challenge.accept(input), null)
    assert.equal(challenge.matched, i + 1)
    assert.equal(challenge.invalid, false)
  }
  assert.equal(challenge.accept('눈사람'), '눈사람')
  assert.equal(challenge.completed, 1)
  assert.notEqual(challenge.word, '눈사람')
  assert.equal(challenge.input, '')
})

test('wrong keys cannot advance progress; backspace and mixed case work without Enter', () => {
  const challenge = new SnowWordChallenge(() => .51)
  challenge.word = 'snow'
  challenge.accept('S')
  assert.equal(challenge.matched, 1)
  assert.equal(challenge.accept('sx'), null)
  assert.equal(challenge.invalid, true)
  assert.equal(challenge.input, 's')
  challenge.accept('')
  assert.equal(challenge.matched, 0)
  challenge.accept('sno')
  assert.equal(challenge.completed, 0)
  assert.equal(challenge.accept('SNOW'), 'snow')
  assert.equal(challenge.completed, 1)
  assert.equal(challenge.accept(''), null)
  assert.equal(challenge.completed, 1)
})

test('random words include both languages and never immediately repeat', () => {
  let seed = 1234
  const challenge = new SnowWordChallenge(() => (seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296)
  const languages = new Set()
  for (let i = 0; i < 150; i++) {
    const previous = challenge.word
    languages.add(challenge.korean)
    assert.equal(challenge.accept(previous), previous)
    assert.notEqual(challenge.word, previous)
  }
  assert.equal(languages.size, 2)
})

function settledGame() {
  const game = new TypingRain(1000, 800, () => .8)
  game.x = game.target = 50
  return game
}
function landAt(game, word, x, props = {}) {
  game.dropWord(word)
  const body = game.letters.at(-1)
  Object.assign(body, { x, y: -80, angle: 0, spin: 0, vx: 0, ...props })
  for (let i = 0; i < 500 && !body.landed && game.state !== 'over'; i++) game.update(1 / 120)
  assert.equal(body.landed, true)
  return body
}

test('snow words fall as single bodies and remain in a growing pile permanently', () => {
  const game = settledGame()
  const first = landAt(game, 'snow', 650), firstY = first.y, firstSurface = game.groundAt(650)
  const second = landAt(game, '겨울', 650)
  assert.ok(second.y < firstY - 25)
  assert.ok(game.groundAt(650) < firstSurface)
  assert.equal(game.dodged, 2)
  for (let i = 0; i < 1200; i++) game.update(1 / 120)
  assert.equal(game.letters.length, 2, 'settled snow must never fade or be pruned')
  assert.equal(first.y, firstY)
  assert.ok(game.letters.every(body => body.vy === 0 && body.vx === 0))
})

test('spaces between snow glyphs stay open instead of supporting an invisible white block', () => {
  const game = settledGame()
  const first = landAt(game, 'snow', 650, { shape: [
    { x: -45, y: -12, radius: 4 }, { x: -45, y: 12, radius: 4 },
    { x: 45, y: -12, radius: 4 }, { x: 45, y: 12, radius: 4 },
  ] })
  assert.ok(game.groundAt(605) < game.floor)
  assert.equal(game.groundAt(650), game.floor, 'transparent gap is still ground level')
  const second = landAt(game, '눈', 650, { width: 20, shape: [
    { x: 0, y: -12, radius: 3 }, { x: 0, y: 12, radius: 3 },
  ] })
  assert.ok(Math.abs(second.y - first.y) < 4, 'a small glyph can settle into the gap')
})

test('rotated snow rests on its actual lettering rather than the corners of a bounding rectangle', () => {
  const game = settledGame()
  const body = landAt(game, 'moon', 650, { width: 200, angle: Math.PI / 4, shape: [
    { x: -30, y: 0, radius: 3 }, { x: 30, y: 0, radius: 3 },
  ] })
  const lowestInk = body.y + 30 * Math.sin(body.angle) + 3
  assert.ok(Math.abs(lowestInk - game.floor) < .001)
  assert.ok(game.groundAt(650) > game.floor - 1, 'empty corners do not become a tall support')
})

test('resizing preserves accumulated snow and restart clears words, snow and counters', () => {
  const game = settledGame()
  landAt(game, 'snow', 650)
  const depth = game.floor - game.groundAt(650)
  game.resize(500, 700)
  assert.ok(Math.abs((game.floor - game.groundAt(325)) - depth / 2) < .01)
  assert.equal(game.letters.length, 1)
  game.restart()
  assert.equal(game.letters.length, 0)
  assert.ok(game.snow.every(height => height === 0))
  assert.equal(game.state, 'ready')
  assert.equal(game.typed, 0)
  assert.equal(game.dodged, 0)
  assert.equal(game.elapsed, 0)
})

test('a snow word hitting the child ends play and prevents further drops', () => {
  const game = settledGame()
  game.dropWord('snow')
  const body = game.letters[0]
  Object.assign(body, { x: game.x, y: game.floor - 69, vx: 0, angle: 0, spin: 0 })
  assert.equal(touchesLetter(body, game.x, game.floor - 69, 20), true)
  game.update(1 / 120)
  assert.equal(game.state, 'over')
  assert.equal(game.impact, body)
  assert.equal(game.dropWord('겨울'), false)
})

class Element extends EventTarget {
  children = []
  attributes = new Map()
  styles = new Map()
  classes = new Set()
  dataset = {}
  style = { setProperty: (key, value) => this.styles.set(key, value) }
  classList = { toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name) }
  value = ''
  textContent = ''
  disabled = false
  hidden = true
  setAttribute(key, value) { this.attributes.set(key, value) }
  replaceChildren(...children) { this.children = children }
  closest() { return null }
  focus() {}
  blur() { this.dispatchEvent(new Event('compositionend')) }
}

function sceneSetup() {
  const elements = new Map(), frames = new Map()
  let frameId = 0, disconnected = false
  const gradient = { addColorStop() {} }
  const context = new Proxy({}, { get: (_, key) => key === 'createLinearGradient' ? () => gradient : key === 'measureText' ? () => ({ width: 100 }) : () => {} })
  const root = new Element()
  Object.assign(root, { clientWidth: 1000, clientHeight: 800, querySelector: selector => {
    if (!elements.has(selector)) elements.set(selector, new Element())
    return elements.get(selector)
  } })
  const canvas = new Element(); canvas.getContext = () => context; elements.set('canvas', canvas)
  const container = { innerHTML: '', querySelector: () => root }
  const document = new EventTarget(), window = new EventTarget()
  Object.assign(document, { hidden: false, hasFocus: () => true, fonts: { ready: Promise.resolve() }, createElement: tag => {
    const element = new Element(); if (tag === 'canvas') element.getContext = () => context; return element
  } })
  Object.assign(globalThis, { document, window, devicePixelRatio: 1,
    ResizeObserver: class { observe() {} disconnect() { disconnected = true } },
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId },
    cancelAnimationFrame: id => frames.delete(id),
  })
  const originalRandom = Math.random
  Math.random = () => 0
  const cleanup = mountTypingRain(container)
  Math.random = originalRandom
  return {
    root, frames, elements,
    get: id => elements.get(`#${id}`),
    type(value) { const input = this.get('rain-word-input'); input.value = value; input.dispatchEvent(new Event('input')) },
    emit(id, type) { this.get(id).dispatchEvent(new Event(type, { cancelable: true })) },
    tick(now) { const current = [...frames.values()]; frames.clear(); current.forEach(callback => callback(now)) },
    cleanup() { cleanup(); assert.equal(disconnected, true) },
  }
}

test('composing the final Korean syllable drops immediately and compositionend cannot duplicate it', () => {
  const app = sceneSetup()
  assert.equal(app.get('rain-target-word').attributes.get('aria-label'), '입력할 단어: 눈사람')
  assert.equal(app.get('rain-input-target').textContent, '눈사람')
  assert.equal(app.get('rain-word-input').placeholder, '눈사람')
  app.emit('rain-word-input', 'compositionstart')
  app.type('눈사라')
  assert.equal(app.get('rain-word-progress').textContent, '7 / 8')
  assert.equal(app.get('rain-jamo').children.filter(child => child.className === 'is-typed').length, 7)
  app.type('눈사람')
  assert.notEqual(app.get('rain-target-word').attributes.get('aria-label'), '입력할 단어: 눈사람')
  assert.equal(app.get('rain-target-word').attributes.get('aria-label'), `입력할 단어: ${app.get('rain-input-target').textContent}`)
  assert.equal(app.get('rain-word-input').value, '')
  app.emit('rain-word-input', 'compositionend')
  app.emit('rain-word-input', 'input')
  app.tick(100)
  assert.equal(app.get('rain-typed').textContent, '001')
  app.cleanup()
  assert.equal(app.frames.size, 0)
})

test('invalid input restores accepted progress; restarting clears composition and snow stats', () => {
  const app = sceneSetup()
  app.type('누')
  app.type('누x')
  assert.equal(app.get('rain-word-input').value, '누')
  assert.equal(app.get('rain-word-progress').textContent, '2 / 8')
  app.type('눈사람')
  app.tick(100)
  assert.equal(app.get('rain-typed').textContent, '001')
  app.emit('rain-reset', 'click')
  app.tick(120)
  assert.equal(app.get('rain-typed').textContent, '000')
  assert.equal(app.get('rain-word-input').value, '')
  assert.equal(app.root.dataset.rainState, 'ready')
  const word = app.get('rain-target-word').attributes.get('aria-label')
  app.cleanup()
  app.type('snow')
  assert.equal(app.get('rain-target-word').attributes.get('aria-label'), word)
})
