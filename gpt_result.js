"use strict";

/* 0) file:// 경고 */
const fileWarnEl=document.getElementById("fileWarn");
if(location.protocol==="file:"){
  fileWarnEl.style.display="block";
  fileWarnEl.innerHTML='지금 <b>file://</b>로 열렸어. 실제 검색/지도는 제한될 수 있어. <code>python3 -m http.server 5500</code>로 띄우고, 카카오 콘솔에 <b>http://localhost:5500</b> 등록해줘.';
}

/* 1) 파라미터 */
const qs=new URLSearchParams(location.search);
const locationName=(qs.get("location")||"").trim();
const filtersStr=(qs.get("filters")||"").trim();
const startStr=qs.get("start")||"";
const endStr=qs.get("end")||"";
const budgetTier=qs.get("budgetTier")||"mid";
const budgetAmount=+(qs.get("budgetAmount")||0);
const transportSel=qs.get("transport")||"대중교통";
const weatherSel=qs.get("weather")||"무관";
const moodsStr=(qs.get("moods")||"").trim();

function parseDaysByDates(s,e){if(!s||!e)return null;const sd=new Date(s),ed=new Date(e);if(isNaN(sd)||isNaN(ed))return null;return Math.max(1,Math.round((ed-sd)/86400000)+1);}
let days=parseDaysByDates(startStr,endStr); if(!days){ const m=filtersStr.match(/(\d+)\s*일/); days=m?+m[1]:1; }

document.getElementById("selectedInfo").textContent =
 `지역: ${locationName||"-"} | 기간: ${startStr||"?"} ~ ${endStr||"?"} (${days}일) | 예산: ${budgetAmount?budgetAmount.toLocaleString()+"원/1인":"미설정"} | 수준: ${budgetTier} | 이동: ${transportSel} | 날씨: ${weatherSel} | 필터: ${moodsStr||"없음"}`;

