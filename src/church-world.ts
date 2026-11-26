import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { PEWS, worshipPose, type ChurchPlayer } from './church-model.ts'
import { createAvatar, textSprite } from './sixflags-world.ts'
import { CHOIR_ROWS, createChoir, createChoirPiano } from './church-furnishings.ts'
import { createPastor } from './church-pastor.ts'
import { BALCONY_PEWS, createBalconyCongregation } from './church-balcony.ts'
import { createChurchDisplay } from './church-display.ts'
import { createChurchArchitecture } from './church-architecture.ts'

export function createChurchAvatar(player: ChurchPlayer, self: boolean) {
  const avatar = createAvatar(player.outfit, player.nickname, self)
  const closedEyes = new THREE.Group(); closedEyes.name = 'prayer-closed-eyes'; closedEyes.visible = false; avatar.body.add(closedEyes)
  const eyelidMaterial = new THREE.MeshStandardMaterial({ color: '#58403a', roughness: .85 })
  for (const side of [-1, 1]) {
    const points = Array.from({ length: 9 }, (_, i) => {
      const u = i / 4 - 1, x = side * .13 + u * .055, y = 1.205 - .012 * (1 - u * u)
      const z = .36 * Math.sqrt(1 - (x / .4) ** 2 - ((y - 1.18) / .41) ** 2) + .005
      return new THREE.Vector3(x, y, z)
    })
    closedEyes.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, .007, 6, false), eyelidMaterial))
  }
  const praying = new THREE.Group(); avatar.body.add(praying)
  const skin = new THREE.MeshStandardMaterial({ color: player.outfit.skin, roughness: .75 }), cloth = new THREE.MeshStandardMaterial({ color: player.outfit.shirt, roughness: .85 })
  const arms = [-1, 1].map(side => {
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(.09, .085, 1, 12), cloth), lower = new THREE.Mesh(new THREE.CylinderGeometry(.075, .07, 1, 12), cloth), palm = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), skin)
    palm.scale.set(.055, .095, .075); praying.add(upper, lower, palm)
    return { side, upper, lower, palm, shoulder: new THREE.Vector3(side * .28, .76, 0), elbow: new THREE.Vector3(side * .32, .57, .2) }
  })
  const up = new THREE.Vector3(0, 1, 0), delta = new THREE.Vector3()
  function connect(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) { delta.copy(b).sub(a); mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.scale.y = delta.length(); mesh.quaternion.setFromUnitVectors(up, delta.normalize()) }
  return { root: avatar.root, animate(p: ChurchPlayer, time: number) {
    const pose = worshipPose(p.activity, time - p.since)
    const eyesClosed = p.activity === 'pray'
    avatar.eyes.forEach(eye => { eye.visible = !eyesClosed }); closedEyes.visible = eyesClosed
    avatar.body.position.y = p.moving ? Math.abs(Math.sin(time * 10)) * .045 : 0
    avatar.body.rotation.x = pose.bow
    avatar.arms.forEach((arm, i) => { arm.visible = !pose.active; arm.rotation.x = p.seat ? -.4 : p.moving ? Math.sin(time * 10 + i * Math.PI) * .45 : 0 })
    avatar.legs.forEach((leg, i) => { leg.rotation.x = p.seat ? -Math.PI / 2 : p.moving ? Math.sin(time * 10 + i * Math.PI) * .55 : 0 })
    praying.visible = pose.active
    arms.forEach(arm => { const target = arm.side < 0 ? pose.left : pose.right; arm.palm.position.set(target.x, target.y, target.z); connect(arm.upper, arm.shoulder, arm.elbow); connect(arm.lower, arm.elbow, arm.palm.position) })
  } }
}

