import * as THREE from 'three'

/** An archival sanctuary photograph, not a live service or today's sermon. */
export function createChurchDisplay(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.height = 512
  canvas.width = Math.round(512 * width / height)
  const ctx = canvas.getContext('2d')!
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const photo = new Image()
  let disposed = false

  function draw(loaded = false) {
    const h = canvas.height, w = canvas.width
    ctx.fillStyle = '#1e3335'
    ctx.fillRect(0, 0, w, h)
    if (loaded) {
      // Contain the entire photograph; never stretch it to the wide screen.
      const scale = Math.min(h / photo.naturalWidth, h / photo.naturalHeight)
      const pw = photo.naturalWidth * scale, ph = photo.naturalHeight * scale
      ctx.drawImage(photo, (h - pw) / 2, (h - ph) / 2, pw, ph)
    }
    const start = loaded ? h + 42 : 42
    const available = w - start - 42
    const center = start + available / 2
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#d5c398'
    ctx.font = '24px "Malgun Gothic", sans-serif'
    ctx.fillText('WELCOME  ·  대성전', center, 119, available)
    ctx.fillStyle = '#fff8e9'
    ctx.font = `bold ${Math.min(80, available / 9)}px "Malgun Gothic", sans-serif`
    ctx.fillText('여의도순복음교회', center, 223, available)
    ctx.font = `${Math.min(47, available / 12)}px "Malgun Gothic", sans-serif`
    ctx.fillText('오신 것을 환영합니다', center, 312, available)
    ctx.fillStyle = '#c2d3ce'
    ctx.font = '20px "Malgun Gothic", sans-serif'
    ctx.fillText('함께 기도하고 찬송하는 공간', center, 386, available)
    if (loaded) {
      ctx.fillStyle = 'rgba(20, 35, 36, .85)'
      ctx.fillRect(0, h - 38, h, 38)
      ctx.fillStyle = '#f0ece1'
      ctx.font = '17px "Malgun Gothic", sans-serif'
      ctx.fillText('대성전 자료 사진 · 출처: mv.fgtv.com', h / 2, h - 19, h - 24)
    }
    texture.needsUpdate = true
  }

  draw()
  photo.onload = () => { if (!disposed) draw(true) }
  photo.src = `${import.meta.env.BASE_URL}church/sanctuary-interior.jpg`
  texture.addEventListener('dispose', () => {
    disposed = true
    photo.onload = null
    photo.removeAttribute('src')
  })
  const display = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  )
  display.name = 'sanctuary-photo-display'
  return display
}
