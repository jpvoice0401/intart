import * as THREE from 'three'
import { ForestArt } from './animal-forest-art'
import type { ForestActivity, ForestLife, ForestResident } from './animal-forest-model'

const R=2.42, UP=new THREE.Vector3(0,1,0)
function direction(lat:number,lon:number){const a=lat*Math.PI/180,b=lon*Math.PI/180;return new THREE.Vector3(Math.cos(a)*Math.sin(b),Math.sin(a),Math.cos(a)*Math.cos(b))}
function random(seed:number){const n=Math.sin(seed*127.1+311.7)*43758.5453;return n-Math.floor(n)}
const HOME=direction(55,-10)
const DESTINATIONS:Record<ForestActivity,THREE.Vector3>={fruit:direction(38,-38),fish:direction(29,27),flower:direction(47,7),dance:direction(58,5)}

export class AnimalForestWorld {
  readonly canvas:HTMLCanvasElement
  private renderer:THREE.WebGLRenderer
  private host:HTMLElement
  private scene=new THREE.Scene()
  private camera=new THREE.PerspectiveCamera(38,1,.1,100)
  private planet=new THREE.Group()
  private art=new ForestArt()
  private extras=new Set<THREE.Material>()
  private textures=new Set<THREE.Texture>()
  private events=new AbortController()
  private observer:ResizeObserver
  private angle=-.2
  private tilt=.2
  private distance=13.2
  private width=1
  private height=1
  private stars:THREE.ShaderMaterial
  private neighbors:{anchor:THREE.Group;animal:THREE.Group;phase:number}[]=[]
  private asteroids:THREE.Group[]=[]
  private ship=new THREE.Group()
  private shipAge=100
  private shipDirection=1
  private meteor=new THREE.Group()
  private meteorAge=100
  private meteorStart=new THREE.Vector3()
  private meteorDelta=new THREE.Vector3()
  private meteorMaterial:THREE.LineBasicMaterial
  private player:THREE.Group|null=null
  private avatar:THREE.Group|null=null
  private parachute=new THREE.Group()
  private playerNormal=HOME.clone()
  private rod=new THREE.Group()
  private reward=new THREE.Group()
  private planted=0
  private plantedObjects:THREE.Group[]=[]
  private tree:THREE.Group
  private fire:THREE.Group
  private disposed=false
  private lastActivity:ForestActivity|null=null
  private drag:{x:number;y:number;distance:number}|null=null
  paused=false

