"use strict";

/* file:// 경고 */
const fileWarnEl=document.getElementById("fileWarn");
if(location.protocol==="file:"){
  fileWarnEl.style.display="block";
  fileWarnEl.innerHTML='지금 <b>file://</b>로 열렸어. 실제 검색/지도가 막힐 수 있어. <code>python3 -m http.server 5500</code>로 실행하고, 카카오 콘솔에 <b>http://localhost:5500</b> 등록해줘.';
}

/* 파라미터 */
const qs=new URLSearchParams(location.search);
const locationName=(qs.get("location")||"").trim();
const startStr=qs.get("start")||"";
const endStr=qs.get("end")||"";
const budgetTier=qs.get("budgetTier")||"mid";
const budgetAmount=+(qs.get("budgetAmount")||0);
const transportSel=qs.get("transport")||"대중교통";
const weatherSel=qs.get("weather")||"무관";
const moodsStr=(qs.get("moods")||"").trim();

/* 날짜/상단 정보 */
function parseDaysByDates(s,e){if(!s||!e)return null;const sd=new Date(s),ed=new Date(e);if(isNaN(sd)||isNaN(ed))return null;return Math.max(1,Math.round((ed-sd)/86400000)+1);}
let days=parseDaysByDates(startStr,endStr)||1;
document.getElementById("selectedInfo").textContent =
 `지역: ${locationName||"-"} | 기간: ${startStr||"?"} ~ ${endStr||"?"} (${days}일) | 예산: ${budgetAmount?budgetAmount.toLocaleString()+"원/1인":"미설정"} | 수준: ${budgetTier} | 이동: ${transportSel} | 날씨: ${weatherSel} | 필터: ${moodsStr||"없음"}`;

/* 유틸 */
const hasKakao=()=>window.kakao&&kakao.maps&&kakao.maps.services;
function haversineKm(aLat,aLng,bLat,bLng){const R=6371,toRad=d=>d*Math.PI/180,dLat=toRad(bLat-aLat),dLng=toRad(bLng-aLat);const x=Math.sin(dLat/2)**2+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function etaBy(mode,km){const spd=mode==="도보"?4.5:mode==="대중교통"?15:22;return Math.max(5,Math.round(km/spd*60));}
function toHM(min){const h=Math.floor(min/60),m=min%60;return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;}
function clampDay(min){return Math.max(9*60,Math.min(min,22*60));}
function clip(n,a,b){return Math.max(a,Math.min(n,b));}
function thumbByTag(tag){
  if(/카페/i.test(tag))return "https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?q=80&w=800";
  if(/맛집|음식|식당|시장/i.test(tag))return "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?q=80&w=800";
  if(/호텔|숙박|모텔|리조트|게스트/i.test(tag))return "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?q=80&w=800";
  return "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=800";
}

/* 비용 */
const COST_TABLE={ 
  low:{cafe:6000,lunch:9000,dinner:12000,culture:5000, stay:30000}, 
  mid:{cafe:8000,lunch:12000,dinner:18000,culture:9000, stay:60000}, 
  high:{cafe:12000,lunch:20000,dinner:30000,culture:15000, stay:120000} 
};
const COST=COST_TABLE[budgetTier]||COST_TABLE.mid;

/* 카카오 검색 */
const MAX_RESULTS=25, CACHE=new Map();
const REGION_RADIUS_M=6000;

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
function searchKeyword(keyword,center){
  if(!hasKakao())return Promise.resolve([]);
  const key=`K:${keyword}|${center.lat},${center.lng}`;
  if(CACHE.has(key))return Promise.resolve(CACHE.get(key));
  return new Promise(resolve=>{
    const ps=new kakao.maps.services.Places();
    ps.keywordSearch(keyword,(data,status)=>{
      if(status!==kakao.maps.services.Status.OK)return resolve([]);
      const list=data.slice(0,MAX_RESULTS).map(p=>({name:p.place_name,address:p.road_address_name||p.address_name||"",lat:+p.y,lng:+p.x,url:p.place_url,category:p.category_name||""}));
      CACHE.set(key,list); resolve(list);
    },{location:new kakao.maps.LatLng(center.lat,center.lng),radius:REGION_RADIUS_M});
  });
}
const uniqByName=arr=>Array.from(new Map(arr.map(p=>[p.name,p])).values());
const inRadius=(c,p)=>haversineKm(c.lat,c.lng,p.lat,p.lng)*1000<=REGION_RADIUS_M;

async function collectLocalPools(center){
  const [fd,ce,at,ct,ad,mk1,mk2]=await Promise.all([
    searchCategory("FD6",center),
    searchCategory("CE7",center),
    searchCategory("AT4",center),
    searchCategory("CT1",center),
    searchCategory("AD5",center),
    searchKeyword("재래시장",center),
    searchKeyword("전통시장",center)
  ]);
  const market = uniqByName([...(mk1||[]), ...(mk2||[])]);
  const filterLocal=a=>uniqByName(a).filter(p=>inRadius(center,p));
  return { 
    food:filterLocal(fd), cafe:filterLocal(ce), sight:filterLocal(at),
    culture:filterLocal(ct), stay:filterLocal(ad), market:filterLocal(market)
  };
}

/* 취향/시드 */
const picked={
  healing:/힐링/.test(moodsStr), activity:/액티비티/.test(moodsStr),
  food:/맛집|먹거리/.test(moodsStr), culture:/문화/.test(moodsStr),
  romantic:/로맨틱/.test(moodsStr), night:/야간/.test(moodsStr)
};
function hash32(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=(h*16777619)>>>0;}return h>>>0;}
function seedsFromInput(){const base=`${locationName}|${startStr}|${endStr}|${budgetTier}|${budgetAmount}|${transportSel}|${weatherSel}|${moodsStr}|${days}`;const h=hash32(base);return [h,(h^0x9e3779b9)>>>0,((h*1103515245+12345)>>>0)];}
function randPick(arr,seed){seed.v=(seed.v*1103515245+12345)&0x7fffffff;return arr.length?arr[seed.v%arr.length]:null;}

