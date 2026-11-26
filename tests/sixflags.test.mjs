import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { WebSocket } from 'ws'
import { ParkRoom } from '../server/sixflags-room.mjs'
import { attachPark } from '../server/sixflags-plugin.mjs'
import { RIDES, seatPose, initialRides } from '../src/sixflags-model.ts'

const advance = (room, seconds) => { for (let i = 0; i < Math.ceil(seconds / .05); i++) room.tick(.05) }
function board(room, player, id) { const r = RIDES.find(r => r.id === id); player.x = r.x; player.z = r.z; room.command(player.id, { type: 'board', ride: id }); room.tick(.05) }

test('nickname validation, bounded input, and stale input stopping are authoritative', () => {
  const room = new ParkRoom()
  for (const name of ['', ' ', null, 'abcdefghijklmnop']) assert.throws(() => room.join(name))
  const p = room.join('눈사람'); const x = p.x, z = p.z
  room.command(p.id, { type: 'move', x: 1000, z: 1000 }); advance(room, .2)
  assert.ok(Math.hypot(p.x - x, p.z - z) <= .71)
  advance(room, 1); const stopped = p.x; advance(room, 1); assert.equal(p.x, stopped)
  room.command(p.id, { type: 'move', x: NaN, z: Infinity }); room.tick(.05); assert.ok(Number.isFinite(p.x))
  assert.throws(() => room.command(p.id, { type: 'board', ride: 'wheel' }), /가까이/)
  const snapshot = room.snapshot(); assert.equal('input' in snapshot.players[0], false)
})

test('all four rides board, respond to space actions, and release their seats', () => {
  for (const ride of RIDES) {
    const room = new ParkRoom(), p = room.join('테스터'); board(room, p, ride.id)
    assert.equal(p.ride, ride.id)
    room.command(p.id, { type: 'action' }); advance(room, .4)
    if (ride.id === 'carousel') assert.ok(room.rides.speeds[0] > .3)
    if (ride.id === 'wheel') assert.ok(p.wave > 2)
    if (ride.id === 'skyscreamer') { assert.ok(room.rides.speeds[2] > .5); assert.ok(room.rides.lift > 3.2) }
    if (ride.id === 'teacups') assert.ok(room.rides.cupSpeeds[0] > .6)
    room.command(p.id, { type: 'dismount' }); assert.equal(p.ride, null); assert.equal(p.y, 0)
  }
})

test('shared rides assign exclusive seats and free seats on disconnect', () => {
  const room = new ParkRoom(), a = room.join('가'), b = room.join('나'), c = room.join('다')
  board(room, a, 'carousel'); board(room, b, 'carousel'); assert.notEqual(a.seat, b.seat)
  for (let i = 0; i < 4; i++) board(room, room.join(`친구${i}`), 'carousel')
  assert.throws(() => board(room, c, 'carousel'), /모든 자리/)
  room.leave(a.id); board(room, c, 'carousel'); assert.equal(c.seat, a.seat)
  const before = room.rides.speeds[0]; room.command(b.id, { type: 'action' }); advance(room, .2)
  assert.ok(room.rides.speeds[0] > before)
  const pose = seatPose('carousel', c.seat, room.rides); assert.equal(c.y, pose.y)
})

test('friends share one teacup and its handle only accelerates that cup', () => {
  const room = new ParkRoom(), a = room.join('빙글'), b = room.join('친구'); board(room, a, 'teacups'); board(room, b, 'teacups')
  assert.equal(Math.floor(a.seat / 2), Math.floor(b.seat / 2))
  room.command(a.id, { type: 'action' }); room.command(b.id, { type: 'action' }); advance(room, .1)
  assert.ok(room.rides.cupSpeeds[0] > 1); assert.equal(room.rides.cupSpeeds[1], .2)
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > .8)
})

test('all ride seats stay above ground for full rotations and speed stays bounded', () => {
  const state = initialRides()
  for (let i = 0; i < 100; i++) {
    state.angles.fill(i * Math.PI / 50); state.cupAngles.fill(i * .2); state.time = i
    for (const ride of RIDES) for (let seat = 0; seat < ride.seats; seat++) { const pose = seatPose(ride.id, seat, state); assert.ok(pose.y >= .5, ride.id); assert.ok(Number.isFinite(pose.x + pose.z)) }
  }
  const room = new ParkRoom(), p = room.join('속도'); board(room, p, 'skyscreamer')
  for (let i = 0; i < 100; i++) { room.command(p.id, { type: 'action' }); advance(room, .2) }
  assert.ok(room.rides.speeds[2] <= 1.6)
})

test('two real WebSocket clients join one room, share actions, and see disconnections', async () => {
  const server = createServer(), park = attachPark(server)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `ws://127.0.0.1:${server.address().port}/__sixflags`
  const sockets = []
  const connect = () => new Promise((resolve, reject) => {
    const ws = new WebSocket(url); sockets.push(ws); const inbox = []; const pending = []
    ws.on('error', reject)
    ws.on('message', raw => { const msg = JSON.parse(raw); inbox.push(msg); for (const check of [...pending]) check() })
    const wait = predicate => new Promise((yes, no) => {
      const timer = setTimeout(() => { pending.splice(pending.indexOf(check), 1); no(new Error('WebSocket response timed out')) }, 3000)
      function check() { const index = inbox.findIndex(predicate); if (index >= 0) { clearTimeout(timer); pending.splice(pending.indexOf(check), 1); yes(inbox.splice(index, 1)[0]) } }
      pending.push(check); check()
    })
    ws.on('open', () => resolve({ ws, wait, send: msg => ws.send(JSON.stringify(msg)) }))
  })
  try {
    const a = await connect(), b = await connect()
    a.send({ type: 'join', nickname: '첫째' }); b.send({ type: 'join', nickname: '둘째' })
    const aa = await a.wait(m => m.type === 'joined'), bb = await b.wait(m => m.type === 'joined'); assert.notEqual(aa.id, bb.id)
    const state = await a.wait(m => m.type === 'state' && m.players.length === 2); assert.deepEqual(new Set(state.players.map(p => p.nickname)), new Set(['첫째', '둘째']))
    const player = park.room.players.get(aa.id); player.x = RIDES[0].x; player.z = RIDES[0].z
    a.send({ type: 'board', ride: 'carousel' }); a.send({ type: 'action' })
    const shared = await b.wait(m => m.type === 'state' && m.players.some(p => p.id === aa.id && p.ride === 'carousel') && m.rides.speeds[0] > .3)
    assert.ok(shared.rides.angles[0] > 0)
    a.ws.close(); await b.wait(m => m.type === 'state' && m.players.length === 1 && m.players[0].id === bb.id)
  } finally { sockets.forEach(ws => ws.terminate()); park.dispose(); await new Promise(resolve => server.close(resolve)) }
})
