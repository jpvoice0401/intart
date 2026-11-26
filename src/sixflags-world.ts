import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { RIDES, cupPose, seatPose, type Outfit, type ParkPlayer, type RideState } from './sixflags-model.ts'

const materials = new Map<string, THREE.MeshStandardMaterial>()
function mat(color: string) {
  let result = materials.get(color)
  if (!result) { result = new THREE.MeshStandardMaterial({ color, roughness: .78 }); materials.set(color, result) }
  return result
}
function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, mat(color)); object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true; parent.add(object); return object
}
function box(parent: THREE.Object3D, w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, radius = .08) {
  return mesh(parent, new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 3, h / 3, d / 3)), color, x, y, z)
}
function ball(parent: THREE.Object3D, sx: number, sy: number, sz: number, color: string, x = 0, y = 0, z = 0) {
  const object = mesh(parent, new THREE.SphereGeometry(1, 20, 14), color, x, y, z); object.scale.set(sx, sy, sz); return object
}
function bar(parent: THREE.Object3D, a: number[], b: number[], radius: number, color: string) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.clone().sub(from)
  const object = mesh(parent, new THREE.CylinderGeometry(radius, radius, delta.length(), 12), color)
  object.position.copy(from.add(to).multiplyScalar(.5)); object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return object
}
export function textSprite(text: string, color = '#36534b', background = '#fffdf2', width = 2.2) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = background; ctx.beginPath(); ctx.roundRect(8, 14, 496, 96, 46); ctx.fill()
  ctx.font = '600 43px "Noto Sans KR", sans-serif'; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 64, 450)
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: texture, depthWrite: false })
  const sprite = new THREE.Sprite(material); sprite.scale.set(width, width / 4, 1); return sprite
}

