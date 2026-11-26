import * as THREE from 'three'

export type PlushKind = 'bear' | 'bunny' | 'cat' | 'panda' | 'penguin' | 'frog' | 'axolotl' | 'dog'
export type PlushSpec = { id: string; name: string; kind: PlushKind; color: string; accent: string; tag: string }
export type PlushPart = { at: [number, number, number]; scale: [number, number, number]; material: 'fur' | 'face' | 'accent' | 'cream' | 'ear'; angle?: number }
export const PLUSH_SPECS: PlushSpec[] = [
  { id: 'milk-bear', name: '밀크 베어', kind: 'bear', color: '#dfc29a', accent: '#ac7963', tag: 'SOFT & SWEET' },
  { id: 'lilac-bunny', name: '라일락 래빗', kind: 'bunny', color: '#bdacd6', accent: '#e6c6da', tag: 'DREAMY FRIEND' },
  { id: 'apricot-cat', name: '살구 고양이', kind: 'cat', color: '#e6ac88', accent: '#bd806c', tag: 'LITTLE PURR' },
  { id: 'mint-frog', name: '피스타치오 개구리', kind: 'frog', color: '#a6bf8a', accent: '#d5dfb4', tag: 'HAPPY HOPPER' },
  { id: 'blue-penguin', name: '블루 펭귄', kind: 'penguin', color: '#92b4cd', accent: '#e8be73', tag: 'COOL CUDDLES' },
  { id: 'peach-axo', name: '피치 아홀로틀', kind: 'axolotl', color: '#e7b4bb', accent: '#cf829a', tag: 'BUBBLE BUDDY' },
  { id: 'caramel-dog', name: '카라멜 퍼피', kind: 'dog', color: '#bc9876', accent: '#86664f', tag: 'YOUR BEST PAL' },
  { id: 'pocket-panda', name: '포켓 판다', kind: 'panda', color: '#e7dfcd', accent: '#655e68', tag: 'BEARY SPECIAL' },
  { id: 'rose-bunny', name: '로즈 래빗', kind: 'bunny', color: '#d5a2b1', accent: '#edc9c9', tag: 'BLUSHING BUN' },
  { id: 'cloud-bear', name: '구름 곰', kind: 'bear', color: '#b5cfcb', accent: '#7aa7a3', tag: 'CLOUD NINE' },
  { id: 'butter-cat', name: '버터 고양이', kind: 'cat', color: '#e6cd8b', accent: '#c3a264', tag: 'SUNNY SIDE UP' },
  { id: 'violet-axo', name: '바이올렛 아홀로틀', kind: 'axolotl', color: '#aaa8d0', accent: '#807da9', tag: 'MAGIC LITTLE ONE' },
]

export function plushParts(spec: PlushSpec): PlushPart[] {
  const penguin = spec.kind === 'penguin', frog = spec.kind === 'frog'
  const parts: PlushPart[] = [
    { at: [0, 0, 0], scale: [penguin ? .27 : .25, .3, .21], material: 'fur' },
    { at: [0, .33, .015], scale: [frog ? .32 : .28, .25, .235], material: 'face' },
    { at: [-.14, -.265, .075], scale: [.13, .125, .17], material: penguin ? 'accent' : 'fur' },
    { at: [.14, -.265, .075], scale: [.13, .125, .17], material: penguin ? 'accent' : 'fur' },
    { at: [-.245, .015, 0], scale: [.115, .21, .13], angle: -.25, material: spec.kind === 'panda' ? 'accent' : 'fur' },
    { at: [.245, .015, 0], scale: [.115, .21, .13], angle: .25, material: spec.kind === 'panda' ? 'accent' : 'fur' },
    { at: [0, -.025, .174], scale: [.16, .215, .055], material: 'cream' },
  ]
  if (spec.kind === 'bunny') {
    parts.push({ at: [-.125, .66, 0], scale: [.085, .245, .09], angle: .1, material: 'ear' }, { at: [.125, .66, 0], scale: [.085, .245, .09], angle: -.1, material: 'ear' })
  } else if (spec.kind === 'dog') {
    parts.push({ at: [-.255, .29, -.01], scale: [.12, .235, .11], angle: -.18, material: 'accent' }, { at: [.255, .29, -.01], scale: [.12, .235, .11], angle: .18, material: 'accent' })
  } else if (spec.kind === 'cat') {
    parts.push({ at: [-.18, .53, .015], scale: [.105, .15, .095], angle: .22, material: 'ear' }, { at: [.18, .53, .015], scale: [.105, .15, .095], angle: -.22, material: 'ear' })
  } else if (spec.kind === 'bear' || spec.kind === 'panda') {
    parts.push({ at: [-.205, .505, 0], scale: [.11, .11, .09], material: spec.kind === 'panda' ? 'accent' : 'ear' }, { at: [.205, .505, 0], scale: [.11, .11, .09], material: spec.kind === 'panda' ? 'accent' : 'ear' })
  } else if (spec.kind === 'axolotl') {
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) parts.push({ at: [side * .285, .21 + i * .105, -.01], scale: [.14, .06, .07], angle: side * (i - 1) * .4, material: 'accent' })
  } else if (frog) {
    parts.push({ at: [-.19, .49, .01], scale: [.13, .13, .12], material: 'fur' }, { at: [.19, .49, .01], scale: [.13, .13, .12], material: 'fur' })
  }
  return parts
}

