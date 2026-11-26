import * as THREE from 'three'
import { FAN, GALLERIES, GALLERY_ARC, HALL, HALL_ARC, HALL_COLUMNS, hallPoint } from './church-layout.ts'

/** Elliptical horseshoe galleries and a shallow radial acoustic ceiling. */
export function createChurchArchitecture(root: THREE.Group, roof: THREE.Group, back: THREE.Group, left: THREE.Group, right: THREE.Group) {
  const materials = new Map<string, THREE.MeshStandardMaterial>()
  function material(color: string) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .74, side: THREE.DoubleSide, emissive: color === '#fff0cf' ? color : '#000000', emissiveIntensity: color === '#fff0cf' ? 1.5 : 0 }))
    return materials.get(color)!
  }
  const geometries = { box: new THREE.BoxGeometry(1, 1, 1), cylinder: new THREE.CylinderGeometry(1, 1, 1, 16) }
  const batches = new Map<string, { group: THREE.Group; kind: keyof typeof geometries; color: string; matrices: THREE.Matrix4[] }>()
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), axis = new THREE.Vector3(0, 1, 0)
  function part(kind: keyof typeof geometries, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, yaw = 0, group = root) {
    const key = `${group.uuid}:${kind}:${color}`
    if (!batches.has(key)) batches.set(key, { group, kind, color, matrices: [] })
    batches.get(key)!.matrices.push(new THREE.Matrix4().compose(p.set(x, y, z), q.setFromAxisAngle(axis, yaw), s.set(sx, sy, sz)))
  }
  function band(rx: number, rz: number, ix: number, iz: number, a: number, b: number, y: number, depth: number, color: string, group = root, centerZ = HALL.centerZ) {
    const shape = new THREE.Shape(), steps = Math.ceil((b - a) * 30)
    for (let i = 0; i <= steps; i++) { const angle = a + (b - a) * i / steps, x = rx * Math.sin(angle), z = centerZ + rz * Math.cos(angle); if (!i) shape.moveTo(x, -z); else shape.lineTo(x, -z) }
    if (ix > 0) for (let i = steps; i >= 0; i--) { const angle = a + (b - a) * i / steps; shape.lineTo(ix * Math.sin(angle), -(centerZ + iz * Math.cos(angle))) }
    shape.closePath()
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 }); geometry.rotateX(-Math.PI / 2)
    const mesh = new THREE.Mesh(geometry, material(color)); mesh.position.y = y; mesh.receiveShadow = true; group.add(mesh); return mesh
  }
  band(HALL.radiusX, HALL.radiusZ, 0, 0, -HALL_ARC, HALL_ARC, -.38, .38, '#bcb5a7').name = 'rounded-sanctuary-floor'
  // Radial aisles and two cross aisles follow the actual seating fan.
  for (let i = 0; i <= FAN.banks; i++) {
    const angle = -FAN.halfAngle + i * 2 * FAN.halfAngle / FAN.banks
    let end = 8
    while (end < 42) {
      const x = (end + .1) * Math.sin(angle), z = FAN.centerZ + (end + .1) * Math.cos(angle)
      if ((x / 27.4) ** 2 + ((z - HALL.centerZ) / 25.4) ** 2 > 1) break
      end += .1
    }
    const start = i % 2 ? FAN.firstRadius + 5.5 * FAN.rowSpacing : i === FAN.banks / 2 ? 4 : 6
    const middle = (end + start) / 2
    part('box', middle * Math.sin(angle), .018, FAN.centerZ + middle * Math.cos(angle), i === FAN.banks / 2 ? 1.25 : .82, .032, end - start, '#843c48', angle)
  }
  for (const row of FAN.crossRows) {
    const r = FAN.firstRadius + row * FAN.rowSpacing
    band(r + .55, r + .55, r - .55, r - .55, -FAN.halfAngle - .03, FAN.halfAngle + .03, .015, .025, '#843c48', root, FAN.centerZ)
  }
  // Curved perimeter replaces all three rectangular walls.
  for (const section of [{ a: -HALL_ARC, b: -.75, group: left }, { a: -.75, b: .75, group: back }, { a: .75, b: HALL_ARC, group: right }]) {
    band(28.15, 26.15, 27.8, 25.8, section.a, section.b, 0, HALL.eaveY, '#ded5c4', section.group)
    band(27.81, 25.81, 27.65, 25.65, section.a, section.b, .1, 1.25, '#9b784e', section.group)
    for (let angle = section.a + .06; angle < section.b; angle += .13) {
      const pt = hallPoint(angle, 27.64, 25.64), yaw = Math.atan2(25.64 * Math.sin(angle), 27.64 * Math.cos(angle))
      part('box', pt.x, 7, pt.z, .04, 12, .03, '#c8baa6', yaw, section.group)
    }
    // Glazed doors, exit signs and upper acoustic panels.
    for (let angle = section.a + .22; angle < section.b - .1; angle += .43) {
      const pt = hallPoint(angle, 27.57, 25.57), yaw = Math.atan2(25.57 * Math.sin(angle), 27.57 * Math.cos(angle))
      part('box', pt.x, 1.65, pt.z, 2.8, 3.3, .13, '#8d7658', yaw, section.group)
      const inset = hallPoint(angle, 27.46, 25.46)
      part('box', inset.x, 1.72, inset.z, 2.45, 2.95, .05, '#647e79', yaw, section.group)
      part('box', inset.x, 1.72, inset.z, .045, 3, .065, '#d4c5a7', yaw, section.group)
      part('box', inset.x, 3.55, inset.z, .64, .19, .08, '#b2d8bb', yaw, section.group)
      part('box', pt.x, 12.2, pt.z, 2.75, 1.75, .12, '#c1b39d', yaw, section.group)
    }
  }
  for (const gallery of GALLERIES) {
    const name = `gallery-${gallery.floor}`
    band(27.8, 25.8, gallery.innerX, gallery.innerZ, -GALLERY_ARC, GALLERY_ARC, gallery.y - .35, .35, '#b59468').name = `${name}-curved-deck`
    band(gallery.innerX + .2, gallery.innerZ + .2, gallery.innerX, gallery.innerZ, -GALLERY_ARC, GALLERY_ARC, gallery.y, 1.02, '#e8dfd0').name = `${name}-curved-fascia`
    band(gallery.innerX + .24, gallery.innerZ + .24, gallery.innerX - .035, gallery.innerZ - .035, -GALLERY_ARC, GALLERY_ARC, gallery.y + 1.02, .075, '#b38b58')
    for (let row = 0; row < gallery.rows; row++) {
      const innerX = gallery.firstX + row * 1.8 - .86
      band(27.75, 25.75, innerX, innerX - 2, -GALLERY_ARC, GALLERY_ARC, gallery.y + Math.max(0, row * .32 - .2), row ? .32 : .12, '#b69c78').name = `${name}-terrace-${row}`
    }
    for (let bank = 0; bank <= 18; bank++) {
      const angle = -GALLERY_ARC + bank * 2 * GALLERY_ARC / 18
      for (let row = 0; row < gallery.rows; row++) {
        const rx = gallery.firstX + row * 1.8, pt = hallPoint(angle, rx, rx - 2)
        part('box', pt.x, gallery.y + .14 + row * .32, pt.z, .72, .028, 1.75, '#873c49', angle)
      }
    }
    for (let angle = -GALLERY_ARC + .06; angle <= GALLERY_ARC; angle += .16) {
      const pt = hallPoint(angle, gallery.innerX + .8, gallery.innerZ + .8)
      part('cylinder', pt.x, gallery.y - .4, pt.z, .09, .045, .09, '#fff0cf')
      const panel = hallPoint(angle, gallery.innerX + .02, gallery.innerZ + .02)
      part('box', panel.x, gallery.y + .49, panel.z, .025, .94, .025, '#d1c5b2')
    }
  }
  // Slender circular columns support the overhang; upper columns sit behind the pews.
  for (const c of HALL_COLUMNS) {
    part('cylinder', c.x, 2.6, c.z, c.radius, 5.2, c.radius, '#eee7d8')
    part('cylinder', c.x, .14, c.z, .37, .28, .37, '#d8cbb5')
    part('cylinder', c.x, 4.99, c.z, .4, .22, .4, '#d8cbb5')
    const angle = Math.atan2(c.x / 21.1, (c.z - HALL.centerZ) / 19.1), pt = hallPoint(angle, 27.1, 25.1)
    part('cylinder', pt.x, 9.4, pt.z, .24, 8.4, .24, '#eee7d8')
    part('box', c.x, 4.5, c.z - .34, .4, .38, .23, '#303a3c')
  }
  // Stepped timber acoustic reflectors visible over the organs in the VR.
  for (let bay = -2; bay <= 2; bay++) for (let tier = 0; tier < 5; tier++) {
    const x = bay * 6, y = 14 - tier * .25, z = -16.3 + tier * .72
    part('box', x, y, z, 5.9, .18, .78, '#bf9c79', 0, roof)
    part('box', x, y - .16, z + .36, 5.9, .25, .08, '#9c7856', 0, roof)
    for (const offset of [-2, 0, 2]) part('cylinder', x + offset, y - .115, z, .08, .04, .08, '#fff0cf', 0, roof)
  }
  // Ceiling radius is clipped at the chancel wall; concentric bands stay inside it.
  function ceilingPoint(a: number, r: number) {
    const reach = Math.cos(a) < 0 ? Math.min(1, (HALL.centerZ - HALL.frontZ) / (-HALL.radiusZ * Math.cos(a))) : 1
    return new THREE.Vector3(HALL.radiusX * Math.sin(a) * r * reach, HALL.crownY - (HALL.crownY - HALL.eaveY) * r * r, HALL.centerZ + HALL.radiusZ * Math.cos(a) * r * reach)
  }
  const vertices: number[] = [], colors: number[] = [], indices: number[] = [], segments = 128, rings = 16
  for (let row = 0; row <= rings; row++) for (let col = 0; col <= segments; col++) {
    const point = ceilingPoint(col * Math.PI * 2 / segments, row / rings)
    vertices.push(...point.toArray())
    const color = new THREE.Color(row < 2 ? '#3b494d' : col % 2 ? '#626d6d' : '#697371'); colors.push(color.r, color.g, color.b)
    if (row < rings && col < segments) { const a = row * (segments + 1) + col, b = a + segments + 1; indices.push(a, b, a + 1, a + 1, b, b + 1) }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals()
  const ceiling = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, side: THREE.DoubleSide })); ceiling.name = 'radial-acoustic-ceiling'; roof.add(ceiling)
  const seams: THREE.Vector3[] = []
  for (let col = 0; col < 96; col++) for (let row = 2; row < 24; row++) {
    for (const r of [row / 24, (row + 1) / 24]) { const pt = ceilingPoint(col * Math.PI * 2 / 96, r); pt.y -= .035; seams.push(pt) }
  }
  roof.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seams), new THREE.LineBasicMaterial({ color: '#39494b' })))
  for (const r of [.13, .35, .6, .84, .98]) {
    const points = Array.from({ length: 129 }, (_, i) => { const pt = ceilingPoint(i * Math.PI * 2 / 128, r); pt.y -= .16; return pt })
    const ring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 192, .16, 6, true), material('#83918c')); roof.add(ring)
    const count = Math.round(24 + 100 * r)
    for (let i = 0; i < count; i++) {
      const pt = ceilingPoint(i * Math.PI * 2 / count, r)
      part('cylinder', pt.x, pt.y - .29, pt.z, .16, .16, .16, '#303e40', 0, roof)
      part('cylinder', pt.x, pt.y - .38, pt.z, .105, .025, .105, '#fff0cf', 0, roof)
    }
  }
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometries[batch.kind], material(batch.color), batch.matrices.length)
    batch.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix)); mesh.receiveShadow = true; mesh.castShadow = batch.color !== '#fff0cf'; mesh.computeBoundingSphere(); batch.group.add(mesh)
  }
}
