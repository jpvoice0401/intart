import * as THREE from 'three'
import {cameraCover} from './water-touch-model'
import {SabrinaWardrobe} from './sabrina-wardrobe'
import {SABRINA_FACE_OVAL,SABRINA_FINGERTIPS,sabrinaHead,sabrinaOpenPalm,type SabrinaState,type SabrinaMask,type SabrinaPoint} from './sabrina-model'
import {sabrinaFacePatch,sb3} from './sabrina-body3d'

const vertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}'
const fragment=`
uniform sampler2D uVideo,uWardrobe,uKeep,uMask,uClean;
uniform vec2 uCover,uBounds;uniform float uLive,uMagic,uCleanReady;
varying vec2 vUv;
void main(){
  vec2 uv=vec2(1.)-((vUv-.5)*uCover+.5);
  if(uLive<.5){gl_FragColor=vec4(mix(vec3(.22,.17,.27),vec3(.46,.35,.43),vUv.y),1.);return;}
  vec3 original=texture2D(uVideo,uv).rgb;
  vec3 color=original;
  float keep=texture2D(uKeep,uv).r;
  if(uMagic>.0&&uCleanReady>.5){
    float person=smoothstep(.28,.68,texture2D(uMask,uv).r);
    float row=clamp((uBounds.y-uv.y)/max(.02,uBounds.y-uBounds.x),0.,1.);
    float reveal=smoothstep(row*.75,row*.75+.20,uMagic);
    color=mix(color,texture2D(uClean,uv).rgb,person*reveal*(1.-keep));
  }
  vec4 dress=texture2D(uWardrobe,vUv);
  color=dress.rgb+color*(1.-dress.a);
  // Restore the original camera pixels AFTER all costume rendering. There is
  // no face replacement, beautification, color grading or face mesh warp.
  color=mix(color,original,keep);
  gl_FragColor=vec4(color,1.);
}`
const magicVertex=`
uniform vec2 uCover;uniform float uTime,uGlow,uDpr;
attribute float aSeed,aKind;varying float vAlpha,vKind;
void main(){
  float phase=fract(uTime*.85+aSeed),angle=aSeed*64.;
  vec2 drift=aKind>.5?vec2(cos(angle)*phase*.045,-phase*.065+sin(angle)*phase*.02):vec2(0.);
  vec2 uv=position.xy+drift;
  gl_Position=vec4((.5-uv.x)*2./uCover.x,(.5-uv.y)*2./uCover.y,0.,1.);
  gl_PointSize=(aKind>.5?2.5+3.*aSeed:30.+3.*sin(uTime*3.+aSeed))*uDpr;
  vAlpha=uGlow*(aKind>.5?sin(phase*3.14159):1.);vKind=aKind;
}`
const magicFragment=`
varying float vAlpha,vKind;
void main(){
  vec2 p=(gl_PointCoord-.5)*2.;float r=length(p);
  float star=exp(-abs(p.x)*24.)*exp(-abs(p.y)*2.)+exp(-abs(p.y)*24.)*exp(-abs(p.x)*2.);
  float glow=exp(-r*r*6.)*.38;
  float a=(vKind>.5?max(0.,1.-r):star+glow)*vAlpha;
  if(a<.008)discard;gl_FragColor=vec4(mix(vec3(.86,.67,1.),vec3(1.,.87,.53),min(1.,star)),min(1.,a));
}`

