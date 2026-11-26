import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { CLAW_HOME, PLAY_FLOOR, fingerPose } from './claw-model.ts'

export function labelTexture(text: string, subtitle = '', color = '#54455f', background = '#ebdfd9') {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = background; ctx.fillRect(0, 0, 1024, 256)
  ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.font = '700 82px Arial'; ctx.fillText(text, 512, subtitle ? 124 : 158)
  if (subtitle) { ctx.font = '22px Arial'; ctx.fillText(subtitle, 512, 192) }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture
}

export function createMachine() {
  const root = new THREE.Group()
  const cream = new THREE.MeshPhysicalMaterial({ color: '#e8d7d0', metalness: .32, roughness: .28, clearcoat: 1, clearcoatRoughness: .2 })
  const lilac = new THREE.MeshPhysicalMaterial({ color: '#b6a4c2', metalness: .3, roughness: .3, clearcoat: .9 })
  const steel = new THREE.MeshStandardMaterial({ color: '#d8e1e4', metalness: .9, roughness: .19 })
  const dark = new THREE.MeshStandardMaterial({ color: '#31323e', roughness: .6 })
  const felt = new THREE.MeshStandardMaterial({ color: '#89869f', roughness: .98 })
  const glow = new THREE.MeshStandardMaterial({ color: '#fff3dc', emissive: '#fff0d8', emissiveIntensity: 2.3 })
  const glass = new THREE.MeshPhysicalMaterial({ color: '#c9e4ef', transparent: true, opacity: .055, roughness: .08, metalness: .1, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide })
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material, radius = .04) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 4, h / 4, d / 4)), material)
    mesh.position.set(x, y, z); mesh.castShadow = material !== glass && material !== glow; mesh.receiveShadow = material !== glass; root.add(mesh); return mesh
  }
  const panel = (text: string, sub: string, x: number, y: number, z: number, w: number, h: number, bg = '#ebdfd9', color = '#58465e') => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: labelTexture(text, sub, color, bg), roughness: .65 }))
    mesh.position.set(x, y, z); root.add(mesh); return mesh
  }
  box(0, .22, 0, 4.8, .35, 3.8, dark, .13)
  box(-2.3, 1.27, 0, .2, 2.1, 3.7, lilac); box(2.3, 1.27, 0, .2, 2.1, 3.7, lilac)
  box(0, 1.28, -1.78, 4.7, 2.1, .18, cream)
  box(-1.58, 1.05, 1.8, 1.64, 1.66, .2, cream); box(1.58, 1.05, 1.8, 1.64, 1.66, .2, cream)
  box(0, .34, 1.8, 1.6, .22, .2, cream)
  box(0, 1.55, 1.8, 1.6, .58, .2, cream)
  // An open, recessed collection bay in the middle of the lower cabinet.
  box(0, .84, 1.36, 1.45, .94, .08, dark)
  box(-.75, .86, 1.72, .09, 1, .42, steel); box(.75, .86, 1.72, .09, 1, .42, steel)
  box(0, 1.33, 1.74, 1.58, .09, .4, steel); box(0, .4, 1.94, 1.58, .1, .8, lilac)
  panel('YOUR NEW FRIEND', 'PICK UP HERE', 0, 1.57, 1.91, 1.32, .24)
  box(0, 1.91, 1.92, 4.75, .24, .64, lilac, .1)
  box(0, 2.15, 1.79, 4.7, .25, .23, cream)
  panel('CUDDLE CLUB', 'ONE TRY. A LITTLE MAGIC.', -1.2, .98, 1.91, 1.15, .42)
  panel('07', 'PLAY LAB', 1.5, .92, 1.91, .58, .5)
  // Tiny inset coin mechanism and real 3D controls.
  box(1.6, 1.48, 1.93, .34, .16, .045, steel, .02); box(1.6, 1.49, 1.96, .19, .025, .012, dark, .004)
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(.034, .034, .24, 16), steel); stick.position.set(-1.25, 2.14, 2.02); root.add(stick)
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.115, 24, 16), new THREE.MeshPhysicalMaterial({ color: '#796e91', roughness: .18, clearcoat: 1 })); ball.position.set(-1.25, 2.29, 2.02); ball.castShadow = true; root.add(ball)
  for (const [x, color] of [[.9, '#d593a8'], [1.35, '#9dbbb6']] as const) {
    const button = new THREE.Mesh(new THREE.CylinderGeometry(.14, .16, .075, 32), new THREE.MeshPhysicalMaterial({ color, roughness: .2, clearcoat: 1 })); button.position.set(x, 2.08, 2.04); root.add(button)
  }
  panel('READY TO PLAY', '', 0, 2.01, 2.25, 1.13, .14, '#353541', '#cce6d5')
  // Separate floor pieces surround the delivery chute.
  box(0, PLAY_FLOOR - .08, -.52, 4.4, .16, 2.42, felt)
  box(-1.44, PLAY_FLOOR - .08, 1.2, 1.55, .16, 1.04, felt); box(1.44, PLAY_FLOOR - .08, 1.2, 1.55, .16, 1.04, felt)
  box(0, PLAY_FLOOR - .4, 1.2, 1.32, .05, 1.04, dark)
  box(-.72, PLAY_FLOOR + .25, 1.2, .10, .5, 1.08, cream); box(.72, PLAY_FLOOR + .25, 1.2, .10, .5, 1.08, cream)
  box(0, PLAY_FLOOR + .25, .64, 1.5, .5, .10, cream)
  panel('PRIZE DROP', '', 0, PLAY_FLOOR + .23, .703, 1.18, .16, '#e8d7d0', '#8a738f')
  box(0, 4.33, -1.81, 4.65, 3.87, .10, lilac)
  panel('LITTLE THINGS', 'BIG HAPPY FEELINGS', 0, 5.28, -1.745, 2.9, .65, '#b6a4c2', '#eee3ed')
  for (const x of [-2.3, 2.3]) for (const z of [-1.8, 1.8]) box(x, 4.38, z, .16, 4.12, .16, cream)
  for (const x of [-2.24, 2.24]) box(x, 4.4, 0, .035, 3.75, 3.45, glass, .005)
  box(0, 4.4, 1.8, 4.38, 3.75, .025, glass, .005)
  box(0, 6.42, 0, 4.88, .54, 3.9, cream, .12)
  box(0, 6.73, 0, 4.65, .13, 3.65, lilac)
  panel('CUDDLE CLUB', 'TAKE A LITTLE HAPPINESS HOME', 0, 6.43, 1.966, 4.12, .48)
  for (const x of [-2.12, 2.12]) box(x, 6.05, 0, .035, .045, 3.2, glow, .01)
  box(0, 6.13, 1.58, 4.2, .035, .04, glow, .01)
  const reflection = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .12, depthWrite: false })
  box(-1.98, 4.6, 1.82, .022, 2.8, .005, reflection, .001)
  box(2.0, 4.7, 1.82, .065, 2.6, .005, reflection, .001)
  const screw = new THREE.SphereGeometry(.025, 8, 6)
  for (const x of [-2.3, 2.3]) for (const y of [2.55, 6.13]) { const mesh = new THREE.Mesh(screw, steel); mesh.scale.z = .3; mesh.position.set(x, y, 1.89); root.add(mesh) }
  return { root, steel, dark }
}

