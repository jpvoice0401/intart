import * as THREE from 'three'

export const CHOIR_ROWS = Array.from({ length: 6 }, (_, row) => ({ x: -13.7, y: .4 + row * .4, z: -10.3 - row * 1.05, width: 4.9 }))
export const PIANO_POSITION = { x: -13.65, z: -8.85 }

export function choirSingingPose(time: number, member: number) {
  const phase = member * .71, syllable = .5 + .5 * Math.sin(time * 6.8 + phase)
  return { mouth: .009 + .058 * syllable ** 1.5, sway: Math.sin(time * 1.3 + phase) * .018, nod: Math.sin(time * 1.7 + phase) * .035, turn: Math.sin(time * .63 + phase) * .035, book: Math.sin(time * 1.3 + phase + .4) * .024 }
}

/** All six places on every choir bench are occupied, facing the congregation. */
export function createChoir() {
  const root = new THREE.Group(); root.name = 'choir-36-members'
  const geometries = { sphere: new THREE.SphereGeometry(1, 16, 12), box: new THREE.BoxGeometry(1, 1, 1), robe: new THREE.CylinderGeometry(.25, .35, .56, 16) }
  type Motion = 'fixed' | 'body' | 'head' | 'book'
  type Part = { base: THREE.Matrix4; member: number; motion: Motion }
  const batches = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; parts: Part[] }>()
  const members: { origin: THREE.Vector3; fixed: THREE.Matrix4; body: THREE.Matrix4; head: THREE.Matrix4; book: THREE.Matrix4; mouth: number }[] = []
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3()
  function part(kind: keyof typeof geometries, color: string, member: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, angle = 0) {
    const key = `${kind}:${color}`
    if (!batches.has(key)) batches.set(key, { geometry: geometries[kind], material: new THREE.MeshStandardMaterial({ color, roughness: .8 }), parts: [] })
    quaternion.setFromEuler(new THREE.Euler(angle, 0, 0))
    matrix.compose(position.set(x, y, z), quaternion, scale.set(sx, sy, sz))
    const motion: Motion = y >= 1 ? 'head' : y < .5 ? 'fixed' : (kind === 'sphere' && Math.abs(x) >= .235 && y < .9) || ['#4d6861', '#ffefcf'].includes(color) ? 'book' : 'body'
    batches.get(key)!.parts.push({ base: matrix.clone(), member, motion })
  }
  for (const [rowIndex, row] of CHOIR_ROWS.entries()) for (let column = 0; column < 6; column++) {
    const i = rowIndex * 6 + column, origin = new THREE.Vector3(row.x + (column - 2.5) * .79, row.y + .18, row.z + .09)
    members.push({ origin, fixed: new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z), body: new THREE.Matrix4(), head: new THREE.Matrix4(), book: new THREE.Matrix4(), mouth: .026 })
    const skin = ['#f0c9ac', '#deb393', '#e9bea0', '#c99776'][i % 4]!, hair = ['#362d2a', '#5c4233', '#514341', '#80766b'][i % 4]!
    const add = (kind: keyof typeof geometries, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, angle = 0) => part(kind, color, i, x, y, z, sx, sy, sz, angle)
    // Two-head proportions, seated robe, connected sleeves, hands and songbook.
    add('robe', '#f3eee2', 0, .68, 0, 1, 1, .75)
    add('box', '#e6dfcf', 0, .46, .16, .56, .16, .46)
    for (const side of [-1, 1]) {
      add('sphere', '#282f32', side * .16, .12, .24, .115, .1, .2)
      add('sphere', '#eee8db', side * .16, .28, .2, .13, .2, .14)
      add('box', '#77424b', side * .13, .76, .235, .13, .34, .035)
      add('box', '#ceab67', side * .13, .64, .257, .1, .025, .018)
      add('sphere', '#f3eee2', side * .275, .76, .12, .13, .22, .17, -.6)
      add('sphere', skin, side * .235, .65, .3, .075, .08, .075)
    }
    add('sphere', skin, 0, 1.15, 0, .33, .34, .295)
    // Back hair stays attached to the head; fringes and optional buns vary per member.
    add('sphere', hair, 0, 1.29, -.07, .335, .235, .27)
    for (let fringe = 0; fringe < 4; fringe++) add('sphere', hair, -.21 + fringe * .135, 1.38 - fringe * .015, .17, .09, .07, .08)
    if (i % 3 === 0) for (const side of [-1, 1]) add('sphere', hair, side * .27, 1.12, -.13, .12, .15, .13)
    for (const side of [-1, 1]) {
      add('sphere', skin, side * .32, 1.14, 0, .06, .085, .06)
      add('sphere', '#342d2a', side * .105, 1.17, .279, .027, .04, .02)
      add('sphere', '#ffffff', side * .105 - .006, 1.182, .295, .008, .01, .006)
      add('sphere', '#dc9b91', side * .2, 1.08, .23, .045, .022, .015)
    }
    add('sphere', skin, 0, 1.105, .287, .034, .03, .032)
    add('box', '#4d6861', 0, .67, .335, .43, .045, .29, -.3)
    for (const side of [-1, 1]) add('box', '#ffefcf', side * .108, .7, .335, .205, .022, .255, -.3)
  }
  const animatedBatches = [...batches.values()].map(batch => {
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.parts.length)
    mesh.name = 'choir-parts'
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh)
    return { mesh, parts: batch.parts }
  })
  const rotation = new THREE.Matrix4(), pivot = new THREE.Matrix4(), inversePivot = new THREE.Matrix4(), base = new THREE.Matrix4(), euler = new THREE.Euler()
  // Each singer has a curved lip, dark opening, teeth and tongue on the facial surface.
  // Batch the 36 faces into four meshes so the additional detail stays inexpensive.
  const segments = 32, verticesPerMouth = segments + 2, mouthPoint = new THREE.Vector3()
  const mouthLayers = [
    { name: 'lips', color: '#a46760', offset: .005 },
    { name: 'opening', color: '#44272b', offset: .009 },
    { name: 'teeth', color: '#f7e7d2', offset: .013 },
    { name: 'tongue', color: '#cf8580', offset: .013 },
  ].map(layer => {
    const geometry = new THREE.BufferGeometry(), positions = new THREE.BufferAttribute(new Float32Array(members.length * verticesPerMouth * 3), 3)
    positions.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute('position', positions)
    const indices: number[] = []
    for (let member = 0; member < members.length; member++) for (let i = 1; i <= segments; i++) { const start = member * verticesPerMouth; indices.push(start, start + i, start + i + 1) }
    geometry.setIndex(indices)
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: layer.color, roughness: .85 }))
    mesh.name = `choir-mouth-${layer.name}`; mesh.receiveShadow = true; mesh.frustumCulled = false; root.add(mesh)
    return { ...layer, geometry, positions }
  })
  function animateMouths() {
    for (const layer of mouthLayers) {
      members.forEach((member, index) => {
        let width = .067, height = member.mouth, centerY = 1.025
        if (layer.name === 'lips') { width += .008; height += .008 }
        if (layer.name === 'teeth') { width = .044; centerY += height * .59; height = height > .029 ? .006 : 0 }
        if (layer.name === 'tongue') { width = .036; centerY -= height * .58; height = height > .043 ? .008 : 0 }
        for (let vertex = 0; vertex < verticesPerMouth; vertex++) {
          const angle = (vertex - 1) / segments * Math.PI * 2
          const x = vertex === 0 ? 0 : Math.cos(angle) * width, y = centerY + (vertex === 0 ? 0 : Math.sin(angle) * height)
          const z = .295 * Math.sqrt(Math.max(0, 1 - (x / .33) ** 2 - ((y - 1.15) / .34) ** 2)) + layer.offset
          mouthPoint.set(x, y, z).applyMatrix4(member.head)
          layer.positions.setXYZ(index * verticesPerMouth + vertex, mouthPoint.x, mouthPoint.y, mouthPoint.z)
        }
      })
      layer.positions.needsUpdate = true; layer.geometry.computeVertexNormals()
    }
  }
  function around(x: number, y: number, z: number, rx: number, ry: number, rz: number) {
    return pivot.makeTranslation(x, y, z).multiply(rotation.makeRotationFromEuler(euler.set(rx, ry, rz))).multiply(inversePivot.makeTranslation(-x, -y, -z))
  }
  function animate(time: number) {
    members.forEach((member, i) => {
      const pose = choirSingingPose(time, i); member.mouth = pose.mouth
      member.body.copy(member.fixed).multiply(around(0, .46, 0, 0, 0, pose.sway))
      member.head.copy(member.body).multiply(around(0, .93, 0, pose.nod, pose.turn, 0))
      member.book.copy(member.body).multiply(around(0, .78, .12, pose.book, 0, 0))
    })
    for (const batch of animatedBatches) {
      batch.parts.forEach((part, i) => {
        const member = members[part.member]!
        base.copy(part.base)
        matrix.multiplyMatrices(member[part.motion], base)
        batch.mesh.setMatrixAt(i, matrix)
      })
      batch.mesh.instanceMatrix.needsUpdate = true
    }
    animateMouths()
  }
  animate(0)
  for (const { mesh } of animatedBatches) { mesh.computeBoundingSphere(); if (mesh.boundingSphere) mesh.boundingSphere.radius += .15 }
  return { root, animate }
}

