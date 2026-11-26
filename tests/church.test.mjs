import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'node:http'
import { WebSocket } from 'ws'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Box3, Vector3 } from 'three'
import { ChurchRoom } from '../server/church-room.mjs'
import { attachPark } from '../server/sixflags-plugin.mjs'
import { CHURCH_SEATS, CHURCH_BOUNDS, moveInChurch, standPosition, walkable, worshipPose } from '../src/church-model.ts'
import { findChurchPath, clearFloorSegment } from '../src/church-navigation.ts'
import { churchVoiceSettings, createChurchSpeechInbox } from '../src/church-voice.ts'

const advance = (room, seconds) => { for (let i = 0; i < Math.ceil(seconds / .05); i++) room.tick(.05) }

test('floor destinations route around pews, arrive, stand from a seat, and yield to manual movement', () => {
  const room = new ChurchRoom(), p = room.join('걷기', 'male'); Object.assign(p, { x: 0, z: 13 })
  for (const end of [{ x: -7.8, z: -7.7 }, { x: 25, z: 3 }, { x: -15.5, z: 12.8 }, { x: 0, z: -7.8 }, { x: 0, z: 27 }]) {
    const path = findChurchPath(p, end); assert.ok(path)
    let previous = p; for (const point of path) { assert.ok(clearFloorSegment(previous, point)); previous = point }
    room.command(p.id, { type: 'navigate', ...end })
    for (let i = 0; i < 700 && p.destination; i++) {
      const old = { x: p.x, z: p.z }; room.tick(.05)
      assert.ok(walkable(p.x, p.z)); assert.ok(Math.hypot(p.x - old.x, p.z - old.z) <= .176)
    }
    assert.equal(p.destination, null); assert.ok(Math.hypot(p.x - end.x, p.z - end.z) < .02)
  }
  assert.equal(findChurchPath(p, { x: 1000, z: 0 }), null)
  assert.equal(findChurchPath(p, CHURCH_SEATS[0]), null)
  room.command(p.id, { type: 'activity', activity: 'pray' }); assert.ok(p.seat)
  room.command(p.id, { type: 'navigate', x: 0, z: 12 }); assert.equal(p.seat, null)
  room.command(p.id, { type: 'move', x: 0, z: 0 }); room.tick(.05); assert.ok(p.destination)
  room.command(p.id, { type: 'move', x: 1, z: 0 }); assert.equal(p.destination, null)
  advance(room, .2); room.command(p.id, { type: 'navigate', x: 0, z: 12 }); room.command(p.id, { type: 'stop' }); assert.equal(p.path.length, 0)
  assert.equal('path' in room.snapshot().players[0], false)
})

test('gender voices differ, fixed phrases synchronize once and old speech never replays', () => {
  const voices = [{ name: 'Microsoft Heami', lang: 'ko-KR' }, { name: 'Microsoft InJoon', lang: 'ko-KR' }]
  assert.equal(churchVoiceSettings(voices, 'male').voice.name, 'Microsoft InJoon')
  assert.equal(churchVoiceSettings(voices, 'female').voice.name, 'Microsoft Heami')
  assert.notEqual(churchVoiceSettings(voices.slice(0, 1), 'male').pitch, churchVoiceSettings(voices.slice(0, 1), 'female').pitch)
  const room = new ChurchRoom(), p = room.join('목소리', 'male'), inbox = createChurchSpeechInbox()
  assert.throws(() => room.join('잘못된 설정', 'invalid')); assert.equal(p.gender, 'male')
  assert.deepEqual(inbox.read(room.snapshot()), [])
  room.command(p.id, { type: 'speak', phrase: 'amen', gender: 'female' })
  const events = inbox.read(room.snapshot()); assert.equal(events.length, 1); assert.equal(events[0].gender, 'male'); assert.equal(events[0].phrase, 'amen')
  assert.deepEqual(inbox.read(room.snapshot()), [])
  room.command(p.id, { type: 'speak', phrase: 'lord' }); assert.equal(p.speech.seq, 1)
  advance(room, 1.1); room.command(p.id, { type: 'speak', phrase: 'lord' }); assert.equal(inbox.read(room.snapshot())[0].phrase, 'lord')
  assert.deepEqual(createChurchSpeechInbox().read(room.snapshot()), [])
  advance(room, 1.1); room.command(p.id, { type: 'speak', phrase: 'arbitrary text' }); assert.equal(p.speech.seq, 2)
})

