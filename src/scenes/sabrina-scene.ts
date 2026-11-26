import '../sabrina.css'
import {openCamera,setCameraVisible} from '../camera-access'
import {MinecraftCapture} from '../minecraft-capture'
import {SabrinaState,type SabrinaMask} from '../sabrina-model'
import {SabrinaVision} from '../sabrina-vision'
import {SabrinaRenderer} from '../sabrina-renderer'
import {SabrinaLookDeck,SABRINA_DRESSES,SABRINA_HAIR,type SabrinaLook} from '../sabrina-styles'
import {SabrinaTurnTracker} from '../sabrina-turn'

const wardrobeDeck=new SabrinaLookDeck()

export function mountSabrina(container:HTMLElement):()=>void{
  const base=import.meta.env.BASE_URL
  container.innerHTML=`
    <section class="sb-scene" aria-label="Sabrina · 손끝의 빛으로 변신하는 공주 마법">
      <video class="sb-video" playsinline muted aria-hidden="true"></video>
      <div class="sb-intro"><div class="sb-intro-copy"><p class="sb-kicker">A LITTLE MAGIC. ALL YOU.</p><h2>손끝에서 시작되는,<br><em>나만의 공주 마법.</em></h2><p>손바닥을 펼쳐 작은 빛을 깨워보세요.<br>얼굴은 그대로, 머리부터 발끝까지 새로운 나.</p><button class="sb-start" type="button">카메라 켜고 마법 시작 <span>✧</span></button><small>전신이 카메라에 들어오도록 충분히 떨어져 주세요.<br>영상은 기기 안에서만 처리됩니다.</small></div><div class="sb-preview" aria-hidden="true"><img src="${base}sabrina/dress.webp" alt=""><span>✧</span><span>✧</span><span>✦</span></div></div>
      <header class="sb-heading"><div><p>THE TEENAGE WITCH / EXPERIMENT 017</p><h1>Sabrina<sup>✧</sup><span>사브리나 · 손끝에 숨겨둔 마법</span></h1></div><div class="sb-badge"><b>YOUR FACE. YOUR FAIRYTALE.</b><span class="sb-look">5 DRESSES · 5 HAIRSTYLES</span></div></header>
      <div class="sb-feedback"><i aria-hidden="true"></i><p class="sb-status" role="status" aria-live="polite">누구나 자기만의 마법을 가지고 있어요.</p></div>
      <div class="sb-guide"><span>01<b>전신을 카메라에</b></span><span>02<b>손바닥 펼치기</b></span><span>03<b>한 바퀴마다 새 의상</b></span></div>
      <span class="sb-state" aria-hidden="true">A LITTLE MAGIC IN YOUR EVERYDAY</span>
      <footer class="sb-tools"><button class="sb-labels" type="button" aria-label="화면 안내 표시 전환" aria-pressed="true" title="안내 표시 전환">Aa</button><button class="sb-magic" type="button" disabled>마법 체험 ✧</button><button class="sb-reset" type="button">마법 풀기</button><button class="sb-camera" type="button">카메라 켜기</button></footer>
    </section>`
  const root=container.querySelector<HTMLElement>('.sb-scene')!,video=root.querySelector<HTMLVideoElement>('video')!
  const start=root.querySelector<HTMLButtonElement>('.sb-start')!,camera=root.querySelector<HTMLButtonElement>('.sb-camera')!
  const status=root.querySelector<HTMLElement>('.sb-status')!,intro=root.querySelector<HTMLElement>('.sb-intro')!
  const labels=root.querySelector<HTMLButtonElement>('.sb-labels')!,magic=root.querySelector<HTMLButtonElement>('.sb-magic')!
  const lookLabel=root.querySelector<HTMLElement>('.sb-look')!
  const state=new SabrinaState(),turns=new SabrinaTurnTracker(),events=new AbortController(),options={signal:events.signal}
  let disposed=false,live=false,preparing=false,generation=0,frame=0,previous=performance.now(),videoTime=-1,hudAt=-Infinity
  let stream:MediaStream|null=null,vision:SabrinaVision|null=null,capture:MinecraftCapture|null=null,latestMask:SabrinaMask|null=null
  let showLabels=true,assetsReady=false
  let lookName=''
  let currentLook:SabrinaLook|null=null
  let renderer:SabrinaRenderer
  const say=(text:string)=>{if(status.textContent!==text)status.textContent=text}
  function requestFrame(){if(!disposed&&!document.hidden&&!frame)frame=requestAnimationFrame(animate)}
  try{renderer=new SabrinaRenderer(root,video,requestFrame)}catch(error){say(`화면을 시작하지 못했어요: ${String(error)}`);start.disabled=camera.disabled=true;return()=>events.abort()}
  try{showLabels=localStorage.getItem('sabrina-labels')!=='hidden'}catch{/* Optional storage. */}
  const syncLabels=()=>{root.classList.toggle('sb-hide-labels',!showLabels);labels.setAttribute('aria-pressed',String(showLabels))}
  syncLabels()
  void renderer.wardrobe.load().then(()=>{if(disposed)return;assetsReady=true;magic.disabled=!live||preparing;renderer.invalidate();requestFrame()}).catch(error=>{if(!disposed){say(String(error));start.disabled=camera.disabled=magic.disabled=true}})
  function stopCamera(){
    generation++;live=preparing=false;cancelAnimationFrame(frame);frame=0;turns.reset()
    vision?.close();vision=null;capture?.reset();capture=null;latestMask=null
    stream?.getTracks().forEach(track=>track.stop());stream=null;video.pause();video.srcObject=null;state.clear();renderer.reset()
    lookLabel.textContent='5 DRESSES · 5 HAIRSTYLES'
    root.classList.remove('sb-live','sb-transformed');intro.hidden=false;start.disabled=false;start.innerHTML='카메라 켜고 마법 시작 <span>✧</span>';camera.textContent='카메라 켜기';magic.disabled=true;magic.textContent='마법 체험 ✧';requestFrame()
  }
  async function startCamera(){
    if(preparing||stream){stopCamera();say('카메라를 껐어요. 다시 켜면 마법을 시작할 수 있어요.');return}
    if(!assetsReady){say('마법 의상을 준비하고 있어요. 잠시 후 다시 눌러주세요.');return}
    const token=++generation;preparing=true;start.disabled=true;start.textContent='카메라 연결 중…';camera.textContent='취소';say('카메라 사용을 허용해주세요.')
    try{
      const cameraStream=await openCamera(video,960,540)
      if(disposed||token!==generation){cameraStream.getTracks().forEach(track=>track.stop());return}
      stream=cameraStream;video.srcObject=stream;await video.play();if(disposed||token!==generation)return
      live=true;intro.hidden=true;root.classList.add('sb-live');setCameraVisible(stream,!document.hidden);previous=performance.now();requestFrame()
      capture=new MinecraftCapture(background=>{if(!disposed&&live){renderer.setBackground(background);requestFrame()}})
      const tracking=new SabrinaVision((output,time,image)=>{
        if(disposed||token!==generation||document.hidden)return
        const aspect=(video.videoWidth||960)/(video.videoHeight||540)
        state.receive(output,time,aspect)
        if(output.task==='pose'){
          latestMask=output.person;renderer.setPerson(output.person)
          if(image&&output.person)capture?.update(image,output.person,time,state.transformed)
        }
      })
      vision=tracking;tracking.setVisible(!document.hidden);await tracking.initialize(message=>{if(!disposed&&token===generation)say(message)})
      if(disposed||token!==generation){tracking.close();return}
      preparing=false;camera.textContent='카메라 끄기';magic.disabled=!assetsReady;videoTime=-1;hudAt=-Infinity
      say('얼굴과 몸을 보여준 뒤, 어느 손이든 손바닥을 펼쳐보세요.');requestFrame()
      cameraStream.getVideoTracks()[0]?.addEventListener('ended',()=>{if(!disposed&&token===generation){stopCamera();say('카메라 연결이 종료됐어요. 다시 켜주세요.')}},options)
    }catch(error){
      if(disposed||token!==generation)return
      stopCamera();const name=error instanceof Error?error.name:''
      say(name==='NotAllowedError'?'카메라 권한을 허용해주세요. HTTPS 인증서를 신뢰한 뒤 Chrome·Safari에서 열어주세요.':name==='NotReadableError'?'다른 앱이 카메라를 사용 중인지 확인해주세요.':name==='NotFoundError'?'카메라를 찾지 못했어요.':`시작하지 못했어요: ${error instanceof Error?error.message:String(error)}`)
    }
  }
  function beginMagic(){
    if(!live||preparing||state.transformed||document.hidden)return
    const now=performance.now(),aspect=(video.videoWidth||960)/(video.videoHeight||540)
    if(!state.activate(now,aspect)){say('얼굴과 어깨가 잘 보이게 해주세요. 발끝도 보이면 전신으로 변신해요.');return}
    transform()
  }
  function showLook(advance=false){
    if(!currentLook||advance)currentLook=wardrobeDeck.next()
    const look=currentLook
    renderer.wardrobe.setLook(look)
    lookName=`${SABRINA_DRESSES[look.dress]!.name} · ${SABRINA_HAIR[look.hair]!.name}`
    lookLabel.textContent=lookName
  }
  function transform(){
    turns.reset();showLook()
    if(latestMask){const saved=capture?.save(latestMask);if(saved)renderer.setBackground(saved.background)}
    root.classList.add('sb-transformed');magic.disabled=true;magic.textContent='마법이 이루어졌어요 ✧';say(lookName);requestFrame()
  }
  function restore(){state.reset();turns.reset();capture?.reset();renderer.setBackground(null);lookLabel.textContent='5 DRESSES · 5 HAIRSTYLES';root.classList.remove('sb-transformed');magic.disabled=!live||preparing||!assetsReady;magic.textContent='마법 체험 ✧';say(live?'마법을 풀었어요. 다시 변신한 뒤 한 바퀴 돌면 의상이 바뀌어요.':'카메라를 켜면 손끝에서 마법이 시작돼요.');hudAt=performance.now()+1600;requestFrame()}
  function animate(now:number){
    frame=0;if(disposed||document.hidden)return
    const dt=Math.max(0,(now-previous)/1000);previous=now
    if(live&&vision&&!preparing&&video.currentTime!==videoTime){
      if(vision.error){stopCamera();say('마법 인식이 멈췄어요. 카메라를 다시 켜주세요.');return}
      if(vision.submit(video,now))videoTime=video.currentTime
    }
    const aspect=(video.videoWidth||960)/(video.videoHeight||540)
    if(live&&state.update(now,dt,aspect))transform()
    if(live&&state.transformed&&turns.update(state.tracking(now)?state.frame!.yaw:null,now)){
      showLook(true);say(`새로운 마법 · ${lookName}`);hudAt=now+1200
    }
    renderer.render(video,live,state,now)
    if(live&&!preparing&&now-hudAt>240){
      const body=state.tracking(now)?state.frame?.body:null
      say(state.transformed?(!state.tracking(now)?'몸이 카메라 안에 들어오게 해주세요. 변신은 유지되고 있어요.'
        :state.progress(now)<1?lookName:body?.fullBody?`${lookName} · 한 바퀴 돌 때마다 의상과 헤어가 바뀌어요.`:'전신이 보이도록 뒤로 가서 천천히 돌아보세요.')
        :!state.ready(now,aspect)?'먼저 얼굴과 어깨를 카메라에 보여주세요. 변신 후에는 뒤돌아도 유지돼요.'
        :state.openHands?'손끝에 빛이 모이고 있어요. 잠깐 그대로 보여주세요.':'엄지까지 손바닥을 펼쳐보세요. 양손 모두 마법을 쓸 수 있어요.')
      hudAt=now
    }
    if(live)frame=requestAnimationFrame(animate)
  }
  start.addEventListener('click',()=>void startCamera(),options);camera.addEventListener('click',()=>void startCamera(),options)
  magic.addEventListener('click',beginMagic,options);root.querySelector('.sb-reset')!.addEventListener('click',restore,options)
  labels.addEventListener('click',()=>{showLabels=!showLabels;syncLabels();try{localStorage.setItem('sabrina-labels',showLabels?'visible':'hidden')}catch{/* Optional. */}},options)
  window.addEventListener('keydown',event=>{if(event.code==='Space'&&!event.repeat&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!(event.target as HTMLElement)?.closest('button,a,input,textarea,select')&&live){event.preventDefault();beginMagic()}},options)
  document.addEventListener('visibilitychange',()=>{
    cancelAnimationFrame(frame);frame=0;state.clearHands();turns.reset();if(document.hidden)capture?.pause();vision?.setVisible(!document.hidden);setCameraVisible(stream,!document.hidden)
    if(!document.hidden){previous=performance.now();videoTime=-1;renderer.invalidate();requestFrame()}
  },options)
  renderer.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();stopCamera();start.disabled=camera.disabled=magic.disabled=true;say('그래픽 연결이 끊겼어요. 페이지를 새로고침해주세요.')},options)
  requestFrame()
  return()=>{disposed=true;events.abort();cancelAnimationFrame(frame);frame=0;stopCamera();renderer.destroy()}
}