/* 분류/평가 */
function keyFromCat(cat){
  if(/음식|맛집|식당|분식|회|해산물|시장/i.test(cat))return "food";
  if(/카페|커피|베이커리/i.test(cat))return "cafe";
  if(/문화|박물관|미술관|공연|전시|도서관|아쿠아리움/i.test(cat))return "culture";
  if(/숙박|호텔|모텔|게스트|펜션|리조트|호스텔/i.test(cat))return "stay";
  return "sight";
}
function waitingEstimate(p){const t=(p?.name||"")+" "+(p?.category||""); let w=5; if(/웨이팅|본점|핫플|미쉐린|Michelin|시장/i.test(t))w+=15; return Math.min(w,60);}
function baseDwell(key){ if(key==="food")return 60; if(key==="cafe")return 45; if(key==="culture")return 90; if(key==="stay")return 60; return 75; }
function poolForKey(p,key){
  if(key==="food")return p.food.length?p.food:(p.market.length?p.market:p.cafe);
  if(key==="cafe")return p.cafe;
  if(key==="culture")return p.culture;
  if(key==="stay")return p.stay;
  return p.sight;
}
function categoryCost(key,hm){
  if(key==="food") return (hm<15*60)?COST.lunch:COST.dinner;
  if(key==="cafe") return COST.cafe;
  if(key==="culture") return COST.culture;
  if(key==="stay") return COST.stay||0;
  return 0;
}
function decideNextCategory(state){
  const {hm,hunger,energy,weatherBias}=state;
  let scores={food:0,cafe:0,culture:0,sight:0,stay:0};
  scores.food += clip((hunger-40)/40,0,1)*3;
  scores.cafe += clip((70-energy)/50,0,1)*1.5;
  if(weatherBias>0){ scores.culture+=2; scores.cafe+=1; }
  if(hm>=20*60) scores.stay+=3;
  if(hm<11*60){ scores.sight+=1.5; scores.culture+=1; }
  if(hm>=11*60 && hm<15*60){ scores.food+=1.5; }
  if(hm>=17*60 && hm<21*60){ scores.food+=1.5; }
  if(picked.healing) scores.sight+=1;
  if(picked.culture) scores.culture+=1;
  if(picked.night && hm>=19*60) scores.cafe+=0.8;
  let best="sight", bestv=-1;
  for(const k in scores){ if(scores[k]>bestv){bestv=scores[k]; best=k;} }
  return best;
}
function utility(place, key, state){
  const {prev, hm, budgetLeft, weatherBias, transport} = state;
  let u=0;
  const km=prev? haversineKm(prev.lat,prev.lng,place.lat,place.lng):0;
  const move=etaBy(transport,km);
  u -= Math.min(4, km/2.5);
  if(key==="food"){ u += 2; if(hm>=11*60&&hm<15*60)u+=1; if(hm>=17*60&&hm<21*60)u+=1; u += Math.min(1.5, waitingEstimate(place)/30); }
  if(key==="cafe"){ u += 0.8; if(hm>=13*60&&hm<19*60)u+=0.6; }
  if(key==="culture"){ u += 1.2; if(weatherBias>0)u+=1.2; }
  if(key==="sight"){ u += 1.0; if(weatherBias>0)u-=0.8; if(picked.romantic&&hm>=19*60)u+=1; }
  if(key==="stay"){ u += (hm>=20*60?3:1.2); }
  const cost=categoryCost(key,hm);
  if(cost>0 && budgetAmount>0){ const ratio=cost/Math.max(1,budgetAmount); u -= ratio*0.8; if(budgetLeft-cost<0)u-=1.5; }
  if(move>40) u-=1;
  return u;
}

