export const FOREST_ANIMALS = [
  { name:'쥐', emoji:'🐭', color:0x9ba6c1, coat:0xf3cd81, personality:'작은 보물을 모으는 수집가' },
  { name:'소', emoji:'🐮', color:0xb88b69, coat:0x87b6aa, personality:'느긋하게 꽃을 돌보는 정원사' },
  { name:'호랑이', emoji:'🐯', color:0xf3ac55, coat:0xa0b8d6, personality:'모험을 좋아하는 산책 대장' },
  { name:'토끼', emoji:'🐰', color:0xffe8cf, coat:0xe6a7b6, personality:'친구에게 꽃을 선물하는 다정한 이웃' },
  { name:'용', emoji:'🐲', color:0x8abf9c, coat:0xe8c578, personality:'별자리를 읽는 꿈 많은 여행자' },
  { name:'뱀', emoji:'🐍', color:0xa2c6a1, coat:0xeec899, personality:'연못 옆에서 쉬는 이야기꾼' },
  { name:'말', emoji:'🐴', color:0xc48a68, coat:0x93b9d1, personality:'과수원을 달리는 씩씩한 친구' },
  { name:'양', emoji:'🐑', color:0xf4e9d3, coat:0xb6a6cc, personality:'포근한 노래를 부르는 음악가' },
  { name:'원숭이', emoji:'🐵', color:0xa77959, coat:0xe9b76e, personality:'모닥불 앞의 장난꾸러기 춤꾼' },
  { name:'닭', emoji:'🐔', color:0xfff0dc, coat:0xa3bea2, personality:'아침마다 마을을 깨우는 노래꾼' },
  { name:'개', emoji:'🐶', color:0xd4ad7c, coat:0xc1a3c6, personality:'누구와도 금세 친구가 되는 낚시꾼' },
  { name:'돼지', emoji:'🐷', color:0xf0b0b0, coat:0x9bbdb1, personality:'달콤한 과일을 나누는 요리사' },
] as const
export type ForestActivity = 'fruit' | 'fish' | 'flower' | 'dance'
export const FOREST_ACTIVITIES: Record<ForestActivity,{label:string;duration:number;reward:string}> = {
  fruit:{label:'과일 따기',duration:5,reward:'달콤한 복숭아 3개를 모았어요.'},
  fish:{label:'연못 낚시',duration:7,reward:'반짝이는 별물고기를 낚았어요!'},
  flower:{label:'꽃 심기',duration:5,reward:'행성에 새로운 꽃이 피었어요.'},
  dance:{label:'모닥불 춤',duration:6,reward:'이웃들과 춤추고 별조각 2개를 받았어요.'},
}
export interface ForestResident { name:string; animal:number; flower:number }
export interface ForestInventory { fruit:number; fish:number; flower:number; stars:number }
export interface ForestSave { version:1; resident:ForestResident; inventory:ForestInventory }

/** This experience uses the birth year, rather than a lunar-new-year cutoff. */
export function forestBirth(birthday:string, now = new Date()): {animal:number;flower:number} | null {
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday)
  if(!match)return null
  const year=Number(match[1]), month=Number(match[2]), day=Number(match[3])
  const date=new Date(year,month-1,day)
  if(year<1900||date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)return null
  if(date.getTime()>new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime())return null
  return {animal:((year-4)%12+12)%12,flower:(month+day)%5}
}
export function readForestSave(raw:string|null):ForestSave|null {
  if(!raw)return null
  try {
    const data=JSON.parse(raw),r=data.resident,i=data.inventory
    if(data.version!==1||!r||typeof r.name!=='string'||!r.name.trim()||r.name.length>12||!Number.isInteger(r.animal)||r.animal<0||r.animal>11||!Number.isInteger(r.flower)||r.flower<0||r.flower>4)return null
    if(!i||!['fruit','fish','flower','stars'].every(key=>Number.isInteger(i[key])&&i[key]>=0&&i[key]<=9999))return null
    return {version:1,resident:{name:r.name,animal:r.animal,flower:r.flower},inventory:{fruit:i.fruit,fish:i.fish,flower:i.flower,stars:i.stars}}
  } catch {return null}
}

/** An active-time clock: a hidden tab cannot queue missed space events. */
export class ForestLife {
  resident:ForestResident|null=null
  inventory:ForestInventory={fruit:0,fish:0,flower:0,stars:0}
  elapsed=0
  landing=0
  activity:ForestActivity|null=null
  progress=0
  private meteorAt=30
  private shipAt=60
  constructor(saved:ForestSave|null=null) {if(saved){this.resident={...saved.resident};this.inventory={...saved.inventory}}}
  moveIn(name:string,birthday:string,now=new Date()):boolean {
    const birth=forestBirth(birthday,now)
    if(!birth)return false
    this.resident={name:name.trim().slice(0,12)||'별숲 주민',...birth}
    this.inventory={fruit:0,fish:0,flower:0,stars:0};this.activity=null;this.progress=0;this.landing=4.5
    return true
  }
  begin(kind:ForestActivity):boolean {
    if(!this.resident||this.landing>0||this.activity||!Object.hasOwn(FOREST_ACTIVITIES,kind))return false
    this.activity=kind;this.progress=0;return true
  }
  update(dt:number):{meteor:boolean;ship:boolean;landed:boolean;completed:ForestActivity|null} {
    const step=Number.isFinite(dt)?Math.max(0,Math.min(.25,dt)):0
    this.elapsed+=step
    const meteor=this.elapsed+1e-8>=this.meteorAt,ship=this.elapsed+1e-8>=this.shipAt
    if(meteor)this.meteorAt+=30
    if(ship)this.shipAt+=60
    const before=this.landing;this.landing=Math.max(0,this.landing-step)
    let completed:ForestActivity|null=null
    if(this.activity){
      this.progress=Math.min(1,this.progress+step/FOREST_ACTIVITIES[this.activity].duration)
      if(this.progress>=1-1e-8){
        completed=this.activity
        const key=completed==='dance'?'stars':completed
        this.inventory[key]=Math.min(9999,this.inventory[key]+(completed==='fruit'?3:completed==='dance'?2:1))
        this.activity=null;this.progress=0
      }
    }
    return {meteor,ship,landed:before>0&&this.landing===0,completed}
  }
  save():ForestSave|null{return this.resident?{version:1,resident:{...this.resident},inventory:{...this.inventory}}:null}
}
