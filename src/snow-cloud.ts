/** Draw once at display resolution; floating clouds reuse these small sprites. */
export function createSnowCloud(width: number, variant: number, snowing: boolean) {
  const canvas = document.createElement('canvas')
  const dpr = Math.min(devicePixelRatio || 1,1.5)
  const w = width*1.7, h = width*1.15
  canvas.width = Math.ceil(w*dpr); canvas.height = Math.ceil(h*dpr)
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr,dpr); ctx.translate(w*.5,h*.52)
  const puff = (variant%3-1)*.025
  ctx.save(); ctx.scale(width,width)
  ctx.beginPath(); ctx.moveTo(-.43,.2)
  ctx.bezierCurveTo(-.65,.24,-.73,.02,-.57,-.12)
  ctx.bezierCurveTo(-.48,-.22,-.38,-.18,-.34,-.19)
  ctx.bezierCurveTo(-.36,-.4,-.12,-.52,.02+puff,-.32)
  ctx.bezierCurveTo(.13,-.56,.48,-.4,.43,-.17)
  ctx.bezierCurveTo(.67,-.21,.76,.12,.54,.22)
  ctx.bezierCurveTo(.39,.31,.26,.25,.12,.26)
  ctx.bezierCurveTo(-.1,.3,-.28,.26,-.43,.2)
  ctx.closePath()
  const body = ctx.createLinearGradient(0,-.43,0,.28)
  body.addColorStop(0,'#ffffff'); body.addColorStop(.4,'#fffdf8'); body.addColorStop(.73,'#eaf3f8')
  body.addColorStop(1,snowing?'#bfd5ee':'#cfdfed')
  ctx.shadowColor = '#263e5b30'; ctx.shadowBlur = width*.13; ctx.shadowOffsetY = width*.075
  ctx.fillStyle = body; ctx.fill(); ctx.shadowColor = 'transparent'
  ctx.clip()
  for (const [x,y,r] of [[-.23,-.2,.28],[.2,-.23,.31],[-.49,-.02,.2],[.48,.02,.22]]) {
    const light = ctx.createRadialGradient(x!-.05,y!-.06,.005,x!,y!,r!)
    light.addColorStop(0,'#ffffffdd'); light.addColorStop(.5,'#ffffff66'); light.addColorStop(1,'#ffffff00')
    ctx.fillStyle = light; ctx.fillRect(-.8,-.6,1.6,1.1)
  }
  const shade = ctx.createLinearGradient(0,.02,0,.31)
  shade.addColorStop(0,'#a4c7e500'); shade.addColorStop(1,'#a3c4e12e')
  ctx.fillStyle = shade; ctx.fillRect(-.8,0,1.6,.4)
  ctx.restore()
  // Two tiny ice glints complement the soft, porcelain-like puffs.
  ctx.strokeStyle = '#ffffffc0'; ctx.lineWidth = .8
  for (const [x,y,size] of [[-.48,-.32,3],[.51,-.27,2]]) {
    const px = x!*width, py = y!*width
    ctx.beginPath(); ctx.moveTo(px-size!,py); ctx.lineTo(px+size!,py); ctx.moveTo(px,py-size!); ctx.lineTo(px,py+size!); ctx.stroke()
  }
  return canvas
}
