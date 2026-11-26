import * as THREE from 'three'

export interface MinecraftImages { sword:HTMLImageElement; icons:HTMLImageElement; gui:HTMLImageElement; steve:HTMLImageElement }
let images:Promise<MinecraftImages>|null=null
export function loadMinecraftImages():Promise<MinecraftImages>{
  if(!images){
    const load=(name:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{
      const image=new Image();image.decoding='async';image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`텍스처를 불러오지 못했어요: ${name}`))
      image.src=`${import.meta.env.BASE_URL}minecraft/${name}.png`
    })
    images=Promise.all([load('diamond_sword'),load('icons'),load('gui'),load('steve')])
      .then(([sword,icons,gui,steve])=>({sword,icons,gui,steve})).catch(error=>{images=null;throw error})
  }
  return images
}

/** The native 16×16 sprite becomes an actual closed 3D extrusion. Interior
 * pixel walls are omitted; front/back texels and exposed side faces are merged
 * into one indexed mesh. No billboard, remote model or per-pixel draw calls. */
export function swordGeometry(image:HTMLImageElement):THREE.BufferGeometry {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=16
  const context=canvas.getContext('2d',{willReadFrequently:true})!
  context.drawImage(image,0,0,16,16)
  const pixels=context.getImageData(0,0,16,16).data
  const positions:number[]=[],normals:number[]=[],colors:number[]=[],indices:number[]=[]
  const color=new THREE.Color(),unit=1/16,depth=1/32,gripX=3.5,gripY=12.5
  const solid=(x:number,y:number)=>x>=0&&x<16&&y>=0&&y<16&&pixels[(y*16+x)*4+3]!>127
  const quad=(vertices:number[],nx:number,ny:number,nz:number)=>{
    const first=positions.length/3
    positions.push(...vertices)
    for(let i=0;i<4;i++){normals.push(nx,ny,nz);colors.push(color.r,color.g,color.b)}
    indices.push(first,first+1,first+2,first,first+2,first+3)
  }
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    if(!solid(x,y))continue
    const index=(y*16+x)*4
    color.setRGB(pixels[index]!/255,pixels[index+1]!/255,pixels[index+2]!/255,THREE.SRGBColorSpace)
    const x0=(x-gripX)*unit,x1=x0+unit,y1=(gripY-y)*unit,y0=y1-unit,z=depth
    quad([x0,y0,z,x1,y0,z,x1,y1,z,x0,y1,z],0,0,1)
    quad([x1,y0,-z,x0,y0,-z,x0,y1,-z,x1,y1,-z],0,0,-1)
    if(!solid(x-1,y))quad([x0,y0,-z,x0,y0,z,x0,y1,z,x0,y1,-z],-1,0,0)
    if(!solid(x+1,y))quad([x1,y0,z,x1,y0,-z,x1,y1,-z,x1,y1,z],1,0,0)
    if(!solid(x,y-1))quad([x0,y1,z,x1,y1,z,x1,y1,-z,x0,y1,-z],0,1,0)
    if(!solid(x,y+1))quad([x0,y0,-z,x1,y0,-z,x1,y0,z,x0,y0,z],0,-1,0)
  }
  const geometry=new THREE.BufferGeometry()
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3))
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeBoundingSphere()
  canvas.width=canvas.height=1
  return geometry
}

export class MinecraftSword {
  readonly group=new THREE.Group()
  private bladeGeometry:THREE.BufferGeometry
  private bladeMaterial=new THREE.MeshLambertMaterial({vertexColors:true})
  private armGeometry=new THREE.BoxGeometry(.25,.75,.25)
  private armMaterial:THREE.MeshLambertMaterial
  private skin:THREE.Texture
  constructor(images:MinecraftImages){
    this.bladeGeometry=swordGeometry(images.sword)
    const blade=new THREE.Mesh(this.bladeGeometry,this.bladeMaterial)
    blade.rotation.set(0,THREE.MathUtils.degToRad(-35),THREE.MathUtils.degToRad(60),'ZYX')
    blade.scale.setScalar(1.12);this.group.add(blade)
    this.skin=new THREE.Texture(images.steve);this.skin.colorSpace=THREE.SRGBColorSpace
    this.skin.magFilter=this.skin.minFilter=THREE.NearestFilter;this.skin.generateMipmaps=false;this.skin.needsUpdate=true
    const rectangles=[[48,20,4,12],[40,20,4,12],[44,16,4,4],[48,16,4,4],[44,20,4,12],[52,20,4,12]]
    const uv=this.armGeometry.getAttribute('uv') as THREE.BufferAttribute
    for(let face=0;face<6;face++)for(let corner=0;corner<4;corner++){
      const i=face*4+corner,[x,y,w,h]=rectangles[face]!
      uv.setXY(i,(x!+uv.getX(i)*w!)/64,1-(y!+(1-uv.getY(i))*h!)/64)
    }
    this.armMaterial=new THREE.MeshLambertMaterial({map:this.skin})
    const arm=new THREE.Mesh(this.armGeometry,this.armMaterial)
    arm.rotation.z=Math.PI;arm.position.set(0,-.34,.10);this.group.add(arm)
  }
  destroy(){this.bladeGeometry.dispose();this.bladeMaterial.dispose();this.armGeometry.dispose();this.armMaterial.dispose();this.skin.dispose();this.group.clear()}
}

/** Native pixel sprites, redrawn only for load/resize, not every video frame. */
export function drawMinecraftHud(canvas:HTMLCanvasElement,images:MinecraftImages){
  canvas.width=184;canvas.height=53
  const c=canvas.getContext('2d')!;c.imageSmoothingEnabled=false;c.clearRect(0,0,184,53)
  // Equal 9px cells for armor, health and hunger; neighboring sprites never overlap.
  const iconSize=9,iconStep=9,left=1,right=93
  for(let i=0;i<10;i++){
    c.drawImage(images.icons,16,9,9,9,left+i*iconStep,0,iconSize,iconSize)
    c.drawImage(images.icons,34,9,9,9,left+i*iconStep,0,iconSize,iconSize)
    c.drawImage(images.icons,16,0,9,9,left+i*iconStep,10,iconSize,iconSize)
    c.drawImage(images.icons,52,0,9,9,left+i*iconStep,10,iconSize,iconSize)
    c.drawImage(images.icons,16,27,9,9,right+i*iconStep,10,iconSize,iconSize)
    c.drawImage(images.icons,52,27,9,9,right+i*iconStep,10,iconSize,iconSize)
  }
  c.drawImage(images.icons,0,64,182,5,1,22,182,5)
  c.drawImage(images.icons,0,69,84,5,1,22,84,5)
  c.drawImage(images.gui,0,0,182,22,1,30,182,22)
  c.drawImage(images.gui,0,22,24,24,0,29,24,24)
  c.drawImage(images.sword,0,0,16,16,4,33,16,16)
  c.fillStyle='#000';c.fillRect(5,48,13,2);c.fillStyle='#37dd25';c.fillRect(5,48,13,1)
}