test('each entrant needs a nickname and receives a distinct clothing combination', () => {
  const room = new ChurchRoom(), outfits = new Set()
  for (const invalid of ['', ' ', null, 'abcdefghijklmnop']) assert.throws(() => room.join(invalid))
  for (let i = 0; i < 32; i++) { const p = room.join(`친구${i}`); outfits.add([p.outfit.shirt, p.outfit.pants, p.outfit.style].join(':')); assert.equal(walkable(p.x, p.z), true) }
  assert.equal(outfits.size, 32); assert.throws(() => room.join('추가 입장'), /32명/)
  const p = room.players.values().next().value; room.leave(p.id); assert.equal(room.players.size, 31); room.join('다시 입장')
  assert.equal('input' in room.snapshot().players[0], false)
})

test('prayer seats at the nearest free chair, praise changes pose, standing releases it', () => {
  const room = new ChurchRoom(), p = room.join('기도')
  room.command(p.id, { type: 'activity', activity: 'pray' }); assert.ok(p.seat); assert.equal(p.activity, 'pray')
  const seat = CHURCH_SEATS.find(s => s.id === p.seat); assert.equal(p.x, seat.x); assert.equal(p.z, seat.z)
  room.command(p.id, { type: 'move', x: 1, z: 1 }); advance(room, 1); assert.equal(p.x, seat.x); assert.equal(p.z, seat.z)
  room.command(p.id, { type: 'activity', activity: 'praise' }); assert.equal(p.activity, 'praise'); assert.equal(p.seat, seat.id)
  room.command(p.id, { type: 'activity', activity: 'walk' }); assert.equal(p.seat, null); assert.equal(walkable(p.x, p.z), true)
  const old = { x: p.x, z: p.z }; advance(room, 1); assert.equal(p.x, old.x); assert.equal(p.z, old.z)
})

test('concurrent prayer cannot claim the same chair, and a disconnect frees it', () => {
  const room = new ChurchRoom(), a = room.join('가'), b = room.join('나'), seat = CHURCH_SEATS[5]
  for (const p of [a, b]) Object.assign(p, standPosition(seat))
  room.command(a.id, { type: 'activity', activity: 'pray', seat: seat.id })
  assert.throws(() => room.command(b.id, { type: 'activity', activity: 'pray', seat: seat.id }), /빈 의자/)
  room.leave(a.id); room.command(b.id, { type: 'activity', activity: 'pray', seat: seat.id }); assert.equal(b.seat, seat.id)
  const c = room.join('멀리'); assert.throws(() => room.command(c.id, { type: 'activity', activity: 'pray', seat: CHURCH_SEATS[0].id }), /빈 의자/)
})

test('movement cannot cross pews, tunnel through rows, or leave the sanctuary', () => {
  const bounded = moveInChurch(0, 13, 0, -100)
  assert.equal(bounded.x, 0)
  assert.ok(bounded.z >= CHURCH_BOUNDS.minZ && bounded.z - CHURCH_BOUNDS.minZ < .11)
  const seat = CHURCH_SEATS.find(s => s.pew === '1-10'), start = standPosition(seat)
  const stopped = moveInChurch(start.x, start.z, 0, 8); assert.ok(stopped.z < seat.z); assert.equal(walkable(stopped.x, stopped.z), true)
  for (const chair of CHURCH_SEATS) { const stand = standPosition(chair); assert.ok(walkable(stand.x, stand.z), chair.id) }
  const room = new ChurchRoom(), p = room.join('이동'), oldX = p.x
  room.command(p.id, { type: 'move', x: 1000, z: 0 }); advance(room, .2); assert.ok(p.x - oldX <= .71)
  advance(room, 1); const stoppedX = p.x; advance(room, 1); assert.equal(p.x, stoppedX)
  room.command(p.id, { type: 'move', x: NaN, z: Infinity }); advance(room, .1); assert.ok(Number.isFinite(p.x + p.z))
})

