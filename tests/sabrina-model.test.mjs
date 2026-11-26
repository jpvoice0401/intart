// Server-free numerical validation. Does not initialize camera, Vite or models.
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {SabrinaState,sabrinaOpenPalm,sabrinaBody,sabrinaHead} from '../src/sabrina-model.ts'

function hand({mirror=false,scale=1,rotation=0,fist=false,thumbClosed=false}={}){
  const p=Array.from({length:21},()=>({x:.5,y:.7}))
  p[0]={x:.5,y:.85};p[1]={x:.38,y:.73};p[2]={x:.30,y:.64};p[3]={x:.23,y:.57};p[4]=thumbClosed?{x:.40,y:.62}:{x:.15,y:.49}
  for(const [base,x,y]of [[5,.38,.59],[9,.5,.55],[13,.62,.59],[17,.73,.64]]){
    p[base]={x,y};p[base+1]={x,y:y-.13};p[base+2]={x,y:y-.24};p[base+3]={x,y:fist?y+.06:y-.36}
  }
  for(const q of p){const x=(q.x-.5)*scale,y=(q.y-.5)*scale;q.x=.5+(mirror?-1:1)*(x*Math.cos(rotation)-y*Math.sin(rotation));q.y=.5+x*Math.sin(rotation)+y*Math.cos(rotation)}
  return{id:mirror?'Right':'Left',points:p}
}
function pose(){
  const p=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}))
  for(const [i,x,y]of [[11,.37,.35],[12,.63,.35],[23,.42,.57],[24,.58,.57],[27,.43,.88],[28,.57,.88],[29,.43,.92],[30,.57,.92],[31,.40,.95],[32,.60,.95]])p[i]={x,y,z:0,visibility:1}
  return p
}
function face(){
  const p=Array.from({length:478},()=>({x:.5,y:.2,z:0}))
  p[10]={x:.5,y:.10};p[152]={x:.5,y:.30};p[234]={x:.42,y:.2};p[454]={x:.58,y:.2}
  return p
}
function prepare(state,time=0){state.receive({task:'pose',points:pose(),person:null},time,1);state.receive({task:'face',points:face()},time,1)}

test('an open palm works on either hand, at different sizes and rotations',()=>{
  for(const mirror of [false,true])for(const scale of [.4,1,1.5])for(const rotation of [-.7,0,.7])assert.equal(sabrinaOpenPalm(hand({mirror,scale,rotation}).points,1),true)
})
test('a fist, a closed thumb and invalid landmarks do not become open palms',()=>{
  assert.equal(sabrinaOpenPalm(hand({fist:true}).points),false)
  assert.equal(sabrinaOpenPalm(hand({thumbClosed:true}).points),false)
  const invalid=hand().points;invalid[8].x=NaN
  assert.equal(sabrinaOpenPalm(invalid),false);assert.equal(sabrinaOpenPalm([]),false)
})
test('screen aspect changes do not reject a clear palm',()=>{for(const aspect of [.56,1,1.78])assert.equal(sabrinaOpenPalm(hand().points,aspect),true)})
test('feet must be visible before shoes are enabled',()=>{
  const p=pose(),body=sabrinaBody(p)
  assert.ok(body.fullBody);assert.ok(body.hem.y>body.waist.y)
  p[31].visibility=.1;assert.equal(sabrinaBody(p).fullBody,false)
  p[31].visibility=1;p[31].y=1.3;assert.equal(sabrinaBody(p).fullBody,false)
})
test('an upper-body crop gets a finite offscreen skirt estimate, without invented visible shoes',()=>{
  const p=pose();for(let i=23;i<33;i++)p[i].visibility=.1
  const body=sabrinaBody(p,.56)
  assert.ok(body);assert.equal(body.fullBody,false)
  for(const v of [body.hem.x,body.hem.y,body.width,body.torso])assert.ok(Number.isFinite(v))
})
test('missing shoulders, collapsed head and corrupt landmarks hide the costume',()=>{
  const p=pose();p[11].visibility=.1;assert.equal(sabrinaBody(p),null)
  p[11].visibility=1;p[24].x=NaN;assert.equal(sabrinaBody(p),null)
  const f=face();f[152]={...f[10]};assert.equal(sabrinaHead(f),null)
  assert.equal(sabrinaHead([]),null);assert.equal(sabrinaBody([]),null)
})
test('brief palm sightings do not transform; a sustained open palm does',()=>{
  const state=new SabrinaState();prepare(state)
  state.receive({task:'hands',hands:[hand()]},20,1);assert.equal(state.update(40,.02,1),false)
  for(const time of [120,220,320]){state.receive({task:'hands',hands:[hand()]},time,1);assert.equal(state.update(time,.02,1),false)}
  state.receive({task:'hands',hands:[hand()]},420,1);assert.equal(state.update(420,.02,1),true)
  assert.equal(state.transformed,true)
})
test('face protection and body fit must both be fresh before any transformation',()=>{
  const state=new SabrinaState();assert.equal(state.activate(0,1),false)
  state.receive({task:'pose',points:pose(),person:null},0,1);assert.equal(state.activate(0,1),false)
  prepare(state,0);assert.equal(state.activate(700,1),false)
  prepare(state,800);assert.equal(state.activate(800,1),true)
})
test('removing the hand preserves the completed outfit until reset',()=>{
  const state=new SabrinaState();prepare(state);assert.ok(state.activate(10,1))
  state.receive({task:'hands',hands:[]},500,1);state.update(2000,.05,1)
  assert.equal(state.progress(2000),1);assert.equal(state.transformed,true)
  state.reset();assert.equal(state.transformed,false);assert.equal(state.progress(2001),0)
})
test('tracking loss fades the hand light and stops costume fitting safely',()=>{
  const state=new SabrinaState();prepare(state)
  state.receive({task:'hands',hands:[hand()]},20,1);assert.equal(state.glow(20),1)
  state.receive({task:'hands',hands:[]},80,1);state.update(500,.05,1)
  assert.equal(state.glow(500),0);assert.equal(state.hands.length,0)
  state.receive({task:'face',points:null},500,1);state.update(500,.05,1)
  assert.equal(state.ready(500,1),false)
})
test('smoothing does not rewrite the original received face or pose landmarks',()=>{
  const state=new SabrinaState(),p=pose(),f=face(),before=JSON.stringify({p,f})
  state.receive({task:'pose',points:p,person:null},0,1);state.receive({task:'face',points:f},0,1);state.update(10,.016,1)
  assert.equal(JSON.stringify({p,f}),before)
  state.clear();assert.equal(state.face.length,0);assert.equal(state.pose.length,0)
})
