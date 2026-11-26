import type { GolfOutcome } from './golf-model.ts'

export const GOLF_REACTIONS = {
  rough: { text: '아잉~', file: 'golf-rough-aing.wav', displayMs: 2400 },
  fairway: { text: 'I love you~', file: 'golf-fairway-love.wav', displayMs: 2800 },
  good: { text: '너뿐이야~', file: 'golf-good-only-you.wav', displayMs: 2600 },
  hole: { text: '싸랑훼~', file: 'golf-hole-ssarang.wav', displayMs: 2800 },
} as const

export type GolfReactionOutcome = keyof typeof GOLF_REACTIONS

export function golfReaction(outcome: GolfOutcome) {
  return outcome in GOLF_REACTIONS ? GOLF_REACTIONS[outcome as GolfReactionOutcome] : null
}
