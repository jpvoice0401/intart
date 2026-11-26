const ENGLISH_WORDS = ['snow', 'winter', 'flake', 'cozy', 'mittens', 'frost', 'cocoa', 'sled', 'angel', 'scarf', 'igloo', 'boots', 'snowball', 'sparkle', 'smile', 'cloud', 'frozen', 'magic', 'candy', 'moon']
const KOREAN_WORDS = ['눈사람', '겨울', '눈꽃', '장갑', '목도리', '썰매', '눈송이', '눈놀이', '고드름', '얼음', '하늘', '구름', '산타', '선물', '포근', '반짝', '미소', '별빛', '코코아', '눈썰매']
const INITIAL = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ']
const VOWEL = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ']
const FINAL = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ']
const COMPOUND: Record<string, string> = { 'ㅘ': 'ㅗㅏ', 'ㅙ': 'ㅗㅐ', 'ㅚ': 'ㅗㅣ', 'ㅝ': 'ㅜㅓ', 'ㅞ': 'ㅜㅔ', 'ㅟ': 'ㅜㅣ', 'ㅢ': 'ㅡㅣ', 'ㄳ': 'ㄱㅅ', 'ㄵ': 'ㄴㅈ', 'ㄶ': 'ㄴㅎ', 'ㄺ': 'ㄹㄱ', 'ㄻ': 'ㄹㅁ', 'ㄼ': 'ㄹㅂ', 'ㄽ': 'ㄹㅅ', 'ㄾ': 'ㄹㅌ', 'ㄿ': 'ㄹㅍ', 'ㅀ': 'ㄹㅎ', 'ㅄ': 'ㅂㅅ' }

/** Match native Korean IME syllables, unfinished jamo and compound vowels alike. */
export function wordUnits(text: string): string[] {
  return [...text.normalize('NFC').toLowerCase()].flatMap(char => {
    const n = char.charCodeAt(0) - 0xac00
    const jamo = n >= 0 && n < 11172 ? INITIAL[Math.floor(n / 588)]! + VOWEL[Math.floor(n / 28) % 21]! + FINAL[n % 28]! : char
    return [...jamo].flatMap(unit => [...(COMPOUND[unit] ?? unit)])
  })
}

export class SnowWordChallenge {
  word = ''
  input = ''
  invalid = false
  completed = 0
  private random: () => number

  constructor(random: () => number = Math.random) { this.random = random; this.next() }
  get units() { return wordUnits(this.word) }
  get matched() { return wordUnits(this.input).length }
  get korean() { return /[가-힣]/.test(this.word) }

  private next() {
    const pool = this.random() < .5 ? KOREAN_WORDS : ENGLISH_WORDS
    const choices = pool.filter(word => word !== this.word)
    this.word = choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))]!
    this.input = ''; this.invalid = false
  }

  accept(value: string): string | null {
    const normalized = value.normalize('NFC').toLowerCase(), units = wordUnits(normalized), target = this.units
    if (units.length > target.length || units.some((unit, i) => unit !== target[i])) { this.invalid = true; return null }
    this.invalid = false; this.input = normalized
    if (!units.length || units.length !== target.length) return null
    const complete = this.word
    this.completed++; this.next()
    return complete
  }

  restart() { this.completed = 0; this.next() }
}