/* 2) 유틸 */
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const hasKakao=()=>window.kakao&&kakao.maps&&kakao.maps.services;
function haversineKm(aLat,aLng,bLat,bLng){const R=6371,toRad=d=>d*Math.PI/180,dLat=toRad(bLat-aLat),dLng=toRad(bLng-aLng);const x=Math.sin(dLat/2)**2+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function etaBy(mode,km){const spd=mode==="도보"?4.5:mode==="대중교통"?15:22;return Math.max(5,Math.round(km/spd*60));}
function parseHM(s){const [h,m]=s.split(":").map(Number);return h*60+m;}
function toHM(min){const h=Math.floor(min/60),m=min%60;return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;}
function clampDay(min){return Math.max(9*60,Math.min(min,22*60));}
function thumbByTag(tag){if(/카페/i.test(tag))return "https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?q=80&w=800&auto=format&fit=crop"; if(/맛집|음식|식당|시장/i.test(tag))return "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?q=80&w=800&auto=format&fit=crop"; return "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=800&auto=format&fit=crop";}

/* 3) 비용 테이블 */
const COST_TABLE={ low:{cafe:6000,lunch:9000,dinner:12000,culture:5000}, mid:{cafe:8000,lunch:12000,dinner:18000,culture:9000}, high:{cafe:12000,lunch:20000,dinner:30000,culture:15000} };
const COST=COST_TABLE[budgetTier]||COST_TABLE.mid;

/* 4) Kakao 검색 캐시 */
const MAX_RESULTS=12, USE_SESSION_CACHE=true, CACHE=new Map();

/* 5) 지역 센터/반경 */
const REGION_RADIUS_M=5000;
function parseCityGu(name){const p=name.split(/\s+/);if(p.length>=2)return{city:p[0],gu:p.slice(1).join(" ")};return{city:name,gu:""};}
async function getRegionCenter(region){
  if(!hasKakao())return{lat:37.5665,lng:126.9780};
  const ps=new kakao.maps.services.Places();
  const d=await new Promise(res=>ps.keywordSearch(region+" 구청",(a,s)=>res(s===kakao.maps.services.Status.OK?a:[])));
  if(d.length)return{lat:+d[0].y,lng:+d[0].x};
  const alt=await new Promise(res=>ps.keywordSearch(region,(a,s)=>res(s===kakao.maps.services.Status.OK?a:[])));
  return alt.length?{lat:+alt[0].y,lng:+alt[0].x}:{lat:37.5665,lng:126.9780};
}

/* 6) 검색 함수 */
function searchKeyword(keyword,center){
  const key=`K:${keyword}|${center.lat},${center.lng}`; if(USE_SESSION_CACHE){const s=sessionStorage.getItem(key);if(s)return Promise.resolve(JSON.parse(s));}
  if(CACHE.has(key))return Promise.resolve(CACHE.get(key));
  if(!hasKakao())return Promise.resolve([]);
  return new Promise(resolve=>{
    const ps=new kakao.maps.services.Places();
    ps.keywordSearch(keyword,(data,status)=>{
      if(status!==kakao.maps.services.Status.OK)return resolve([]);
      const list=data.slice(0,MAX_RESULTS).map(p=>({name:p.place_name,address:p.road_address_name||p.address_name||"",lat:+p.y,lng:+p.x,url:p.place_url,category:p.category_name||""}));
      CACHE.set(key,list); if(USE_SESSION_CACHE)sessionStorage.setItem(key,JSON.stringify(list)); resolve(list);
    },{location:new kakao.maps.LatLng(center.lat,center.lng),radius:REGION_RADIUS_M});
  });
}
function searchCategory(code,center){
  const key=`C:${code}|${center.lat},${center.lng}`; if(USE_SESSION_CACHE){const s=sessionStorage.getItem(key);if(s)return Promise.resolve(JSON.parse(s));}
  if(CACHE.has(key))return Promise.resolve(CACHE.get(key));
  if(!hasKakao())return Promise.resolve([]);
  return new Promise(resolve=>{
    const ps=new kakao.maps.services.Places();
    ps.categorySearch(code,(data,status)=>{
      if(status!==kakao.maps.services.Status.OK)return resolve([]);
      const list=data.slice(0,MAX_RESULTS).map(p=>({name:p.place_name,address:p.road_address_name||p.address_name||"",lat:+p.y,lng:+p.x,url:p.place_url,category:p.category_name||""}));
      CACHE.set(key,list); if(USE_SESSION_CACHE)sessionStorage.setItem(key,JSON.stringify(list)); resolve(list);
    },{location:new kakao.maps.LatLng(center.lat,center.lng),radius:REGION_RADIUS_M});
  });
}
const uniqByName=arr=>Array.from(new Map(arr.map(p=>[p.name,p])).values());
const inRadius=(c,p)=>haversineKm(c.lat,c.lng,p.lat,p.lng)*1000<=REGION_RADIUS_M;

/* 7) 현지 풀 수집: 구명/반경 필터링 + 카테고리 */
async function collectLocalPools(center,city,gu){
  const [fd,ce,at,ct]=await Promise.all([
    searchCategory("FD6",center), // 음식
    searchCategory("CE7",center), // 카페
    searchCategory("AT4",center), // 관광
    searchCategory("CT1",center), // 문화
  ]);
  const mk=await searchKeyword(`${city} ${gu} 재래시장`,center).then(a=>a.concat(searchKeyword(`${city} ${gu} 전통시장`,center)));
  const hasGu=p=>gu?(p.address.includes(gu)||p.name.includes(gu)):true;
  const filterLocal=a=>uniqByName(a).filter(p=>inRadius(center,p)||hasGu(p));
  return { food:filterLocal(fd), cafe:filterLocal(ce), sight:filterLocal(at), culture:filterLocal(ct), market:filterLocal(mk) };
}

/* 8) 필터/시드 */
const picked={
  healing:/힐링/.test(moodsStr), activity:/액티비티/.test(moodsStr),
  food:/먹거리|맛집/.test(moodsStr), culture:/문화/.test(moodsStr),
  romantic:/로맨틱/.test(moodsStr), night:/야간/.test(moodsStr),
  transport:transportSel, weather:weatherSel
};
function hash32(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=(h*16777619)>>>0;}return h>>>0;}
function seedsFromInput(){const base=`${locationName}|${startStr}|${endStr}|${budgetTier}|${budgetAmount}|${transportSel}|${weatherSel}|${moodsStr}|${days}`;const h=hash32(base);return [h,(h^0x9e3779b9)>>>0,((h*1103515245+12345)>>>0)];}
function randPick(arr,seed){seed.v=(seed.v*1103515245+12345)&0x7fffffff;return arr.length?arr[seed.v%arr.length]:null;}

