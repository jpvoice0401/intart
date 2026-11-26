export type RideId = 'carousel' | 'wheel' | 'skyscreamer' | 'teacups'
export const RIDES: { id: RideId; name: string; subtitle: string; action: string; x: number; z: number; color: string; seats: number }[] = [
  { id: 'carousel', name: 'Carousel', subtitle: '회전목마 · 고삐를 잡고 달려요', action: '고삐 잡고 가속', x: -5.5, z: 4.5, color: '#e99675', seats: 6 },
  { id: 'wheel', name: 'Giant Wheel', subtitle: '관람차 · 하늘에서 손 흔들기', action: '친구에게 손 흔들기', x: -5.5, z: -4.5, color: '#a4a1d4', seats: 8 },
  { id: 'skyscreamer', name: 'SkyScreamer', subtitle: '회전그네 · 더 높이 날아요', action: '더 높이 날기', x: 5.5, z: -4.5, color: '#e9bd60', seats: 6 },
  { id: 'teacups', name: 'Enchanted Teacups', subtitle: '회전 찻잔 · 친구와 핸들 돌리기', action: '찻잔 핸들 돌리기', x: 5.5, z: 4.5, color: '#76b5ad', seats: 8 },
]
export type Outfit = { shirt: string; pants: string; skin: string; hair: string; style: number; hat: boolean }
export type ParkPlayer = { id: string; nickname: string; outfit: Outfit; x: number; y: number; z: number; yaw: number; moving: boolean; ride: RideId | null; seat: number; wave: number; jump: number }
export type RideState = { angles: number[]; speeds: number[]; cupAngles: number[]; cupSpeeds: number[]; lift: number; time: number }
export type ParkSnapshot = { type: 'state'; time: number; players: ParkPlayer[]; rides: RideState }
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
export const initialRides = (): RideState => ({ angles: [0, 0, 0, 0], speeds: [.22, .14, .35, .2], cupAngles: [0, 0, 0, 0], cupSpeeds: [.2, .2, .2, .2], lift: 3.2, time: 0 })
export function cupPose(cup: number, state: RideState) { const angle = state.angles[3]! + cup * Math.PI / 2; return { x: Math.sin(angle) * 2.05, z: Math.cos(angle) * 2.05, yaw: angle + state.cupAngles[cup]! } }
/** Identical seating transforms on the server and in the rendered ride. */
export function seatPose(ride: RideId, seat: number, state: RideState) {
  const r = RIDES.find(item => item.id === ride)!
  let x = 0, y = 0, z = 0, yaw = 0
  if (ride === 'carousel') { const angle = state.angles[0]! + seat * Math.PI / 3; x = Math.sin(angle) * 2.15; z = Math.cos(angle) * 2.15; y = 1.27 + Math.sin(state.time * 2.3 + seat) * .16; yaw = angle + Math.PI / 2 }
  if (ride === 'wheel') { const angle = state.angles[1]! + seat * Math.PI / 4; x = Math.sin(angle) * 3.4; y = 4.6 + Math.cos(angle) * 3.4 - .35; z = .35 }
  if (ride === 'skyscreamer') { const angle = state.angles[2]! + seat * Math.PI / 3; const lean = Math.min(.7, state.speeds[2]! * .4); const radius = 1.5 + Math.sin(lean) * 1.9; x = Math.sin(angle) * radius; z = Math.cos(angle) * radius; y = state.lift + 1.9 * (1 - Math.cos(lean)); yaw = angle + Math.PI / 2 }
  if (ride === 'teacups') { const cup = cupPose(Math.floor(seat / 2), state); const side = seat % 2 === 0 ? -1 : 1; x = cup.x + Math.cos(cup.yaw) * side * .46; z = cup.z - Math.sin(cup.yaw) * side * .46; y = .85; yaw = cup.yaw - side * Math.PI / 2 }
  return { x: r.x + x, y, z: r.z + z, yaw }
}
