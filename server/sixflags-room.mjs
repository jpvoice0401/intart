import { randomUUID } from 'node:crypto'
import { RIDES, seatPose, clamp, initialRides } from '../src/sixflags-model.ts'

const shirts = ['#ee876d', '#83afca', '#a99acb', '#ecc35e', '#78b9a3', '#e69cbe', '#d6a272', '#7892bd']
export class ParkRoom {
  players = new Map()
  rides = initialRides()
  time = 0
  join(nickname) {
    if (typeof nickname !== 'string') throw new Error('닉네임을 입력해 주세요.')
    nickname = nickname.replace(/[\p{C}]/gu, '').trim()
    if (!nickname || [...nickname].length > 12) throw new Error('닉네임은 1–12자로 입력해 주세요.')
    if (this.players.size >= 24) throw new Error('테마파크가 가득 찼어요. 잠시 후 다시 입장해 주세요.')
    const pick = a => a[Math.floor(Math.random() * a.length)]
    const outfit = { shirt: pick(shirts), pants: pick(['#536778', '#796c8b', '#bc9270', '#f4e7cc']), skin: pick(['#f3c9aa', '#dfad86', '#be8866', '#8d5d47']), hair: pick(['#4f342b', '#302b32', '#8b5839', '#d8b679']), style: Math.floor(Math.random() * 3), hat: Math.random() > .5 }
    const player = { id: randomUUID(), nickname, outfit, x: (Math.random() - .5) * 2, y: 0, z: 8.3 + Math.random(), yaw: Math.PI, moving: false, ride: null, seat: -1, wave: 0, jump: 0, input: { x: 0, z: 0 }, inputAt: -1, actionAt: -1, jumpAt: -1 }
    this.players.set(player.id, player)
    return player
  }
  leave(id) { this.players.delete(id) }
  command(id, message) {
    const p = this.players.get(id)
    if (!p) return
    if (message.type === 'move') {
      if (!Number.isFinite(message.x) || !Number.isFinite(message.z)) return
      const length = Math.max(1, Math.hypot(message.x, message.z))
      p.input = { x: message.x / length, z: message.z / length }; p.inputAt = this.time
    }
    if (message.type === 'board') {
      if (p.ride) return
      const ride = RIDES.find(r => r.id === message.ride)
      if (!ride) return
      if (Math.hypot(p.x - ride.x, p.z - ride.z) > 3.7) throw new Error('놀이기구 가까이에서 탑승해 주세요.')
      const occupied = new Set([...this.players.values()].filter(other => other.ride === ride.id).map(other => other.seat))
      const seat = Array.from({ length: ride.seats }, (_, i) => i).find(i => !occupied.has(i))
      if (seat === undefined) throw new Error('모든 자리에 친구가 있어요. 잠시 기다려 주세요.')
      p.ride = ride.id; p.seat = seat; p.jump = 0; p.jumpAt = -1; p.moving = false
    }
    if (message.type === 'dismount') this.dismount(p)
    if (message.type === 'action' && this.time - p.actionAt > .18) {
      p.actionAt = this.time
      if (!p.ride && p.jumpAt < 0) p.jumpAt = this.time
      if (p.ride === 'carousel') this.rides.speeds[0] = Math.min(1.1, this.rides.speeds[0] + .18)
      if (p.ride === 'wheel') p.wave = 2.5
      if (p.ride === 'skyscreamer') this.rides.speeds[2] = Math.min(1.6, this.rides.speeds[2] + .22)
      if (p.ride === 'teacups') { const cup = Math.floor(p.seat / 2); this.rides.cupSpeeds[cup] = Math.min(3.5, this.rides.cupSpeeds[cup] + .5) }
    }
  }
  dismount(p) {
    if (!p.ride) return
    const ride = RIDES.find(r => r.id === p.ride)
    p.x = ride.x + (p.seat % 2 ? 2.9 : -2.9); p.z = ride.z + 3.2; p.y = 0; p.ride = null; p.seat = -1; p.wave = 0; p.input = { x: 0, z: 0 }; p.moving = false
  }
  tick(dt) {
    dt = clamp(dt, 0, .05); this.time += dt
    const r = this.rides
    r.time = this.time
    const base = [.22, .14, .35, .2]
    for (let i = 0; i < 4; i++) { r.speeds[i] = Math.max(base[i], r.speeds[i] - .045 * dt); r.angles[i] = (r.angles[i] + r.speeds[i] * dt) % (Math.PI * 2); r.cupSpeeds[i] = Math.max(.2, r.cupSpeeds[i] - .12 * dt); r.cupAngles[i] = (r.cupAngles[i] + r.cupSpeeds[i] * dt) % (Math.PI * 2) }
    r.lift += ((2.7 + r.speeds[2] * 1.6) - r.lift) * dt * .8
    for (const p of this.players.values()) {
      p.wave = Math.max(0, p.wave - dt)
      if (p.ride) {
        Object.assign(p, seatPose(p.ride, p.seat, r)); p.moving = false
      } else {
        const input = this.time - p.inputAt < .35 ? p.input : { x: 0, z: 0 }
        p.x = clamp(p.x + input.x * dt * 3.5, -11.4, 11.4); p.z = clamp(p.z + input.z * dt * 3.5, -10.5, 10.5)
        p.moving = Math.hypot(input.x, input.z) > .05
        if (p.moving) p.yaw = Math.atan2(input.x, input.z)
        if (p.jumpAt >= 0) { const t = this.time - p.jumpAt; p.jump = Math.max(0, 3.6 * t - 5.4 * t * t); if (t > .67) { p.jumpAt = -1; p.jump = 0 } }
        p.y = p.jump
      }
    }
  }
  snapshot() {
    return { type: 'state', time: this.time, rides: structuredClone(this.rides), players: [...this.players.values()].map(({ input, inputAt, actionAt, jumpAt, ...p }) => ({ ...p })) }
  }
}