export function createClawRig(root: THREE.Group, steel: THREE.Material, dark: THREE.Material) {
  const claw = new THREE.Group(), carriage = new THREE.Group(); root.add(claw, carriage)
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12), sphere = new THREE.SphereGeometry(1, 12, 8)
  function rod(parent: THREE.Group, radius: number) { const mesh = new THREE.Mesh(cylinder, steel); mesh.scale.set(radius, 1, radius); mesh.castShadow = true; parent.add(mesh); return mesh }
  function between(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, radius: number) {
    mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.scale.set(radius, a.distanceTo(b), radius)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
  }
  const cable = rod(root, .016), crossrail = rod(carriage, .043)
  between(crossrail, new THREE.Vector3(-2.1, 6.05, 0), new THREE.Vector3(2.1, 6.05, 0), .043)
  for (const x of [-2.02, 2.02]) { const rail = rod(root, .04); between(rail, new THREE.Vector3(x, 6.1, -1.55), new THREE.Vector3(x, 6.1, 1.55), .04) }
  const trolley = new THREE.Mesh(new RoundedBoxGeometry(.48, .18, .4, 2, .045), dark); trolley.position.y = 6.04; root.add(trolley)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(.18, .21, .25, 32), steel); hub.position.y = .06; claw.add(hub)
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(.11, .14, .13, 24), dark); motor.position.y = .25; claw.add(motor)
  const jointMeshes: THREE.Mesh[] = [], links: THREE.Mesh[][] = []
  for (let i = 0; i < 3; i++) {
    const joint = new THREE.Mesh(sphere, steel); joint.scale.setScalar(.052); claw.add(joint); jointMeshes.push(joint)
    links.push(Array.from({ length: 7 }, () => rod(claw, .025)))
  }
  const shadow = new THREE.Mesh(new THREE.RingGeometry(.29, .32, 48), new THREE.MeshBasicMaterial({ color: '#f7e7c2', transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; root.add(shadow)
  function update(x: number, y: number, z: number, open: number) {
    claw.position.set(x, y, z); carriage.position.z = z; trolley.position.x = x; trolley.position.z = z
    between(cable, new THREE.Vector3(x, y + .31, z), new THREE.Vector3(x, 5.98, z), .016)
    const pose = fingerPose(open)
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3 + Math.PI / 2
      const point = (r: number, py: number) => new THREE.Vector3(Math.cos(angle) * r, py, Math.sin(angle) * r)
      const a = point(pose.root.radius, pose.root.y), b = point(pose.joint.radius, pose.joint.y)
      jointMeshes[i]!.position.copy(b); between(links[i]![0]!, a, b, .029)
      for (let j = 0; j < 6; j++) {
        const sample = (t: number) => point(pose.joint.radius + (pose.tip.radius - pose.joint.radius) * t + Math.sin(t * Math.PI) * .025, pose.joint.y + (pose.tip.y - pose.joint.y) * t)
        between(links[i]![j + 1]!, sample(j / 6), sample((j + 1) / 6), .023)
      }
    }
    shadow.position.set(x, PLAY_FLOOR + .012, z); shadow.visible = y === CLAW_HOME
  }
  update(0, CLAW_HOME, 0, 1)
  return { update, claw }
}