test('praying hands meet and clapping cycles between contact and separation', () => {
  const prayer = worshipPose('pray', 0); assert.ok(prayer.right.x - prayer.left.x < .11); assert.ok(prayer.bow > 0)
  const distances = Array.from({ length: 100 }, (_, i) => { const pose = worshipPose('praise', i / 30); return pose.right.x - pose.left.x })
  assert.ok(Math.min(...distances) < .11); assert.ok(Math.max(...distances) > .45)
})

test('the imported official exterior loads as one building with finite geometry', async () => {
  const bytes = await fs.readFile(new URL('../public/church/daeseongjeon.glb', import.meta.url))
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString())
  assert.equal(json.nodes.length, 1); assert.equal(json.nodes[0].name, 'daeseongjeon'); assert.equal(json.meshes.length, 1)
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  const size = new Box3().setFromObject(gltf.scene).getSize(new Vector3())
  assert.ok(size.x > 0 && size.y > 0 && size.z > 0 && Number.isFinite(size.length()))
  let groups = 0; gltf.scene.traverse(o => { if (o.isMesh) { groups++; o.geometry.dispose(); o.material.dispose() } }); assert.equal(groups, 17)
})

test('real sockets synchronize prayer and praise while church and park stay isolated', async () => {
  const server = createServer(), park = attachPark(server), church = attachPark(server, new ChurchRoom(), '/__church')
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const sockets = []
  async function client(path) {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}${path}`), inbox = [], pending = []; sockets.push(ws)
    ws.on('message', raw => { inbox.push(JSON.parse(raw)); for (const check of [...pending]) check() })
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })
    return { ws, send: data => ws.send(JSON.stringify(data)), wait: predicate => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.splice(pending.indexOf(check), 1); reject(new Error('WebSocket response timeout')) }, 3000)
      function check() { const i = inbox.findIndex(predicate); if (i >= 0) { clearTimeout(timer); pending.splice(pending.indexOf(check), 1); resolve(inbox.splice(i, 1)[0]) } }
      pending.push(check); check()
    }) }
  }
  try {
    const a = await client('/__church'), b = await client('/__church'), outsider = await client('/__sixflags')
    a.send({ type: 'join', nickname: '함께기도', gender: 'male' }); b.send({ type: 'join', nickname: '함께찬송', gender: 'female' }); outsider.send({ type: 'join', nickname: '공원손님' })
    const joined = await a.wait(m => m.type === 'joined'); await b.wait(m => m.type === 'joined'); await outsider.wait(m => m.type === 'joined')
    a.send({ type: 'activity', activity: 'pray' })
    const shared = await b.wait(m => m.type === 'state' && m.players.some(p => p.id === joined.id && p.activity === 'pray'))
    assert.equal(shared.players.length, 2); assert.ok(shared.players.find(p => p.id === joined.id).seat)
    a.send({ type: 'activity', activity: 'praise' }); await b.wait(m => m.type === 'state' && m.players.some(p => p.id === joined.id && p.activity === 'praise'))
    a.send({ type: 'speak', phrase: 'amen' }); const spoken = await b.wait(m => m.type === 'state' && m.players.some(p => p.id === joined.id && p.speech?.phrase === 'amen'))
    assert.equal(spoken.players.find(p => p.id === joined.id).gender, 'male')
    a.send({ type: 'navigate', x: 0, z: 12 }); await b.wait(m => m.type === 'state' && m.players.some(p => p.id === joined.id && p.destination?.z === 12 && !p.seat))
    const separate = await outsider.wait(m => m.type === 'state' && m.players.length === 1); assert.equal(separate.players[0].nickname, '공원손님')
    a.ws.close(); await b.wait(m => m.type === 'state' && m.players.length === 1); assert.equal(church.room.players.size, 1)
  } finally { sockets.forEach(ws => ws.terminate()); park.dispose(); church.dispose(); await new Promise(resolve => server.close(resolve)) }
})
