import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Raycaster, Vector3 } from 'three'
import { createChoir, choirSingingPose } from '../src/church-furnishings.ts'

test('all 36 singers have visible articulated mouths in front of their faces', () => {
  const choir = createChoir(), opening = choir.root.getObjectByName('choir-mouth-opening')
  const ray = new Raycaster(), center = new Vector3(), normal = new Vector3(), from = new Vector3()
  const positions = opening.geometry.getAttribute('position'), normals = opening.geometry.getAttribute('normal')
  assert.equal(positions.count, 36 * 34)
  for (const name of ['lips', 'opening', 'teeth', 'tongue']) assert.ok(choir.root.getObjectByName(`choir-mouth-${name}`))
  for (const time of [0, .3, 1.4, 3.7, 8, 23]) {
    choir.animate(time); choir.root.updateMatrixWorld(true)
    for (let member = 0; member < 36; member++) {
      center.fromBufferAttribute(positions, member * 34); normal.fromBufferAttribute(normals, member * 34).normalize()
      assert.ok(Number.isFinite(center.length() + normal.length()))
      from.copy(center).addScaledVector(normal, .18); ray.set(from, normal.clone().negate()); ray.far = .25
      const hit = ray.intersectObject(choir.root, true)[0]
      assert.ok(hit?.object.name.startsWith('choir-mouth-'), `Singer ${member} mouth is obscured at ${time}`)
    }
  }
  for (let member = 0; member < 36; member++) {
    const sizes = Array.from({ length: 90 }, (_, i) => choirSingingPose(i / 30, member).mouth)
    assert.ok(Math.max(...sizes) - Math.min(...sizes) > .05)
  }
  choir.root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose() } })
})
