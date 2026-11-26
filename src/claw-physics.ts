import * as CANNON from 'cannon-es'

import { PLUSH_SPECS, plushParts, type PlushPart, type PlushSpec } from './claw-plush.ts'
import { PLAY_FLOOR, PRIZE_COUNT, type GrabTarget, type GripKind } from './claw-model.ts'

export type PlushActor = { id: number; spec: PlushSpec; scale: number; body: CANNON.Body; parts: PlushPart[]; won: boolean; delivering: boolean }
export class ClawPhysics {
  world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0), allowSleep: true })
  actors: PlushActor[] = []
  anchor = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, collisionFilterGroup: 0, collisionFilterMask: 0 })
  held: PlushActor | null = null
  delivery: PlushActor | null = null
  hatch: CANNON.Body
  private constraints: CANNON.Constraint[] = []
  private spheres = new Map<number, CANNON.Sphere>()
  private plushMaterial = new CANNON.Material('plush')
  private groundMaterial = new CANNON.Material('cabinet')

  constructor(count = PRIZE_COUNT, random = Math.random) {
    this.world.broadphase = new CANNON.SAPBroadphase(this.world)
    ;(this.world.solver as CANNON.GSSolver).iterations = 8
    this.world.defaultContactMaterial.friction = .45
    this.world.defaultContactMaterial.restitution = .02
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.plushMaterial, this.groundMaterial, { friction: .65, restitution: .015, contactEquationStiffness: 1e7, contactEquationRelaxation: 4 }))
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.plushMaterial, this.plushMaterial, { friction: .6, restitution: .015, contactEquationStiffness: 8e5, contactEquationRelaxation: 5 }))
    const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const body = new CANNON.Body({ mass: 0, material: this.groundMaterial, shape: new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)), position: new CANNON.Vec3(x, y, z), collisionFilterGroup: 1 })
      this.world.addBody(body); return body
    }
    // A real opening in the play deck leads into the lower cabinet.
    box(0, PLAY_FLOOR - .13, -.53, 4.5, .26, 2.42)
    box(-1.455, PLAY_FLOOR - .13, 1.2, 1.59, .26, 1.04)
    box(1.455, PLAY_FLOOR - .13, 1.2, 1.59, .26, 1.04)
    this.hatch = box(0, PLAY_FLOOR - .13, 1.2, 1.32, .26, 1.04)
    box(-2.23, 4.3, 0, .15, 4, 3.6); box(2.23, 4.3, 0, .15, 4, 3.6)
    box(0, 4.3, -1.73, 4.5, 4, .15); box(0, 4.3, 1.73, 4.5, 4, .15)
    box(-.72, PLAY_FLOOR + .26, 1.2, .12, .52, 1.08); box(.72, PLAY_FLOOR + .26, 1.2, .12, .52, 1.08)
    box(0, PLAY_FLOOR + .26, .64, 1.5, .52, .12)
    this.world.addBody(this.anchor)
    for (let i = 0; i < count; i++) {
      const spec = PLUSH_SPECS[i % PLUSH_SPECS.length]!, scale = .77 + random() * .08, parts = plushParts(spec)
      const body = new CANNON.Body({ mass: .22, material: this.plushMaterial, linearDamping: .48, angularDamping: .65, sleepSpeedLimit: .15, sleepTimeLimit: .8, collisionFilterGroup: 2, collisionFilterMask: 3 })
      for (const part of parts) {
        if (part.material === 'cream') continue
        const orientation = new CANNON.Quaternion(); orientation.setFromEuler(0, 0, part.angle ?? 0)
        const dimensions = part.scale.map(v => v * scale)
        const axis = dimensions.indexOf(Math.max(...dimensions)), radius = Math.min(...dimensions)
        const travel = dimensions[axis]! - radius
        const steps = travel < .02 ? 0 : Math.max(1, Math.ceil(travel * 2 / radius))
        const key = Math.round(radius * 1000)
        let sphere = this.spheres.get(key)
        if (!sphere) { sphere = new CANNON.Sphere(radius); this.spheres.set(key, sphere) }
        for (let segment = 0; segment <= steps; segment++) {
          const local = new CANNON.Vec3()
          if (steps) local[['x', 'y', 'z'][axis] as 'x' | 'y' | 'z'] = -travel + travel * 2 * segment / steps
          const offset = orientation.vmult(local)
          offset.x += part.at[0] * scale; offset.y += part.at[1] * scale; offset.z += part.at[2] * scale
          body.addShape(sphere, offset)
        }
      }
      const col = i % 8, row = Math.floor(i / 8) % 3, layer = Math.floor(i / 24)
      let x = -1.77 + col * .505 + (random() - .5) * .08, z = -.99 + row * .85 + (random() - .5) * .1
      if (Math.abs(x) < .96 && z > .45) z = -.2
      body.position.set(x, PLAY_FLOOR + .65 + layer * .85 + random() * .18, z)
      body.quaternion.setFromEuler((random() - .5) * 2.9, random() * Math.PI * 2, (random() - .5) * 2.8)
      this.world.addBody(body)
      this.actors.push({ id: i, spec, scale, body, parts, won: false, delivering: false })
    }
  }

  lowestPoint(actor: PlushActor) {
    let lowest = Infinity
    for (const part of actor.parts) {
      const center = actor.body.quaternion.vmult(new CANNON.Vec3(...part.at.map(v => v * actor.scale) as [number, number, number]))
      const local = new CANNON.Quaternion(); local.setFromEuler(0, 0, part.angle ?? 0)
      const q = actor.body.quaternion.mult(local)
      const ax = q.vmult(new CANNON.Vec3(1, 0, 0)), ay = q.vmult(new CANNON.Vec3(0, 1, 0)), az = q.vmult(new CANNON.Vec3(0, 0, 1))
      const radius = Math.hypot(ax.y * part.scale[0], ay.y * part.scale[1], az.y * part.scale[2]) * actor.scale
      lowest = Math.min(lowest, actor.body.position.y + center.y - radius)
    }
    return lowest
  }

  step(dt: number, claw?: { x: number; y: number; z: number }) {
    if (this.held && claw) {
      const target = new CANNON.Vec3(claw.x, claw.y - .56, claw.z)
      target.vsub(this.anchor.position, this.anchor.velocity); this.anchor.velocity.scale(1 / Math.max(dt, .001), this.anchor.velocity)
      this.anchor.quaternion.slerp(new CANNON.Quaternion(), 1 - Math.exp(-dt * 2), this.anchor.quaternion)
    } else this.anchor.velocity.setZero()
    this.world.step(dt)
    for (const actor of this.actors) {
      if (actor.won || actor.delivering || actor === this.held || actor.body.sleepState === CANNON.Body.SLEEPING) continue
      const bottom = this.lowestPoint(actor)
      if (bottom < PLAY_FLOOR + .006) {
        actor.body.position.y += PLAY_FLOOR + .006 - bottom
        actor.body.velocity.y = Math.max(0, actor.body.velocity.y); actor.body.aabbNeedsUpdate = true
      }
    }
  }

  probe(x: number, z: number): GrabTarget | null {
    let selected: GrabTarget | null = null, score = -Infinity
    for (const actor of this.actors) {
      if (actor.won || actor.delivering) continue
      const p = actor.body.position, distance = Math.hypot(x - p.x, z - p.z)
      if (distance > .48) continue
      const candidate = p.y - distance * .8
      if (candidate > score) {
        const up = actor.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0))
        selected = { id: actor.id, y: p.y, distance, tilt: Math.acos(Math.min(1, Math.abs(up.y))) }; score = candidate
      }
    }
    return selected
  }

  grab(target: GrabTarget, kind: GripKind) {
    const actor = this.actors.find(a => a.id === target.id)!
    this.held = actor; actor.body.wakeUp(); this.anchor.position.copy(actor.body.position); this.anchor.velocity.setZero()
    this.anchor.quaternion.copy(actor.body.quaternion)
    const pivots = kind === 'stable' ? [new CANNON.Vec3(-.09, 0, 0), new CANNON.Vec3(.09, 0, 0), new CANNON.Vec3(0, .09, .04)] : [new CANNON.Vec3(0, .14, 0)]
    for (const pivot of pivots) {
      const constraint = new CANNON.PointToPointConstraint(actor.body, pivot, this.anchor, pivot.clone(), 95)
      constraint.collideConnected = false; this.world.addConstraint(constraint); this.constraints.push(constraint)
    }
  }

  release(delivery: boolean) {
    this.constraints.forEach(c => this.world.removeConstraint(c)); this.constraints = []
    if (!this.held) return
    const actor = this.held; this.held = null; actor.body.wakeUp()
    if (delivery) {
      actor.delivering = true; actor.body.collisionFilterGroup = 4; actor.body.collisionFilterMask = 1
      this.delivery = actor; this.world.removeBody(this.hatch)
      actor.body.velocity.set(0, -.15, 0)
    } else { actor.body.velocity.x += .25; actor.body.angularVelocity.set(.8, .4, -.7) }
  }

  collect(actor: PlushActor) {
    actor.won = true; this.world.removeBody(actor.body)
    if (!this.world.bodies.includes(this.hatch)) this.world.addBody(this.hatch)
    this.delivery = null
  }

  dispose() { this.constraints.forEach(c => this.world.removeConstraint(c)); [...this.world.bodies].forEach(b => this.world.removeBody(b)); this.spheres.clear() }
}
