import * as THREE from 'three'

type Point = [number, number, number]
type Gesture = { left: Point; right: Point; leftElbow: Point; rightElbow: Point; head: number; bow: number }
const gestures: Gesture[] = [
  { left: [-.28, 1.16, .49], right: [.24, 1.27, .52], leftElbow: [-.56, .93, .15], rightElbow: [.55, 1.02, .16], head: -.05, bow: .02 },
  { left: [-.94, 1.94, .28], right: [.94, 1.94, .28], leftElbow: [-.76, 1.35, .09], rightElbow: [.76, 1.35, .09], head: .04, bow: -.035 },
  { left: [-.34, 1.2, .49], right: [.67, 1.94, .04], leftElbow: [-.57, 1.02, .12], rightElbow: [.82, 1.4, -.02], head: -.08, bow: .015 },
  { left: [-.12, 1.18, .55], right: [.13, 1.2, .55], leftElbow: [-.51, .95, .18], rightElbow: [.52, .98, .19], head: .06, bow: .04 },
  { left: [-.83, 1.58, .42], right: [.84, 1.7, .38], leftElbow: [-.67, 1.14, .16], rightElbow: [.68, 1.22, .12], head: -.035, bow: -.015 },
]
export const PASTOR_CYCLE_SECONDS = 22.5
export function pastorSpeechPose(time: number) {
  const syllable = Math.max(0, .54 + .32 * Math.sin(time * 10.5) + .2 * Math.sin(time * 17.3 + .7))
  const emphasis = .65 + .35 * (.5 + .5 * Math.sin(time * 1.35))
  return { opening: .007 + .073 * syllable ** 1.5 * emphasis, width: .105 + .012 * Math.sin(time * 6.1), centerY: -.215 - syllable * .012 }
}
export function pastorPose(time: number) {
  const phase = ((time % PASTOR_CYCLE_SECONDS) + PASTOR_CYCLE_SECONDS) % PASTOR_CYCLE_SECONDS / 4.5
  const index = Math.floor(phase), a = gestures[index]!, b = gestures[(index + 1) % gestures.length]!
  const progress = Math.max(0, Math.min(1, (phase - index - .38) / .62)), blend = progress * progress * (3 - 2 * progress)
  const point = (key: 'left' | 'right' | 'leftElbow' | 'rightElbow'): Point => a[key].map((value, i) => value + (b[key][i]! - value) * blend) as Point
  return { left: point('left'), right: point('right'), leftElbow: point('leftElbow'), rightElbow: point('rightElbow'), head: a.head + (b.head - a.head) * blend, bow: a.bow + (b.bow - a.bow) * blend }
}

