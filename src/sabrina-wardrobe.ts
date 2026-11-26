import * as THREE from 'three'
import {sb3,type SabrinaVector3,type SabrinaBody3D} from './sabrina-body3d.ts'
import type {SabrinaState} from './sabrina-model'
import {SABRINA_DRESSES,SABRINA_HAIR,type SabrinaLook} from './sabrina-styles.ts'

const vertex=`
uniform vec2 uCover;attribute vec3 aNormal;attribute float aAround,aHeight;
varying vec2 vUv;varying vec3 vNormal;varying float vY,vAround,vHeight;
void main(){vUv=uv;vNormal=aNormal;vY=position.y;vAround=aAround;vHeight=aHeight;gl_Position=vec4((.5-position.x)*2./uCover.x,(.5-position.y)*2./uCover.y,clamp(position.z*1.5,-.95,.95),1.);}`
const fragment=`
uniform sampler2D uMap;uniform vec3 uTint,uTrim;uniform float uKind,uAmount,uTime,uStyle;uniform vec2 uBounds;
varying vec2 vUv;varying vec3 vNormal;varying float vY,vAround,vHeight;
void main(){
  vec3 color=uTint;
  if(uKind<.5){
    vec4 sampleColor=texture2D(uMap,vUv);
    color=sampleColor.a>.35?sampleColor.rgb:uTint;
    float silk=dot(sampleColor.rgb,vec3(.2126,.7152,.0722));
    if(uStyle>.5&&sampleColor.a>.35){
      color=uTint*clamp(.37+silk*1.03,.55,1.19);
      float embroidery=smoothstep(.04,.17,sampleColor.r-sampleColor.b)*smoothstep(.48,.72,silk);
      color=mix(color,uTrim,embroidery*.87);
    }
    if(uStyle>1.5&&uStyle<2.5&&vHeight>.29){
      float petal=abs(fract(vHeight*5.+cos(vAround*6.)*.17)-.82);
      color=mix(color,uTrim,.42*(1.-smoothstep(.015,.045,petal)));
    }
    if(uStyle>3.5)color*=.85+.15*pow(max(0.,cos(vAround*3.)),3.);
    // Continue the same satin and embroidery around the back, with a corset tie.
    if(cos(vAround)<-.88&&vHeight<.28){
      float x=sin(vAround)*.5,lace=abs(abs(x)-abs(sin(vHeight*105.))*.13);
      color=mix(color,uTrim,1.-smoothstep(.005,.012,lace));
    }
  }else if(uKind<1.5){
    color*=.87+.09*cos(vAround*3.)+.025*sin(vAround*32.+vHeight*12.);
    if(vHeight<.03||vHeight>.96)color=mix(color,uTrim,.8);
  }else if(uKind<2.5||uKind>6.5){
    // This opening belongs to the front of the 3D wig and rotates with the head.
    // The rear remains a complete hair surface; no face sprite appears there.
    if(uKind<2.5&&vHeight>.12&&cos(vAround)>.56&&abs(sin(vAround))<.76)discard;
    vec4 hair=texture2D(uMap,vUv);color=hair.a>.35?hair.rgb:uTint;
    if(hair.a>.35){
      float sheen=dot(hair.rgb,vec3(.2126,.7152,.0722));
      color=uTint*(.48+sheen*.86)+vec3(.16)*pow(sheen,4.);
    }
    color*=.91+.055*sin(vAround*90.+vHeight*32.)+.035*cos(vAround*143.);
  }else if(uKind<3.5){
    if(vHeight>.12&&vHeight<.72&&abs(sin(vAround*8.))>.45)discard;
  }else if(uKind<4.5){
    color+=vec3(.08)*pow(max(0.,sin(vAround*7.+uTime*1.2)),12.);
  }else{
    color=mix(color,vec3(.98,.95,.84),pow(max(0.,sin(vAround+.7)),8.));
  }
  vec3 n=normalize(vNormal),light=normalize(vec3(-.4,-.7,-.7));
  float diffuse=.72+.28*max(0.,dot(n,light));
  float gloss=pow(max(0.,dot(n,normalize(light+vec3(0.,0.,-1.)))),uKind>2.5?36.:22.);
  color=color*diffuse+vec3(uKind>2.5?.32:.11)*gloss;
  float row=clamp((uBounds.y-vY)/max(.02,uBounds.y-uBounds.x),0.,1.);
  float reveal=smoothstep(row*.75,row*.75+.20,uAmount);
  float distanceToRim=(uAmount-row*.75-.1)*24.;
  float rim=exp(-distanceToRim*distanceToRim)*step(.01,uAmount)*step(uAmount,.98);
  if(reveal<.005)discard;
  gl_FragColor=vec4(color+vec3(.30,.21,.08)*rim,reveal);
}`

