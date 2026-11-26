import '../rubber-human.css'
import { openCamera, setCameraVisible } from '../camera-access'
import { RubberHumanModel } from '../rubber-human-model'
import { RubberHumanRenderer } from '../rubber-human-renderer'
import { RubberHumanVision } from '../rubber-human-vision'

export function mountRubberHuman(container:HTMLElement):()=>void {
  container.innerHTML=`
    <section class="rubber-scene" aria-label="고무 인간 · 얼굴을 잡아 늘리는 카메라">
      <video class="rubber-video" playsinline muted aria-hidden="true"></video>
      <header class="rubber-heading"><div><p>SOFT SKIN / PLAYFUL PHYSICS</p><h1>고무 인간<span>Rubber Human</span></h1></div><span class="rubber-badge"><i></i> LIVE EXPERIMENT / 014</span></header>
      <div class="rubber-intro">
        <svg class="rubber-illustration" viewBox="0 0 440 290" fill="none" aria-hidden="true"><defs><linearGradient id="rubber-glow" x1="100" y1="40" x2="330" y2="270" gradientUnits="userSpaceOnUse"><stop stop-color="#ffddc4"/><stop offset="1" stop-color="#ba9bff"/></linearGradient></defs><path d="M164 32C90 20 74 82 80 145s33 115 89 113c57-2 67-61 147-52 35 4 49-19 35-37-21-27-110 9-116-52-5-50-25-77-71-85Z" fill="url(#rubber-glow)"/><path d="M118 117c2-11 8-11 10 0m40-1c2-11 8-11 10 0m-52 51c11 18 34 15 41-3" stroke="#56403d" stroke-width="5" stroke-linecap="round"/><path d="m352 161 20-17m-10 35 27-1m-38 23 17 15" stroke="#dfc3ff" stroke-width="2" stroke-linecap="round"/></svg>
        <span class="rubber-eyebrow">A LITTLE STRETCH. A LOT OF YOU.</span>
        <h2>오늘은 조금,<br><em>말랑해져도 괜찮아.</em></h2>
        <p>얼굴 위에서 엄지와 검지를 맞대고 당겨보세요.<br>놓으면, 통통. 다시 나로 돌아옵니다.</p>
        <button class="rubber-start" type="button">카메라 켜고 늘려보기 <span>↗</span></button>
        <small>영상은 기기 안에서만 처리됩니다.</small>
      </div>
      <div class="rubber-guide"><span>01 <b>얼굴 위에서 집기</b></span><i>→</i><span>02 <b>쭈욱 늘리기</b></span><i>→</i><span>03 <b>놓으면 탱글</b></span></div>
      <footer class="rubber-footer"><div class="rubber-feedback"><i></i><p class="rubber-status" role="status">손끝에 잡히는, 조금 다른 나.</p></div><div class="rubber-tools"><button class="rubber-labels" type="button" aria-pressed="true" title="설명 표시 전환">Aa</button><button class="rubber-reset" type="button">RESET</button><button class="rubber-camera" type="button">CAMERA ↗</button></div></footer>
      <span class="rubber-footnote">PINCH, PULL & LET GO. <i>✳</i> NO SHARP EDGES.</span>
    </section>`
  const root=container.querySelector<HTMLElement>('.rubber-scene')!
  const video=root.querySelector<HTMLVideoElement>('video')!
  const start=root.querySelector<HTMLButtonElement>('.rubber-start')!
  const camera=root.querySelector<HTMLButtonElement>('.rubber-camera')!
  const status=root.querySelector<HTMLElement>('.rubber-status')!
  const intro=root.querySelector<HTMLElement>('.rubber-intro')!
  const labels=root.querySelector<HTMLButtonElement>('.rubber-labels')!
  const model=new RubberHumanModel(),events=new AbortController(),options={signal:events.signal}
  let renderer:RubberHumanRenderer
  try{renderer=new RubberHumanRenderer(root,video,model)}
  catch(error){status.textContent=`그래픽을 시작하지 못했어요: ${String(error)}`;start.disabled=camera.disabled=true;return()=>events.abort()}
  let stream:MediaStream|null=null,vision:RubberHumanVision|null=null
  let disposed=false,preparing=false,live=false,generation=0
  let frame=0,previous=performance.now(),submitted=-Infinity,videoTime=-1,hudAt=0
  let pointer:number|null=null
  let showLabels=true
  try{showLabels=localStorage.getItem('rubber-human-labels')!=='hidden'}catch{/* Optional storage. */}
  function syncLabels(){root.classList.toggle('rubber-hide-labels',!showLabels);labels.setAttribute('aria-pressed',String(showLabels))}
  syncLabels()

  function stopCamera(){
    cancelAnimationFrame(frame);frame=0
    generation++;preparing=live=false
    vision?.close();vision=null;stream?.getTracks().forEach(track=>track.stop());stream=null
    video.pause();video.srcObject=null;model.reset();model.visible=false;model.face=null;model.hands=[];renderer.reset()
    if(pointer!==null){try{renderer.canvas.releasePointerCapture(pointer)}catch{/* Pointer already ended. */}pointer=null}
    intro.hidden=false;start.disabled=false;start.innerHTML='카메라 켜고 늘려보기 <span>↗</span>';camera.textContent='CAMERA ↗';root.classList.remove('rubber-live')
    renderer.render(video,false,performance.now())
  }
  async function startCamera(){
    if(preparing||stream){stopCamera();status.textContent='카메라를 껐어요.';return}
    const token=++generation;preparing=true;start.disabled=true;start.textContent='카메라 연결 중…';camera.textContent='CANCEL'
    status.textContent='카메라 사용을 허용해주세요.'
    try{
      const cameraStream=await openCamera(video,960,540)
      if(disposed||token!==generation){cameraStream.getTracks().forEach(track=>track.stop());return}
      stream=cameraStream;video.srcObject=stream;await video.play()
      if(disposed||token!==generation)return
      live=true;intro.hidden=true;root.classList.add('rubber-live');setCameraVisible(stream,!document.hidden)
      requestFrame()
      status.textContent='손과 얼굴 인식 준비 중… 처음에는 잠시 걸릴 수 있어요.'
      const tracking=new RubberHumanVision((result,time)=>{
        if(disposed||token!==generation||document.hidden)return
        model.receive(result,time,(video.videoWidth||960)/(video.videoHeight||540))
      })
      vision=tracking;await tracking.initialize()
      if(disposed||token!==generation){tracking.close();return}
      preparing=false;submitted=-Infinity;videoTime=-1;camera.textContent='CAMERA OFF'
      status.textContent='얼굴 위에서 엄지와 검지를 맞대고 당겨보세요. 양손으로도 잡을 수 있어요.'
      cameraStream.getVideoTracks()[0]?.addEventListener('ended',()=>{if(disposed||token!==generation)return;stopCamera();status.textContent='카메라 연결이 종료됐어요. 다시 켜주세요.'},options)
    }catch(error){
      if(disposed||token!==generation)return
      stopCamera()
      const name=error instanceof Error?error.name:''
      status.textContent=name==='NotAllowedError'?'카메라 권한을 허용해주세요. HTTPS 인증서 경고가 있다면 신뢰 등록 후 외부 브라우저에서 열어주세요.'
        :name==='NotReadableError'?'다른 앱이 카메라를 사용 중인지 확인해주세요.'
        :name==='NotFoundError'?'연결된 카메라를 찾지 못했어요.'
        :`시작하지 못했어요: ${error instanceof Error?error.message:String(error)}`
    }
  }
  function animate(now:number){
    frame=0
    if(disposed||document.hidden)return
    const dt=Math.max(0,(now-previous)/1000);previous=now
    if(live&&vision&&!preparing&&now-submitted>=vision.interval&&video.currentTime!==videoTime){
      if(vision.error){stopCamera();status.textContent='얼굴 인식이 중단됐어요. 카메라를 다시 켜주세요.'}
      else if(vision.submit(video,now)){submitted=now;videoTime=video.currentTime}
    }
    if(live)model.update(dt,now)
    renderer.render(video,live,now)
    if(live&&!preparing&&now-hudAt>140){
      const held=model.heldCount
      const message=!model.visible?'얼굴 전체가 카메라에 보이게 해주세요.'
        :held?`${held===2?'양손으로':'손끝으로'} 잡았어요 · 움직이면 쭈욱, 놓으면 탱글!`
        :model.active?'탱글탱글, 원래 얼굴로 돌아오는 중…'
        :'얼굴 위에서 엄지와 검지를 맞대고 당겨보세요. 마우스·터치로도 당길 수 있어요.'
      if(status.textContent!==message)status.textContent=message
      root.classList.toggle('rubber-grabbing',held>0);hudAt=now
    }
    if(live)frame=requestAnimationFrame(animate)
  }
  function requestFrame(){
    if(disposed||document.hidden||frame)return
    previous=performance.now();frame=requestAnimationFrame(animate)
  }
  start.addEventListener('click',()=>void startCamera(),options)
  camera.addEventListener('click',()=>void startCamera(),options)
  labels.addEventListener('click',()=>{showLabels=!showLabels;syncLabels();try{localStorage.setItem('rubber-human-labels',showLabels?'visible':'hidden')}catch{/* Optional. */}},options)
  root.querySelector('.rubber-reset')!.addEventListener('click',()=>{model.reset();renderer.reset();status.textContent='원래 얼굴로 돌아왔어요.'},options)
  renderer.canvas.addEventListener('pointerdown',event=>{
    if(pointer!==null||!live||event.button!==0)return
    if(model.begin('pointer',renderer.pointer(event.clientX,event.clientY),performance.now())){
      pointer=event.pointerId;renderer.canvas.setPointerCapture(pointer);event.preventDefault()
    }
  },options)
  renderer.canvas.addEventListener('pointermove',event=>{if(event.pointerId===pointer)model.movePointer(renderer.pointer(event.clientX,event.clientY),performance.now())},options)
  function releasePointer(event:PointerEvent){if(event.pointerId===pointer){model.releasePointer();pointer=null}}
  for(const event of ['pointerup','pointercancel','lostpointercapture'] as const)renderer.canvas.addEventListener(event,releasePointer,options)
  window.addEventListener('blur',()=>{model.releaseAll();pointer=null},options)
  document.addEventListener('visibilitychange',()=>{
    cancelAnimationFrame(frame);frame=0;model.releaseAll();pointer=null;setCameraVisible(stream,!document.hidden)
    if(!document.hidden&&!disposed&&live){submitted=-Infinity;requestFrame()}
  },options)
  renderer.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();stopCamera();status.textContent='그래픽 연결이 끊겼어요. 페이지를 새로고침해주세요.';start.disabled=camera.disabled=true},options)
  requestFrame()
  return()=>{disposed=true;events.abort();cancelAnimationFrame(frame);stopCamera();renderer.destroy()}
}
