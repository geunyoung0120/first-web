"use strict";

const fileWarnEl=document.getElementById("fileWarn");
if(location.protocol==="file:"){
  fileWarnEl.style.display="block";
  fileWarnEl.innerHTML='지금 <b>file://</b>로 열렸어. <code>python3 -m http.server 5500</code>로 실행하고, 카카오 콘솔에 <b>http://localhost:5500</b> 등록해줘.';
}

const qs=new URLSearchParams(location.search);
const locationName=(qs.get("location")||"").trim();
const startStr=qs.get("start")||"";
const endStr=qs.get("end")||"";
const budgetTier=qs.get("budgetTier")||"mid";
const budgetAmount=+(qs.get("budgetAmount")||0);
const transportSel=qs.get("transport")||"대중교통";
const weatherSel=qs.get("weather")||"무관";
const moodsStr=(qs.get("moods")||"").trim();

function parseDaysByDates(s,e){if(!s||!e)return null;const sd=new Date(s),ed=new Date(e);if(isNaN(sd)||isNaN(ed))return null;return Math.max(1,Math.round((ed-sd)/86400000)+1);}
let days=parseDaysByDates(startStr,endStr)||1;

document.getElementById("selectedInfo").textContent =
 `지역: ${locationName||"-"} | 기간: ${startStr||"?"} ~ ${endStr||"?"} (${days}일) | 예산: ${budgetAmount?budgetAmount.toLocaleString()+"원/1인":"미설정"} | 수준: ${budgetTier} | 이동: ${transportSel} | 날씨: ${weatherSel} | 필터: ${moodsStr||"없음"}`;

const hasKakao=()=>window.kakao&&kakao.maps&&kakao.maps.services;
function haversineKm(aLat,aLng,bLat,bLng){const R=6371,toRad=d=>d*Math.PI/180,dLat=toRad(bLat-aLat),dLng=toRad(bLng-aLng);const x=Math.sin(dLat/2)**2+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function etaBy(mode,km){const spd=mode==="도보"?4.5:mode==="대중교통"?15:22;return Math.max(5,Math.round(km/spd*60));}
function toHM(min){const h=Math.floor(min/60),m=min%60;return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;}
function clampDay(min){return Math.max(9*60,Math.min(min,22*60));}
function thumbByTag(tag){if(/카페/i.test(tag))return "https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?q=80&w=800"; if(/맛집|음식|식당/i.test(tag))return "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?q=80&w=800"; return "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=800";}

const COST_TABLE={ 
  low:{cafe:6000,lunch:9000,dinner:12000,culture:5000, stay:30000}, 
  mid:{cafe:8000,lunch:12000,dinner:18000,culture:9000, stay:60000}, 
  high:{cafe:12000,lunch:20000,dinner:30000,culture:15000, stay:120000} 
};
const COST=COST_TABLE[budgetTier]||COST_TABLE.mid;

const MAX_RESULTS=12, CACHE=new Map();
const REGION_RADIUS_M=5000;
async function getRegionCenter(region){
  if(!hasKakao())return{lat:37.5665,lng:126.9780};
  const ps=new kakao.maps.services.Places();
  const d=await new Promise(res=>ps.keywordSearch(region,(a,s)=>res(s===kakao.maps.services.Status.OK?a:[])));
  return d.length?{lat:+d[0].y,lng:+d[0].x}:{lat:37.5665,lng:126.9780};
}
function searchCategory(code,center){
  if(!hasKakao())return Promise.resolve([]);
  const key=`C:${code}|${center.lat},${center.lng}`;
  if(CACHE.has(key))return Promise.resolve(CACHE.get(key));
  return new Promise(resolve=>{
    const ps=new kakao.maps.services.Places();
    ps.categorySearch(code,(data,status)=>{
      if(status!==kakao.maps.services.Status.OK)return resolve([]);
      const list=data.slice(0,MAX_RESULTS).map(p=>({name:p.place_name,address:p.road_address_name||p.address_name||"",lat:+p.y,lng:+p.x,url:p.place_url,category:p.category_name||""}));
      CACHE.set(key,list); resolve(list);
    },{location:new kakao.maps.LatLng(center.lat,center.lng),radius:REGION_RADIUS_M});
  });
}
function uniqByName(arr){return Array.from(new Map(arr.map(p=>[p.name,p])).values());}
function inRadius(c,p){return haversineKm(c.lat,c.lng,p.lat,p.lng)*1000<=REGION_RADIUS_M;}

async function collectLocalPools(center){
  const [fd,ce,at,ct,ad]=await Promise.all([
    searchCategory("FD6",center),
    searchCategory("CE7",center),
    searchCategory("AT4",center),
    searchCategory("CT1",center),
    searchCategory("AD5",center)
  ]);
  const filterLocal=a=>uniqByName(a).filter(p=>inRadius(center,p));
  return { food:filterLocal(fd), cafe:filterLocal(ce), sight:filterLocal(at), culture:filterLocal(ct), stay:filterLocal(ad) };
}

const picked={healing:/힐링/.test(moodsStr), activity:/액티비티/.test(moodsStr),food:/맛집/.test(moodsStr),culture:/문화/.test(moodsStr),romantic:/로맨틱/.test(moodsStr), night:/야간/.test(moodsStr)};
function hash32(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=(h*16777619)>>>0;}return h>>>0;}
function seedsFromInput(){const base=`${locationName}|${startStr}|${endStr}|${budgetTier}|${budgetAmount}|${transportSel}|${weatherSel}|${moodsStr}|${days}`;const h=hash32(base);return [h,(h^0x9e3779b9)>>>0,((h*1103515245+12345)>>>0)];}
function randPick(arr,seed){seed.v=(seed.v*1103515245+12345)&0x7fffffff;return arr.length?arr[seed.v%arr.length]:null;}

