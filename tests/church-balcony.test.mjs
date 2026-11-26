import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Matrix4, Vector3, Box3 } from 'three'
import { BALCONY_PEWS, BALCONY_WORSHIPPERS, BALCONY_SUPPORT, createBalconyCongregation } from '../src/church-balcony.ts'

test('every upper-gallery pew is filled, with worshippers seated inside its ends and facing forward', () => {
  assert.equal(BALCONY_WORSHIPPERS.filter(p => p.floor === 2).length, 296)
  assert.equal(BALCONY_WORSHIPPERS.filter(p => p.floor === 3).length, 206)
  assert.equal(new Set(BALCONY_WORSHIPPERS.map(p => p.id)).size, 502)
  for (const pew of BALCONY_PEWS) {
    const people = BALCONY_WORSHIPPERS.filter(p => p.pew === pew.id)
    assert.ok(people.length >= 3)
    for (const p of people) {
      const dx = p.x - pew.x, dz = p.z - pew.z, x = Math.cos(pew.yaw) * dx - Math.sin(pew.yaw) * dz
      assert.ok(Math.abs(x) + .35 < pew.width / 2)
      assert.ok(Math.abs(p.y + .43 - (pew.y + .61)) < 1e-6)
      assert.equal(p.yaw, pew.yaw + Math.PI)
      assert.ok(Math.abs(p.x) + .36 < BALCONY_SUPPORT.x - BALCONY_SUPPORT.radius)
    }
    for (let i = 1; i < people.length; i++) assert.ok(Math.hypot(people[i].x - people[i - 1].x, people[i].z - people[i - 1].z) >= .72)
  }
})

test('all 502 praying characters have complete heads, joined palms and feet above the balcony floor', () => {
  const root = createBalconyCongregation(), matrix = new Matrix4(), point = new Vector3(), handCenters = []
  let heads = 0, palms = 0, feet = 0
  for (const mesh of root.children) {
    assert.ok(mesh.isInstancedMesh); mesh.geometry.computeBoundingBox()
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix); assert.ok(matrix.elements.every(Number.isFinite))
      if (mesh.name === 'balcony-heads') heads++
      if (mesh.name === 'balcony-praying-palms') { palms++; handCenters.push(new Vector3().setFromMatrixPosition(matrix)) }
      if (mesh.name === 'balcony-feet') {
        feet++; point.setFromMatrixPosition(matrix)
        const p = BALCONY_WORSHIPPERS.reduce((best, candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y, candidate.z - point.z) < Math.hypot(best.x - point.x, best.y - point.y, best.z - point.z) ? candidate : best)
        const bounds = new Box3().copy(mesh.geometry.boundingBox).applyMatrix4(matrix)
        assert.ok(bounds.min.y > p.y - .18)
      }
    }
  }
  assert.equal(heads, 502); assert.equal(palms, 1004); assert.equal(feet, 1004)
  for (const hand of handCenters) assert.ok(handCenters.some(other => other !== hand && hand.distanceTo(other) < .07))
  assert.ok(root.children.length < 80)
  root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose() } })
})
