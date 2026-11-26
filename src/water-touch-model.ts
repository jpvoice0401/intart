export const FINGERTIPS = [4, 8, 12, 16, 20] as const

/** Object-fit: cover, shared by the mirrored camera shader and landmarks. */
export function cameraCover(width: number, height: number, videoWidth: number, videoHeight: number) {
  const aspect = width / height
  const cameraAspect = videoWidth / videoHeight
  return { x: Math.min(1, aspect / cameraAspect), y: Math.min(1, cameraAspect / aspect) }
}

export function landmarkToSurface(x: number, y: number, cover: { x: number; y: number }) {
  return { x: (0.5 - x) / cover.x + 0.5, y: (0.5 - y) / cover.y + 0.5 }
}

export interface WaterContact { id: string; x: number; y: number; sampledAt: number }
export interface FingerMotion extends WaterContact { speed: number; continuous: boolean }

/** Speed in screen heights/second, measured between input samples, not render frames. */
export function measureFingerMotion(point: WaterContact, previous: FingerMotion | undefined, aspect: number): FingerMotion {
  if (!previous) return { ...point, speed: 0, continuous: false }
  const elapsed = point.sampledAt - previous.sampledAt
  if (elapsed <= 0) return previous
  const distance = Math.hypot((point.x - previous.x) * aspect, point.y - previous.y)
  // A long tracking gap or a landmark teleport is a new touch, not a powerful swipe.
  if (elapsed > .2 || distance > .55) return { ...point, speed: 0, continuous: false }
  const blend = 1 - Math.exp(-elapsed / .035)
  const speed = previous.speed + (distance / elapsed - previous.speed) * blend
  return { ...point, speed, continuous: true }
}

export function fingerWaveResponse(speed: number, sampleAge: number) {
  // Suppress tracking jitter, then increase both amplitude and footprint on fast swipes.
  // Decay stale motion if frames stop arriving so a frozen hand cannot keep splashing.
  const freshSpeed = Math.max(0, speed) * Math.exp(-Math.max(0, sampleAge - .05) / .06)
  const power = Math.pow(Math.min(1, Math.max(0, freshSpeed - .045) / 2.8), 1.25)
  return { force: .8 * power, radius: .009 + .025 * Math.sqrt(power) }
}