/* 9) 카테고리 키/웨이팅/체류 */
function keyFromCat(cat){ if(/음식|맛집|식당|시장/i.test(cat))return "food"; if(/카페/i.test(cat))return "cafe"; if(/문화|박물관|미술관|공연|전시/i.test(cat))return "culture"; if(/관광|명소|전망|해변|공원|야경/i.test(cat))return "sight"; return "sight"; }
function waitingEstimate(p){const t=(p?.name||"")+" "+(p?.category||""); let w=5; if(/본점|핫플|웨이팅|줄|행렬|미쉐린|Michelin|시장/i.test(t))w+=15; if(/브런치|카페/i.test(t))w+=10; if(picked.night&&/바|펍|포차|루프탑/i.test(t))w+=10; return Math.min(w,60); }
function baseDwell(key){ if(key==="food"||key==="market")return 60; if(key==="cafe")return 45; if(key==="culture")return 90; return 75; }
function dwellAdjust(key,hm){ let add=0; if(picked.activity&&key==="sight")add+=20; if(picked.romantic&&hm>=19*60)add+=20; if(picked.weather==="비"&&(key==="culture"||key==="cafe"))add+=10; if(budgetTier==="high"&&(key==="food"||key==="cafe"))add+=10; return add; }

/* 10) 블루프린트/쿼터 */
function blueprint(totalDays){
  const tmpl=[{time:"09:00",pref:["sight","culture"]},{time:"12:00",pref:["food","market"]},{time:"15:00",pref:["sight","culture","cafe"]},{time:"18:00",pref:["food","market"]},{time:"20:00",pref:["sight","cafe"]}];
  if(picked.culture){tmpl[0].pref.unshift("culture");tmpl[2].pref.unshift("culture");}
  if(picked.healing){tmpl[0].pref.unshift("sight");tmpl[2].pref.unshift("sight");}
  if(picked.weather==="비"){tmpl[0].pref=["culture","cafe","sight"];tmpl[2].pref=["culture","cafe","sight"];tmpl[4].pref=["culture","cafe","sight"];}
  const slots=[];for(let d=1;d<=totalDays;d++)tmpl.forEach(s=>slots.push({day:d,time:s.time,pref:[...s.pref]})); return slots;
}
function quotas(totalDays){
  const q={food:0,culture:0,sight:0,cafe:0,market:0};
  if(picked.food)q.food+=2*totalDays;
  if(picked.culture)q.culture+=1*totalDays;
  if(picked.healing)q.sight+=1*totalDays;
  if(picked.night||picked.romantic)q.sight+=1*totalDays;
  if(picked.weather==="비"){q.culture+=Math.ceil(.5*totalDays);q.cafe+=Math.ceil(.5*totalDays);}
  return q;
}

/* 11) 스코어 */
function score(place,base,slotPref){
  let s=0; const cat=place.category||""; const key=keyFromCat(cat);
  const idx=slotPref.indexOf(key); if(idx===0)s+=3.5; else if(idx===1)s+=2; else if(idx===2)s+=1;
  if(picked.healing &&/공원|정원|스파|온천|숲|호수|산책/i.test(cat))s+=3;
  if(picked.activity&&/레저|서핑|체험|스포츠|테마/i.test(cat))s+=3;
  if(picked.culture &&/문화|박물관|미술관|공연|전시|역사/i.test(cat))s+=3;
  if(picked.food    &&/음식|맛집|식당|시장|회|해산물|분식/i.test(cat))s+=3;
  if(picked.romantic&&/야경|전망|루프탑|해변|브릿지|마리나/i.test(cat))s+=3;
  if(picked.weather==="비"){ if(/실내|박물관|미술관|카페|시장|전시|아쿠아리움/i.test(cat))s+=2.5; if(/해변|공원|야외/i.test(cat))s-=2; }
  if(base.prev && place.lat && place.lng){ const km=haversineKm(base.prev.lat,base.prev.lng,place.lat,place.lng); s-=Math.min(3,km/3); if(transportSel==="자동차")s+=0.5; if(transportSel==="도보")s-=0.5; }
  const w=waitingEstimate(place); if((key==="food"||key==="market")&&picked.food) s+=Math.min(1.5,w/30);
  return s;
}

/* 12) 로컬 패널 렌더 */
const localTabs=document.getElementById("localTabs"), localList=document.getElementById("localList");
let LOCAL_POOLS=null;
function renderLocal(cat){ if(!LOCAL_POOLS)return; const list=LOCAL_POOLS[cat]||[]; localList.innerHTML=list.slice(0,12).map(p=>`
  <div class="local-card">
    <img class="lthumb" src="${thumbByTag(p.category)}" alt="${p.name}" loading="lazy"/>
    <div>
      <p class="lname">${p.name}</p>
      <p class="lmeta">${p.address||""}</p>
      <span class="ltag">${p.category||cat}</span>
      ${p.url?` · <a href="${p.url}" target="_blank">상세보기</a>`:""}
    </div>
  </div>`).join("") || `<div class="local-card"><div></div><div><p>이 범위에서 결과가 부족해.</p></div></div>`; }