export function createAvatar(outfit: Outfit, nickname: string, self = false) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body)
  const torso = ball(body, .29, .33, .23, outfit.shirt, 0, .61)
  if (outfit.style === 1) { box(body, .39, .28, .44, outfit.pants, 0, .48, .015); for (const x of [-.15, .15]) { box(body, .055, .32, .025, outfit.pants, x, .66, .224); ball(body, .025, .025, .015, '#f6db94', x, .64, .247) } }
  if (outfit.style === 2) for (let i = 0; i < 3; i++) box(body, .47, .035, .03, '#fff5dd', 0, .5 + i * .1, .219)
  torso.rotation.z = 0
  const legs: THREE.Group[] = [], arms: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * .14, .4, 0); body.add(leg)
    ball(leg, .12, .2, .13, outfit.pants, 0, -.17); box(leg, .25, .13, .34, '#fff6e9', 0, -.33, .045); box(leg, .25, .04, .34, '#d3c9b4', 0, -.385, .045); legs.push(leg)
    const arm = new THREE.Group(); arm.position.set(side * .27, .77, 0); body.add(arm)
    ball(arm, .12, .19, .12, outfit.shirt, side * .06, -.11); ball(arm, .105, .105, .105, outfit.skin, side * .1, -.27); arms.push(arm)
  }
  // Every feature intersects the head surface; there are no floating facial pieces.
  const eyes: THREE.Mesh[] = []
  ball(body, .4, .41, .36, outfit.skin, 0, 1.18)
  for (const side of [-1, 1]) {
    ball(body, .087, .12, .08, outfit.skin, side * .385, 1.17)
    eyes.push(ball(body, .043, .057, .027, '#322e33', side * .13, 1.21, .341))
    eyes.push(ball(body, .012, .016, .01, '#ffffff', side * .13 - .01, 1.23, .365))
    ball(body, .075, .038, .014, '#e5988d', side * .24, 1.1, .287)
  }
  ball(body, .047, .042, .043, outfit.skin, 0, 1.13, .354)
  const smile = new THREE.Mesh(new THREE.TorusGeometry(.065, .012, 8, 16, Math.PI), mat('#885048')); smile.position.set(0, 1.07, .338); smile.rotation.z = Math.PI; body.add(smile)
  const hair = mesh(body, new THREE.SphereGeometry(.415, 24, 16, 0, Math.PI * 2, 0, Math.PI * .48), outfit.hair, 0, 1.21); hair.scale.z = .9
  for (let i = 0; i < 4; i++) ball(body, .11, .09, .055, outfit.hair, -.24 + i * .15, 1.43 - i * .018, .265)
  if (outfit.hat) { const cap = mesh(body, new THREE.SphereGeometry(.43, 24, 12, 0, Math.PI * 2, 0, Math.PI * .35), outfit.shirt, 0, 1.24); cap.scale.z = .96; box(body, .55, .045, .3, outfit.shirt, 0, 1.44, .29); ball(body, .07, .07, .07, '#fff4d9', 0, 1.67) }
  const label = textSprite(nickname + (self ? ' · 나' : ''), self ? '#fffaf0' : '#36534b', self ? '#3d7769' : '#fffdf2', Math.max(1.4, Math.min(3, [...nickname].length * .14 + .65)))
  label.position.y = 2; root.add(label)
  if (self) { const ring = new THREE.Mesh(new THREE.RingGeometry(.47, .52, 32), new THREE.MeshBasicMaterial({ color: '#f7cc62', side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = .018; root.add(ring) }
  return { root, body, arms, legs, eyes, animate(player: ParkPlayer, time: number) {
    const walking = player.moving && !player.ride
    body.position.y = walking ? Math.abs(Math.sin(time * 11)) * .055 : 0
    for (let i = 0; i < 2; i++) { legs[i]!.rotation.x = player.ride ? -Math.PI / 2 : walking ? Math.sin(time * 11 + i * Math.PI) * .55 : 0; arms[i]!.rotation.x = player.ride ? -.65 : walking ? Math.sin(time * 11 + i * Math.PI + Math.PI) * .45 : .05 }
    body.rotation.z = player.ride === 'teacups' ? Math.sin(time * 3) * .05 : 0
    arms[1]!.rotation.z = player.wave > 0 ? -2.5 + Math.sin(time * 15) * .3 : 0
  } }
}

export function createPark(scene: THREE.Scene) {
  const world = new THREE.Group(); scene.add(world)
  box(world, 26, .7, 24, '#79a68a', 0, -.46, 0, .3)
  box(world, 25.8, .18, 23.8, '#c4d2a1', 0, -.08, 0, .2)
  box(world, 3.2, .04, 23.5, '#f0dfb8', 0, .025, 0)
  box(world, 25.5, .04, 2.8, '#f0dfb8', 0, .028, 0)
  mesh(world, new THREE.CylinderGeometry(2.8, 2.8, .04, 48), '#eee0be', 0, .04, 0)
  const horses: THREE.Group[] = [], gondolas: THREE.Group[] = [], flyingSeats: THREE.Group[] = [], cups: THREE.Group[] = []
  const carousel = new THREE.Group(), wheel = new THREE.Group(), towerTop = new THREE.Group(), teaFloor = new THREE.Group()
  const chains: THREE.Mesh[] = []
  for (const r of RIDES) {
    const group = new THREE.Group(); group.position.set(r.x, 0, r.z); world.add(group)
    box(group, 8.1, .075, 7.8, r.id === 'carousel' ? '#edd0b5' : r.id === 'wheel' ? '#d5cce5' : r.id === 'skyscreamer' ? '#ecddaf' : '#aed3c5', 0, .04, 0, .2)
    const sign = textSprite(r.name, '#476258', '#fff8e8', 2.6); sign.position.set(0, .55, 3.85); group.add(sign)
    if (r.id === 'carousel') {
      group.add(carousel)
      mesh(carousel, new THREE.CylinderGeometry(3.05, 3.2, .3, 64), '#e3ae6e', 0, .22)
      mesh(carousel, new THREE.CylinderGeometry(.5, .65, 3.5, 24), '#fff1d4', 0, 2)
      mesh(carousel, new THREE.CylinderGeometry(3.1, 3.1, .25, 48), '#e9aa87', 0, 3.85)
      const roof = new THREE.ConeGeometry(3.25, 1.35, 12)
      const roofMesh = new THREE.Mesh(roof, [mat('#e89c80'), mat('#fff0cf')]); roofMesh.position.y = 4.65; roofMesh.castShadow = true; carousel.add(roofMesh)
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; bar(carousel, [Math.sin(a) * 3.2, 4, Math.cos(a) * 3.2], [0, 5.32, 0], .045, '#fff0cf'); ball(carousel, .075, .075, .075, '#fff6c9', Math.sin(a) * 3.05, 3.75, Math.cos(a) * 3.05) }
      ball(carousel, .18, .23, .18, '#ddb968', 0, 5.45)
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3; bar(carousel, [Math.sin(a) * 2.15, .3, Math.cos(a) * 2.15], [Math.sin(a) * 2.15, 3.8, Math.cos(a) * 2.15], .035, '#d6ae68')
        const horse = new THREE.Group(); group.add(horse); horses.push(horse)
        const color = ['#fff0cf', '#b48865', '#d9c9b8'][i % 3]!
        ball(horse, .29, .31, .62, color, 0, -.27); ball(horse, .21, .4, .23, color, 0, .02, .4); ball(horse, .22, .19, .36, color, 0, .24, .54)
        for (const side of [-1, 1]) { ball(horse, .065, .17, .07, color, side * .12, .47, .43); ball(horse, .035, .035, .025, '#473f38', side * .19, .27, .63); for (const z of [-.36, .36]) { bar(horse, [side * .19, -.4, z], [side * .22, -.85, z + .13], .075, color); ball(horse, .1, .09, .12, '#73665c', side * .22, -.85, z + .13) } }
        box(horse, .55, .09, .45, '#a8787d', 0, .015, -.08); ball(horse, .13, .25, .13, '#8b7161', 0, .04, .24); bar(horse, [0, -.2, -.55], [0, -.55, -.72], .075, '#8b7161')
      }
    }
    if (r.id === 'wheel') {
      for (const z of [-.6, .6]) { bar(group, [-2.5, .1, z], [0, 4.6, z], .13, '#f6efd9'); bar(group, [2.5, .1, z], [0, 4.6, z], .13, '#f6efd9') }
      wheel.position.y = 4.6; group.add(wheel)
      for (const z of [-.28, .28]) { mesh(wheel, new THREE.TorusGeometry(3.4, .09, 10, 80), '#a292ca', 0, 0, z); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; bar(wheel, [0, 0, z], [Math.sin(a) * 3.4, Math.cos(a) * 3.4, z], .045, '#f8edcd') } }
      mesh(group, new THREE.CylinderGeometry(.38, .38, .9, 24), '#e7c77e', 0, 4.6).rotation.x = Math.PI / 2
      for (let i = 0; i < 8; i++) {
        const car = new THREE.Group(); group.add(car); gondolas.push(car)
        const color = ['#e6a07f', '#a3b7c9', '#a9bb85', '#c6a3c5'][i % 4]!
        box(car, 1.05, .45, .9, color, 0, -.15, .35); box(car, 1.08, .1, .94, '#fff1d6', 0, -.4, .35)
        for (const x of [-.45, .45]) bar(car, [x, 0, .35], [x, 1.45, .35], .035, '#f9efda')
        box(car, 1.2, .14, 1.05, color, 0, 1.45, .35); bar(car, [-.46, .35, .78], [.46, .35, .78], .035, '#f9efda')
      }
    }
    if (r.id === 'skyscreamer') {
      mesh(group, new THREE.CylinderGeometry(.55, .85, .4, 16), '#e7b45d', 0, .25)
      for (const side of [-1, 1]) for (const z of [-.3, .3]) bar(group, [side * .3, .2, z], [side * .3, 8, z], .055, '#dfa65b')
      for (let h = .3; h < 7.8; h += .65) { bar(group, [-.3, h, .3], [.3, h + .65, .3], .028, '#f7e6b7'); bar(group, [-.3, h, -.3], [.3, h + .65, -.3], .028, '#f7e6b7') }
      group.add(towerTop)
      const crown = new THREE.Shape()
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6, radius = i % 2 === 0 ? 1.95 : .75
        const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius
        if (i === 0) crown.moveTo(x, z); else crown.lineTo(x, z)
      }
      crown.closePath()
      const crownMesh = mesh(towerTop, new THREE.ExtrudeGeometry(crown, { depth: .15, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 1 }), '#e3b75a')
      crownMesh.rotation.x = -Math.PI / 2
      for (let i = 0; i < 6; i++) { const angle = i * Math.PI / 3; bar(towerTop, [0, .55, 0], [Math.sin(angle) * 1.85, .15, Math.cos(angle) * 1.85], .035, '#fff0d4'); ball(towerTop, .09, .09, .09, '#fff4cc', Math.sin(angle) * 1.85, .17, Math.cos(angle) * 1.85) }
      const star = textSprite('✦', '#f8e4ac', '#c59c5000', 1); star.position.y = 8.4; group.add(star)
      for (let i = 0; i < 6; i++) {
        const seat = new THREE.Group(); group.add(seat); flyingSeats.push(seat)
        box(seat, .85, .12, .64, '#eeb371'); box(seat, .85, .55, .12, '#eeb371', 0, .25, -.28)
        for (const side of [-1, 1]) { bar(seat, [side * .38, 0, .2], [side * .38, .45, .2], .035, '#fff0d4'); chains.push(bar(group, [0, 0, 0], [0, 1, 0], .018, '#b9a98a')) }
        bar(seat, [-.38, .45, .2], [.38, .45, .2], .035, '#fff0d4')
      }
    }
    if (r.id === 'teacups') {
      group.add(teaFloor); mesh(teaFloor, new THREE.CylinderGeometry(3.3, 3.4, .22, 64), '#85b9ab', 0, .2)
      for (let i = 0; i < 4; i++) {
        const cup = new THREE.Group(); group.add(cup); cups.push(cup)
        const color = ['#dea7ba', '#a8b9d4', '#e6be74', '#afc68e'][i]!
        mesh(cup, new THREE.CylinderGeometry(1, .75, .12, 40), '#fff0d5', 0, .18)
        const profile = [new THREE.Vector2(.68, .22), new THREE.Vector2(.9, .4), new THREE.Vector2(.98, 1), new THREE.Vector2(.91, 1), new THREE.Vector2(.82, .43), new THREE.Vector2(.64, .3)]
        mesh(cup, new THREE.LatheGeometry(profile, 40), color)
        mesh(cup, new THREE.TorusGeometry(.95, .05, 8, 40), '#fff0d5', 0, 1).rotation.x = Math.PI / 2
        mesh(cup, new THREE.TorusGeometry(.35, .07, 8, 24), color, 1.05, .68).rotation.y = Math.PI / 2
        mesh(cup, new THREE.CylinderGeometry(.25, .25, .07, 20), '#fff2d4', 0, .9); bar(cup, [0, .3, 0], [0, .9, 0], .05, '#e8d7b3')
        for (const side of [-1, 1]) box(cup, .36, .12, .6, '#fff1d6', side * .46, .8)
      }
      ball(group, .48, .52, .48, '#f2e1bd', 0, .85); ball(group, .3, .08, .3, '#ddaa79', 0, 1.35); ball(group, .08, .1, .08, '#ddaa79', 0, 1.47)
      bar(group, [.25, 1, 0], [.65, 1.35, 0], .14, '#f2e1bd'); mesh(group, new THREE.TorusGeometry(.3, .08, 10, 24), '#f2e1bd', -.45, .95)
    }
  }
  // Border pickets, soft trees, and little benches give the park a miniature scale.
  for (let x = -12; x <= 12; x += 1) for (const z of [-11.5, 11.5]) {
    if (z > 0 && Math.abs(x) < 2) continue
    box(world, .12, .75, .13, '#fff2d5', x, .4, z); ball(world, .09, .09, .09, '#fff2d5', x, .8, z)
  }
  for (const z of [-11.5, 11.5]) { if (z < 0) bar(world, [-12, .52, z], [12, .52, z], .045, '#fff2d5'); else for (const side of [-1, 1]) bar(world, [side * 2, .52, z], [side * 12, .52, z], .045, '#fff2d5') }
  for (const x of [-12.4, 12.4]) { bar(world, [x, .52, -11.5], [x, .52, 11.5], .045, '#fff2d5'); for (let z = -11; z <= 11; z++) box(world, .13, .75, .12, '#fff2d5', x, .4, z) }
  for (const [x, z] of [[-10, -8.8], [10, -8.8], [-10, 8.8], [10, 8.8], [-10.7, 0], [10.7, 0], [-3, -9.2], [3, -9.2]]) {
    bar(world, [x!, 0, z!], [x!, 1.8, z!], .16, '#b08b65')
    ball(world, .95, 1.25, .9, '#80a884', x, 2.3, z); ball(world, .7, .85, .65, '#a6c28b', x! - .4, 2.6, z! + .2)
  }
  for (const x of [-3, 3]) {
    box(world, 1.8, .13, .7, '#c5946b', x, .55, 9.3); box(world, 1.8, .65, .12, '#c5946b', x, 1, 9.65)
    for (const dx of [-.6, .6]) box(world, .1, .6, .6, '#6e8e7b', x + dx, .28, 9.3)
  }
  for (let i = 0; i < 6; i++) {
    const x = -2.5 + i; bar(world, [x, 0, -10.3], [x, 3.8, -10.3], .035, '#faf2da')
    const flag = mesh(world, new THREE.PlaneGeometry(.55, .38), ['#e98c75', '#e9bc60', '#86b399', '#83b5c8', '#aa9bc9', '#dca3bb'][i]!, x + .29, 3.55, -10.3); (flag.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide
  }
  const welcome = textSprite('6flags · GREAT ADVENTURE', '#fff3d9', '#4c7f6b', 4.8); welcome.position.set(0, 2.6, -10.3); world.add(welcome)
  const up = new THREE.Vector3(0, 1, 0), from = new THREE.Vector3(), to = new THREE.Vector3(), delta = new THREE.Vector3()
  return { world, update(state: RideState) {
    carousel.rotation.y = state.angles[0]!; wheel.rotation.z = -state.angles[1]!; towerTop.rotation.y = state.angles[2]!; towerTop.position.y = state.lift + 1.9; teaFloor.rotation.y = state.angles[3]!
    for (const [id, objects] of [['carousel', horses], ['wheel', gondolas], ['skyscreamer', flyingSeats]] as const) objects.forEach((object, i) => {
      const pose = seatPose(id, i, state), ride = RIDES.find(r => r.id === id)!
      object.position.set(pose.x - ride.x, pose.y, pose.z - ride.z - (id === 'wheel' ? .35 : 0)); object.rotation.y = pose.yaw
      if (id === 'skyscreamer') for (let side = 0; side < 2; side++) {
        const angle = state.angles[2]! + i * Math.PI / 3, offset = side ? .38 : -.38
        from.set(Math.sin(angle) * 1.5 + Math.cos(pose.yaw) * offset, state.lift + 1.9, Math.cos(angle) * 1.5 - Math.sin(pose.yaw) * offset)
        to.set(object.position.x + Math.cos(pose.yaw) * offset, object.position.y + .35, object.position.z - Math.sin(pose.yaw) * offset)
        delta.copy(to).sub(from); const chain = chains[i * 2 + side]!; chain.position.copy(from).add(to).multiplyScalar(.5); chain.scale.y = delta.length(); chain.quaternion.setFromUnitVectors(up, delta.normalize())
      }
    })
    cups.forEach((cup, i) => { const pose = cupPose(i, state); cup.position.set(pose.x, 0, pose.z); cup.rotation.y = pose.yaw })
  } }
}

export function disposePark(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>(), textures = new Set<THREE.Texture>()
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite)) return
    if (object instanceof THREE.Mesh) geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      mats.add(material); const map = (material as THREE.MeshStandardMaterial).map; if (map) textures.add(map)
    }
  })
  geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); mats.forEach(m => m.dispose()); materials.clear()
}
