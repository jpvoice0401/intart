import type { Outfit } from './sixflags-model.ts'
import { FAN, HALL, HALL_COLUMNS, insideHall } from './church-layout.ts'
export type ChurchActivity = 'walk' | 'sit' | 'pray' | 'praise'
export type ChurchGender = 'male' | 'female'
export const CHURCH_PHRASES = { amen: '아멘', lord: '주여!' } as const
export type ChurchPhrase = keyof typeof CHURCH_PHRASES
export type ChurchPlayer = { id: string; nickname: string; gender: ChurchGender; outfit: Outfit; x: number; z: number; yaw: number; moving: boolean; seat: string | null; activity: ChurchActivity; since: number; destination: { x: number; z: number } | null; speech: { seq: number; phrase: ChurchPhrase; at: number } | null }
export type ChurchSnapshot = { type: 'state'; time: number; players: ChurchPlayer[] }
export type Pew = { id: string; x: number; z: number; yaw: number; width: number; row: number; bank: number }
export type ChurchSeat = { id: string; x: number; z: number; yaw: number; pew: string; label: string }
export const CHURCH_BOUNDS = { minX: -HALL.radiusX + .75, maxX: HALL.radiusX - .75, minZ: -8, maxZ: HALL.centerZ + HALL.radiusZ - .75 }
export const PEWS: Pew[] = []
for (let row = 0; row < FAN.rows; row++) {
  if (FAN.crossRows.includes(row)) continue
  const radius = FAN.firstRadius + row * FAN.rowSpacing, banks = row < 6 ? 4 : FAN.banks, sector = FAN.halfAngle * 2 / banks
  for (let bank = 0; bank < banks; bank++) {
    const yaw = -FAN.halfAngle + sector * (bank + .5), x = radius * Math.sin(yaw), z = FAN.centerZ + radius * Math.cos(yaw)
    const width = 2 * radius * Math.sin(sector / 2) - 1.2
    if (width < 1.7) continue
    // Reserve both the bench footprint and its standing aisle within the curved wall.
    if ([-1, 1].some(side => [-.95, .6].some(depth => !insideHall(x + Math.cos(yaw) * side * (width / 2 + .3) + Math.sin(yaw) * depth, z - Math.sin(yaw) * side * (width / 2 + .3) + Math.cos(yaw) * depth, 1)))) continue
    if (HALL_COLUMNS.some(c => { const dx = c.x - x, dz = c.z - z; return Math.abs(Math.cos(yaw) * dx - Math.sin(yaw) * dz) < width / 2 + .65 && Math.abs(Math.sin(yaw) * dx + Math.cos(yaw) * dz) < 1.4 })) continue
    PEWS.push({ id: `${bank}-${row}`, x, z, yaw, width, row, bank })
  }
}
export const CHURCH_SEATS: ChurchSeat[] = PEWS.flatMap(p => {
  const count = Math.max(1, Math.floor((p.width - .3) / .9))
  return Array.from({ length: count }, (_, i) => {
    const localX = (i - (count - 1) / 2) * .9
    return { id: `${p.id}-${i}`, pew: p.id, x: p.x + Math.cos(p.yaw) * localX, z: p.z - Math.sin(p.yaw) * localX, yaw: Math.PI + p.yaw, label: `${'ABCDEFGH'[p.bank]}구역 ${p.row + 1}열 ${i + 1}번` }
  })
})
export function walkable(x: number, z: number) {
  if (!Number.isFinite(x + z) || x < CHURCH_BOUNDS.minX || x > CHURCH_BOUNDS.maxX || z < CHURCH_BOUNDS.minZ || z > CHURCH_BOUNDS.maxZ) return false
  if (!insideHall(x, z, .75) || HALL_COLUMNS.some(c => Math.hypot(c.x - x, c.z - z) < c.radius + .23)) return false
  return !PEWS.some(p => { const dx = x - p.x, dz = z - p.z, localX = Math.cos(p.yaw) * dx - Math.sin(p.yaw) * dz, localZ = Math.sin(p.yaw) * dx + Math.cos(p.yaw) * dz; return Math.abs(localX) < p.width / 2 + .2 && Math.abs(localZ) < .5 })
}
export function moveInChurch(x: number, z: number, dx: number, dz: number) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .1))
  for (let i = 0; i < steps; i++) { if (walkable(x + dx / steps, z)) x += dx / steps; if (walkable(x, z + dz / steps)) z += dz / steps }
  return { x, z }
}
export function standPosition(seat: ChurchSeat) {
  const yaw = seat.yaw - Math.PI
  return { x: seat.x - Math.sin(yaw) * .78, z: seat.z - Math.cos(yaw) * .78 }
}
/** Hand targets are used for both articulated arms and skin-colored palms. */
export function worshipPose(activity: ChurchActivity, time: number) {
  const gap = activity === 'pray' ? .045 : activity === 'praise' ? .045 + .2 * (1 + Math.sin(time * 7)) / 2 : .32
  return { left: { x: -gap, y: activity === 'pray' ? .8 : .76, z: .34 }, right: { x: gap, y: activity === 'pray' ? .8 : .76, z: .34 }, bow: activity === 'pray' ? .14 : 0, active: activity === 'pray' || activity === 'praise' }
}