localTabs.addEventListener("click",e=>{const b=e.target.closest(".ltab");if(!b)return;document.querySelectorAll(".ltab").forEach(x=>x.classList.remove("active"));b.classList.add("active");renderLocal(b.dataset.cat);});

/* 13) 코스 생성(실제 상호명 + 시간/비용/이동 포함) */
function poolForKey(p,key){ if(key==="food")return p.food.length?p.food:(p.market.length?p.market:p.cafe); if(key==="market")return p.market.length?p.market:p.food; if(key==="culture")return p.culture.length?p.culture:p.sight; if(key==="cafe")return p.cafe.length?p.cafe:p.sight; return p.sight.length?p.sight:(p.culture.length?p.culture:p.cafe); }
function buildCourse({title,center,totalDays,pools,seed}){
  const slots=blueprint(totalDays), q=quotas(totalDays), used=new Set(), seedBox={v:seed};
  const plan=[]; let curHM=9*60, prev=center; let totalCost=0,totalMoveKm=0,totalMoveMin=0;

  for(const slot of slots){
    if(slot.time==="09:00"){curHM=9*60; plan.push({type:"day-start",label:(totalDays===1?"당일":`${slot.day}일차`)});}
    let pickKey=slot.pref.find(k=>(q[k]||0)>0)||slot.pref[0];
    let pool=poolForKey(pools,pickKey);

    const cand=(pool.length?pool:slot.pref.map(k=>poolForKey(pools,k)).flat())
      .filter(c=>!used.has(c.name))
      .map(c=>({p:c,s:score(c,{prev},slot.pref)}))
      .sort((a,b)=>b.s-a.s).slice(0,6).map(o=>o.p);

    const pick=cand.length?randPick(cand,seedBox):randPick(pool,seedBox);
    if(pick)used.add(pick.name);
    const key=pick?keyFromCat(pick.category||""):pickKey; if(q[key]>0)q[key]--;

    let km=0,move=0; if(pick&&pick.lat){km=haversineKm(prev.lat,prev.lng,pick.lat,pick.lng); move=etaBy(transportSel,km);}
    totalMoveKm+=km; totalMoveMin+=move;

    const wait=(key==="food"||key==="market")?waitingEstimate(pick):0;
    const dwell=baseDwell(key)+dwellAdjust(key,curHM)+(wait||0);

    let addCost=0; if(key==="food"||key==="market") addCost=(curHM<15*60)?COST.lunch:COST.dinner; else if(key==="cafe") addCost=COST.cafe; else if(key==="culture") addCost=COST.culture;
    totalCost+=addCost;

    const startHM=clampDay(curHM+move), endHM=clampDay(startHM+dwell);
    plan.push({
      time:toHM(startHM), end:toHM(endHM),
      title:pick?.name||`${key} 추천`, desc:pick?.category||key, address:pick?.address||"",
      url:pick?.url||"", moveText:km>0?`이동 ${Math.round(move)}분(약 ${km.toFixed(1)}km)`:"이동 없음",
      stayText:`체류 약 ${dwell}분${wait?` (웨이팅 ${wait}분 포함)`:""}`,
      costText:addCost?`예상 비용 약 ${addCost.toLocaleString()}원/1인`:"비용 없음",
      thumb:thumbByTag(pick?.category||key), _lat:pick?.lat||null,_lng:pick?.lng||null
    });
    curHM=endHM+10; if(pick&&pick.lat)prev={lat:pick.lat,lng:pick.lng};
  }
  return {title,center,plan,totalCost,totalMoveKm,totalMoveMin};
}