interface Surface{
  mesh:THREE.Mesh;segments:number;rows:number
  positions:Float32Array;normals:Float32Array;uv:Float32Array;sin:Float32Array;cos:Float32Array
}
interface SurfaceProfile{dress:number[][];hair:number[][]}
function surface(segments:number,rows:number,material:THREE.Material):Surface{
  const geometry=new THREE.BufferGeometry(),count=(segments+1)*(rows+1)
  const positions=new Float32Array(count*3),normals=new Float32Array(count*3),uv=new Float32Array(count*2)
  const around=new Float32Array(count),height=new Float32Array(count),sin=new Float32Array(segments+1),cos=new Float32Array(segments+1),indices:number[]=[]
  for(let x=0;x<=segments;x++){const theta=x/segments*Math.PI*2;sin[x]=Math.sin(theta);cos[x]=Math.cos(theta)}
  // Exact duplicate seam values avoid microscopic cracks after a full turn.
  sin[segments]=sin[0]!;cos[segments]=cos[0]!
  for(let y=0;y<=rows;y++)for(let x=0;x<=segments;x++){
    const i=y*(segments+1)+x;around[i]=x/segments*Math.PI*2;height[i]=y/rows;uv[i*2]=x/segments;uv[i*2+1]=1-y/rows
    if(y<rows&&x<segments){const b=i+segments+1;indices.push(i,b,i+1,i+1,b,b+1)}
  }
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('aNormal',new THREE.BufferAttribute(normals,3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('aAround',new THREE.BufferAttribute(around,1));geometry.setAttribute('aHeight',new THREE.BufferAttribute(height,1));geometry.setIndex(indices)
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.visible=false
  return{mesh,segments,rows,positions,normals,uv,sin,cos}
}
function write(part:Surface,index:number,center:SabrinaVector3,right:SabrinaVector3,down:SabrinaVector3,front:SabrinaVector3,
  x:number,y:number,z:number,nx:number,ny:number,nz:number,aspect:number,u:number,v:number){
  const i=index*3
  part.positions[i]=(center.x+right.x*x+down.x*y+front.x*z)/aspect
  part.positions[i+1]=center.y+right.y*x+down.y*y+front.y*z
  part.positions[i+2]=center.z+right.z*x+down.z*y+front.z*z
  let a=right.x*nx+down.x*ny+front.x*nz,b=right.y*nx+down.y*ny+front.y*nz,c=right.z*nx+down.z*ny+front.z*nz
  const len=Math.max(.001,Math.hypot(a,b,c));a/=len;b/=len;c/=len
  part.normals[i]=a;part.normals[i+1]=b;part.normals[i+2]=c;part.uv[index*2]=u;part.uv[index*2+1]=v
}
function upload(part:Surface){for(const name of ['position','aNormal','uv'])part.mesh.geometry.attributes[name]!.needsUpdate=true}

/** Continuous radial garment surfaces, fitted to the 3D body and head frame.
 * The camera projection remains calibrated to normalized landmarks. */
export class SabrinaWardrobe{
  readonly scene=new THREE.Scene()
  readonly bounds=new THREE.Vector2(0,1)
  private dress:Surface;private hair:Surface;private band:Surface;private crown:Surface
  private sleeves:Surface[];private shoes:Surface[];private gems:Surface[];private hairDetail:Surface[]
  private materials:THREE.ShaderMaterial[]=[];private textures:THREE.Texture[]=[]
  private parts:Surface[]=[];private profile:SurfaceProfile|null=null
  private look:SabrinaLook={dress:0,hair:0}
  private closed=false;loaded=false
  constructor(cover:THREE.Vector2){
    const make=(kind:number,tint:number)=>{
      const material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,transparent:true,side:THREE.DoubleSide,depthTest:true,depthWrite:true,
        uniforms:{uCover:{value:cover},uMap:{value:null},uTint:{value:new THREE.Color(tint)},uTrim:{value:new THREE.Color().setHex(0xe6c58b,THREE.NoColorSpace)},uKind:{value:kind},uAmount:{value:0},uBounds:{value:this.bounds},uTime:{value:0},uStyle:{value:0}}})
      // Shader colors/photographs are already in display RGB, as in the camera.
      material.uniforms.uTint!.value.setHex(tint,THREE.NoColorSpace)
      this.materials.push(material);return material
    }
    this.dress=surface(48,40,make(0,0xc5a0dc));this.hair=surface(48,32,make(2,SABRINA_HAIR[0].color))
    const satin=make(1,0xc5a0dc),glass=make(5,0xc6cced),gold=make(3,0xd5b271),crystal=make(4,0xede9f6)
    this.sleeves=[surface(16,24,satin),surface(16,24,satin)]
    this.shoes=[surface(16,16,glass),surface(16,16,glass)]
    this.band=surface(48,6,make(1,0x241b21));this.crown=surface(64,8,gold)
    this.gems=Array.from({length:8},()=>surface(4,2,crystal))
    const hairDetailMaterial=make(7,SABRINA_HAIR[0].color)
    this.hairDetail=Array.from({length:3},()=>surface(16,24,hairDetailMaterial))
    this.parts=[this.dress,this.hair,this.band,this.crown,...this.sleeves,...this.shoes,...this.gems,...this.hairDetail]
    for(const part of this.parts)this.scene.add(part.mesh)
  }
  async load(){
    const loader=new THREE.TextureLoader()
    const load=(name:string,part:Surface)=>new Promise<void>((resolve,reject)=>{
      const texture=loader.load(`${import.meta.env.BASE_URL}sabrina/${name}.webp`,()=>{
        if(this.closed){texture.dispose();resolve();return}
        ;(part.mesh.material as THREE.ShaderMaterial).uniforms.uMap!.value=texture;resolve()
      },undefined,()=>reject(new Error('입체 마법 의상을 불러오지 못했어요.')))
      texture.generateMipmaps=false;texture.minFilter=texture.magFilter=THREE.LinearFilter;this.textures.push(texture)
    })
    await Promise.all([load('dress',this.dress),load('hair',this.hair),fetch(`${import.meta.env.BASE_URL}sabrina/surface-profile.json`).then(async response=>{
      if(!response.ok)throw new Error('의상 표면 자료를 불러오지 못했어요.')
      const profile=await response.json() as SurfaceProfile
      if(profile.dress?.length!==41||profile.hair?.length!==33)throw new Error('의상 표면 자료가 맞지 않아요.')
      this.profile=profile
    })])
    if(!this.closed)this.loaded=true
    const hairUniforms=(this.hair.mesh.material as THREE.ShaderMaterial).uniforms
    ;(this.hairDetail[0]!.mesh.material as THREE.ShaderMaterial).uniforms.uMap!.value=hairUniforms.uMap!.value
  }
  setLook(look:SabrinaLook){
    this.look={...look}
    const dress=SABRINA_DRESSES[look.dress]!,hair=SABRINA_HAIR[look.hair]!
    for(const part of [this.dress,...this.sleeves,...this.shoes,this.crown]){
      const uniforms=(part.mesh.material as THREE.ShaderMaterial).uniforms
      uniforms.uTint!.value.setHex(part===this.crown?dress.trim:dress.color,THREE.NoColorSpace)
      uniforms.uTrim!.value.setHex(dress.trim,THREE.NoColorSpace)
      uniforms.uStyle!.value=look.dress
    }
    for(const part of [this.hair,this.hairDetail[0]!]){
      const uniforms=(part.mesh.material as THREE.ShaderMaterial).uniforms
      uniforms.uTint!.value.setHex(hair.color,THREE.NoColorSpace);uniforms.uStyle!.value=look.hair
    }
  }
  update(state:SabrinaState,now:number,aspect:number,amount:number){
    for(const part of this.parts)part.mesh.visible=false
    if(!this.loaded||!state.tracking(now)||!state.frame||amount<=0)return false
    const frame=state.frame,{body:b,head:h}=frame,time=now/1000
    this.bounds.set(h.center.y-h.height*.95,b.hem.y+b.width*.12)
    for(const material of this.materials){material.uniforms.uAmount!.value=amount;material.uniforms.uTime!.value=time}
    this.dress.mesh.visible=this.hair.mesh.visible=this.band.mesh.visible=this.crown.mesh.visible=true
    this.fitDress(frame,time,aspect);this.fitHair(frame,time,aspect);this.fitHairDetail(frame,time,aspect);this.fitCrown(frame,aspect)
    for(let side=0;side<2;side++){
      const indices=side?[12,14,16]:[11,13,15]
      // The far arm may be visually occluded during a turn. Its world skeleton
      // still positions the sleeve and the garment depth buffer hides it.
      if(frame.world||indices.every(i=>(state.pose[i]!.visibility??1)>.45))this.fitSleeve(this.sleeves[side]!,frame,indices,aspect)
      if(b.fullBody)this.fitShoe(this.shoes[side]!,frame,side,aspect)
    }
    return true
  }
  private fitDress(f:SabrinaBody3D,time:number,aspect:number){
    const part=this.dress,w=f.body.width
    const cut=SABRINA_DRESSES[this.look.dress]!.cut
    for(let row=0;row<=part.rows;row++){
      const v=row/part.rows,t=v<.26?v/.26:(v-.26)/.74
      const center=v<.26?sb3.mix(sb3.add(f.shoulder,sb3.mul(f.down,-f.body.torso*.055)),f.waist,t):sb3.mix(f.waist,f.hem,t)
      const skirt=Math.max(0,(v-.26)/.74)
      let spread=Math.pow(skirt,.62)*.96
      if(cut==='aline')spread=skirt*.78
      if(cut==='petal')spread=.91*Math.pow(skirt,.76)+.075*Math.sin(skirt*Math.PI*5)*skirt
      if(cut==='mermaid')spread=.22*Math.sin(skirt*Math.PI)+.91*Math.pow(skirt,5.5)
      if(cut==='column')spread=.22*skirt+.29*Math.pow(skirt,6)
      const rx=w*(v<.26?.52-.20*t:.32+spread),rz=w*(v<.26?.29-.07*t:.22+spread*.83)
      const profile=this.profile!.dress[row]!
      for(let x=0;x<=part.segments;x++){
        const sin=part.sin[x]!,cos=part.cos[x]!,theta=x/part.segments*Math.PI*2
        const pleat=1+Math.sin(theta*(cut==='petal'?12:18)+v*4)*(cut==='petal'?.045:.018)*skirt+Math.sin(time*1.3+theta*3)*.008*skirt
        const u=.5+sin*profile[1]!
        write(part,row*(part.segments+1)+x,center,f.right,f.down,f.front,sin*rx*pleat,0,cos*rz*pleat,sin,-spread*.42,cos*rx/Math.max(.001,rz),aspect,u,1-profile[0]!)
      }
    }
    upload(part)
  }
  private fitHair(f:SabrinaBody3D,time:number,aspect:number){
    const part=this.hair,h=f.head
    const style=SABRINA_HAIR[this.look.hair]!
    for(let row=0;row<=part.rows;row++){
      const v=row/part.rows,cap=Math.sin(Math.min(1,v/.2)*Math.PI*.5),profile=this.profile!.hair[row]!
      const taper=style.detail==='bob'?1-.12*Math.pow(v,5):1-.22*Math.pow(v,6)*Number(style.detail!=='waves')
      const rx=h.width*(.59+.035*Math.sin(v*12+time*.8))*cap*taper,rz=h.width*.55*cap*taper
      for(let x=0;x<=part.segments;x++){
        const sin=part.sin[x]!,cos=part.cos[x]!,theta=x/part.segments*Math.PI*2
        const wave=Math.sin(theta*7+v*14+time)*.018*h.width*v
        const y=(v*style.length-.67)*h.height+Math.sin(theta*9)*h.height*.035*v*v
        const u=(sin<0?profile[1]!:profile[2]!)+Math.sin(theta*4)*.017
        write(part,row*(part.segments+1)+x,h.center,h.right,h.down,h.front,sin*rx+wave,y,cos*rz,sin,-(1-cap)*.8,cos,aspect,u,1-profile[0]!)
      }
    }
    upload(part)
  }
  private fitHairDetail(frame:SabrinaBody3D,time:number,aspect:number){
    const style=SABRINA_HAIR[this.look.hair]!.detail
    if(style==='waves'||style==='bob')return
    const h=frame.head
    const count=style==='braid'?3:1
    for(let i=0;i<count;i++){
      const part=this.hairDetail[i]!
      part.mesh.visible=true
      for(let row=0;row<=part.rows;row++){
        const v=row/part.rows,bulge=Math.sin(v*Math.PI),swing=Math.sin(time*2+v*4)*v*.085
        const braidAngle=v*Math.PI*10+i*Math.PI*2/3
        const x=style==='braid'?Math.cos(braidAngle)*.105*(1-v*.6):swing
        const y=style==='bun'?-.22+v*.55:style==='pony'?-.17+v*1.92:.27+v*1.7
        const z=style==='bun'?-.58:style==='pony'?-.48-.63*bulge:-.48-.10*v+Math.sin(braidAngle)*.09
        const radius=style==='bun'?.31*bulge:style==='pony'?.22*bulge*(1-v*.65):.115*Math.pow(bulge,.4)*(1-v*.62)
        for(let j=0;j<=part.segments;j++){
          const sin=part.sin[j]!,cos=part.cos[j]!
          write(part,row*(part.segments+1)+j,h.center,h.right,h.down,h.front,(x+sin*radius)*h.width,y*h.height,(z+cos*radius)*h.width,sin,style==='bun'?v*2-1:0,cos,aspect,.22+.09*sin,1-(.25+v*.7))
        }
      }
      upload(part)
    }
  }
  private fitCrown(f:SabrinaBody3D,aspect:number){
    const h=f.head
    for(const [part,isBand]of [[this.band,true],[this.crown,false]] as const){
      for(let row=0;row<=part.rows;row++)for(let x=0;x<=part.segments;x++){
        const v=row/part.rows,sin=part.sin[x]!,cos=part.cos[x]!,theta=x/part.segments*Math.PI*2
        const tube=Math.cos(v*Math.PI*2)*h.width*.018
        const y=isBand?-.43*h.height+Math.sin(v*Math.PI*2)*h.width*.026:-.48*h.height-v*(.055+.18*Math.pow(Math.max(0,Math.cos(theta*8)),8))*h.height
        write(part,row*(part.segments+1)+x,h.center,h.right,h.down,h.front,sin*(h.width*.61+(isBand?tube:0)),y,cos*(h.width*.56+(isBand?tube:0)),sin,isBand?Math.sin(v*Math.PI*2):-v*.2,cos,aspect,x/part.segments,1-v)
      }
      upload(part)
    }
    for(let i=0;i<this.gems.length;i++){
      const part=this.gems[i]!,angle=i/this.gems.length*Math.PI*2,sin=Math.sin(angle),cos=Math.cos(angle)
      const center=sb3.add(h.center,sb3.add(sb3.mul(h.right,sin*h.width*.61),sb3.add(sb3.mul(h.front,cos*h.width*.56),sb3.mul(h.down,-.73*h.height))))
      part.mesh.visible=true
      for(let row=0;row<=part.rows;row++)for(let x=0;x<=part.segments;x++){
        const v=row/part.rows,radius=(1-Math.abs(v*2-1))*h.width*.065
        write(part,row*(part.segments+1)+x,center,h.right,h.down,h.front,part.sin[x]!*radius,(v-.5)*h.height*.12,part.cos[x]!*radius,part.sin[x]!,v<.5?-1:1,part.cos[x]!,aspect,x/part.segments,1-v)
      }
      upload(part)
    }
  }
  private fitSleeve(part:Surface,f:SabrinaBody3D,indices:number[],aspect:number){
    part.mesh.visible=true
    const a=f.joints[indices[0]!]!,b=f.joints[indices[1]!]!,c=f.joints[indices[2]!]!
    for(let row=0;row<=part.rows;row++){
      const v=row/part.rows,t=v<.5?v*2:(v-.5)*2,center=v<.5?sb3.mix(a,b,t):sb3.mix(b,c,t)
      const tangent=sb3.unit(v<.5?sb3.sub(b,a):sb3.sub(c,b),f.down)
      const helper=Math.abs(sb3.dot(tangent,f.front))<.85?f.front:f.right
      const right=sb3.unit(sb3.cross(tangent,helper),f.right),front=sb3.unit(sb3.cross(right,tangent),f.front)
      const radius=f.body.width*(.13*(1-.55*v)+.05*Math.exp(-(((v-.18)/.14)**2)))
      const cap=Math.min(1,Math.sin(Math.min(.5,v)*Math.PI)*8)
      for(let x=0;x<=part.segments;x++)write(part,row*(part.segments+1)+x,center,right,tangent,front,part.sin[x]!*radius*cap,0,part.cos[x]!*radius*cap,part.sin[x]!,0,part.cos[x]!,aspect,x/part.segments,1-v)
    }
    upload(part)
  }
  private fitShoe(part:Surface,f:SabrinaBody3D,side:number,aspect:number){
    part.mesh.visible=true
    const ankle=f.joints[side?28:27]!,heel=f.joints[side?30:29]!,toe=f.joints[side?32:31]!
    const forward=sb3.unit(sb3.sub(toe,heel),f.front),right=sb3.unit(sb3.cross(f.down,forward),f.right),up=sb3.unit(sb3.cross(forward,right),f.down)
    for(let row=0;row<=part.rows;row++){
      const v=row/part.rows,center=v<.25?sb3.mix(ankle,heel,v*4):sb3.mix(heel,toe,(v-.25)/.75)
      const radius=Math.pow(Math.max(0,Math.sin(v*Math.PI)),.4)
      for(let x=0;x<=part.segments;x++)write(part,row*(part.segments+1)+x,center,right,forward,up,part.sin[x]!*f.body.width*.095*radius,0,part.cos[x]!*f.body.width*.055*radius,part.sin[x]!,0,part.cos[x]!,aspect,x/part.segments,1-v)
    }
    upload(part)
  }
  destroy(){this.closed=true;for(const part of this.parts)part.mesh.geometry.dispose();for(const material of this.materials)material.dispose();for(const texture of this.textures)texture.dispose();this.scene.clear()}
}
