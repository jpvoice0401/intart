import '../minecraft.css'
import { openCamera, setCameraVisible } from '../camera-access'
import { MC_HITS_TO_CAPTURE, MinecraftCombat, type MinecraftMask } from '../minecraft-model'
import { MinecraftCapture } from '../minecraft-capture'
import { MinecraftSubject } from '../minecraft-subject'
import { MinecraftRenderer } from '../minecraft-renderer'
import { MinecraftVision } from '../minecraft-vision'
import { drawMinecraftHud, loadMinecraftImages } from '../minecraft-sword'
import { MinecraftFloorAR } from '../minecraft-ar'
import { minecraftARMobile, requestMinecraftMotion } from '../minecraft-ar-engine'

export function mountMinecraft(container:HTMLElement):()=>void {
  const base=import.meta.env.BASE_URL
  const slots=(count:number,offset=0)=>Array.from({length:count},(_,i)=>`<div class="mc-slot${i+offset===27?' mc-slot-sword':''}">${i+offset===27?`<img src="${base}minecraft/diamond_sword.png" alt="다이아몬드 검">`:''}</div>`).join('')
  container.innerHTML=`
    <section class="mc-scene" aria-label="MineCraft · 카메라 검 휘두르기">
      <video class="mc-video" playsinline muted aria-hidden="true"></video>
      <header class="mc-heading"><div><h1>MineCraft</h1><span>CAMERA / SURVIVAL</span></div><div class="mc-tools"><button class="mc-labels" type="button" aria-pressed="true" title="안내 표시 전환">Aa</button><button class="mc-inventory-toggle" type="button" aria-expanded="false" aria-controls="mc-inventory">E <span>인벤토리</span></button><button class="mc-ar-toggle" type="button">바닥 AR</button><button class="mc-reset" type="button" title="전투 효과 초기화">↺</button><button class="mc-camera" type="button">카메라 켜기</button></div></header>
      <div class="mc-crosshair" aria-hidden="true"></div>
      <div class="mc-ui">
        <div class="mc-intro"><div class="mc-intro-item"><img src="${base}minecraft/diamond_sword.png" alt=""></div><p class="mc-overline">A NEW WORLD. RIGHT IN FRONT OF YOU.</p><h2>현실에 들어온<br><em>다이아몬드 검.</em></h2><p>중앙 조준점으로 사람을 겨누고<br>클릭하거나 터치해 검을 휘둘러보세요.</p><button class="mc-start" type="button">카메라 켜고 시작하기</button><small>카메라 영상은 이 기기에서만 처리됩니다.</small></div>
        <div class="mc-hotbar"><div class="mc-hotbar-copy"><div class="mc-actionbar"><p class="mc-hit-count" hidden></p><p class="mc-status" role="status">검을 준비하고 있어요…</p></div><span class="mc-item-name">다이아몬드 검</span></div><div class="mc-hud-frame"><canvas class="mc-hud" aria-label="체력과 허기 가득, 9칸 인벤토리의 첫 칸에 다이아몬드 검 하나" role="img"></canvas><button class="mc-equipped" type="button" aria-pressed="true" aria-label="다이아몬드 검 장착됨" title="다이아몬드 검"></button></div></div>
      </div>
      <div id="mc-inventory" class="mc-inventory" role="dialog" aria-modal="true" aria-label="인벤토리" hidden><div class="mc-inventory-panel"><header><h2>인벤토리</h2><button class="mc-inventory-close" type="button" aria-label="인벤토리 닫기">×</button></header><div class="mc-inventory-top"><div class="mc-player"><i class="mc-player-head"></i><i class="mc-player-body"></i><i class="mc-player-legs"></i></div><div class="mc-crafting"><span>제작</span><div>${slots(4)}</div></div><b class="mc-craft-arrow">→</b><div class="mc-slot"></div></div><div class="mc-storage">${slots(27)}</div><div class="mc-pocket">${slots(9,27)}</div><p>다이아몬드 검 · 1개</p></div></div>
      <footer class="mc-footer"><span>클릭 / 터치 <b>공격</b> <i>·</i> SPACE <b>공격</b> <i>·</i> E <b>인벤토리</b></span><a href="${base}minecraft/CREDITS.md" target="_blank" rel="noopener">출처</a></footer>
    </section>`
  const root=container.querySelector<HTMLElement>('.mc-scene')!,video=root.querySelector<HTMLVideoElement>('video')!
  const start=root.querySelector<HTMLButtonElement>('.mc-start')!,camera=root.querySelector<HTMLButtonElement>('.mc-camera')!
  const status=root.querySelector<HTMLElement>('.mc-status')!,intro=root.querySelector<HTMLElement>('.mc-intro')!
  const hitCount=root.querySelector<HTMLElement>('.mc-hit-count')!
  const arButton=root.querySelector<HTMLButtonElement>('.mc-ar-toggle')!
  const inventory=root.querySelector<HTMLElement>('.mc-inventory')!,inventoryToggle=root.querySelector<HTMLButtonElement>('.mc-inventory-toggle')!
  const inventoryClose=root.querySelector<HTMLButtonElement>('.mc-inventory-close')!,labels=root.querySelector<HTMLButtonElement>('.mc-labels')!
  const combat=new MinecraftCombat(),events=new AbortController(),options={signal:events.signal}
  let disposed=false,live=false,preparing=false,generation=0,frame=0,submitted=-Infinity,videoTime=-1,hudAt=0,messageUntil=0
  let stream:MediaStream|null=null,vision:MinecraftVision|null=null,showLabels=true
  let arMode=false,arSession:MinecraftFloorAR|null=null
  const subject=new MinecraftSubject()
  let capture:MinecraftCapture|null=null
  let savedPortrait:HTMLCanvasElement|null=null
  let latestMask:MinecraftMask|null=null
  let selectedMask:MinecraftMask|null=null
  let lastSubjectAt=-Infinity
  let subjectLost=false
  let renderer:MinecraftRenderer
  try{renderer=new MinecraftRenderer(root,video,requestFrame)}
  catch(error){start.disabled=camera.disabled=true;status.textContent=`그래픽을 시작하지 못했어요: ${String(error)}`;return()=>events.abort()}
  try{showLabels=localStorage.getItem('minecraft-labels')!=='hidden'}catch{/* Optional storage. */}
  function syncLabels(){root.classList.toggle('mc-hide-labels',!showLabels);labels.setAttribute('aria-pressed',String(showLabels))}
  syncLabels()
  function setStatus(message:string){if(status.textContent!==message)status.textContent=message}
  function syncHits(){
    hitCount.hidden=!combat.hits
    hitCount.textContent=`명중 ${combat.hits} / ${MC_HITS_TO_CAPTURE}`
    arButton.textContent=savedPortrait?'모습 AR 배치':'바닥 AR'
  }
  function clearTracking(){
    latestMask=selectedMask=null
    subject.clear()
    lastSubjectAt=-Infinity
    subjectLost=false
    combat.clearMask()
    renderer.clearMask()
  }
  function showMask(mask:MinecraftMask|null,time:number){
    if(mask){
      combat.updateMask(mask,time)
      renderer.updateMask(mask,combat.defeated)
    }else{
      combat.clearMask()
      renderer.clearMask()
    }
  }
  function setInventory(open:boolean){
    inventory.hidden=!open;inventoryToggle.setAttribute('aria-expanded',String(open))
    if(open)inventoryClose.focus();else renderer.canvas.focus({preventScroll:true})
    requestFrame()
  }
  void loadMinecraftImages().then(images=>{
    if(disposed)return
    renderer.setAssets(images);drawMinecraftHud(root.querySelector<HTMLCanvasElement>('.mc-hud')!,images)
    setStatus('다이아몬드 검 장착 · 클릭하거나 터치해 휘둘러보세요.');requestFrame()
  }).catch(error=>{if(!disposed)setStatus(String(error))})

  function stopCamera(){
    generation++;preparing=live=false;vision?.close();vision=null
    stream?.getTracks().forEach(track=>track.stop());stream=null;video.pause();video.srcObject=null
    clearTracking();combat.reset();capture?.reset();renderer.setCleanBackground(null);syncHits()
    intro.hidden=false;camera.textContent='카메라 켜기';start.disabled=false;start.textContent='카메라 켜고 시작하기'
    root.classList.remove('mc-live','mc-has-target');requestFrame()
  }
  async function startCamera(){
    if(preparing||stream){stopCamera();setStatus('카메라를 껐어요. 검 휘두르기는 계속 체험할 수 있어요.');return}
    const token=++generation;preparing=true;start.disabled=true;start.textContent='카메라 연결 중…';camera.textContent='취소'
    setStatus('카메라 사용을 허용해주세요.')
    try{
      const cameraStream=await openCamera(video,960,540)
      if(disposed||token!==generation){cameraStream.getTracks().forEach(track=>track.stop());return}
      stream=cameraStream;video.srcObject=stream;await video.play()
      if(disposed||token!==generation)return
      live=true;intro.hidden=true;root.classList.add('mc-live');setCameraVisible(stream,!document.hidden);requestFrame()
      setStatus('사람 윤곽을 준비하고 있어요…')
      capture??=new MinecraftCapture(background=>{
        if(disposed||!live)return
        renderer.setCleanBackground(background);requestFrame()
      })
      const tracking=new MinecraftVision((mask,time,image)=>{
        if(disposed||token!==generation||document.hidden)return
        if(!mask.width||!mask.height||mask.mask.length!==mask.width*mask.height){latestMask=selectedMask=null;showMask(null,time);return}
        latestMask=mask
        capture?.update(image,mask,time,combat.defeated)
        if(combat.hits>0){
          selectedMask=subjectLost?null:subject.follow(mask)
          if(selectedMask) lastSubjectAt=time
          else if(time-lastSubjectAt>600){
            subject.clear()
            if(combat.defeated) subjectLost=true
            else{combat.reset();syncHits()}
          }
        }
        showMask(combat.hits>0?selectedMask:mask,time)
      })
      vision=tracking;await tracking.initialize()
      if(disposed||token!==generation){tracking.close();return}
      preparing=false;submitted=-Infinity;videoTime=-1;camera.textContent='카메라 끄기';renderer.canvas.focus({preventScroll:true})
      setStatus('중앙 조준점으로 사람을 겨누고 공격하세요.')
      cameraStream.getVideoTracks()[0]?.addEventListener('ended',()=>{if(disposed||token!==generation)return;stopCamera();setStatus('카메라 연결이 종료됐어요. 다시 켜주세요.')},options)
    }catch(error){
      if(disposed||token!==generation)return
      stopCamera()
      const name=error instanceof Error?error.name:''
      setStatus(name==='NotAllowedError'?'카메라 권한을 허용해주세요. HTTPS 인증서 경고가 있으면 신뢰 등록 후 외부 브라우저에서 열어주세요.'
        :name==='NotReadableError'?'다른 앱이 카메라를 사용 중인지 확인해주세요.'
        :name==='NotFoundError'?'연결된 카메라를 찾지 못했어요.'
        :`시작하지 못했어요: ${error instanceof Error?error.message:String(error)}`)
    }
  }
  function attack(x=0,y=0){
    if(arMode||!inventory.hidden)return
    const now=performance.now(),previous=combat.swings,hit=combat.attack(now,x,y)
    if(combat.swings===previous)return
    if(hit&&combat.hits===1&&latestMask){
      selectedMask=subject.lock(latestMask)
      if(selectedMask){lastSubjectAt=now;showMask(selectedMask,now)}
    }
    if(hit&&combat.defeated){
      const result=selectedMask?capture?.save(selectedMask):null
      if(result){
        savedPortrait=result.cutout
        renderer.setCleanBackground(result.background)
        renderer.updateMask(selectedMask!,true)
        setStatus('투명인간! 주변 공간을 복원했어요 · 보관한 모습은 AR로 배치할 수 있어요.')
      }else{
        combat.retryCapture()
        setStatus('모습을 보관하지 못했어요. 몸을 화면에 보인 채 한 번 더 맞혀주세요.')
      }
    }else if(hit) setStatus(`명중! ${combat.hits} / ${MC_HITS_TO_CAPTURE}`)
    else if(combat.defeated) setStatus('모습 AR 배치 버튼을 눌러 다른 곳에 놓아보세요.')
    else setStatus(live?'공격 · 조준점으로 사람을 겨눠보세요.':'다이아몬드 검 · 카메라를 켜면 사람에게 명중할 수 있어요.')
    messageUntil=now+950
    syncHits()
    requestFrame()
  }
  function animate(now:number){
    frame=0;if(disposed||document.hidden||arMode)return
    if(live&&vision&&!preparing&&now-submitted>=vision.interval&&video.currentTime!==videoTime){
      if(vision.error){stopCamera();setStatus('사람 인식이 중단됐어요. 카메라를 다시 켜주세요.')}
      else if(vision.submit(video,now)){submitted=now;videoTime=video.currentTime}
    }
    const motion=renderer.render(video,live,combat,now)
    if(live&&!preparing&&now-hudAt>120){
      const target=combat.target(now);root.classList.toggle('mc-has-target',target)
      if(now>messageUntil)setStatus(combat.defeated?'모습 AR 배치 버튼을 눌러 다른 곳에 놓아보세요.'
        :target?'사람을 조준하고 있어요 · 클릭 / 터치로 공격':'중앙 조준점으로 사람을 겨눠보세요.')
      hudAt=now
    }
    if(live||motion)frame=requestAnimationFrame(animate)
  }
  function requestFrame(){if(!disposed&&!document.hidden&&!arMode&&!frame)frame=requestAnimationFrame(animate)}
  function exitAR(message='바닥 AR을 종료했어요. 카메라 게임을 다시 시작할 수 있어요.'){
    const session=arSession;arSession=null;session?.destroy();arMode=false;root.classList.remove('mc-ar-active')
    if(disposed)return
    renderer.invalidate();setStatus(message);messageUntil=performance.now()+6500;requestFrame()
  }
  async function startAR(){
    if(arMode||disposed)return
    if(!isSecureContext){setStatus('바닥 AR은 신뢰할 수 있는 HTTPS 주소에서 열어주세요.');messageUntil=performance.now()+8000;return}
    if(!minecraftARMobile()){setStatus('바닥 AR은 휴대폰·태블릿의 후면 카메라로 사용해주세요. 같은 HTTPS 주소를 휴대폰에서 열어주세요.');messageUntil=performance.now()+8000;return}
    // Request iOS motion permission in this actual button gesture, before
    // waiting for the lazy engine binary/chunk and camera permissions.
    let motion:Promise<void>
    try{motion=requestMinecraftMotion()}catch(error){setStatus(String(error));return}
    stopCamera();cancelAnimationFrame(frame);frame=0;inventory.hidden=true;inventoryToggle.setAttribute('aria-expanded','false')
    arMode=true;root.classList.add('mc-ar-active')
    const session=new MinecraftFloorAR(root,()=>exitAR(),savedPortrait);arSession=session
    try{await session.start(motion);if(disposed||arSession!==session)session.destroy()}
    catch(error){if(!disposed&&arSession===session)exitAR(error instanceof Error?error.message:String(error));else session.destroy()}
  }
  start.addEventListener('click',()=>void startCamera(),options)
  camera.addEventListener('click',()=>void startCamera(),options)
  arButton.addEventListener('click',()=>void startAR(),options)
  root.querySelector('.mc-reset')!.addEventListener('click',()=>{
    combat.reset()
    clearTracking()
    capture?.reset()
    savedPortrait=null
    renderer.setCleanBackground(null)
    syncHits()
    setStatus('다이아몬드 검 장착')
    messageUntil=performance.now()+650
    requestFrame()
  },options)
  labels.addEventListener('click',()=>{showLabels=!showLabels;syncLabels();try{localStorage.setItem('minecraft-labels',showLabels?'visible':'hidden')}catch{/* Optional. */}},options)
  inventoryToggle.addEventListener('click',()=>setInventory(inventory.hidden!==false),options)
  inventoryClose.addEventListener('click',()=>setInventory(false),options)
  inventory.addEventListener('pointerdown',event=>{if(event.target===inventory)setInventory(false)},options)
  inventory.addEventListener('keydown',event=>{if(event.code==='Tab'){event.preventDefault();inventoryClose.focus()}},options)
  root.querySelector('.mc-equipped')!.addEventListener('click',()=>{setStatus('다이아몬드 검 장착');messageUntil=performance.now()+650},options)
  renderer.canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0)return
    event.preventDefault()
    renderer.canvas.focus({preventScroll:true})
    const bounds=renderer.canvas.getBoundingClientRect()
    attack((event.clientX-bounds.left)/bounds.width*2-1,1-(event.clientY-bounds.top)/bounds.height*2)
  },options)
  window.addEventListener('keydown',event=>{
    if(arMode){if(event.code==='Escape'){event.preventDefault();exitAR()}return}
    if(event.repeat||event.ctrlKey||event.altKey||event.metaKey)return
    if((event.target as HTMLElement)?.closest('button,a,input,textarea,select')&&event.code!=='Escape'&&event.code!=='KeyE')return
    if(event.code==='KeyE'){event.preventDefault();event.stopPropagation();setInventory(inventory.hidden!==false)}
    else if(event.code==='Escape'&&!inventory.hidden){event.preventDefault();event.stopPropagation();setInventory(false)}
    else if(event.code==='Space'){event.preventDefault();attack()}
  },options)
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)capture?.pause()
    cancelAnimationFrame(frame);frame=0;latestMask=selectedMask=null;showMask(null,performance.now());setCameraVisible(stream,!document.hidden)
    if(!document.hidden){submitted=-Infinity;renderer.invalidate();requestFrame()}
  },options)
  renderer.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();stopCamera();start.disabled=camera.disabled=true;setStatus('그래픽 연결이 끊겼어요. 페이지를 새로고침해주세요.')},options)
  requestFrame()
  return()=>{disposed=true;events.abort();cancelAnimationFrame(frame);frame=0;exitAR();stopCamera();renderer.destroy()}
}