export function createChoirPiano() {
  const root = new THREE.Group(); root.name = 'choir-grand-piano'; root.position.set(PIANO_POSITION.x, 0, PIANO_POSITION.z)
  const black = new THREE.MeshStandardMaterial({ color: '#171d20', roughness: .23, metalness: .2 }), ivory = new THREE.MeshStandardMaterial({ color: '#f3ecda', roughness: .45 }), gold = new THREE.MeshStandardMaterial({ color: '#bfa36a', metalness: .65, roughness: .3 })
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, material = black) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); return mesh
  }
  const outline = new THREE.Shape(); outline.moveTo(-.85, .55); outline.lineTo(.85, .55); outline.lineTo(.85, -.05); outline.bezierCurveTo(.85, -.7, .4, -.85, -.1, -.85); outline.bezierCurveTo(-.6, -.85, -.85, -.55, -.85, -.2); outline.closePath()
  const bodyGeometry = new THREE.ExtrudeGeometry(outline, { depth: .22, bevelEnabled: true, bevelThickness: .025, bevelSize: .025, bevelSegments: 2, curveSegments: 20 })
  bodyGeometry.rotateX(Math.PI / 2)
  const body = new THREE.Mesh(bodyGeometry, black); body.position.y = 1.12; body.castShadow = body.receiveShadow = true; root.add(body)
  // Raised lid, visibly supported, with the same curved grand-piano silhouette.
  const lidGeometry = new THREE.ShapeGeometry(outline, 20); lidGeometry.rotateX(Math.PI / 2)
  const lidMaterial = black.clone(); lidMaterial.side = THREE.DoubleSide
  const lid = new THREE.Mesh(lidGeometry, lidMaterial); lid.rotation.z = -.28; lid.position.set(0, 1.38, 0); lid.castShadow = true; root.add(lid)
  box(-.65, 1.32, -.2, .035, .55, .035, gold)
  for (const [x, z] of [[-.7, .4], [.7, .4], [.1, -.65]]) { box(x!, .45, z!, .1, .9, .1); box(x!, .055, z!, .14, .08, .17, gold) }
  box(0, 1.04, .68, 1.76, .13, .29)
  for (let key = 0; key < 28; key++) {
    const x = -.79 + key * .0585; box(x, 1.12, .69, .055, .035, .23, ivory)
    if ([0, 1, 3, 4, 5].includes(key % 7) && key < 27) box(x + .029, 1.15, .63, .033, .04, .12)
  }
  const musicStand = box(0, 1.32, .45, .65, .3, .025); musicStand.rotation.x = -.18
  for (const x of [-.12, 0, .12]) box(x, .14, .7, .065, .04, .16, gold)
  // Bench fits in the gap ahead of the choir, behind the first congregational pew.
  box(0, .5, 1.05, .7, .12, .35)
  for (const x of [-.27, .27]) for (const z of [.94, 1.16]) box(x, .23, z, .055, .46, .055)
  return root
}