/* 동적 스케줄러 */
function buildCourse({title,center,totalDays,pools,seed}){
  const used=new Set(); const seedBox={v:seed};
  const plan=[]; let totalCost=0,totalMoveKm=0,totalMoveMin=0;
  const lastAnchorByDay={};
  for(let day=1; day<=totalDays; day++){
    let hm=9*60;
    let prev=lastAnchorByDay[day-1]||center;
    let hunger=30, energy=85;
    let budgetLeft=budgetAmount||Infinity;
    const weatherBias=(/비|소나기|우천/.test(weatherSel))?1:0;
    plan.push({type:"day-start",label:(totalDays===1?"당일":`${day}일차`)});

    while(hm<22*60){
      hunger = clip(hunger + 0.5*(hm<12*60?1.2:1) + 0.7*(hm>=17*60?1.1:0.6), 0, 100);
      energy = clip(energy - 2.5, 20, 100);

      const key = decideNextCategory({hm,hunger,energy,weatherBias});
      const cand = poolForKey(pools,key)
        .filter(c=>c && !used.has(c.name))
        .map(c=>({p:c, u:utility(c,key,{prev,hm,budgetLeft,weatherBias,transport:transportSel})}))
        .sort((a,b)=>b.u-a.u)
        .slice(0,8)
        .map(o=>o.p);

      if(!cand.length){
        const fallbackKey = ["food","cafe","culture","sight","stay"].find(k=>poolForKey(pools,k).some(c=>!used.has(c.name)));
        if(!fallbackKey) break;
        cand.push(...poolForKey(pools,fallbackKey).filter(c=>!used.has(c.name)).slice(0,5));
      }
      if(!cand.length) break;

      const pick = randPick(cand, seedBox);
      used.add(pick.name);
      const k = keyFromCat(pick.category||"");

      const km = prev? haversineKm(prev.lat,prev.lng,pick.lat,pick.lng):0;
      const move = etaBy(transportSel, km);
      totalMoveKm += km; totalMoveMin += move;

      const wait = (k==="food")?waitingEstimate(pick):0;
      const dwell = baseDwell(k) + (k==="sight"&&picked.activity?20:0) + (k==="cafe"&&hm>=13*60?10:0) + (weatherBias>0&&k!=="sight"?10:0) + wait;

      const addCost = categoryCost(k,hm);
      totalCost += addCost; budgetLeft = (isFinite(budgetLeft)? Math.max(0,budgetLeft - addCost) : budgetLeft);

      const startHM = clampDay(hm + move);
      const endHM   = clampDay(startHM + dwell);

      plan.push({
        time: toHM(startHM),
        end:  toHM(endHM),
        title: pick.name,
        desc:  pick.category || k,
        address: pick.address || "",
        url: pick.url || "",
        moveText: km>0 ? `이동 ${Math.round(move)}분(약 ${km.toFixed(1)}km)` : "이동 없음",
        stayText: `체류 약 ${dwell}분${wait?` (웨이팅 ${wait}분 포함)`:""}`,
        costText: addCost?`예상 비용 약 ${addCost.toLocaleString()}원/1인`:"비용 없음",
        thumb: thumbByTag(pick.category||k),
        _lat: pick.lat, _lng: pick.lng, _key: k
      });

      hm = endHM + 10;
      prev = {lat:pick.lat,lng:pick.lng};
      if(!lastAnchorByDay[day] || lastAnchorByDay[day]._key!=="stay" || k==="stay"){
        lastAnchorByDay[day] = {...prev,_key:k};
      }
      if(k==="food"){ hunger = Math.max(10, hunger-55); }
      if(k==="cafe"){ energy = clip(energy+8,20,100); }
      if(k==="stay" && hm>=21*60){ break; }
    }
  }
  return {title,center,plan,totalCost,totalMoveKm,totalMoveMin};
}

