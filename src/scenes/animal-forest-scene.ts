import '../animal-forest.css'
import { AnimalForestWorld } from '../animal-forest-world'
import { FOREST_ACTIVITIES, FOREST_ANIMALS, ForestLife, forestBirth, readForestSave, type ForestActivity } from '../animal-forest-model'

const STORAGE='animal-forest-resident-v1'
const leaf='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 3C8 2 3 7 5 15c7 5 15 1 15-12Z"/><path d="M3 22 16 8M8 17l-1-6m4 3 6 1"/></svg>'
const activityIcons:Record<ForestActivity,string>={fruit:'🍑',fish:'🐟',flower:'🌼',dance:'🔥'}
export function mountAnimalForest(container:HTMLElement):()=>void {
  container.innerHTML=`
    <section class="af-scene" aria-label="우주에 떠 있는 동물의 숲 행성">
      <header class="af-heading">
        <h1>${leaf}<span>동물의 숲<small>별 사이에 피어난 작은 마을</small></span></h1>
        <div class="af-view-tools"><button class="af-neighbors" type="button">이웃 12명</button><button class="af-rotate" type="button" aria-pressed="false">회전 멈춤</button></div>
      </header>
      <div class="af-main">
        <div class="af-welcome">
          <span class="af-eyebrow">나만의 작은 우주</span>
          <h2>작은 행성에,<br><em>큰 일상을.</em></h2>
          <p>생일로 만나는 나의 동물.<br>열두 이웃과 숲속의 하루를 시작해요.</p>
          <button class="af-join af-primary" type="button">나의 동물로 입주하기</button>
          <small>드래그하면 행성을 돌려볼 수 있어요.</small>
        </div>
        <section class="af-resident" aria-label="나의 입주 정보" hidden>
          <span class="af-resident-emoji" aria-hidden="true"></span>
          <div><small>이 행성의 새로운 이웃</small><h2 class="af-resident-name"></h2><p class="af-resident-type"></p></div>
          <button class="af-focus" type="button">내 동물 찾기</button>
          <button class="af-change" type="button">다시 입주</button>
        </section>
      </div>
      <footer class="af-footer">
        <div class="af-message"><p class="af-status" role="status" aria-live="polite">우주 한가운데, 당신을 기다리는 숲이 있어요.</p><small class="af-storage-note">입주와 활동 기록은 이 브라우저에 저장돼요.</small></div>
        <section class="af-play" aria-label="숲에서 놀기" hidden>
          <div class="af-inventory" aria-label="모은 물건"><span>🍑 <b data-count="fruit">0</b></span><span>🐟 <b data-count="fish">0</b></span><span>🌼 <b data-count="flower">0</b></span><span>✧ <b data-count="stars">0</b></span></div>
          <div class="af-activities">${(Object.keys(FOREST_ACTIVITIES) as ForestActivity[]).map(kind=>`<button type="button" data-activity="${kind}"><span aria-hidden="true">${activityIcons[kind]}</span>${FOREST_ACTIVITIES[kind].label}</button>`).join('')}</div>
          <div class="af-progress" role="progressbar" aria-label="활동 진행" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" hidden><i></i></div>
        </section>
      </footer>
      <dialog class="af-dialog af-move-dialog" aria-labelledby="af-move-title">
        <button class="af-close" type="button" aria-label="입주 창 닫기">×</button>
        <span class="af-dialog-mark" aria-hidden="true">${leaf}</span><h2 id="af-move-title">어떤 이웃이 될까요?</h2>
        <p class="af-move-note">생년월일을 알려주면 나의 동물을 만나요.</p>
        <form class="af-form">
          <label>마을에서 부를 이름<input name="residentName" type="text" maxlength="12" placeholder="별숲 주민" autocomplete="off"></label>
          <label>생년월일<input name="birthday" type="date" required min="1900-01-01" autocomplete="off"></label>
          <p class="af-birth-preview" aria-live="polite">출생연도를 기준으로 띠를 정해요.</p>
          <button class="af-primary" type="submit">이 행성에 입주하기</button>
          <small>생년월일은 저장하지 않아요. 입주 정보와 활동 기록은 이 브라우저에 남아요.</small>
        </form>
      </dialog>
      <dialog class="af-dialog af-neighbor-dialog" aria-labelledby="af-neighbor-title">
        <button class="af-close" type="button" aria-label="이웃 창 닫기">×</button><h2 id="af-neighbor-title">열두 이웃을 만나보세요</h2><p>친구를 누르면 행성에서 찾아드려요.</p>
        <div class="af-neighbor-grid">${FOREST_ANIMALS.map((animal,index)=>`<button type="button" data-neighbor="${index}" aria-label="${animal.name} 찾아보기"><span aria-hidden="true">${animal.emoji}</span><b>${animal.name}</b></button>`).join('')}</div>
        <small>별똥별은 30초마다, 우주선은 1분마다 찾아와요.</small>
      </dialog>
    </section>`
  const root=container.querySelector<HTMLElement>('.af-scene')!,q=<T extends Element=HTMLElement>(selector:string)=>root.querySelector<T>(selector)!
  const status=q('.af-status'),welcome=q('.af-welcome'),resident=q('.af-resident'),play=q('.af-play')
  const moveDialog=q<HTMLDialogElement>('.af-move-dialog'),neighborDialog=q<HTMLDialogElement>('.af-neighbor-dialog')
  const form=q<HTMLFormElement>('.af-form'),birthday=form.elements.namedItem('birthday') as HTMLInputElement,name=form.elements.namedItem('residentName') as HTMLInputElement
  const preview=q('.af-birth-preview'),progress=q('.af-progress'),bar=q('.af-progress i'),rotate=q<HTMLButtonElement>('.af-rotate')
  const events=new AbortController(),options={signal:events.signal}
  const now=new Date();birthday.max=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  let saved=null
  try{saved=readForestSave(localStorage.getItem(STORAGE))}catch{/* Storage may be unavailable. */}
  const life=new ForestLife(saved)
  let world:AnimalForestWorld
  function announce(message:string){status.textContent=message}
  function persist(){const data=life.save();if(!data)return;try{localStorage.setItem(STORAGE,JSON.stringify(data))}catch{q('.af-storage-note').textContent='저장 공간을 사용할 수 없어, 이번 방문 동안만 기록돼요.'}}
  function activity(kind:ForestActivity){
    if(!life.resident){announce('먼저 입주하면 이웃들과 함께 놀 수 있어요.');return}
    if(life.begin(kind)){world.focusResident();announce(`${FOREST_ACTIVITIES[kind].label} 중이에요. 잠시 느긋하게 기다려주세요.`);sync()}
  }
  function meet(index:number){const animal=FOREST_ANIMALS[index]!;world.greet(index);announce(`${animal.emoji} ${animal.name} — ${animal.personality}. 반갑게 인사해요!`)}
  try{
    world=new AnimalForestWorld(root,(kind,index)=>{if(kind==='animal')meet(index);else if(Object.hasOwn(FOREST_ACTIVITIES,kind))activity(kind as ForestActivity)})
  }catch{
    announce('3D 화면을 준비하지 못했어요. WebGL을 지원하는 브라우저에서 다시 열어주세요.')
    root.classList.add('af-unavailable');root.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=true)
    return()=>events.abort()
  }
  function sync(){
    const r=life.resident,active=Boolean(r)
    welcome.hidden=active;resident.hidden=!active;play.hidden=!active;root.classList.toggle('af-inhabited',active)
    if(r){const spec=FOREST_ANIMALS[r.animal]!;q('.af-resident-emoji').textContent=spec.emoji;q('.af-resident-name').textContent=r.name;q('.af-resident-type').textContent=`${spec.name} 이웃 · ${life.landing>0?'우주에서 내려오는 중':'우리 마을에 오신 걸 환영해요'}`}
    for(const key of ['fruit','fish','flower','stars'] as const){const item=q(`[data-count="${key}"]`);item.textContent=String(life.inventory[key]);item.parentElement!.setAttribute('aria-label',`${({fruit:'복숭아',fish:'물고기',flower:'꽃',stars:'별조각'})[key]} ${life.inventory[key]}개`)}
    root.querySelectorAll<HTMLButtonElement>('[data-activity]').forEach(button=>button.disabled=!active||life.landing>0||Boolean(life.activity))
    progress.hidden=life.landing===0&&!life.activity
    const ratio=life.landing>0?1-life.landing/4.5:life.progress
    bar.style.width=`${ratio*100}%`;progress.setAttribute('aria-valuenow',String(Math.round(ratio*100)));progress.setAttribute('aria-label',life.landing>0?'행성으로 입주 중':life.activity?FOREST_ACTIVITIES[life.activity].label:'활동 진행')
    world.fitView()
  }
  if(life.resident){world.setResident(life.resident);world.plantFlowers(life.inventory.flower,life.resident.flower);announce(`${life.resident.name}님, 숲이 당신을 기다렸어요.`)}
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches
  world.paused=reduced
  function rotationLabel(){rotate.textContent=world.paused?'회전 시작':'회전 멈춤';rotate.setAttribute('aria-pressed',String(world.paused))}
  rotationLabel();sync()
  function openMove(){
    q('.af-move-note').textContent=life.resident?'다시 입주하면 활동 기록이 새로 시작돼요.':'생년월일을 알려주면 나의 동물을 만나요.'
    name.value=life.resident?.name??'';birthday.value='';birthday.setCustomValidity('');preview.textContent='출생연도를 기준으로 띠를 정해요.';moveDialog.showModal()
  }
  q('.af-join').addEventListener('click',openMove,options);q('.af-change').addEventListener('click',openMove,options)
  q('.af-neighbors').addEventListener('click',()=>neighborDialog.showModal(),options)
  root.querySelectorAll<HTMLButtonElement>('.af-close').forEach(button=>button.addEventListener('click',()=>button.closest('dialog')?.close(),options))
  root.querySelectorAll<HTMLButtonElement>('[data-neighbor]').forEach(button=>button.addEventListener('click',()=>{neighborDialog.close();meet(Number(button.dataset.neighbor))},options))
  rotate.addEventListener('click',()=>{world.paused=!world.paused;rotationLabel()},options)
  q('.af-focus').addEventListener('click',()=>world.focusResident(),options)
  root.querySelectorAll<HTMLButtonElement>('[data-activity]').forEach(button=>button.addEventListener('click',()=>activity(button.dataset.activity as ForestActivity),options))
  birthday.addEventListener('input',()=>{
    const result=forestBirth(birthday.value);birthday.setCustomValidity('')
    preview.textContent=result?`${FOREST_ANIMALS[result.animal]!.emoji} 당신은 ${FOREST_ANIMALS[result.animal]!.name} 이웃이에요.`:'출생연도를 기준으로 띠를 정해요.'
  },options)
  form.addEventListener('submit',event=>{
    event.preventDefault()
    if(!life.moveIn(name.value,birthday.value)){birthday.setCustomValidity('1900년 이후의 올바른 생년월일을 입력해주세요.');birthday.reportValidity();return}
    world.setResident(life.resident!);world.paused=false;rotationLabel();moveDialog.close();persist();sync();announce('작은 우주 여행이 시작됐어요. 숲 행성으로 내려갑니다!')
  },options)
  let disposed=false,frame=0,last=performance.now(),lastHud=0
  function tick(time:number){
    if(disposed||document.hidden)return
    const dt=Math.min(.25,Math.max(0,(time-last)/1000));last=time
    const event=life.update(dt)
    if(event.meteor)world.meteorShower()
    if(event.ship)world.flyShip()
    if(event.landed){announce('착륙 완료! 과일을 따거나 연못에서 낚시를 해볼까요?');sync()}
    if(event.completed){world.plantFlowers(life.inventory.flower,life.resident!.flower);persist();announce(FOREST_ACTIVITIES[event.completed].reward);sync()}
    world.render(life,dt)
    if(time-lastHud>120){if(life.landing>0||life.activity)sync();lastHud=time}
    frame=requestAnimationFrame(tick)
  }
  document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(frame);if(!document.hidden&&!disposed){last=performance.now();frame=requestAnimationFrame(tick)}},options)
  frame=requestAnimationFrame(tick)
  return()=>{disposed=true;events.abort();cancelAnimationFrame(frame);moveDialog.close();neighborDialog.close();world.destroy()}
}