export class SabrinaRenderer {
  readonly canvas:HTMLCanvasElement
  readonly wardrobe:SabrinaWardrobe
  private renderer:THREE.WebGLRenderer
  private scene=new THREE.Scene();private magicScene=new THREE.Scene();private camera=new THREE.Camera()
  private plane=new THREE.PlaneGeometry(2,2);private material:THREE.ShaderMaterial
  private target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true,stencilBuffer:false})
  private videoTexture:THREE.VideoTexture
  private maskPixels=new Uint8Array(1);private maskTexture:THREE.DataTexture
  private keep:CanvasRenderingContext2D;private keepTexture:THREE.CanvasTexture
  private clean:THREE.CanvasTexture|null=null;private cleanWidth=0;private cleanHeight=0
  private magicGeometry=new THREE.BufferGeometry();private magicMaterial:THREE.ShaderMaterial;private magicPoints:THREE.Points
  private anchors=new Float32Array(210*3)
  private cover=new THREE.Vector2(1,1)
  private observer:ResizeObserver
  private root:HTMLElement;private width=1;private height=1;private dpr=1
  private closed=false;private dirty=true;private lastDraw=-Infinity;private notify:()=>void
  constructor(root:HTMLElement,video:HTMLVideoElement,notify:()=>void){
    this.root=root;this.notify=notify
    const keep=document.createElement('canvas').getContext('2d')
    if(!keep)throw new Error('얼굴 보호 마스크를 준비할 수 없어요.')
    this.keep=keep;keep.canvas.width=512;keep.canvas.height=288
    this.keepTexture=this.canvasTexture(keep.canvas)
    this.renderer=new THREE.WebGLRenderer({alpha:false,antialias:false,stencil:false,powerPreference:'low-power'});this.renderer.setPixelRatio(1)
    this.canvas=this.renderer.domElement;this.canvas.className='sb-canvas';this.canvas.setAttribute('aria-label','사브리나 · 얼굴은 그대로, 공주 의상과 손끝 마법이 따라오는 카메라')
    root.prepend(this.canvas)
    this.videoTexture=new THREE.VideoTexture(video);this.videoTexture.flipY=false;this.videoTexture.colorSpace=THREE.NoColorSpace
    this.videoTexture.generateMipmaps=false;this.videoTexture.minFilter=this.videoTexture.magFilter=THREE.LinearFilter
    this.maskTexture=this.createMask(1,1)
    this.wardrobe=new SabrinaWardrobe(this.cover)
    this.material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,depthTest:false,depthWrite:false,
      uniforms:{uVideo:{value:this.videoTexture},uWardrobe:{value:this.target.texture},uKeep:{value:this.keepTexture},uMask:{value:this.maskTexture},uClean:{value:null},uCover:{value:this.cover},uBounds:{value:this.wardrobe.bounds},uLive:{value:0},uMagic:{value:0},uCleanReady:{value:0}}})
    const mesh=new THREE.Mesh(this.plane,this.material);mesh.frustumCulled=false;this.scene.add(mesh)
    const seeds=new Float32Array(210),kinds=new Float32Array(210)
    for(let i=0;i<210;i++){seeds[i]=((i*71)%997)/997;kinds[i]=i%21===0?0:1}
    this.magicGeometry.setAttribute('position',new THREE.BufferAttribute(this.anchors,3));this.magicGeometry.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));this.magicGeometry.setAttribute('aKind',new THREE.BufferAttribute(kinds,1));this.magicGeometry.setDrawRange(0,0)
    this.magicMaterial=new THREE.ShaderMaterial({vertexShader:magicVertex,fragmentShader:magicFragment,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false,
      uniforms:{uCover:{value:this.cover},uTime:{value:0},uGlow:{value:0},uDpr:{value:1}}})
    this.magicPoints=new THREE.Points(this.magicGeometry,this.magicMaterial);this.magicPoints.frustumCulled=false;this.magicScene.add(this.magicPoints)
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(root);this.resize()
  }
  private canvasTexture(canvas:HTMLCanvasElement){const texture=new THREE.CanvasTexture(canvas);texture.flipY=false;texture.generateMipmaps=false;texture.minFilter=texture.magFilter=THREE.LinearFilter;return texture}
  private createMask(width:number,height:number){
    const texture=new THREE.DataTexture(this.maskPixels,width,height,THREE.RedFormat,THREE.UnsignedByteType)
    texture.flipY=false;texture.generateMipmaps=false;texture.unpackAlignment=1;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture
  }
  setPerson(mask:SabrinaMask|null){
    if(!mask){this.maskPixels.fill(0);this.maskTexture.needsUpdate=true;return}
    if(mask.mask.length!==mask.width*mask.height)return
    if(this.maskTexture.image.width!==mask.width||this.maskTexture.image.height!==mask.height){this.maskTexture.dispose();this.maskPixels=new Uint8Array(mask.mask.length);this.maskTexture=this.createMask(mask.width,mask.height);this.material.uniforms.uMask!.value=this.maskTexture}
    for(let i=0;i<mask.mask.length;i++)this.maskPixels[i]=Math.round(Math.max(0,Math.min(1,mask.mask[i]!))*255)
    this.maskTexture.needsUpdate=true;this.dirty=true
  }
  setBackground(canvas:HTMLCanvasElement|null){
    if(canvas&&this.clean?.image===canvas&&this.cleanWidth===canvas.width&&this.cleanHeight===canvas.height)this.clean.needsUpdate=true
    else{this.clean?.dispose();this.clean=canvas?this.canvasTexture(canvas):null;this.cleanWidth=canvas?.width??0;this.cleanHeight=canvas?.height??0;this.material.uniforms.uClean!.value=this.clean}
    this.material.uniforms.uCleanReady!.value=this.clean?1:0;this.dirty=true;this.notify()
  }
  private protect(state:SabrinaState,aspect:number,now:number){
    const context=this.keep,{width,height}=context.canvas
    context.clearRect(0,0,width,height);context.fillStyle='#fff';context.strokeStyle='#fff';context.lineJoin=context.lineCap='round'
    const polygon=(points:SabrinaPoint[])=>{if(!points.length)return;context.beginPath();points.forEach((p,i)=>{if(i)context.lineTo(p.x*width,p.y*height);else context.moveTo(p.x*width,p.y*height)});context.closePath();context.fill()}
    const frame=state.frame,body=frame?.body
    const head=state.faceVisible(now)&&(!frame||frame.head.front.z<.15)?sabrinaHead(state.face,aspect):null
    if(head){
      context.shadowColor='#fff';context.shadowBlur=2
      polygon(SABRINA_FACE_OVAL.map(i=>state.face[i]!))
      context.shadowBlur=0
      if(body){
        const w=head.width*.23/aspect,top=state.face[152]!.y-head.height*.09,bottom=Math.max(top,body.shoulder.y)
        polygon([{x:head.center.x-w,y:top},{x:head.center.x+w,y:top},{x:body.shoulder.x+w,y:bottom},{x:body.shoulder.x-w,y:bottom}])
      }
    }else if(frame&&state.tracking(now)){
      const patch=sabrinaFacePatch(frame.head,aspect)
      if(patch.length){
        context.shadowColor='#fff';context.shadowBlur=2;polygon(patch);context.shadowBlur=0
        const h=frame.head,top=sb3.add(h.center,sb3.mul(h.down,h.height*.45)),bottom=sb3.add(frame.shoulder,sb3.mul(frame.down,-frame.body.torso*.025))
        const forward=sb3.mul(h.front,h.width*.16),radius=h.width*.22
        polygon([sb3.add(sb3.add(top,forward),sb3.mul(h.right,-radius)),sb3.add(sb3.add(top,forward),sb3.mul(h.right,radius)),sb3.add(bottom,sb3.mul(h.right,radius)),sb3.add(bottom,sb3.mul(h.right,-radius))].map(p=>({x:p.x/aspect,y:p.y})))
      }
    }
    for(const hand of state.hands){
      const p=hand.points;if(p.length<21)continue
      // Restore original hand pixels, rather than building a distorted fake hand.
      polygon([0,1,2,5,9,13,17].map(i=>p[i]!))
      const palm=Math.hypot((p[5]!.x-p[17]!.x)*width,(p[5]!.y-p[17]!.y)*height)
      for(const chain of [[0,1,2,3,4],[0,5,6,7,8],[0,9,10,11,12],[0,13,14,15,16],[0,17,18,19,20]]){
        context.lineWidth=Math.max(3,palm*.14);context.beginPath();chain.forEach((i,j)=>{if(j)context.lineTo(p[i]!.x*width,p[i]!.y*height);else context.moveTo(p[i]!.x*width,p[i]!.y*height)});context.stroke()
      }
    }
    this.keepTexture.needsUpdate=true
  }
  private magic(state:SabrinaState,now:number,aspect:number){
    let finger=0
    for(const hand of state.hands){if(!sabrinaOpenPalm(hand.points,aspect))continue
      for(const index of SABRINA_FINGERTIPS){const p=hand.points[index]!;for(let j=0;j<21;j++)this.anchors.set([p.x,p.y,0],(finger*21+j)*3);finger++}
    }
    if(finger){this.magicGeometry.setDrawRange(0,finger*21);this.magicGeometry.attributes.position!.needsUpdate=true}
    const glow=state.glow(now)
    this.magicPoints.visible=glow>.01;this.magicMaterial.uniforms.uGlow!.value=glow;this.magicMaterial.uniforms.uTime!.value=now/1000
  }
  private resize(){
    if(this.closed)return
    this.width=Math.max(1,this.root.clientWidth);this.height=Math.max(1,this.root.clientHeight)
    this.dpr=Math.min(1.5,window.devicePixelRatio||1,1440/this.width,1080/this.height)
    const width=Math.max(1,Math.round(this.width*this.dpr)),height=Math.max(1,Math.round(this.height*this.dpr))
    this.renderer.setSize(width,height,false);this.target.setSize(width,height);this.magicMaterial.uniforms.uDpr!.value=this.dpr;this.dirty=true;this.notify()
  }
  render(video:HTMLVideoElement,live:boolean,state:SabrinaState,now:number){
    if(this.closed||(!this.dirty&&!live)||live&&now-this.lastDraw<1000/30)return
    const aspect=(video.videoWidth||960)/(video.videoHeight||540),cover=cameraCover(this.width,this.height,video.videoWidth||960,video.videoHeight||540)
    this.cover.set(cover.x,cover.y)
    const keepHeight=Math.max(1,Math.round(512/aspect))
    if(this.keep.canvas.height!==keepHeight){this.keep.canvas.height=keepHeight;this.keepTexture.dispose();this.keepTexture=this.canvasTexture(this.keep.canvas);this.material.uniforms.uKeep!.value=this.keepTexture}
    const amount=live&&state.tracking(now)?state.progress(now):0
    const wearing=this.wardrobe.update(state,now,aspect,amount)
    this.protect(state,aspect,now);this.magic(state,now,aspect)
    this.renderer.setRenderTarget(this.target);this.renderer.setClearColor(0,0);this.renderer.clear();this.renderer.render(this.wardrobe.scene,this.camera)
    this.renderer.setRenderTarget(null);this.renderer.setClearColor('#241d2d',1);this.renderer.clear()
    this.material.uniforms.uLive!.value=live&&video.readyState>=2?1:0;this.material.uniforms.uMagic!.value=wearing?amount:0
    this.renderer.render(this.scene,this.camera)
    if(live&&this.magicPoints.visible){this.renderer.autoClear=false;this.renderer.render(this.magicScene,this.camera);this.renderer.autoClear=true}
    this.lastDraw=now;this.dirty=false
  }
  reset(){this.setPerson(null);this.setBackground(null);this.magicGeometry.setDrawRange(0,0);this.keep.clearRect(0,0,this.keep.canvas.width,this.keep.canvas.height);this.keepTexture.needsUpdate=true;this.dirty=true}
  invalidate(){this.dirty=true}
  destroy(){
    this.closed=true;this.observer.disconnect();this.wardrobe.destroy();this.target.dispose();this.videoTexture.dispose();this.maskTexture.dispose();this.keepTexture.dispose();this.clean?.dispose();this.plane.dispose();this.material.dispose();this.magicGeometry.dispose();this.magicMaterial.dispose();this.scene.clear();this.magicScene.clear();this.keep.canvas.width=this.keep.canvas.height=1;this.renderer.dispose();this.renderer.forceContextLoss();this.canvas.remove()
  }
}