  constructor(privateHost:HTMLElement,privateSelect:(kind:string,index:number)=>void) {
    this.host=privateHost
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'})
    this.renderer=renderer;this.canvas=renderer.domElement;this.canvas.className='af-canvas';this.canvas.tabIndex=0
    this.canvas.setAttribute('aria-label','숲 행성. 드래그하거나 방향키로 회전하고 동물과 과수원, 연못을 눌러보세요.')
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0,0);privateHost.prepend(this.canvas)
    this.scene.add(new THREE.HemisphereLight(0xfff6e5,0x7c9caa,2.1))
    const sun=new THREE.DirectionalLight(0xffefd8,2.7);sun.position.set(-4,7,8);this.scene.add(sun)
    const rim=new THREE.DirectionalLight(0x89bbd8,1.7);rim.position.set(5,1,-5);this.scene.add(rim)
    this.scene.add(this.planet)
    const ground=this.art.keep(new THREE.IcosahedronGeometry(R,4)),positions=ground.attributes.position!
    const colors=[]
    for(let i=0;i<positions.count;i++){
      const p=new THREE.Vector3().fromBufferAttribute(positions,i),n=p.clone().normalize()
      p.multiplyScalar(1+.008*Math.sin(n.x*15)*Math.cos(n.y*17+n.z*4));positions.setXYZ(i,p.x,p.y,p.z)
      const color=new THREE.Color().setHSL(.275+.015*Math.sin(n.x*8+n.z*5),.36,.36+.035*Math.sin(n.z*21+n.x*9+n.y*7))
      colors.push(color.r,color.g,color.b)
    }
    ground.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));ground.computeVertexNormals()
    const grass=this.extra(new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true}))
    this.planet.add(new THREE.Mesh(ground,grass))
    const trail=[]
    for(let i=0;i<=96;i++){const lon=i/96*360;trail.push(direction(23+9*Math.sin(lon*Math.PI/90),lon).multiplyScalar(R+.027))}
    const path=new THREE.CatmullRomCurve3(trail,true)
    const walk=this.art.keep(new THREE.TubeGeometry(path,100,.075,5,true));this.planet.add(new THREE.Mesh(walk,this.art.material(0xd8c49c)))
    for(let i=0;i<34;i++){
      const lat=Math.asin(1-2*(i+.5)/34)*180/Math.PI,lon=i*137.508
      const anchor=this.anchor(direction(lat,lon));const tree=this.art.tree(i%5===0?1:i%3===0?2:0)
      tree.scale.setScalar(.65+random(i)*.35);anchor.add(tree)
    }
    this.tree=this.art.tree(2);this.anchor(DESTINATIONS.fruit).add(this.tree);this.tree.userData.action='fruit'
    for(let i=0;i<14;i++){
      const grove=this.anchor(direction(-32+(i%4)*14,-48+Math.floor(i/4)*30)),tree=this.art.tree(i%4===0?1:i%3===0?2:0)
      tree.scale.setScalar(.4+random(i+90)*.18);grove.add(tree)
    }
    for(let i=0;i<8;i++){
      const anchor=this.anchor(direction([57,28,-19,2,-45,35,-30,60][i]!,[-42,59,-51,130,165,-150,-130,145][i]!))
      anchor.rotation.y+=(i%3)*.7;const house=this.art.house(i);house.scale.setScalar(.9);anchor.add(house)
    }
    for(const [lat,lon,index] of [[-12,-21,1],[-34,22,2]]){const house=this.art.house(index!);house.scale.setScalar(.72);this.anchor(direction(lat!,lon!)).add(house)}
    const pond=this.anchor(direction(28,28));pond.userData.action='fish'
    this.art.ball(pond,0xd8d4b2,[0,.018,0],[.62,.03,.46]);this.art.ball(pond,0x74bfc6,[0,.05,0],[.54,.032,.38])
    for(let i=0;i<4;i++)this.art.block(pond,0xa48464,[-.42+i*.07,.09,.2],[.065,.035,.37])
    for(let i=0;i<3;i++)this.art.ball(pond,0xd2e7cb,[.1+i*.08,.083,-.14+i*.1],[.055,.008,.035])
    this.fire=this.anchor(direction(59,6))
    for(let i=0;i<3;i++){const wood=this.art.pole(this.fire,0x94745c,[0,.07,0],[.045,.32,.045]);wood.rotation.z=Math.PI/2;wood.rotation.y=i*Math.PI/3}
    this.art.peak(this.fire,0xefb574,[0,.25,0],[.12,.35,.12]);this.art.peak(this.fire,0xffd99b,[0,.2,.05],[.07,.24,.07]);this.fire.userData.action='dance'
    const seats=[[-.35,.06,.08],[.35,.06,.08],[0,.06,-.34]]
    for(const p of seats)this.art.ball(this.fire,0xc2ad8a,p,[.12,.09,.11])
    const places=[[55,-58],[24,-80],[18,-26],[46,4],[1,56],[65,105],[-23,14],[-35,-55],[5,133],[28,177],[-58,105],[-35,-148]]
    for(let i=0;i<12;i++){
      const anchor=this.anchor(direction(places[i]![0]!,places[i]![1]!)),animal=this.art.animal(i)
      animal.scale.setScalar(.55);animal.rotation.y=(i%3-1)*.3;anchor.add(animal)
      this.neighbors.push({anchor,animal,phase:i*.73});anchor.userData.animal=i
      this.shadow(anchor,.18)
    }
    for(let i=0;i<23;i++)this.anchor(direction(Math.asin(1-2*(i+.5)/23)*180/Math.PI,i*137.5+40)).add(this.art.flower(i))
    for(let i=0;i<3;i++){
      const asteroid=new THREE.Group(),rock=new THREE.Mesh(this.art.keep(new THREE.DodecahedronGeometry(.18+i*.035,0)),this.art.material([0x989da8,0xb8b6ae,0x8d9ca4][i]!))
      rock.scale.set(1.2,.85,1);asteroid.add(rock)
      for(let j=0;j<3;j++)this.art.ball(asteroid,0x727d8a,[(j-1)*.08,.1,-.08],[.04,.025,.03])
      this.scene.add(asteroid);this.asteroids.push(asteroid)
    }
    this.stars=this.buildSpace()
    this.art.ball(this.ship,0xb4c9bd,[0,0,0],[.55,.09,.28]);this.art.ball(this.ship,0xc2c3ed,[0,.13,0],[.22,.19,.19])
    for(let i=0;i<5;i++)this.art.ball(this.ship,0xf6d59b,[(i-2)*.17,-.01,.22],[.035,.025,.035])
    this.art.ball(this.ship,0x99b7ac,[0,-.08,-.18],[.24,.035,.18]);this.scene.add(this.ship);this.ship.visible=false
    const lineGeometry=this.art.keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(2.3,1.1,0)]))
    this.meteorMaterial=this.extra(new THREE.LineBasicMaterial({color:0xffdfb0,transparent:true,opacity:1}))
    this.meteor.add(new THREE.Line(lineGeometry,this.meteorMaterial));this.art.ball(this.meteor,0xfff5d5,[0,0,0],[.045,.045,.045]);this.scene.add(this.meteor);this.meteor.visible=false
    const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),events={signal:this.events.signal}
    this.canvas.addEventListener('pointerdown',event=>{this.canvas.setPointerCapture(event.pointerId);this.drag={x:event.clientX,y:event.clientY,distance:0}},events)
    this.canvas.addEventListener('pointermove',event=>{
      if(!this.drag)return
      const dx=event.clientX-this.drag.x,dy=event.clientY-this.drag.y
      this.drag.distance+=Math.abs(dx)+Math.abs(dy);this.angle+=dx*.007;this.tilt=THREE.MathUtils.clamp(this.tilt+dy*.004,-.55,.8);this.drag.x=event.clientX;this.drag.y=event.clientY
    },events)
    this.canvas.addEventListener('pointerup',event=>{
      if(this.drag&&this.drag.distance<7){
        const rect=this.canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1)
        raycaster.setFromCamera(pointer,this.camera)
        const hit=raycaster.intersectObject(this.planet,true)[0]
        if(hit){let object:THREE.Object3D|null=hit.object;while(object&&object!==this.planet){if(typeof object.userData.animal==='number'){privateSelect('animal',object.userData.animal);break}if(object.userData.action){privateSelect(object.userData.action,0);break}object=object.parent}}
      }
      this.drag=null
    },events)
    this.canvas.addEventListener('pointercancel',()=>{this.drag=null},events)
    this.canvas.addEventListener('lostpointercapture',()=>{this.drag=null},events)
    this.canvas.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.code))return
      event.preventDefault()
      if(event.code==='Home')this.focusResident()
      else if(event.code==='ArrowLeft')this.angle-=.25
      else if(event.code==='ArrowRight')this.angle+=.25
      else this.tilt=THREE.MathUtils.clamp(this.tilt+(event.code==='ArrowUp'?-.15:.15),-.55,.8)
    },events)
    const resize=()=>{
      this.width=Math.max(1,privateHost.clientWidth);this.height=Math.max(1,privateHost.clientHeight)
      this.camera.aspect=this.width/this.height;this.camera.updateProjectionMatrix()
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,this.width<800?1.25:1.6));renderer.setSize(this.width,this.height,false)
      this.fitView()
    }
    this.observer=new ResizeObserver(resize);this.observer.observe(privateHost);resize()
  }
  private extra<T extends THREE.Material>(material:T):T{this.extras.add(material);return material}
  /** Keep the entire little planet between the phone heading and its controls. */
  fitView(){
    const portrait=this.height>this.width&&this.width<800
    this.distance=13.2
    if(portrait){
      const bounds=this.host.getBoundingClientRect(),heading=this.host.querySelector('.af-heading')!.getBoundingClientRect()
      const card=this.host.querySelector<HTMLElement>('.af-welcome:not([hidden]),.af-resident:not([hidden])')
      const top=heading.bottom-bounds.top+14,bottom=Math.max(top+100,(card?.getBoundingClientRect().top??bounds.bottom-170)-bounds.top-14)
      const worldPerPixel=2*this.distance*Math.tan(19*Math.PI/180)/this.height
      const radius=Math.min((this.width-30)/2,(bottom-top)/2)
      this.planet.scale.setScalar(radius*worldPerPixel/3.9)
      this.planet.position.set(0,(this.height/2-(top+bottom)/2)*worldPerPixel,0)
    }else{
      this.planet.scale.setScalar(1);this.planet.position.set(1.55,-.15,0)
    }
  }
  private anchor(normal:THREE.Vector3,radius=R+.02){const g=new THREE.Group();g.position.copy(normal).multiplyScalar(radius);g.quaternion.setFromUnitVectors(UP,normal);this.planet.add(g);return g}
  private shadow(anchor:THREE.Group,radius:number){const mat=this.extra(new THREE.MeshBasicMaterial({color:0x273a2e,transparent:true,opacity:.2,depthWrite:false}));const mesh=new THREE.Mesh(this.art.keep(new THREE.CircleGeometry(radius,16)),mat);mesh.rotation.x=-Math.PI/2;mesh.position.y=.008;anchor.add(mesh)}
  private buildSpace(){
    const n=1100,positions=new Float32Array(n*3),phases=new Float32Array(n)
    for(let i=0;i<n;i++){positions.set([(random(i+3)-.5)*65,(random(i+11)-.5)*40,-8-random(i+25)*22],i*3);phases[i]=random(i+44)*6}
    const geometry=this.art.keep(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('aPhase',new THREE.BufferAttribute(phases,1))
    const material=this.extra(new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:{value:0}},vertexShader:`attribute float aPhase; uniform float uTime; varying float vLight; void main(){vec4 p=modelViewMatrix*vec4(position,1.); vLight=.45+.5*sin(uTime*(.6+aPhase*.12)+aPhase*8.); gl_Position=projectionMatrix*p; gl_PointSize=clamp((2.+aPhase)*150./-p.z,1.,5.);}`,fragmentShader:`varying float vLight; void main(){vec2 p=gl_PointCoord-.5;float a=smoothstep(.5,0.,length(p));float crossGlow=exp(-abs(p.x)*35.)*exp(-abs(p.y)*4.)+exp(-abs(p.y)*35.)*exp(-abs(p.x)*4.);gl_FragColor=vec4(mix(vec3(.69,.81,.83),vec3(1.,.91,.71),vLight),(a*.5+crossGlow*.25)*vLight);}`}))
    this.scene.add(new THREE.Points(geometry,material))
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128
    const ctx=canvas.getContext('2d')!,glow=ctx.createRadialGradient(64,64,0,64,64,64)
    glow.addColorStop(0,'#ffffff22');glow.addColorStop(.45,'#ffffff0b');glow.addColorStop(1,'#ffffff00');ctx.fillStyle=glow;ctx.fillRect(0,0,128,128)
    const texture=new THREE.CanvasTexture(canvas);this.textures.add(texture)
    for(const [x,y,z,color,size] of [[-9,3,-10,0x6c8cae,24],[10,-5,-18,0xb69bcb,30],[-2,-7,-12,0x75a998,18]]){
      const sprite=new THREE.Sprite(this.extra(new THREE.SpriteMaterial({map:texture,color,transparent:true,depthWrite:false})));sprite.position.set(x!,y!,z!);sprite.scale.setScalar(size!);this.scene.add(sprite)
    }
    return material
  }
  setResident(resident:ForestResident){
    if(this.player)this.planet.remove(this.player)
    for(const flower of this.plantedObjects)this.planet.remove(flower)
    this.plantedObjects=[];this.planted=0
    this.playerNormal.copy(HOME);this.player=this.anchor(HOME);this.avatar=this.art.animal(resident.animal);this.avatar.scale.setScalar(.55);this.player.add(this.avatar);this.shadow(this.player,.23)
    this.parachute=new THREE.Group()
    const canopy=new THREE.Mesh(this.art.keep(new THREE.SphereGeometry(1,18,9,0,Math.PI*2,0,Math.PI/2)),this.art.material(0xf0ba99));canopy.scale.set(.6,.35,.6);canopy.position.y=1.4;this.parachute.add(canopy)
    for(const sign of [-1,1])this.art.curve(this.parachute,0xf7e6c1,[[sign*.55,1.4,0],[sign*.2,.7,.1]],.007)
    this.player.add(this.parachute);this.parachute.visible=false
    this.rod=new THREE.Group();this.art.curve(this.rod,0x9c7b58,[[.12,.2,.07],[.12,.7,.1],[.12,.85,.35]],.012);this.art.curve(this.rod,0xe9ddc3,[[.12,.85,.35],[.12,.25,.65]],.004);this.art.ball(this.rod,0xe5aa92,[.12,.22,.65],[.035,.035,.035]);this.player.add(this.rod);this.rod.visible=false
    this.reward=new THREE.Group();this.art.ball(this.reward,0xf0be84,[0,0,0],[.1,.1,.1]);this.art.peak(this.reward,0xa8ccac,[0,.11,0],[.06,.08,.02]);this.player.add(this.reward);this.reward.visible=false
    this.focusResident()
  }
  focusResident(){this.angle=-Math.atan2(this.playerNormal.x,this.playerNormal.z);this.tilt=.24}
  greet(index:number){const neighbor=this.neighbors[index];if(!neighbor)return;this.angle=-Math.atan2(neighbor.anchor.position.x,neighbor.anchor.position.z);this.tilt=THREE.MathUtils.clamp(Math.asin(neighbor.anchor.position.y/R)-.5,-.4,.8);neighbor.animal.userData.greeting=2}
  meteorShower(){this.meteorAge=0;this.meteorStart.set((Math.random()-.2)*12,4+Math.random()*2,-4);this.meteorDelta.set(-9-Math.random()*3,-5-Math.random()*2,0);this.meteor.visible=true}
  flyShip(){this.shipAge=0;this.shipDirection=Math.random()<.5?-1:1;this.ship.visible=true}
  plantFlowers(count:number,flower:number){while(this.planted<Math.min(count,24)){const i=this.planted++,anchor=this.anchor(direction(40+(i%4)*6,-12+Math.floor(i/4)*9));anchor.add(this.art.flower(flower));this.plantedObjects.push(anchor)}}
  render(life:ForestLife,dt:number){
    if(this.disposed)return
    const t=life.elapsed
    if(!this.paused&&!this.drag&&life.landing===0&&!life.activity)this.angle+=dt*.045
    const f=1-Math.exp(-dt*4)
    this.planet.rotation.y+=(this.angle-this.planet.rotation.y)*f;this.planet.rotation.x+=(this.tilt-this.planet.rotation.x)*f
    this.camera.position.set(0,0,this.distance*(life.landing>0?1+.12*life.landing/4.5:1));this.camera.lookAt(0,0,0)
    this.stars.uniforms.uTime!.value=t
    for(const [i,asteroid] of this.asteroids.entries()){
      const a=t*(.07+i*.02)+i*2.1;asteroid.position.set(Math.cos(a)*(4.5+i*.6),Math.sin(a*.7)*2.7,Math.sin(a)*2-2);asteroid.rotation.set(t*.11+i,t*.15,0)
    }
    for(const neighbor of this.neighbors){
      const greeting=Math.max(0,(neighbor.animal.userData.greeting??0)-dt);neighbor.animal.userData.greeting=greeting
      neighbor.animal.position.y=Math.max(0,Math.sin(t*(life.activity==='dance'||greeting>0?8:1.7)+neighbor.phase))*(life.activity==='dance'||greeting>0?.1:.014)
      neighbor.animal.rotation.z=Math.sin(t*1.5+neighbor.phase)*.045
      neighbor.animal.rotation.y=Math.sin(t*.4+neighbor.phase)*.35
    }
    this.tree.rotation.z=life.activity==='fruit'?Math.sin(t*16)*.06:0
    this.fire.children[3]!.scale.y=.33+Math.sin(t*8)*.04
    this.shipAge+=dt
    if(this.shipAge<10){const p=this.shipAge/10;this.ship.position.set((p*2-1)*12*this.shipDirection,3.8+Math.sin(p*Math.PI)*.6,-4);this.ship.rotation.z=Math.sin(t*2)*.06}else this.ship.visible=false
    this.meteorAge+=dt
    if(this.meteorAge<1.8){const p=this.meteorAge/1.8;this.meteor.position.copy(this.meteorStart).addScaledVector(this.meteorDelta,p);this.meteorMaterial.opacity=Math.sin(Math.PI*p)}else this.meteor.visible=false
    if(this.player&&this.avatar){
      const destination=life.activity?DESTINATIONS[life.activity]:HOME
      this.playerNormal.lerp(destination,1-Math.exp(-dt*2.2)).normalize();this.player.position.copy(this.playerNormal).multiplyScalar(R+.025);this.player.quaternion.setFromUnitVectors(UP,this.playerNormal)
      if(life.activity&&this.lastActivity!==life.activity)this.focusResident()
      this.lastActivity=life.activity
      this.avatar.position.y=life.landing>0?Math.pow(life.landing/4.5,2)*8:life.activity==='dance'?Math.abs(Math.sin(t*8))*.18:Math.sin(t*2)*.012
      this.avatar.rotation.z=life.activity==='dance'?Math.sin(t*8)*.13:0
      this.parachute.visible=life.landing>0;this.parachute.position.y=this.avatar.position.y
      this.rod.visible=life.activity==='fish'
      this.reward.visible=life.activity==='fruit'||life.activity==='flower';this.reward.position.set(0,.85+Math.sin(t*3)*.06,0)
    }
    this.renderer.render(this.scene,this.camera)
  }
  destroy(){
    this.disposed=true;this.events.abort();this.observer.disconnect();this.art.destroy();for(const m of this.extras)m.dispose();for(const t of this.textures)t.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.canvas.remove();this.scene.clear()
  }
}
