import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ClawCycle, CLAW_HOME, EXIT, PLAY_FLOOR, PRIZE_COUNT, fingerPose, gripResult } from '../src/claw-model.ts'
import { ClawPhysics } from '../src/claw-physics.ts'
import { PLUSH_SPECS, plushParts } from '../src/claw-plush.ts'

function cycleSetup(roll = .1, target = { id: 1, y: 3, distance: .04, tilt: .1 }) {
  const log = []
  const cycle = new ClawCycle({ probe: () => target, grab: (toy, kind) => log.push(['grab', toy.id, kind]), release: delivery => log.push(['release', delivery]) }, () => roll)
  return { cycle, log }
}

test('three fingers close inward without crossing the center or neighboring fingers', () => {
  let previous = 0
  for (let i = 0; i <= 100; i++) {
    const pose = fingerPose(i / 100)
    assert.ok(pose.tip.radius > .1)
    assert.ok(pose.tip.radius >= previous)
    assert.ok(pose.tip.y < pose.joint.y && pose.joint.y < pose.root.y)
    assert.ok(Math.sqrt(3) * pose.tip.radius > .046, 'neighboring metal tips never overlap')
    previous = pose.tip.radius
  }
})

test('one Space starts a complete locked automatic cycle, finishing open at home', () => {
  const { cycle, log } = cycleSetup()
  cycle.move(1, -1, .4)
  assert.equal(cycle.start(), true)
  const visited = new Set()
  for (let i = 0; i < 900 && cycle.locked; i++) {
    visited.add(cycle.phase)
    const p = [cycle.x, cycle.y, cycle.z]
    cycle.move(-1, 1, .5)
    assert.deepEqual([cycle.x, cycle.y, cycle.z], p)
    assert.equal(cycle.start(), false)
    cycle.update(1 / 60)
    if (cycle.phase === 'opening') { assert.equal(cycle.x, EXIT.x); assert.equal(cycle.z, EXIT.z); assert.equal(cycle.y, CLAW_HOME) }
  }
  assert.deepEqual([...visited], ['descending', 'closing', 'lifting', 'carrying', 'opening', 'delivery', 'returning'])
  assert.deepEqual(log, [['grab', 1, 'stable'], ['release', true]])
  assert.equal(cycle.attempts, 1)
  assert.equal(cycle.phase, 'ready'); assert.equal(cycle.open, 1); assert.equal(cycle.y, CLAW_HOME)
})

test('unstable grip drops during lift or travel; a missed grab still completes the cycle', () => {
  const unstable = cycleSetup(.85)
  unstable.cycle.start()
  for (let i = 0; i < 900; i++) unstable.cycle.update(1 / 60)
  assert.deepEqual(unstable.log, [['grab', 1, 'slip'], ['release', false]])
  const missed = cycleSetup(.5, null)
  missed.cycle.start()
  for (let i = 0; i < 900; i++) missed.cycle.update(1 / 60)
  assert.equal(missed.cycle.phase, 'ready'); assert.deepEqual(missed.log, [])
  assert.equal(gripResult(.6, 0, 0), 'miss')
  assert.equal(gripResult(0, 0, .1), 'stable')
})

test('twelve different sewn designs keep every ear and limb attached to the same body', () => {
  assert.equal(PLUSH_SPECS.length, 12)
  assert.equal(new Set(PLUSH_SPECS.map(s => s.kind)).size, 8)
  for (const spec of PLUSH_SPECS) {
    const parts = plushParts(spec)
    const connected = new Set([0])
    for (let pass = 0; pass < parts.length; pass++) for (let i = 0; i < parts.length; i++) {
      if (connected.has(i)) continue
      for (const j of connected) {
        const a = parts[i], b = parts[j]
        // Conservative overlap along the center-to-center line for soft ellipsoids.
        const distance = Math.sqrt(a.at.reduce((sum, value, axis) => sum + ((value - b.at[axis]) / (a.scale[axis] + b.scale[axis])) ** 2, 0))
        if (distance < 1) { connected.add(i); break }
      }
    }
    assert.equal(connected.size, parts.length, `${spec.name} has a detached part`)
    assert.equal(parts.filter(p => p.material === 'face').length, 1, 'face is a head texture, not floating features')
  }
})

test('72 toys settle in varied poses and all visible geometry stays above the play floor', () => {
  let seed = 81
  const physics = new ClawPhysics(PRIZE_COUNT, () => (seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296)
  assert.equal(physics.actors.length, 72)
  for (let i = 0; i < 240; i++) physics.step(1 / 60)
  for (const actor of physics.actors) assert.ok(physics.lowestPoint(actor) >= PLAY_FLOOR - .001, `${actor.id} sank into the floor`)
  assert.ok(Math.max(...physics.actors.map(a => a.body.position.y)) - Math.min(...physics.actors.map(a => a.body.position.y)) > .3)
  assert.ok(new Set(physics.actors.map(a => a.body.quaternion.x.toFixed(1))).size > 3)
  physics.actors.forEach(actor => actor.body.sleep())
  const candidates = physics.actors.filter(a => Math.abs(a.body.position.x) < 1.5 && Math.abs(a.body.position.z) < .9).sort((a, b) => b.body.position.y - a.body.position.y)
  const target = candidates[0]
  const cycle = new ClawCycle({ probe: (x, z) => physics.probe(x, z), grab: (t, kind) => physics.grab(t, kind), release: delivery => physics.release(delivery) }, () => .05)
  cycle.x = target.body.position.x; cycle.z = target.body.position.z; cycle.start()
  let lifted = false, released = false
  for (let i = 0; i < 850; i++) {
    cycle.update(1 / 60); physics.step(1 / 60, cycle)
    if (physics.held && physics.held.body.position.y > 4.6) lifted = true
    if (physics.delivery) { released = true; if (physics.delivery.body.position.y < PLAY_FLOOR - .35) { physics.collect(physics.delivery); break } }
  }
  assert.equal(lifted, true, 'the constraints must actually lift a physical toy')
  assert.equal(released, true, 'a held toy must be released into the chute')
  assert.equal(physics.actors.filter(a => a.won).length, 1)
  assert.ok(physics.world.bodies.includes(physics.hatch))
  physics.dispose()
})
