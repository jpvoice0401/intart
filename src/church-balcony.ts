import * as THREE from 'three'
import { GALLERIES, GALLERY_ARC, hallPoint } from './church-layout.ts'

export type BalconyPew = { id: string; floor: 2 | 3; x: number; y: number; z: number; width: number; yaw: number }
export const BALCONY_SUPPORT = { x: 27.5, radius: .24 }
export const BALCONY_PEWS: BalconyPew[] = []
for (const gallery of GALLERIES) for (let row = 0; row < gallery.rows; row++) {
  const rx = gallery.firstX + row * 1.8, rz = rx - 2, sectors = 18, step = GALLERY_ARC * 2 / sectors
  for (let bank = 0; bank < sectors; bank++) {
    const angle = -GALLERY_ARC + (bank + .5) * step, p = hallPoint(angle, rx, rz)
    const tangentLength = Math.hypot(rx * Math.cos(angle), rz * Math.sin(angle))
    BALCONY_PEWS.push({ id: `gallery-${gallery.floor}-${row}-${bank}`, floor: gallery.floor, ...p, y: gallery.y + .12 + row * .32, width: tangentLength * step - 1.25, yaw: Math.atan2(rz * Math.sin(angle), rx * Math.cos(angle)) })
  }
}
export const BALCONY_WORSHIPPERS = BALCONY_PEWS.flatMap(pew => {
  const count = Math.floor((pew.width - .28) / .72), spacing = Math.min(.82, (pew.width - .72) / Math.max(1, count - 1))
  return Array.from({ length: count }, (_, column) => {
    const localX = (column - (count - 1) / 2) * spacing, localZ = -.12
    return { id: `${pew.id}-${column}`, pew: pew.id, floor: pew.floor, x: pew.x + Math.cos(pew.yaw) * localX + Math.sin(pew.yaw) * localZ, y: pew.y + .18, z: pew.z - Math.sin(pew.yaw) * localX + Math.cos(pew.yaw) * localZ, yaw: pew.yaw + Math.PI }
  })
})

/** Decorative congregation: same seats in every client; no multiplayer slots consumed. */
export function createBalconyCongregation() {
  const root = new THREE.Group(); root.name = 'balcony-praying-congregation'; root.userData.count = BALCONY_WORSHIPPERS.length
  const geometries = { sphere: new THREE.SphereGeometry(1, 12, 8), box: new THREE.BoxGeometry(1, 1, 1), cylinder: new THREE.CylinderGeometry(1, 1, 1, 12), hair: new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * .48) }
  const batches = new Map<string, { kind: keyof typeof geometries; color: string; feature: string; matrices: THREE.Matrix4[] }>()
  const origin = new THREE.Matrix4(), local = new THREE.Matrix4(), head = new THREE.Matrix4(), result = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), axis = new THREE.Vector3(0, 1, 0)
  const shirts = ['#9caec0', '#bfa294', '#b0a0bf', '#98ae9b', '#c7b58c', '#b58f9e'], pants = ['#616b7d', '#867a71', '#676478', '#a29a86'], skins = ['#f0c9ac', '#dfb08d', '#d6a180', '#b88263'], hairs = ['#332d2d', '#65503e', '#5a4540', '#867a70']
  function add(kind: keyof typeof geometries, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, feature = 'body', transform = origin) {
    local.compose(p.set(x, y, z), q.identity(), s.set(sx, sy, sz)); result.multiplyMatrices(transform, local)
    const key = `${kind}:${color}:${feature}`
    if (!batches.has(key)) batches.set(key, { kind, color, feature, matrices: [] })
    batches.get(key)!.matrices.push(result.clone())
  }
  const from = new THREE.Vector3(), to = new THREE.Vector3(), direction = new THREE.Vector3()
  function sleeve(color: string, a: number[], b: number[], radius: number) {
    from.fromArray(a); to.fromArray(b); direction.copy(to).sub(from)
    local.compose(p.copy(from).add(to).multiplyScalar(.5), q.setFromUnitVectors(axis, direction.clone().normalize()), s.set(radius, direction.length(), radius))
    result.multiplyMatrices(origin, local)
    const key = `cylinder:${color}:sleeves`
    if (!batches.has(key)) batches.set(key, { kind: 'cylinder', color, feature: 'sleeves', matrices: [] })
    batches.get(key)!.matrices.push(result.clone())
  }
  for (const [i, person] of BALCONY_WORSHIPPERS.entries()) {
    origin.compose(p.set(person.x, person.y, person.z), q.setFromAxisAngle(axis, person.yaw), s.set(1, 1, 1))
    const shirt = shirts[i % shirts.length]!, trouser = pants[Math.floor(i / 3) % pants.length]!, skin = skins[i % skins.length]!, hair = hairs[Math.floor(i / 5) % hairs.length]!
    add('sphere', shirt, 0, .67, 0, .265, .29, .22)
    add('box', trouser, 0, .46, .12, .45, .14, .42)
    for (const side of [-1, 1]) {
      add('sphere', trouser, side * .14, .28, .24, .11, .18, .12)
      add('sphere', '#423e3c', side * .14, .12, .29, .12, .095, .18, 'feet')
      sleeve(shirt, [side * .24, .78, 0], [side * .28, .61, .18], .09)
      add('sphere', shirt, side * .28, .61, .18, .09, .09, .09)
      sleeve(shirt, [side * .28, .61, .18], [side * .035, .78, .36], .073)
      add('sphere', skin, side * .033, .84, .37, .035, .09, .052, 'praying-palms')
    }
    if (i % 3 === 0) for (const side of [-1, 1]) add('box', '#ede4d2', side * .13, .72, .21, .045, .25, .024)
    else add('box', '#e6dbc8', 0, .77, .215, .045, .1, .02)
    // Bow the complete head, including every facial feature, as one transform.
    local.compose(p.set(0, 1.14, .035), q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), .24 + i % 4 * .025), s.set(1, 1, 1)); head.multiplyMatrices(origin, local)
    add('sphere', skin, 0, 0, 0, .33, .34, .29, 'heads', head)
    add('hair', hair, 0, .025, -.015, .342, .345, .3, 'hair', head)
    for (let fringe = 0; fringe < 4; fringe++) add('sphere', hair, -.21 + fringe * .14, .247 - fringe * .012, .205, .095, .07, .065, 'hair', head)
    for (const side of [-1, 1]) {
      add('sphere', skin, side * .325, -.015, 0, .06, .085, .06, 'ears', head)
      add('sphere', '#55403a', side * .105, .005, .275, .053, .009, .017, 'closed-eyes', head)
      add('sphere', '#dc9f90', side * .2, -.09, .224, .048, .024, .014, 'cheeks', head)
      if (i % 4 === 0) add('sphere', hair, side * .265, -.07, -.11, .105, .18, .13, 'hair', head)
    }
    add('sphere', skin, 0, -.06, .285, .032, .037, .033, 'nose', head)
    add('sphere', '#996558', 0, -.14, .265, .042, .008, .014, 'mouth', head)
  }
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometries[batch.kind], new THREE.MeshStandardMaterial({ color: batch.color, roughness: .85 }), batch.matrices.length)
    mesh.name = `balcony-${batch.feature}`; batch.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix)); mesh.castShadow = ['body', 'heads', 'hair'].includes(batch.feature); mesh.receiveShadow = true; mesh.computeBoundingSphere(); root.add(mesh)
  }
  return root
}
