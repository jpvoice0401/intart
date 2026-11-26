export const SABRINA_DRESSES = [
  { name: '별빛 볼가운', color: 0xc5a0dc, trim: 0xe6c58b, cut: 'ball' },
  { name: '달빛 A라인', color: 0x93bde9, trim: 0xe1ebff, cut: 'aline' },
  { name: '장미 꽃잎 드레스', color: 0xe5a0bf, trim: 0xffd3a0, cut: 'petal' },
  { name: '에메랄드 머메이드', color: 0x82c7b3, trim: 0xe2d48b, cut: 'mermaid' },
  { name: '한밤의 벨벳 드레스', color: 0x7064a1, trim: 0xd0c0f2, cut: 'column' },
] as const

export const SABRINA_HAIR = [
  { name: '골든 블론드 웨이브', color: 0xe2bc70, length: 2.35, detail: 'waves' },
  { name: '샴페인 블론드 단발', color: 0xefd79e, length: 1.5, detail: 'bob' },
  { name: '허니 블론드 땋은 머리', color: 0xd9b66b, length: 1.36, detail: 'braid' },
  { name: '베이지 블론드 포니테일', color: 0xdbc48f, length: 1.28, detail: 'pony' },
  { name: '라이트 블론드 올림머리', color: 0xedcf8c, length: 1.25, detail: 'bun' },
] as const

export interface SabrinaLook { dress: number; hair: number }

/** Two independently shuffled orders, traversed diagonally to visit every
 * combination. Both indices advance, including between two full cycles. */
export class SabrinaLookDeck {
  private dresses: number[] = []
  private hair: number[] = []
  private index = 0
  private previous: SabrinaLook | null = null
  private random: () => number

  constructor(random = Math.random) { this.random = random }

  private order(size: number, previous: number | undefined) {
    const values = Array.from({ length: size }, (_, i) => i)
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1))
      ;[values[i], values[j]] = [values[j]!, values[i]!]
    }
    if (values[0] === previous) values.push(values.shift()!)
    return values
  }

  next(): SabrinaLook {
    const count = SABRINA_DRESSES.length
    if (!this.dresses.length || this.index >= count * SABRINA_HAIR.length) {
      this.dresses = this.order(count, this.previous?.dress)
      this.hair = this.order(SABRINA_HAIR.length, this.previous?.hair)
      this.index = 0
    }
    const column = this.index % count, row = Math.floor(this.index / count)
    this.previous = { dress: this.dresses[column]!, hair: this.hair[(column + row * 2) % this.hair.length]! }
    this.index++
    return this.previous
  }
}