/* 14) 지도/탭 렌더 */
let map,polyline,markers=[]; let courses=[],currentIndex=0;
function initMap(center){ if(!hasKakao()||map) return; map=new kakao.maps.Map(document.getElementById("map"),{center:new kakao.maps.LatLng(center.lat,center.lng),level:6}); }
function drawRoute(i){
  if(!hasKakao())return; const c=courses[i]; if(!c)return;
  if(polyline)polyline.setMap(null); markers.forEach(m=>m.setMap(null)); markers=[];
  const path=[]; c.plan.forEach((s,idx)=>{ if(!s._lat||!s._lng)return; const pos=new kakao.maps.LatLng(s._lat,s._lng); path.push(pos); const mk=new kakao.maps.Marker({position:pos}); mk.setMap(map); markers.push(mk); const iw=new kakao.maps.InfoWindow({content:`<div style="padding:6px 8px;">${idx+1}. ${s.title}</div>`}); kakao.maps.event.addListener(mk,'click',()=>iw.open(map,mk)); });
  if(path.length){ polyline=new kakao.maps.Polyline({path,strokeWeight:4,strokeColor:'#4CAF50',strokeOpacity:.9}); polyline.setMap(map); const b=new kakao.maps.LatLngBounds(); path.forEach(p=>b.extend(p)); map.setBounds(b);}
}
document.getElementById("mapToggle").addEventListener("click",async()=>{
  const el=document.getElementById("map"); const open=el.style.display!=="none";
  if(open){el.style.display="none";document.getElementById("mapToggle").textContent="지도 열기";return;}
  el.style.display="block";document.getElementById("mapToggle").textContent="지도 닫기";
  await delay(50); initMap(courses[currentIndex]?.center||{lat:37.5665,lng:126.9780}); drawRoute(currentIndex);
});
function renderTabs(){
  const tabs=document.getElementById("courseTabs"); tabs.style.display="flex"; tabs.innerHTML="";
  courses.forEach((c,i)=>{const t=document.createElement("div"); t.className="course-tab"+(i===currentIndex?" active":""); t.textContent=c.title;
    t.onclick=()=>{currentIndex=i; document.querySelectorAll(".course-tab").forEach(x=>x.classList.remove("active")); t.classList.add("active"); renderTimetable(courses[i]); if(document.getElementById("map").style.display!=="none"){initMap(courses[i].center); drawRoute(i);} };
    tabs.appendChild(t);
  });
}
function renderTimetable(course){
  document.getElementById("courseTitle").textContent=`${locationName||"여행지"} 맞춤 일정 – ${course.title}`;
  const wrap=document.getElementById("timetable"); wrap.innerHTML="";
  course.plan.forEach((it,idx)=>{
    if(it.type==="day-start"){const h=document.createElement("div");h.className="day-title";h.textContent=it.label;wrap.appendChild(h);return;}
    const card=document.createElement("div"); card.className="time-card";
    card.innerHTML=`
      <div class="time">${it.time}<br/><small>~ ${it.end}</small></div>
      <div class="details">
        <h3>${idx+1}. ${it.title}</h3>
        <div class="chips"><span class="chip">${it.desc}</span>${it.address?`<span class="chip">${it.address}</span>`:""}</div>
        <p class="meta">${it.moveText} · ${it.stayText} · ${it.costText} ${it.url?`· <a href="${it.url}" target="_blank">상세보기</a>`:""}</p>
      </div>
      <img class="thumb" src="${it.thumb}" alt="${it.title}" loading="lazy"/>
    `;
    wrap.appendChild(card);
  });
  const sum=document.getElementById("summary"); const budgetInfo=budgetAmount?` · 예산 대비: ${budgetAmount.toLocaleString()}원/1인 기준 ${course.totalCost<=budgetAmount?"여유":"초과"}`:"";
  sum.style.display="block"; sum.innerHTML=`총 이동: 약 ${Math.round(course.totalMoveKm)}km / ${Math.round(course.totalMoveMin)}분 · 예상 합계(1인): 약 ${course.totalCost.toLocaleString()}원${budgetInfo}`;
}

/* 15) 메인 */
async function main(){
  if(!locationName){document.getElementById("selectedInfo").textContent="검색 지역이 없습니다. gpt.html에서 지역을 입력해줘.";return;}
  try{
    const online=hasKakao()&&location.protocol!=='file:'; const {city,gu}=parseCityGu(locationName);
    let center={lat:37.5665,lng:126.9780}; if(online) center=await getRegionCenter(`${city} ${gu||""}`.trim());

    const pools=online?await collectLocalPools(center,city,gu||""):{food:[],cafe:[],sight:[],culture:[],market:[]};
    LOCAL_POOLS=pools; renderLocal("food"); document.querySelectorAll(".ltab").forEach(btn=>btn.classList.toggle("active",btn.dataset.cat==="food"));

    const [s1,s2,s3]=seedsFromInput();
    courses=[ buildCourse({title:"코스 1",center,totalDays:days,pools,seed:s1}),
              buildCourse({title:"코스 2",center,totalDays:days,pools,seed:s2}),
              buildCourse({title:"코스 3",center,totalDays:days,pools,seed:s3}) ];
    renderTabs(); renderTimetable(courses[0]);
  }catch(e){
    console.log(e);
    const center={lat:37.5665,lng:126.9780}; LOCAL_POOLS={food:[],cafe:[],sight:[],culture:[],market:[]};
    renderLocal("food"); courses=[buildCourse({title:"코스 1",center,totalDays:days,pools:LOCAL_POOLS,seed:7})]; renderTabs(); renderTimetable(courses[0]);
  }
}
document.addEventListener("DOMContentLoaded",main);