function keyFromCat(cat){ if(/음식|맛집|식당/i.test(cat))return "food"; if(/카페/i.test(cat))return "cafe"; if(/문화/i.test(cat))return "culture"; if(/관광|명소/i.test(cat))return "sight"; if(/숙박|호텔|모텔|펜션|리조트/i.test(cat))return "stay"; return "sight"; }
function waitingEstimate(p){let w=5; if(/웨이팅|미쉐린|시장/i.test(p?.name||""))w+=15; return Math.min(w,60);}
function baseDwell(key){ if(key==="food"||key==="stay")return 60; if(key==="cafe")return 45; if(key==="culture")return 90; return 75; }
function dwellAdjust(key,hm){let add=0; if(picked.activity&&key==="sight")add+=20; if(picked.romantic&&hm>=19*60)add+=20; return add;}
function poolForKey(p,key){if(key==="food")return p.food; if(key==="cafe")return p.cafe; if(key==="culture")return p.culture; if(key==="stay")return p.stay; return p.sight;}

function preferredKeysByTime(hm){
  const h=Math.floor(hm/60);
  if(h<11)return["sight","culture","cafe"];
  if(h<15)return["food","sight","culture"];
  if(h<18)return["sight","culture","cafe"];
  if(h<21)return["food","sight","cafe"];
  return["stay","cafe","sight"];
}

function score(place,base,pref){let s=0; const key=keyFromCat(place.category||""); if(pref[0]===key)s+=3; if(base.prev) s-=Math.min(3,haversineKm(base.prev.lat,base.prev.lng,place.lat,place.lng)/3); return s;}

function buildCourse({title,center,totalDays,pools,seed}){
  const used=new Set(); const seedBox={v:seed};
  const plan=[]; let totalCost=0,totalMoveKm=0,totalMoveMin=0;
  const lastAnchorByDay={};
  for(let day=1;day<=totalDays;day++){
    let curHM=9*60;
    let prev=center; if(lastAnchorByDay[day-1]) prev=lastAnchorByDay[day-1];
    plan.push({type:"day-start",label:(totalDays===1?"당일":`${day}일차`)});
    while(curHM<22*60){
      const pref=preferredKeysByTime(curHM);
      const cand=pref.map(k=>poolForKey(pools,k)).flat().filter(c=>c&&!used.has(c.name)).map(c=>({p:c,s:score(c,{prev},pref)})).sort((a,b)=>b.s-a.s).slice(0,6).map(o=>o.p);
      if(!cand.length) break;
      const pick=randPick(cand,seedBox); used.add(pick.name);
      const key=keyFromCat(pick.category||"");
      const km=haversineKm(prev.lat,prev.lng,pick.lat,pick.lng);
      const move=etaBy(transportSel,km); totalMoveKm+=km; totalMoveMin+=move;
      const wait=(key==="food"?waitingEstimate(pick):0);
      const dwell=baseDwell(key)+dwellAdjust(key,curHM)+wait;
      let addCost=0; if(key==="food") addCost=(curHM<15*60)?COST.lunch:COST.dinner; else if(key==="cafe") addCost=COST.cafe; else if(key==="culture") addCost=COST.culture; else if(key==="stay") addCost=COST.stay; totalCost+=addCost;
      const startHM=clampDay(curHM+move), endHM=clampDay(startHM+dwell);
      plan.push({time:toHM(startHM),end:toHM(endHM),title:pick.name,desc:pick.category||key,address:pick.address||"",url:pick.url||"",moveText:km>0?`이동 ${Math.round(move)}분(약 ${km.toFixed(1)}km)`:"이동 없음",stayText:`체류 약 ${dwell}분`,costText:addCost?`약 ${addCost.toLocaleString()}원/1인`:"",thumb:thumbByTag(pick.category||key),_lat:pick.lat,_lng:pick.lng,_key:key});
      curHM=endHM+10; prev={lat:pick.lat,lng:pick.lng}; lastAnchorByDay[day]=prev;
    }
  }
  return {title,center,plan,totalCost,totalMoveKm,totalMoveMin};
}

let courses=[];
async function main(){
  if(!locationName) return;
  let center={lat:37.5665,lng:126.9780};
  if(hasKakao()) center=await getRegionCenter(locationName);
  const pools=await collectLocalPools(center);
  const [s1,s2,s3]=seedsFromInput();
  courses=[ buildCourse({title:"코스 1",center,totalDays:days,pools,seed:s1}),
            buildCourse({title:"코스 2",center,totalDays:days,pools,seed:s2}),
            buildCourse({title:"코스 3",center,totalDays:days,pools,seed:s3}) ];
  console.log(courses);
}
document.addEventListener("DOMContentLoaded",main);
