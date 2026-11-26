import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Group, Box3, Raycaster, Vector3 } from 'three'
import { createChurchArchitecture } from '../src/church-architecture.ts'
import { walkable, CHURCH_SEATS, standPosition, PEWS } from '../src/church-model.ts'
import { HALL_COLUMNS } from '../src/church-layout.ts'
import { findChurchPath } from '../src/church-navigation.ts'

test('the enlarged curved floor supports the new walkable edges but excludes rectangular corners', () => {
  const root = new Group(), roof = new Group(), back = new Group(), left = new Group(), right = new Group()
  root.add(roof, back, left, right); createChurchArchitecture(root, roof, back, left, right); root.updateMatrixWorld(true)
  const floor = root.getObjectByName('rounded-sanctuary-floor'), bounds = new Box3().setFromObject(floor)
  assert.ok(bounds.max.x - bounds.min.x > 55)
  assert.ok(bounds.max.z - bounds.min.z > 46)
  const ray = new Raycaster(), down = new Vector3(0, -1, 0)
  for (const [x, z] of [[25, 3], [-25, 3], [0, 27], [0, -7.8]]) {
    assert.ok(walkable(x, z)); ray.set(new Vector3(x, 2, z), down)
    assert.ok(Math.abs(ray.intersectObject(floor)[0].point.y) < .001)
    assert.ok(findChurchPath({ x: 0, z: 13 }, { x, z }))
  }
  for (const x of [-27, 27]) {
    assert.equal(walkable(x, 27), false); ray.set(new Vector3(x, 2, 27), down); assert.equal(ray.intersectObject(floor).length, 0)
  }
  for (const c of HALL_COLUMNS) assert.equal(walkable(c.x, c.z), false)
  const geometry = new Set(), materials = new Set()
  root.traverse(o => { if (o.geometry) geometry.add(o.geometry); if (o.material) materials.add(o.material); if (o.isInstancedMesh) o.dispose() })
  geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose())
})

test('fan seats face the chancel and each bank has a reachable standing aisle', () => {
  assert.ok(CHURCH_SEATS.length > 240)
  for (const pew of PEWS) {
    const seat = CHURCH_SEATS.find(s => s.pew === pew.id), stand = standPosition(seat)
    assert.ok(walkable(stand.x, stand.z), seat.id)
    assert.ok(findChurchPath({ x: 0, z: 13 }, stand), `Cannot reach ${seat.id}`)
    const facing = new Vector3(Math.sin(seat.yaw), 0, Math.cos(seat.yaw)), stage = new Vector3(-seat.x, 0, -12 - seat.z).normalize()
    assert.ok(facing.dot(stage) > .95)
  }
})
