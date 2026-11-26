import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Box3, Vector3, Raycaster, Matrix4 } from 'three'
import { createPastor, pastorPose, pastorSpeechPose, PASTOR_CYCLE_SECONDS } from '../src/church-pastor.ts'

test('hands stay outside both sleeves and cuffs stay connected throughout every gesture', () => {
  const pastor = createPastor(), vertex = new Vector3(), local = new Vector3(), cuffPoint = new Vector3()
  const sleeves = ['left', 'right'].flatMap(side => ['upper', 'lower'].map(section => ({ mesh: pastor.root.getObjectByName(`${side}-${section}-sleeve`), inverse: new Matrix4() })))
  const hands = ['left', 'right'].map(side => pastor.root.getObjectByName(`${side}-hand`))
  for (let t = 0; t <= PASTOR_CYCLE_SECONDS; t += 1 / 30) {
    pastor.animate(t); pastor.root.updateMatrixWorld(true)
    for (const sleeve of sleeves) sleeve.inverse.copy(sleeve.mesh.matrixWorld).invert()
    for (const side of ['left', 'right']) {
      const lower = pastor.root.getObjectByName(`${side}-lower-sleeve`), cuff = pastor.root.getObjectByName(`${side}-cuff`)
      vertex.set(0, .5, 0).applyMatrix4(lower.matrixWorld); cuff.getWorldPosition(cuffPoint)
      assert.ok(vertex.distanceTo(cuffPoint) < 1e-6, 'Cuff must remain attached to sleeve')
    }
    for (const hand of hands) for (const mesh of hand.children) {
      const positions = mesh.geometry.getAttribute('position')
      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld)
        for (const sleeve of sleeves) {
          local.copy(vertex).applyMatrix4(sleeve.inverse)
          if (Math.abs(local.y) >= .5) continue
          const { radiusBottom, radiusTop } = sleeve.mesh.geometry.parameters
          const radius = radiusBottom + (radiusTop - radiusBottom) * (local.y + .5)
          assert.ok(Math.hypot(local.x, local.z) >= radius - .001, `${hand.name} intersects ${sleeve.mesh.name} at ${t.toFixed(3)}`)
        }
      }
    }
  }
  pastor.root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose() } })
})

test('speaking mouth stays visible in front of the cheek and keeps articulating', () => {
  const pastor = createPastor(), mouth = pastor.root.getObjectByName('pastor-mouth-opening'), head = mouth.parent, ray = new Raycaster()
  let smallest = Infinity, largest = 0
  for (let t = 0; t < 30; t += .07) {
    pastor.animate(t); pastor.root.updateMatrixWorld(true)
    const speech = pastorSpeechPose(t); smallest = Math.min(smallest, speech.opening); largest = Math.max(largest, speech.opening)
    const from = head.localToWorld(new Vector3(0, speech.centerY, 2)), to = head.localToWorld(new Vector3(0, speech.centerY, 0))
    ray.set(from, to.sub(from).normalize())
    const hit = ray.intersectObject(pastor.root, true)[0]
    assert.ok(hit?.object.name.startsWith('pastor-mouth'), 'Mouth must not be hidden behind the cheek')
  }
  assert.ok(smallest < .012 && largest > .065)
  pastor.root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose() } })
})

test('pastor gestures loop continuously and include the supplied raised-hands, ear and chest poses', () => {
  const raised = pastorPose(4.5), ear = pastorPose(9), chest = pastorPose(13.5)
  assert.ok(raised.left[1] > 1.8 && raised.right[1] > 1.8)
  assert.ok(ear.right[1] > 1.8 && ear.left[1] < 1.3)
  assert.ok(Math.abs(chest.left[0] - chest.right[0]) < .3)
  assert.deepEqual(pastorPose(0), pastorPose(PASTOR_CYCLE_SECONDS))
  let previous = pastorPose(0)
  for (let t = 1 / 60; t < PASTOR_CYCLE_SECONDS * 2; t += 1 / 60) {
    const next = pastorPose(t)
    for (const key of ['left', 'right', 'leftElbow', 'rightElbow']) assert.ok(Math.hypot(...next[key].map((v, i) => v - previous[key][i])) < .025)
    previous = next
  }
})

test('pastor model stays grounded, finite and behind the lectern throughout animation', () => {
  const pastor = createPastor(), left = pastor.root.getObjectByName('left-hand'), right = pastor.root.getObjectByName('right-hand')
  for (let t = 0; t <= PASTOR_CYCLE_SECONDS; t += .1) {
    pastor.animate(t); pastor.root.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(pastor.root), size = bounds.getSize(new Vector3())
    assert.ok(Number.isFinite(size.length())); assert.ok(bounds.min.y >= .949); assert.ok(size.x < 3.5 && size.y < 3.5)
    for (const hand of [left, right]) {
      const p = hand.getWorldPosition(new Vector3())
      assert.ok(p.y > 2.2, 'Hands clear the lectern top')
      assert.ok(p.z < -10.1, 'Hands remain behind the lectern front')
    }
  }
  pastor.root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose() } })
})
