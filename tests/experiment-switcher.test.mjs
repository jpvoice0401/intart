import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ExperimentSwitcher } from '../src/experiment-switcher.ts'

function setup() {
  const active = new Set()
  const log = []
  const container = { replaceChildren() { log.push('clear') } }
  const mounts = Object.fromEntries(['character', 'bubbles', 'fireworks', 'clouds', 'golf'].map(id => [id, received => {
    assert.equal(received, container)
    assert.equal(active.size, 0, 'previous scene must be disposed before another starts')
    active.add(id)
    log.push(`mount:${id}`)
    return () => { active.delete(id); log.push(`dispose:${id}`) }
  }]))
  return { switcher: new ExperimentSwitcher(container, mounts), active, log }
}

test('switching experiments disposes the previous one before clearing its DOM', () => {
  const app = setup()
  app.switcher.show('character')
  app.switcher.show('bubbles')
  app.switcher.show('fireworks')
  app.switcher.show('clouds')
  app.switcher.show('golf')
  assert.deepEqual(app.log, ['clear', 'mount:character', 'dispose:character', 'clear', 'mount:bubbles', 'dispose:bubbles', 'clear', 'mount:fireworks', 'dispose:fireworks', 'clear', 'mount:clouds', 'dispose:clouds', 'clear', 'mount:golf'])
  assert.deepEqual([...app.active], ['golf'])
  app.switcher.destroy()
})

test('clicking the current tab keeps its progress without duplicate animation or audio', () => {
  const app = setup()
  assert.equal(app.switcher.show('bubbles'), true)
  assert.equal(app.switcher.show('bubbles'), false)
  assert.deepEqual(app.log, ['clear', 'mount:bubbles'])
  app.switcher.destroy()
})

test('rapid repeated switching leaves exactly one running experiment', () => {
  const app = setup()
  for (let i = 0; i < 100; i++) {
    for (const id of ['character', 'fireworks', 'bubbles', 'clouds', 'golf']) {
      app.switcher.show(id)
      assert.deepEqual([...app.active], [id])
    }
  }
  app.switcher.destroy()
  assert.equal(app.active.size, 0)
  assert.equal(app.log.filter(item => item.startsWith('mount:')).length, app.log.filter(item => item.startsWith('dispose:')).length)
})

test('teardown is safe to repeat and a disposed experiment can be mounted again', () => {
  const app = setup()
  app.switcher.show('fireworks')
  app.switcher.destroy()
  app.switcher.destroy()
  assert.equal(app.log.filter(item => item === 'dispose:fireworks').length, 1)
  app.switcher.show('fireworks')
  assert.deepEqual([...app.active], ['fireworks'])
  app.switcher.destroy()
})