/** Reference: official DS-F02-01 and DS-F03-02 cube panoramas, inspected on 2026-11-05. */
export function createSanctuary() {
  const root = new THREE.Group(), roof = new THREE.Group(), back = new THREE.Group(), left = new THREE.Group(), right = new THREE.Group()
  root.add(roof, back, left, right)
  const pastor = createPastor(); root.add(pastor.root)
  const materials = new Map<string, THREE.MeshStandardMaterial>(), batches = new Map<string, { group: THREE.Group; kind: string; color: string; matrices: THREE.Matrix4[] }>()
  const geometries: Record<string, THREE.BufferGeometry> = { box: new THREE.BoxGeometry(1, 1, 1), cylinder: new THREE.CylinderGeometry(1, 1, 1, 16), sphere: new THREE.SphereGeometry(1, 12, 8) }
  const woodCanvas = document.createElement('canvas'); woodCanvas.width = 256; woodCanvas.height = 256
  const ctx = woodCanvas.getContext('2d')!; ctx.fillStyle = '#dfb574'; ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 180; i++) { const y = i * 1.47; ctx.strokeStyle = `rgba(107,62,26,${.025 + (i % 7) * .008})`; ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(70, y + Math.sin(i) * 4, 170, y - Math.cos(i) * 5, 256, y + 1); ctx.stroke() }
  const wood = new THREE.CanvasTexture(woodCanvas); wood.colorSpace = THREE.SRGBColorSpace; wood.wrapS = wood.wrapT = THREE.RepeatWrapping
  function material(color: string) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: color === '#a0a8ac' ? .3 : color === '#d49b52' ? .42 : .8, metalness: color === '#a0a8ac' ? .7 : 0, map: color === '#d49b52' ? wood : null, emissive: ['#fff0cf', '#b6edff'].includes(color) ? color : '#000000', emissiveIntensity: color === '#b6edff' ? 2 : .6 }))
    return materials.get(color)!
  }
  const position = new THREE.Vector3(), scale = new THREE.Vector3(), quaternion = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0)
  function part(kind: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, yaw = 0, group = root) {
    const key = `${group.uuid}:${kind}:${color}`
    if (!batches.has(key)) batches.set(key, { group, kind, color, matrices: [] })
    batches.get(key)!.matrices.push(new THREE.Matrix4().compose(position.set(x, y, z), quaternion.setFromAxisAngle(yAxis, yaw), scale.set(sx, sy, sz)))
  }
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, yaw = 0, group = root) => part('box', x, y, z, w, h, d, color, yaw, group)
  function pew(x: number, y: number, z: number, width: number, yaw = 0, books = true) {
    const local = (lx: number, ly: number, lz: number, w: number, h: number, d: number, color: string) => box(x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, y + ly, z - Math.sin(yaw) * lx + Math.cos(yaw) * lz, w, h, d, color, yaw)
    local(0, .48, 0, width, .13, .66, '#d49b52'); local(0, .57, -.035, width - .12, .08, .5, '#caa579'); local(0, .93, .27, width, .65, .12, '#d49b52'); local(0, 1.28, .27, width, .09, .16, '#d49b52')
    for (const side of [-1, 1]) { local(side * (width / 2 - .06), .56, 0, .12, 1.12, .74, '#d49b52'); local(side * (width / 2 - .06), 1.14, .24, .12, .28, .23, '#d49b52') }
    for (const lx of [-width * .3, width * .3]) local(lx, .23, 0, .12, .46, .56, '#a77b43')
    if (books) for (let i = 0; i < 5; i++) { const lx = (i - 2) * width / 5; local(lx, 1.27, .4, .35, .08, .25, '#8d6f42'); local(lx, 1.32, .4, .23, .04, .18, i % 2 ? '#f2e7cf' : '#748e83') }
  }
  createChurchArchitecture(root, roof, back, left, right)
  for (const p of PEWS) pew(p.x, 0, p.z, p.width, p.yaw)
  for (const p of BALCONY_PEWS) pew(p.x, p.y, p.z, p.width, p.yaw, false)
  root.add(createBalconyCongregation())
  box(0, 6.6, 21.45, 7, 3.2, .22, '#b09b7d', 0, back); box(0, 6.6, 21.3, 6.7, 2.9, .04, '#293336', 0, back)
  const rearDisplay = createChurchDisplay(6.7, 2.9)
  rearDisplay.position.set(0, 6.6, 21.27); rearDisplay.rotation.y = Math.PI; back.add(rearDisplay)
  // Raised red-carpet chancel, wide black screen, illuminated cross and pipe organs.
  box(0, .45, -12.8, 22, .9, 7.5, '#c2a079'); box(0, .925, -12.8, 22, .05, 7.5, '#973541')
  box(0, 1.2, -14.2, 16, .5, 4.6, '#b68e64'); box(0, 1.465, -14.2, 16, .03, 4.6, '#9b3c49')
  for (let i = 0; i < 4; i++) box(0, .12 + i * .22, -8.8 - i * .32, 3.2, .23, .42, '#c6af8e')
  box(0, 7, -17.4, 36, 14, .45, '#ae8771')
  for (let x = -16; x <= 16; x += 2) box(x, 8, -17.1, 1.9, 10, .2, Math.abs(x) < 4 ? '#b89179' : '#a9816a')
  box(0, 10.25, -16.94, 3.5, 5.5, .18, '#24515b')
  box(0, 10.25, -16.79, .39, 4.65, .14, '#b6edff'); box(0, 11, -16.79, 2.3, .38, .14, '#b6edff')
  box(0, 10.25, -16.67, .22, 4.5, .15, '#6a4836'); box(0, 11, -16.67, 2.15, .22, .15, '#6a4836')
  box(0, 6.8, -15.9, 12.4, 3.1, .45, '#bc9878'); box(0, 6.8, -15.62, 11.9, 2.65, .06, '#202c30')
  const stageDisplay = createChurchDisplay(11.9, 2.65)
  stageDisplay.position.set(0, 6.8, -15.58); root.add(stageDisplay)
  for (const side of [-1, 1]) {
    box(side * 11.2, 7.9, -16.5, 9.5, 6.4, .35, '#695344')
    for (let i = 0; i < 45; i++) {
      const x = side * (6.8 + i * .2), height = 2.4 + Math.abs(Math.sin(i * .21)) * 3.2
      part('cylinder', x, 5.6 + height / 2, -15.95, .065, height, .065, '#a0a8ac')
      box(x, 6, -15.83, .075, .1, .035, '#41423c')
    }
    box(side * 11.2, 5.5, -15.5, 9.8, .25, .75, '#be955c'); box(side * 11.2, 5.05, -15.44, 9.8, .65, .6, '#e6dccc')
  }
  for (const row of CHOIR_ROWS) { box(row.x, row.y / 2, row.z, row.width + .1, row.y, 1.05, '#bd9564'); pew(row.x, row.y, row.z, row.width, Math.PI, false) }
  const choir = createChoir(); root.add(choir.root, createChoirPiano())
  // Pulpits, hymn books, monitors, floral arrangements, and a grand piano.
  box(0, 1.5, -10, 1.5, 1.2, .7, '#ddcca9'); box(0, 2.12, -10, 1.9, .12, .9, '#f0e6d5')
  const emblem = textSprite('✝', '#97464b', '#e8d9b700', .7); emblem.position.set(0, 1.55, -9.6); root.add(emblem)
  for (const x of [-3, 3]) { box(x, 2.1, -13.9, .07, 1.2, .07, '#b3b5b4'); box(x, 2.7, -13.9, 1, .07, .6, '#d2dbd7') }
  for (const x of [-6, -3, 0, 3, 6]) { box(x, 1.8, -15.2, .7, .75, .7, '#bb987c'); box(x, 2.3, -15.45, .7, .8, .1, '#d1b597') }
  for (const x of [-9, -5, 5, 9]) box(x, 1.12, -9.8, .8, .36, .55, '#272c2d')
  for (const x of [-7, -3.5, 3.5, 7]) {
    box(x, 1.1, -10.8, 1.4, .3, .7, '#69815b')
    for (let i = 0; i < 18; i++) { const angle = i * 2.4, radius = .15 + i % 4 * .16; part('sphere', x + Math.cos(angle) * radius, 1.4 + Math.sin(i * 1.3) * .15, -10.8 + Math.sin(angle) * .28, .11, .1, .11, ['#e7cbd8', '#f1e4cc', '#bd7d99'][i % 3]!) }
  }
  for (const x of [-.5, .5]) { part('cylinder', x, 12.5, -10, .016, 5, .016, '#383d3c'); for (let i = 0; i < 5; i++) box(x, 10.6 - i * .35, -10, .55, .32, .45, '#283133') }
  for (const batch of batches.values()) {
    const object = new THREE.InstancedMesh(geometries[batch.kind]!, material(batch.color), batch.matrices.length)
    batch.matrices.forEach((matrix, i) => object.setMatrixAt(i, matrix)); object.castShadow = !['#fff0cf', '#b6edff'].includes(batch.color); object.receiveShadow = true; object.computeBoundingSphere(); batch.group.add(object)
  }
  return { root, roof, back, left, right, animate(time: number) { pastor.animate(time); choir.animate(time) } }
}

export async function loadChurchExterior() {
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}church/daeseongjeon.glb`)
  const bounds = new THREE.Box3().setFromObject(gltf.scene), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3())
  const wrapper = new THREE.Group(), factor = 28 / Math.max(size.x, size.z)
  gltf.scene.position.set(-center.x, -bounds.min.y, -center.z); wrapper.add(gltf.scene); wrapper.scale.setScalar(factor)
  gltf.scene.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true } })
  return wrapper
}

export function disposeChurch(root: THREE.Object3D) {
  const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>()
  root.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite) {
      if ('geometry' in object) geometry.add(object.geometry)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) { materials.add(material); for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value) }
      if (object instanceof THREE.InstancedMesh) object.dispose()
    }
  })
  geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose())
}