/** Facial embroidery is painted directly onto the curved head, never floating geometry. */
function fabricTexture(spec: PlushSpec, face = false, innerEar = false) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = spec.color; ctx.fillRect(0, 0, 1024, 512)
  for (let i = 0; i < 24000; i++) {
    const x = (i * 127.13) % 1024, y = (i * 79.87) % 512
    ctx.strokeStyle = i % 2 ? '#ffffff12' : '#452c3c0e'; ctx.lineWidth = .65
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 1.8, y + 3); ctx.stroke()
  }
  ctx.strokeStyle = '#63525335'; ctx.lineWidth = 2; ctx.setLineDash([3, 5])
  ctx.beginPath(); ctx.moveTo(768, 0); ctx.lineTo(768, 512); ctx.stroke(); ctx.setLineDash([])
  if (innerEar) { ctx.fillStyle = spec.accent; ctx.beginPath(); ctx.ellipse(256, 256, 56, 152, 0, 0, Math.PI * 2); ctx.fill() }
  if (face) {
    const cx = 256, cy = 254
    const oval = (x: number, y: number, rx: number, ry: number, color: string) => { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill() }
    if (spec.kind === 'panda') { oval(cx - 50, cy - 10, 32, 46, '#655e68'); oval(cx + 50, cy - 10, 32, 46, '#655e68') }
    if (spec.kind === 'penguin') oval(cx, cy + 15, 104, 94, '#f7eedb')
    for (const side of [-1, 1]) {
      oval(cx + side * 47, cy - 8, 12, 19, '#3c3438')
      oval(cx + side * 47 - 3, cy - 16, 3.5, 4, '#fff9eb')
      oval(cx + side * 76, cy + 35, 21, 11, '#db8d9665')
    }
    if (spec.kind === 'frog') {
      ctx.strokeStyle = '#455d47'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - 27, cy + 33); ctx.quadraticCurveTo(cx, cy + 59, cx + 27, cy + 33); ctx.stroke()
    } else {
      oval(cx, cy + 30, spec.kind === 'penguin' ? 24 : 13, spec.kind === 'penguin' ? 13 : 9, spec.kind === 'penguin' ? '#d0a252' : '#79585c')
      ctx.strokeStyle = '#79585c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy + 34); ctx.lineTo(cx, cy + 47); ctx.quadraticCurveTo(cx - 12, cy + 59, cx - 21, cy + 46); ctx.moveTo(cx, cy + 47); ctx.quadraticCurveTo(cx + 12, cy + 59, cx + 21, cy + 46); ctx.stroke()
    }
    if (spec.kind === 'cat') for (const side of [-1, 1]) for (let i = 0; i < 2; i++) {
      ctx.strokeStyle = '#856c5480'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + side * 70, cy + 24 + i * 16); ctx.lineTo(cx + side * 108, cy + 20 + i * 24); ctx.stroke()
    }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4
  return texture
}

export class PlushFactory {
  private sphere = new THREE.SphereGeometry(1, 24, 16)
  private materials = new Map<string, Record<PlushPart['material'], THREE.MeshPhysicalMaterial>>()
  private textures: THREE.Texture[] = []
  private bump: THREE.DataTexture

  constructor() {
    const pixels = new Uint8Array(128 * 128 * 4)
    for (let i = 0; i < 128 * 128; i++) { const n = 135 + Math.sin(i * 78.233) * 65; pixels.set([n, n, n, 255], i * 4) }
    this.bump = new THREE.DataTexture(pixels, 128, 128); this.bump.wrapS = this.bump.wrapT = THREE.RepeatWrapping; this.bump.repeat.set(5, 3); this.bump.needsUpdate = true
  }

  create(spec: PlushSpec): THREE.Group {
    let mats = this.materials.get(spec.id)
    if (!mats) {
      const material = (color: string, texture?: THREE.Texture) => new THREE.MeshPhysicalMaterial({ color, map: texture, roughness: .94, metalness: 0, sheen: 1, sheenColor: new THREE.Color('#fff4e5'), sheenRoughness: .85, bumpMap: this.bump, bumpScale: .012 })
      const fur = fabricTexture(spec), face = fabricTexture(spec, true), ear = fabricTexture(spec, false, true)
      this.textures.push(fur, face, ear)
      mats = { fur: material('#ffffff', fur), face: material('#ffffff', face), ear: material('#ffffff', ear), accent: material(spec.accent), cream: material('#eee4d0') }
      this.materials.set(spec.id, mats)
    }
    const group = new THREE.Group()
    for (const part of plushParts(spec)) {
      const mesh = new THREE.Mesh(this.sphere, mats[part.material]); mesh.position.set(...part.at); mesh.scale.set(...part.scale); mesh.rotation.z = part.angle ?? 0; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh)
    }
    return group
  }

  dispose() { this.sphere.dispose(); this.bump.dispose(); this.textures.forEach(t => t.dispose()); this.materials.forEach(m => Object.values(m).forEach(v => v.dispose())) }
}
