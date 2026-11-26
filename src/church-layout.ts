// Photo-based proportions, not surveyed architectural measurements.
// The curved auditorium closes against the straight chancel wall at the front.
export const HALL = { radiusX: 28, radiusZ: 26, centerZ: 3, frontZ: -17.4, eaveY: 13.6, crownY: 18 }
export const HALL_ARC = Math.acos((HALL.frontZ - HALL.centerZ) / HALL.radiusZ)
export const GALLERY_ARC = 2.35
export const GALLERIES = [
  { floor: 2 as const, y: 5.2, innerX: 20.4, innerZ: 18.4, rows: 3, firstX: 21.8 },
  { floor: 3 as const, y: 8.8, innerX: 22.2, innerZ: 20.2, rows: 2, firstX: 23.6 },
]
export function hallPoint(angle: number, rx = HALL.radiusX, rz = HALL.radiusZ) {
  return { x: rx * Math.sin(angle), z: HALL.centerZ + rz * Math.cos(angle) }
}
export function insideHall(x: number, z: number, margin = 0) {
  return z >= HALL.frontZ + margin && (x / (HALL.radiusX - margin)) ** 2 + ((z - HALL.centerZ) / (HALL.radiusZ - margin)) ** 2 <= 1
}
export const HALL_COLUMNS = Array.from({ length: 15 }, (_, i) => ({ ...hallPoint(-2.2 + i * 4.4 / 14, 21.1, 19.1), radius: .3 }))
export const FAN = { centerZ: -12, halfAngle: .98, banks: 8, rows: 24, firstRadius: 6.8, rowSpacing: 1.45, crossRows: [7, 14] }