/** Stylized 3D character based on the supplied robe, glasses, hair and gesture references. */
export function createPastor() {
  const root = new THREE.Group(); root.name = 'pastor'; root.position.set(0, .95, -10.95); root.scale.setScalar(1.25)
  const body = new THREE.Group(); root.add(body)
  const materials = new Map<string, THREE.MeshStandardMaterial>()
  function mat(color: string) { if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: color === '#978a74' ? .3 : .78, metalness: color === '#978a74' ? .65 : 0 })); return materials.get(color)! }
  const skin = '#dfb190', robe = '#f4f0e9', stole = '#20212a', hair = '#23242a'
  function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0) {
    const object = new THREE.Mesh(geometry, mat(color)); object.position.set(x, y, z); object.castShadow = object.receiveShadow = true; parent.add(object); return object
  }
  function ball(parent: THREE.Object3D, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
    const object = mesh(parent, new THREE.SphereGeometry(1, 20, 14), color, x, y, z); object.scale.set(sx, sy, sz); return object
  }
  function box(parent: THREE.Object3D, color: string, x: number, y: number, z: number, w: number, h: number, d: number) { return mesh(parent, new THREE.BoxGeometry(w, h, d), color, x, y, z) }
  for (const side of [-1, 1]) ball(root, '#292b30', side * .18, .09, .09, .15, .09, .23)
  const gown = mesh(body, new THREE.CylinderGeometry(.34, .49, .98, 32), robe, 0, .61); gown.scale.z = .7
  ball(body, robe, 0, .94, 0, .4, .25, .28)
  for (const side of [-1, 1]) {
    box(body, stole, side * .19, .67, .275, .18, .95, .055)
    box(body, '#9e3443', side * .315, .67, .236, .017, .94, .026)
    box(body, '#d1bd91', side * .19, .245, .308, .12, .018, .012)
    const collar = box(body, '#fffaf3', side * .085, 1.035, .29, .13, .17, .035); collar.rotation.z = side * .43
  }
  ball(body, '#8c4254', 0, .97, .325, .065, .075, .035)
  const tie = mesh(body, new THREE.ConeGeometry(.065, .26, 4), '#8c4254', 0, .82, .32); tie.rotation.z = Math.PI
  for (let i = 0; i < 5; i++) ball(body, '#bcb5ac', 0, .38 + i * .1, .347, .015, .015, .008)
  mesh(body, new THREE.CylinderGeometry(.13, .14, .2, 16), skin, 0, 1.11)

  const head = new THREE.Group(); head.position.y = 1.57; body.add(head)
  ball(head, skin, 0, 0, 0, .47, .48, .405)
  ball(head, '#e8b99a', 0, -.19, .06, .4, .28, .35)
  for (const side of [-1, 1]) {
    ball(head, skin, side * .455, -.015, -.005, .078, .115, .08)
    ball(head, '#bd8d77', side * .48, -.015, .048, .026, .063, .025)
    ball(head, '#ded0bc', side * .176, .005, .373, .11, .062, .025)
    ball(head, '#322e2d', side * .176, .006, .398, .036, .035, .017)
    ball(head, '#fff8e9', side * .176 - .009, .017, .413, .01, .01, .005)
    const brow = ball(head, '#3c3430', side * .177, .102, .378, .105, .024, .025); brow.rotation.z = side * -.08
    // Thin oval frames, bridge and temples touch the head and ears.
    const frame = mesh(head, new THREE.TorusGeometry(.127, .009, 8, 36), '#978a74', side * .177, .015, .414); frame.scale.y = .68
    box(head, '#978a74', side * .359, .02, .286, .012, .014, .27)
    ball(head, '#d39b86', side * .29, -.14, .32, .073, .035, .015)
  }
  box(head, '#978a74', 0, .037, .433, .105, .013, .015)
  ball(head, skin, 0, -.073, .405, .073, .095, .079)
  // Follow the outer cheek surface: the previous small sphere was buried inside it.
  function faceSurface(x: number, y: number) {
    const forehead = .405 * Math.sqrt(Math.max(0, 1 - (x / .47) ** 2 - (y / .48) ** 2))
    const cheek = .06 + .35 * Math.sqrt(Math.max(0, 1 - (x / .4) ** 2 - ((y + .19) / .28) ** 2))
    return Math.max(forehead, cheek)
  }
  function mouthPatch(name: string, color: string, offset: number) {
    const geometry = new THREE.CircleGeometry(1, 48)
    const patch = mesh(head, geometry, color); patch.name = name
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute
    positions.setUsage(THREE.DynamicDrawUsage)
    return { patch, update(width: number, height: number, centerY: number) {
      for (let i = 0; i < positions.count; i++) {
        const angle = (i - 1) / 48 * Math.PI * 2
        const x = i === 0 ? 0 : Math.cos(angle) * width, y = centerY + (i === 0 ? 0 : Math.sin(angle) * height)
        positions.setXYZ(i, x, y, faceSurface(x, y) + offset)
      }
      positions.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingSphere()
    } }
  }
  const lips = mouthPatch('pastor-mouth-lips', '#a35d57', .006), mouth = mouthPatch('pastor-mouth-opening', '#42282c', .01)
  const teeth = ball(head, '#f8e8d5', 0, 0, 0, .065, .009, .009); teeth.name = 'pastor-mouth-teeth'
  const tongue = ball(head, '#c57c78', 0, 0, 0, .045, .01, .008); tongue.name = 'pastor-mouth-tongue'
  const cap = mesh(head, new THREE.SphereGeometry(.482, 28, 18, 0, Math.PI * 2, 0, Math.PI * .47), hair, 0, .04, -.015); cap.scale.z = .86
  for (let i = 0; i < 6; i++) {
    const lock = ball(head, i % 2 ? '#292a30' : hair, -.31 + i * .116, .334 + Math.sin(i / 5 * Math.PI) * .085, .225, .135, .087, .11)
    lock.rotation.z = -.28
  }
  for (const side of [-1, 1]) ball(head, hair, side * .423, .116, -.01, .057, .19, .17)

  const up = new THREE.Vector3(0, 1, 0), front = new THREE.Vector3(0, 0, 1), delta = new THREE.Vector3()
  function connect(segment: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3) {
    delta.copy(to).sub(from); segment.position.copy(from).add(to).multiplyScalar(.5); segment.scale.y = delta.length(); segment.quaternion.setFromUnitVectors(up, delta.normalize())
  }
  const arms = [-1, 1].map(side => {
    const shoulder = new THREE.Vector3(side * .34, .99, 0), elbow = new THREE.Vector3(), wrist = new THREE.Vector3(), cuffEnd = new THREE.Vector3(), direction = new THREE.Vector3(), localDirection = new THREE.Vector3(), wristStart = new THREE.Vector3(), palmBase = new THREE.Vector3()
    const upper = mesh(body, new THREE.CylinderGeometry(.19, .17, 1, 20), robe), lower = mesh(body, new THREE.CylinderGeometry(.13, .19, 1, 24, 1, true), robe)
    upper.name = side < 0 ? 'left-upper-sleeve' : 'right-upper-sleeve'
    lower.name = side < 0 ? 'left-lower-sleeve' : 'right-lower-sleeve'
    const cuff = mesh(body, new THREE.TorusGeometry(.13, .012, 8, 24), '#e4dfd8'); cuff.name = side < 0 ? 'left-cuff' : 'right-cuff'
    const wristSkin = mesh(body, new THREE.CylinderGeometry(.065, .065, 1, 16), skin); wristSkin.name = side < 0 ? 'left-wrist' : 'right-wrist'
    const joint = ball(body, robe, 0, 0, 0, .19, .19, .19), shoulderJoint = ball(body, robe, shoulder.x, shoulder.y, shoulder.z, .2, .21, .2)
    shoulderJoint.name = side < 0 ? 'left-shoulder' : 'right-shoulder'
    const hand = new THREE.Group(); hand.name = side < 0 ? 'left-hand' : 'right-hand'; body.add(hand)
    ball(hand, skin, 0, .045, 0, .103, .125, .055)
    for (let finger = 0; finger < 4; finger++) {
      const length = [.13, .17, .16, .125][finger]!, x = (finger - 1.5) * .046
      const digit = ball(hand, skin, x, .13 + length / 2, 0, .027, length / 2 + .025, .03); digit.rotation.z = -(finger - 1.5) * .075
    }
    const thumb = ball(hand, skin, -side * .103, .03, .015, .04, .09, .04); thumb.rotation.z = side * .6
    hand.updateMatrixWorld(true)
    const handBounds = new THREE.Box3()
    for (const child of hand.children) if (child instanceof THREE.Mesh) {
      child.geometry.computeBoundingBox(); handBounds.union(child.geometry.boundingBox!.clone().applyMatrix4(child.matrix))
    }
    return { side, shoulder, elbow, wrist, cuffEnd, direction, localDirection, wristStart, palmBase, handBounds, inverseHand: new THREE.Quaternion(), upper, lower, cuff, wristSkin, joint, hand }
  })
  function animate(time: number) {
    const pose = pastorPose(time)
    body.rotation.x = pose.bow; body.rotation.z = Math.sin(time * .65) * .012
    head.rotation.y = pose.head; head.rotation.x = Math.sin(time * 1.15) * .025
    const speech = pastorSpeechPose(time)
    lips.update(speech.width + .009, speech.opening + .009, speech.centerY)
    mouth.update(speech.width, speech.opening, speech.centerY)
    teeth.visible = speech.opening > .023; tongue.visible = speech.opening > .04
    teeth.position.set(0, speech.centerY + speech.opening * .57, faceSurface(0, speech.centerY + speech.opening * .57) + .015)
    tongue.position.set(0, speech.centerY - speech.opening * .57, faceSurface(0, speech.centerY - speech.opening * .57) + .015)
    for (const arm of arms) {
      arm.elbow.fromArray(arm.side < 0 ? pose.leftElbow : pose.rightElbow)
      arm.wrist.fromArray(arm.side < 0 ? pose.left : pose.right)
      const lowerHand = Math.max(0, Math.min(1, (1.65 - arm.wrist.y) / .4))
      arm.hand.position.copy(arm.wrist); arm.hand.rotation.set(-.12, arm.side * -.16, -arm.side * (.15 + lowerHand * 1.1))
      // End the fabric before the entire rotated hand, not at its palm center.
      // The exposed wrist bridges the cuff to the palm, so no fingers emerge through cloth.
      arm.direction.copy(arm.wrist).sub(arm.elbow).normalize()
      arm.localDirection.copy(arm.direction).applyQuaternion(arm.inverseHand.copy(arm.hand.quaternion).invert())
      const d = arm.localDirection, min = arm.handBounds.min, max = arm.handBounds.max
      const backOfHand = d.x * (d.x >= 0 ? min.x : max.x) + d.y * (d.y >= 0 ? min.y : max.y) + d.z * (d.z >= 0 ? min.z : max.z)
      arm.cuffEnd.copy(arm.wrist).addScaledVector(arm.direction, backOfHand - .025)
      connect(arm.upper, arm.shoulder, arm.elbow); connect(arm.lower, arm.elbow, arm.cuffEnd); arm.joint.position.copy(arm.elbow)
      arm.cuff.position.copy(arm.cuffEnd); arm.cuff.quaternion.setFromUnitVectors(front, arm.direction)
      arm.wristStart.copy(arm.cuffEnd).addScaledVector(arm.direction, -.035)
      arm.palmBase.set(0, -.025, 0).applyQuaternion(arm.hand.quaternion).add(arm.wrist)
      connect(arm.wristSkin, arm.wristStart, arm.palmBase)
    }
  }
  animate(0)
  return { root, animate }
}