/* --- UI 렌더/지도 --- */
let courses=[], currentIndex=0, map=null, polyline=null, markers=[];
function renderTabs(){
  const tabs=document.getElementById("courseTabs");
  tabs.style.display="flex"; tabs.innerHTML="";
  courses.forEach((c,i)=>{
    const div=document.createElement("div");
    div.className="course-tab"+(i===currentIndex?" active":"");
    div.textContent=c.title;
    div.onclick=()=>{
      currentIndex=i;
      document.querySelectorAll(".course-tab").forEach(x=>x.classList.remove("active"));
      div.classList.add("active");
      renderTimetable(courses[i]);
      if(document.getElementById("map").style.display!=="none"){ initMap(courses[i].center); drawRoute(i); }
    };
    tabs.appendChild(div);
  });
}
function renderTimetable(course){
  document.getElementById("courseTitle").textContent=`${locationName||"여행지"} 맞춤 일정 – ${course.title}`;
  const wrap=document.getElementById("timetable"); wrap.innerHTML="";
  course.plan.forEach((it,idx)=>{
    if(it.type==="day-start"){
      const h=document.createElement("div"); h.className="day-title"; h.textContent=it.label; wrap.appendChild(h); return;
    }
    const card=document.createElement("div"); card.className="time-card";
    card.innerHTML=`
      <div class="time">${it.time}<br/><small>~ ${it.end}</small></div>
      <div class="details">
        <h3>${idx}. ${it.title}</h3>
        <div class="chips">
          <span class="chip">${it.desc}</span>
          ${it.address?`<span class="chip">${it.address}</span>`:""}
        </div>
        <p class="meta">${it.moveText} · ${it.stayText} · ${it.costText} ${it.url?`· <a href="${it.url}" target="_blank">상세보기</a>`:""}</p>
      </div>
      <img class="thumb" src="${it.thumb}" alt="${it.title}" loading="lazy"/>
    `;
    wrap.appendChild(card);
  });
  const sum=document.getElementById("summary");
  sum.style.display="block";
  sum.innerHTML=`총 이동: 약 ${Math.round(course.totalMoveKm)}km / ${Math.round(course.totalMoveMin)}분 · 예상 합계(1인): 약 ${course.totalCost.toLocaleString()}원`;
}
function renderLocal(cat){
  if(!window.LOCAL_POOLS) return;
  const list=window.LOCAL_POOLS[cat]||[];
  const el=document.getElementById("localList");
  el.innerHTML = list.slice(0,12).map(p=>`
    <div class="local-card">
      <img class="lthumb" src="${thumbByTag(p.category)}" alt="${p.name}" loading="lazy"/>
      <div>
        <p class="lname">${p.name}</p>
        <p class="lmeta">${p.address||""}</p>
        <span class="ltag">${p.category||cat}</span>
        ${p.url?` · <a href="${p.url}" target="_blank">상세보기</a>`:""}
      </div>
    </div>
  `).join("") || `<div class="local-card"><div></div><div><p>이 범위에서 결과가 부족해.</p></div></div>`;
}
function initMap(center){
  if(!hasKakao()) return;
  if(!map){
    map=new kakao.maps.Map(document.getElementById("map"),{center:new kakao.maps.LatLng(center.lat,center.lng),level:6});
  }else{
    map.setCenter(new kakao.maps.LatLng(center.lat,center.lng));
  }
}
function drawRoute(i){
  if(!hasKakao())return; const c=courses[i]; if(!c) return;
  if(polyline) polyline.setMap(null); markers.forEach(m=>m.setMap(null)); markers=[];
  const path=[];
  c.plan.forEach((s,idx)=>{
    if(!s._lat||!s._lng) return;
    const pos=new kakao.maps.LatLng(s._lat,s._lng); path.push(pos);
    const mk=new kakao.maps.Marker({position:pos}); mk.setMap(map); markers.push(mk);
    const iw=new kakao.maps.InfoWindow({content:`<div style="padding:6px 8px;">${idx}. ${s.title}</div>`});
    kakao.maps.event.addListener(mk,'click',()=>iw.open(map,mk));
  });
  if(path.length){
    polyline=new kakao.maps.Polyline({path,strokeWeight:4,strokeColor:'#4CAF50',strokeOpacity:.9}); polyline.setMap(map);
    const b=new kakao.maps.LatLngBounds(); path.forEach(p=>b.extend(p)); map.setBounds(b);
  }
}
/* 지도 토글 */
document.getElementById("mapToggle").addEventListener("click",async()=>{
  const el=document.getElementById("map"); const open=el.style.display!=="none";
  if(open){el.style.display="none";document.getElementById("mapToggle").textContent="지도 열기";return;}
  el.style.display="block";document.getElementById("mapToggle").textContent="지도 닫기";
  await new Promise(r=>setTimeout(r,50)); if(courses[0]){ initMap(courses[currentIndex]?.center||{lat:37.5665,lng:126.9780}); drawRoute(currentIndex); }
});
/* 로컬 탭 */
document.getElementById("localTabs").addEventListener("click",(e)=>{
  const b=e.target.closest(".ltab"); if(!b) return;
  document.querySelectorAll(".ltab").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  renderLocal(b.dataset.cat);
});

