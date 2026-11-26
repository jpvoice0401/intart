import { randomUUID } from 'node:crypto'
import { CHURCH_SEATS, moveInChurch, standPosition, walkable } from '../src/church-model.ts'
import { findChurchPath } from '../src/church-navigation.ts'

const shirts = ['#a6bdcd', '#cc9c8a', '#ac9dc4', '#94b49c', '#cdbb81', '#b68f9e', '#728da9', '#bca689']
const pants = ['#536278', '#8a7c6d', '#6c607b', '#d5c7ad']
export class ChurchRoom {
  players = new Map()
  time = 0
  lastOutfit = -1
  join(nickname, gender = 'female') {
    if (!['male', 'female'].includes(gender)) throw new Error('캐릭터의 남성 또는 여성 목소리를 선택해 주세요.')
    if (typeof nickname !== 'string') throw new Error('닉네임을 입력해 주세요.')
    nickname = nickname.replace(/[\p{C}]/gu, '').trim()
    if (!nickname || [...nickname].length > 12) throw new Error('닉네임은 1–12자로 입력해 주세요.')
    if (this.players.size >= 32) throw new Error('현재 입장 가능한 32명이 모두 함께하고 있어요.')
    const used = new Set([...this.players.values()].map(p => p.outfitIndex)); let index
    do { index = Math.floor(Math.random() * 96) } while (used.has(index) || index === this.lastOutfit)
    this.lastOutfit = index
    const pick = a => a[Math.floor(Math.random() * a.length)]
    const outfit = { shirt: shirts[index % 8], pants: pants[Math.floor(index / 8) % 4], style: Math.floor(index / 32), hat: false, hair: pick(['#352b2b', '#71503b', '#b88f61', '#514245']), skin: pick(['#f2ceb1', '#dca983', '#b77e5d', '#8f614a']) }
    const p = { id: randomUUID(), nickname, outfit, outfitIndex: index, x: (Math.random() - .5) * 1.7, z: 13, yaw: Math.PI, moving: false, seat: null, activity: 'walk', since: this.time, input: { x: 0, z: 0 }, inputAt: -1 }
    Object.assign(p, { gender, path: [], destination: null, speech: null, navigateAt: -1 })
    this.players.set(p.id, p); return p
  }
  leave(id) { this.players.delete(id) }
  command(id, msg) {
    const p = this.players.get(id); if (!p) return
    if (msg.type === 'speak') {
      if (!['amen', 'lord'].includes(msg.phrase) || (p.speech && this.time - p.speech.at < 1)) return
      p.speech = { seq: (p.speech?.seq ?? 0) + 1, phrase: msg.phrase, at: this.time }; return
    }
    if (msg.type === 'navigate') {
      if (!Number.isFinite(msg.x) || !Number.isFinite(msg.z) || this.time - p.navigateAt < .15) return
      p.navigateAt = this.time
      const start = p.seat ? standPosition(CHURCH_SEATS.find(s => s.id === p.seat)) : p
      const end = { x: msg.x, z: msg.z }, path = findChurchPath(start, end)
      if (!path) throw new Error('의자 위가 아닌 이동할 수 있는 바닥이나 통로를 눌러 주세요.')
      if (p.seat) Object.assign(p, start)
      Object.assign(p, { seat: null, activity: 'walk', since: this.time, path, destination: end, input: { x: 0, z: 0 }, inputAt: -1 }); return
    }
    if (msg.type === 'stop') { p.path = []; p.destination = null; p.input = { x: 0, z: 0 }; p.moving = false; return }
    if (msg.type === 'move') {
      if (!Number.isFinite(msg.x) || !Number.isFinite(msg.z)) return
      const length = Math.max(1, Math.hypot(msg.x, msg.z)); p.input = { x: msg.x / length, z: msg.z / length }; p.inputAt = this.time
      if (Math.hypot(msg.x, msg.z) > .01) { p.path = []; p.destination = null }
    }
    if (msg.type === 'activity') {
      if (!['sit', 'pray', 'praise', 'walk'].includes(msg.activity)) return
      p.path = []; p.destination = null
      if (msg.activity === 'walk') {
        if (p.seat) { const seat = CHURCH_SEATS.find(s => s.id === p.seat); const position = standPosition(seat); if (walkable(position.x, position.z)) Object.assign(p, position); else Object.assign(p, { x: 0, z: 13 }) }
        p.seat = null; p.activity = 'walk'; p.input = { x: 0, z: 0 }; p.since = this.time; return
      }
      if (!p.seat) {
        const occupied = new Set([...this.players.values()].map(other => other.seat))
        const candidates = CHURCH_SEATS.filter(s => !occupied.has(s.id) && (!msg.seat || s.id === msg.seat)).map(s => ({ seat: s, distance: Math.hypot(s.x - p.x, s.z - p.z) })).filter(s => s.distance <= 3.2).sort((a, b) => a.distance - b.distance)
        if (!candidates.length) throw new Error('가까운 빈 의자로 이동해 주세요. 중앙 통로 양옆에서 앉을 수 있어요.')
        const seat = candidates[0].seat; p.seat = seat.id; p.x = seat.x; p.z = seat.z; p.yaw = seat.yaw
      }
      p.activity = msg.activity; p.since = this.time; p.moving = false; p.input = { x: 0, z: 0 }
    }
  }
  tick(dt) {
    dt = Math.max(0, Math.min(.05, dt)); this.time += dt
    for (const p of this.players.values()) {
      if (p.seat) { p.moving = false; continue }
      const input = this.time - p.inputAt < .35 ? p.input : { x: 0, z: 0 }, oldX = p.x, oldZ = p.z
      if (p.path.length) {
        const next = p.path[0], dx = next.x - p.x, dz = next.z - p.z, distance = Math.hypot(dx, dz), amount = Math.min(distance, 3.5 * dt)
        if (distance > .001) Object.assign(p, moveInChurch(p.x, p.z, dx / distance * amount, dz / distance * amount))
        if (Math.hypot(next.x - p.x, next.z - p.z) < .015) p.path.shift()
        if (!p.path.length) p.destination = null
      } else Object.assign(p, moveInChurch(p.x, p.z, input.x * 3.5 * dt, input.z * 3.5 * dt))
      p.moving = Math.hypot(p.x - oldX, p.z - oldZ) > .001
      if (p.moving) p.yaw = Math.atan2(p.x - oldX, p.z - oldZ)
    }
  }
  snapshot() { return { type: 'state', time: this.time, players: [...this.players.values()].map(({ input, inputAt, outfitIndex, path, navigateAt, ...p }) => ({ ...p })) } }
}