/* 메인 */
window.main = async function main(){
  if(!locationName) return;
  const online = !!(window.kakao && kakao.maps && kakao.maps.services);
  let center={lat:37.5665,lng:126.9780};
  if(online) center=await getRegionCenter(locationName);

  let pools;
  if(online){
    pools = await collectLocalPools(center);
  } else {
    pools = {
      food:[{name:"더미 맛집",address:"",lat:37.57,lng:126.98,url:"",category:"음식점"}],
      cafe:[{name:"더미 카페",address:"",lat:37.571,lng:126.981,url:"",category:"카페"}],
      sight:[{name:"더미 관광지",address:"",lat:37.572,lng:126.982,url:"",category:"관광명소"}],
      culture:[{name:"더미 미술관",address:"",lat:37.573,lng:126.983,url:"",category:"미술관"}],
      market:[{name:"더미 시장",address:"",lat:37.574,lng:126.984,url:"",category:"시장"}],
      stay:[{name:"더미 호텔",address:"",lat:37.575,lng:126.985,url:"",category:"호텔"}]
    };
  }
  window.LOCAL_POOLS = pools;
  renderLocal("food"); // 첫 로컬 목록

  const [s1,s2,s3]=seedsFromInput();
  courses=[
    buildCourse({title:"코스 1",center,totalDays:days,pools,seed:s1}),
    buildCourse({title:"코스 2",center,totalDays:days,pools,seed:s2}),
    buildCourse({title:"코스 3",center,totalDays:days,pools,seed:s3})
  ];
  renderTabs();
  renderTimetable(courses[0]);
};
