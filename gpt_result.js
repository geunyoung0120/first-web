"use strict";

/* ========== 0) 파일 모드 경고 ========== */
const fileWarnEl = document.getElementById("fileWarn");
if (location.protocol === "file:") {
  fileWarnEl.style.display = "block";
  fileWarnEl.innerHTML = '지금 <b>file://</b>로 열렸어. 실제 검색/지도가 막혀서 폴백 데이터만 보여줄 수 있어. <code>python3 -m http.server 5500</code> → <b>http://localhost:5500/gpt.html</b> 로 접속하고, 카카오 콘솔에 도메인 등록해줘.';
}

/* ========== 1) 파라미터/상수 ========== */
const qs = new URLSearchParams(location.search);
const locationName = (qs.get("location") || "").trim();       // 예: "부산 해운대구"
const filtersStr   = (qs.get("filters")  || "").trim();
const startStr     = qs.get("start") || "";
const endStr       = qs.get("end")   || "";
const budgetTier   = qs.get("budgetTier") || "mid";
const budgetAmount = +(qs.get("budgetAmount") || 0);
const transportSel = qs.get("transport") || "대중교통";
const weatherSel   = qs.get("weather") || "무관";
const moodsStr     = (qs.get("moods") || "").trim(); // "힐링,먹거리,오후..."

function parseDaysByDates(s,e){
  if (!s || !e) return null;
  const sd=new Date(s), ed=new Date(e);
  if (isNaN(sd)||isNaN(ed)) return null;
  return Math.max(1, Math.round((ed-sd)/86400000)+1);
}
let days = parseDaysByDates(startStr,endStr);
if (!days){ const m = filtersStr.match(/(\d+)\s*일/); days = m?+m[1]:1; }

document.getElementById("selectedInfo").textContent =
  `지역: ${locationName||"-"} | 기간: ${startStr||"?"} ~ ${endStr||"?"} (${days}일) | 예산: ${budgetAmount?budgetAmount.toLocaleString()+"원/1인":"미설정"} | 수준: ${budgetTier} | 이동: ${transportSel} | 날씨: ${weatherSel} | 필터: ${moodsStr||"없음"}`;

/* ========== 2) 유틸 ========== */
const delay = ms => new Promise(r=>setTimeout(r,ms));
function hasKakao(){ return window.kakao && kakao.maps && kakao.maps.services; }
function haversineKm(lat1, lon1, lat2, lon2){ const R=6371, toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lat2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function etaBy(mode, km){ const spd = mode==="도보"?4.5:mode==="대중교통"?15:22; return Math.max(5, Math.round(km/spd*60)); }
function thumbByTag(tag){
  if (/카페|cafe/i.test(tag)) return "https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?q=80&w=800&auto=format&fit=crop";
  if (/맛집|음식|식당|market/i.test(tag)) return "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?q=80&w=800&auto=format&fit=crop";
  return "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=800&auto=format&fit=crop";
}

/* 예산 단가 */
const COST_TABLE = {
  low:  { cafe:6000, lunch:9000,  dinner:12000, sight:0 },
  mid:  { cafe:8000, lunch:12000, dinner:18000, sight:0 },
  high: { cafe:12000,lunch:20000, dinner:30000, sight:0 }
};
const COST = COST_TABLE[budgetTier] || COST_TABLE.mid;

/* Kakao Places 검색 캐시 */
const MAX_RESULTS = 10;
const USE_SESSION_CACHE = true;
const SEARCH_CACHE = new Map();

/* ========== 3) 지역 중심 & 반경 제한 ========== */
const REGION_RADIUS_M = 5000; // 5km 반경
function parseCityGu(name){
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return { city: parts[0], gu: parts.slice(1).join(" ") };
  return { city: name, gu: "" };
}
async function getRegionCenter(region){ // 구청/시청 기반
  if (!hasKakao()) return {lat:37.5665,lng:126.9780};
  const ps = new kakao.maps.services.Places();
  const data = await new Promise(res=>{
    ps.keywordSearch(region + " 구청", (d,st)=> res(st===kakao.maps.services.Status.OK?d:[]));
  });
  if (data.length) return { lat:+data[0].y, lng:+data[0].x };
  const alt = await new Promise(res=>{
    ps.keywordSearch(region, (d,st)=> res(st===kakao.maps.services.Status.OK?d:[]));
  });
  return alt.length ? { lat:+alt[0].y, lng:+alt[0].x } : {lat:37.5665,lng:126.9780};
}

/* ========== 4) Kakao 검색: 카테고리/키워드 ========== */
function searchPlacesKeyword(keyword, center){
  const key = `K:${keyword}|${center.lat},${center.lng}`;
  if (USE_SESSION_CACHE){ const s=sessionStorage.getItem(key); if(s) return Promise.resolve(JSON.parse(s)); }
  if (SEARCH_CACHE.has(key)) return Promise.resolve(SEARCH_CACHE.get(key));
  if (!hasKakao()) return Promise.resolve([]);

  return new Promise(resolve=>{
    const ps = new kakao.maps.services.Places();
    const opts = { location: new kakao.maps.LatLng(center.lat, center.lng), radius: REGION_RADIUS_M };
    ps.keywordSearch(keyword, (data,status)=>{
      if (status !== kakao.maps.services.Status.OK) return resolve([]);
      const list = data.slice(0, MAX_RESULTS).map(p=>({
        name:p.place_name,address:p.road_address_name||p.address_name||"",
        lat:+p.y,lng:+p.x,url:p.place_url,category:p.category_name||""
      }));
      SEARCH_CACHE.set(key, list);
      if (USE_SESSION_CACHE) sessionStorage.setItem(key, JSON.stringify(list));
      resolve(list);
    }, opts);
  });
}
function searchPlacesCategory(catCode, center){
  const key = `C:${catCode}|${center.lat},${center.lng}`;
  if (USE_SESSION_CACHE){ const s=sessionStorage.getItem(key); if(s) return Promise.resolve(JSON.parse(s)); }
  if (SEARCH_CACHE.has(key)) return Promise.resolve(SEARCH_CACHE.get(key));
  if (!hasKakao()) return Promise.resolve([]);

  return new Promise(resolve=>{
    const ps = new kakao.maps.services.Places();
    const opts = { location: new kakao.maps.LatLng(center.lat, center.lng), radius: REGION_RADIUS_M };
    ps.categorySearch(catCode, (data,status)=>{
      if (status !== kakao.maps.services.Status.OK) return resolve([]);
      const list = data.slice(0, MAX_RESULTS).map(p=>({
        name:p.place_name,address:p.road_address_name||p.address_name||"",
        lat:+p.y,lng:+p.x,url:p.place_url,category:p.category_name||""
      }));
      SEARCH_CACHE.set(key, list);
      if (USE_SESSION_CACHE) sessionStorage.setItem(key, JSON.stringify(list));
      resolve(list);
    }, opts);
  });
}
function uniqByName(arr){ return Array.from(new Map(arr.map(p=>[p.name,p])).values()); }
function inRadius(center, p){ const km=haversineKm(center.lat,center.lng,p.lat,p.lng); return km*1000<=REGION_RADIUS_M; }

/* ========== 5) 현지 풀 수집(지역성 보장) ========== */
async function collectLocalPools(center, city, gu){
  const [fd, ce, at, ct] = await Promise.all([
    searchPlacesCategory("FD6", center), // 음식점
    searchPlacesCategory("CE7", center), // 카페
    searchPlacesCategory("AT4", center), // 관광명소
    searchPlacesCategory("CT1", center), // 문화시설
  ]);
  const mk = await searchPlacesKeyword(`${city} ${gu} 재래시장`, center)
    .then(a=>a.concat(searchPlacesKeyword(`${city} ${gu} 전통시장`, center)));

  const nameHasGu = p => gu? (p.address.includes(gu) || p.name.includes(gu)) : true;
  const filterLocal = arr => uniqByName(arr).filter(p => inRadius(center,p) || nameHasGu(p));

  return {
    food:   filterLocal(fd),
    cafe:   filterLocal(ce),
    sight:  filterLocal(at),
    culture:filterLocal(ct),
    market: filterLocal(mk)
  };
}

/* ========== 6) 필터 가중치/청사진/할당 ========== */
const picked = {
  healing:   /힐링/.test(moodsStr),
  activity:  /액티비티/.test(moodsStr),
  food:      /먹거리|맛집/.test(moodsStr),
  culture:   /문화/.test(moodsStr),
  romantic:  /로맨틱/.test(moodsStr),
  morning:   /오전/.test(moodsStr),
  afternoon: /오후/.test(moodsStr),
  night:     /야간/.test(moodsStr),
  transport: transportSel,
  weather:   weatherSel // 무관/맑음/비
};

/* 입력값 해시 → 시드 결정(필터 바뀌면 결과 달라짐) */
function hash32(str){
  let h=2166136261>>>0;
  for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=(h*16777619)>>>0; }
  return h>>>0;
}
function seedsFromInput(){
  const base = `${locationName}|${startStr}|${endStr}|${budgetTier}|${budgetAmount}|${transportSel}|${weatherSel}|${moodsStr}|${days}`;
  const h = hash32(base);
  const r1 = (h ^ 0x9e3779b9) >>> 0;
  const r2 = (h * 1103515245 + 12345) >>> 0;
  const r3 = (r1 * 1664525 + 1013904223) >>> 0;
  return [h, r1, r2 ^ r3];
}

/* 코스 청사진: 슬롯별 목표 카테고리 */
function buildBlueprint(totalDays){
  // 기본: 오전 sight, 점심 food, 오후 sight/culture, 저녁 food, 야간 sight/cafe(로맨틱이면 전경/야경 우선)
  const dayTmpl = [
    {time:"09:00", pref:["sight","culture"]},
    {time:"12:00", pref:["food","market"]},
    {time:"15:00", pref:["sight","culture","cafe"]},
    {time:"18:00", pref:["food","market"]},
    {time:"20:00", pref:["sight","cafe"]},
  ];

  // 필터 영향
  if (picked.food) {
    dayTmpl[1].pref = ["food","market"];  // 점심 확정
    dayTmpl[3].pref = ["food","market"];  // 저녁 확정
  }
  if (picked.culture) {
    dayTmpl[0].pref.unshift("culture");
    dayTmpl[2].pref.unshift("culture");
  }
  if (picked.healing) {
    dayTmpl[0].pref.unshift("sight"); // 공원/산책
    dayTmpl[2].pref.unshift("sight");
  }
  if (picked.romantic) {
    dayTmpl[4].pref = ["sight","cafe"]; // 야간 전경/카페로 집중
  }
  if (picked.night) {
    // 야간 선호면 야간 슬롯 가중
    dayTmpl[4].pref.unshift("sight");
  }
  if (picked.weather==="비") {
    // 비: 실내(문화/카페/시장) 우선
    dayTmpl[0].pref = ["culture","cafe","sight"];
    dayTmpl[2].pref = ["culture","cafe","sight"];
    dayTmpl[4].pref = ["culture","cafe","sight"];
  }

  // 총 일수만큼 전개
  const slots=[];
  for(let d=1; d<=totalDays; d++){
    dayTmpl.forEach((s,i)=> slots.push({day:d, time:s.time, pref:[...s.pref]}));
  }
  return slots;
}

/* 카테고리별 최소 충족 수량(필터 강제 반영) */
function buildQuotas(totalDays){
  const q = { food:0, culture:0, sight:0, cafe:0, market:0 };
  if (picked.food)   { q.food += 2*totalDays; }             // 점심/저녁 최소 충족
  if (picked.culture){ q.culture += 1*totalDays; }
  if (picked.healing){ q.sight += 1*totalDays; }            // 오전 산책 등
  if (picked.night || picked.romantic){ q.sight += 1*totalDays; } // 야간 전경
  // 비: 실내(문화/카페/시장) 최소치 약간 올림
  if (picked.weather==="비"){ q.culture += .5*totalDays; q.cafe += .5*totalDays; q.market += .5*totalDays; }
  // 정수화
  Object.keys(q).forEach(k=> q[k] = Math.ceil(q[k]));
  return q;
}

/* ========== 7) 점수 함수(필터 가중 강화) ========== */
function scorePlace(place, base, slotPref){
  let s = 0; const cat=(place.category||"");

  // 슬롯 선호 카테고리 일치 보너스
  if (slotPref && slotPref.length){
    const key = detectKeyFromCategory(cat);
    const idx = slotPref.indexOf(key);
    if (idx===0) s += 3.5;
    else if (idx===1) s += 2.0;
    else if (idx===2) s += 1.0;
  }

  // 취향 가중
  if (picked.healing   && /공원|정원|스파|온천|호수|숲|산책/i.test(cat)) s += 3;
  if (picked.activity  && /레저|테마파크|서핑|스포츠|체험|클라이밍/i.test(cat)) s += 3;
  if (picked.culture   && /문화|박물관|미술관|고궁|공연|전시|역사/i.test(cat)) s += 3;
  if (picked.food      && /음식|맛집|식당|시장|회|해산물|분식|한식/i.test(cat)) s += 3;
  if (picked.romantic  && /전망|야경|루프탑|해변|강|오션|브릿지|전망대/i.test(cat)) s += 3;

  // 날씨
  if (picked.weather==="비"){
    if (/실내|쇼핑|박물관|미술관|아쿠아리움|카페|백화점|시장|전시/i.test(cat)) s += 2.5;
    if (/해변|공원|야외|정원/i.test(cat)) s -= 2.0;
  }
  if (picked.weather==="맑음"){
    if (/해변|공원|전망|야외|산책/i.test(cat)) s += 2.0;
  }

  // 이동 거리 패널티
  if (base.prev){
    const km = (place.lat&&place.lng) ? haversineKm(base.prev.lat, base.prev.lng, place.lat, place.lng) : 5;
    s -= Math.min(3, km/3);
    // 이동수단에 따른 가중: 자동차는 거리 패널티 완화, 도보는 강화
    if (picked.transport==="자동차") s += 0.5;
    if (picked.transport==="도보") s -= 0.5;
  }
  return s;
}

/* 카카오 카테고리 문자열 → 키 */
function detectKeyFromCategory(cat){
  if (/음식|맛집|식당|FD6|market|시장/i.test(cat)) return "food";
  if (/카페|CE7/i.test(cat)) return "cafe";
  if (/관광|명소|AT4|전망|해변|공원|정원|야경/i.test(cat)) return "sight";
  if (/문화|CT1|박물관|미술관|공연|전시|역사/i.test(cat)) return "culture";
  if (/시장/i.test(cat)) return "market";
  return "sight";
}

/* ========== 8) 현지 리스트 UI ========== */
const localTabs = document.getElementById("localTabs");
const localList = document.getElementById("localList");
let LOCAL_POOLS = null;
function renderLocalList(catKey){
  if (!LOCAL_POOLS) return;
  const list = LOCAL_POOLS[catKey] || [];
  localList.innerHTML = list.slice(0, 12).map(p=>`
    <div class="local-card">
      <img class="lthumb" src="${thumbByTag(p.category)}" alt="${p.name}" loading="lazy"/>
      <div>
        <p class="lname">${p.name}</p>
        <p class="lmeta">${p.address||""}</p>
        <span class="ltag">${p.category||catKey}</span>
        ${p.url?` · <a href="${p.url}" target="_blank">상세보기</a>`:""}
      </div>
    </div>
  `).join("") || `<div class="local-card"><div></div><div><p>이 범위에서 결과가 부족해.</p></div></div>`;
}
localTabs.addEventListener("click", e=>{
  const b = e.target.closest(".ltab"); if(!b) return;
  document.querySelectorAll(".ltab").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  renderLocalList(b.dataset.cat);
});

/* ========== 9) 코스 생성(필터 기반 청사진 + 최소 충족) ========== */
function randPick(arr, seed){ seed.v=(seed.v*1103515245+12345)&0x7fffffff; return arr.length?arr[seed.v%arr.length]:null; }

function buildOneCourse({title, center, totalDays, pools, seed}){
  const blueprint = buildBlueprint(totalDays);        // 슬롯별 선호 카테고리
  const quotas    = buildQuotas(totalDays);           // 카테고리 최소 충족
  const plan=[]; let prev=center;
  let totalCost=0,totalMoveMin=0,totalMoveKm=0;
  const used=new Set(); const seedBox={v:seed};

  function poolForKey(key){
    if (key==="food")   return pools.food.length? pools.food : (pools.market.length?pools.market:pools.cafe);
    if (key==="market") return pools.market.length? pools.market : pools.food;
    if (key==="culture")return pools.culture.length? pools.culture : pools.sight;
    if (key==="cafe")   return pools.cafe.length? pools.cafe : pools.sight;
    return pools.sight.length? pools.sight : (pools.culture.length?pools.culture:pools.cafe);
  }

  for (const [i,slot] of blueprint.entries()){
    // day 헤더
    if (slot.time==="09:00"){
      plan.push({type:"day-start",label:(totalDays===1?"당일":`${slot.day}일차`)});
    }

    // 1) 우선순위 카테고리 중 ‘아직 quota 미달’인 키 선택
    let pickKey = slot.pref.find(k=> (quotas[k]||0) > 0 ) || slot.pref[0];
    let pool = poolForKey(pickKey);

    // 2) 후보 스코어링(필터 가중 + 슬롯 일치 + 거리)
    const candidates = (pool.length? pool : slot.pref.map(poolForKey).flat())
      .filter(c=>!used.has(c.name))
      .map(c=>{
        let s = scorePlace(c, {prev}, slot.pref);
        // 예산 수준에 따라 식사 시간대에서 추가 가중
        if ((slot.time==="12:00"||slot.time==="18:00") && (pickKey==="food"||pickKey==="market")){
          if (budgetTier==="low")  s += 0.6;
          if (budgetTier==="high") s += 0.6;
        }
        return {p:c,s};
      })
      .sort((a,b)=>b.s-a.s)
      .slice(0, 6)
      .map(o=>o.p);

    const pick = candidates.length ? randPick(candidates, seedBox) : randPick(pool, seedBox);
    if (pick) used.add(pick.name);

    // 3) quota 차감
    const chosenKey = pick ? detectKeyFromCategory(pick.category||"") : pickKey;
    if (quotas[chosenKey]>0) quotas[chosenKey]--;

    // 4) 이동/비용 집계
    let km=0,min=0,price=0;
    if (pick && pick.lat && pick.lng){
      km=haversineKm(prev.lat,prev.lng,pick.lat,pick.lng);
      min=etaBy(transportSel,km);
      prev={lat:pick.lat,lng:pick.lng};
    }
    if (slot.time==="12:00") price=COST.lunch;
    else if (slot.time==="18:00") price=COST.dinner;
    else if (slot.time==="20:00" && chosenKey==="cafe") price=COST.cafe;

    totalCost += price; totalMoveKm += km; totalMoveMin += min;

    plan.push({
      time:slot.time,
      title:pick?.name || `${slot.pref[0]} 추천`,
      desc: pick?.category || chosenKey,
      address:pick?.address || "",
      url:pick?.url || "",
      moveText:km>0?`이동 약 ${Math.round(min)}분(약 ${km.toFixed(1)}km)`:"이동 없음",
      costText:price?`예상 비용 약 ${price.toLocaleString()}원/1인`:"비용 없음",
      thumb:thumbByTag(pick?.category || chosenKey),
      _lat:pick?.lat || null, _lng:pick?.lng || null
    });
  }

  return { title, center, plan, totalCost, totalMoveMin, totalMoveKm };
}

/* ========== 10) 지도/탭 렌더 ========== */
let map, polyline, markers=[]; let courses=[], currentIndex=0;
function initMap(center){ if(!hasKakao()||map) return; map=new kakao.maps.Map(document.getElementById('map'),{center:new kakao.maps.LatLng(center.lat,center.lng),level:6}); }
function drawRoute(idx){
  if (!hasKakao()) return; const c=courses[idx]; if(!c) return;
  if (polyline) polyline.setMap(null); markers.forEach(m=>m.setMap(null)); markers=[];
  const path=[]; c.plan.filter(s=>s.time).forEach((s,i)=>{
    if (!s._lat||!s._lng) return;
    const pos=new kakao.maps.LatLng(s._lat,s._lng); path.push(pos);
    const mk=new kakao.maps.Marker({position:pos}); mk.setMap(map); markers.push(mk);
    const iw=new kakao.maps.InfoWindow({content:`<div style="padding:6px 8px;">${i+1}. ${s.title}</div>`});
    kakao.maps.event.addListener(mk,'click',()=>iw.open(map,mk));
  });
  if (path.length){ polyline=new kakao.maps.Polyline({path,strokeWeight:4,strokeColor:'#4CAF50',strokeOpacity:0.9}); polyline.setMap(map);
    const b=new kakao.maps.LatLngBounds(); path.forEach(p=>b.extend(p)); map.setBounds(b); }
}
document.getElementById('mapToggle').addEventListener('click', async ()=>{
  const el=document.getElementById('map'); const open = el.style.display!=='none';
  if (open){ el.style.display='none'; document.getElementById('mapToggle').textContent='지도 열기'; return; }
  el.style.display='block'; document.getElementById('mapToggle').textContent='지도 닫기';
  await delay(50); initMap(courses[currentIndex]?.center||{lat:37.5665,lng:126.9780}); drawRoute(currentIndex);
});

function renderTabs(){
  const tabs=document.getElementById('courseTabs'); tabs.style.display='flex'; tabs.innerHTML='';
  courses.forEach((c,i)=>{
    const tab=document.createElement('div'); tab.className='course-tab'+(i===currentIndex?' active':''); tab.textContent=c.title;
    tab.onclick=()=>{ currentIndex=i; document.querySelectorAll('.course-tab').forEach(e=>e.classList.remove('active')); tab.classList.add('active');
      renderTimetable(courses[i]); if (document.getElementById('map').style.display!=='none'){ initMap(courses[i].center); drawRoute(i); } };
    tabs.appendChild(tab);
  });
}
function renderTimetable(course){
  document.getElementById('courseTitle').textContent = `${locationName||"여행지"} 맞춤 일정 – ${course.title}`;
  const wrap=document.getElementById('timetable'); wrap.innerHTML='';
  course.plan.forEach(item=>{
    if (item.type==='day-start'){ const h=document.createElement('div'); h.className='day-title'; h.textContent=item.label; wrap.appendChild(h); return; }
    const card=document.createElement('div'); card.className='time-card';
    card.innerHTML = `
      <div class="time">${item.time}</div>
      <div class="details">
        <h3>${item.title}</h3>
        <div class="chips">
          <span class="chip">${item.desc}</span>
          ${item.address?`<span class="chip">${item.address}</span>`:""}
        </div>
        <p class="meta">${item.moveText} · ${item.costText} ${item.url?`· <a href="${item.url}" target="_blank">상세보기</a>`:""}</p>
      </div>
      <img class="thumb" src="${item.thumb}" alt="${item.title}" loading="lazy"/>
    `;
    wrap.appendChild(card);
  });
  const sum=document.getElementById('summary'); const budgetInfo = budgetAmount ? ` · 예산 대비: ${budgetAmount.toLocaleString()}원/1인 기준 ${course.totalCost<=budgetAmount?"여유":"초과"}`: "";
  sum.style.display='block'; sum.innerHTML=`총 이동: 약 ${Math.round(course.totalMoveKm)}km / ${Math.round(course.totalMoveMin)}분 · 식음료/식사 예상 합계(1인): 약 ${course.totalCost.toLocaleString()}원${budgetInfo}`;
}

/* ========== 11) 메인 ========== */
async function main(){
  if (!locationName){ document.getElementById('selectedInfo').textContent="검색 지역이 없습니다. gpt.html에서 지역을 입력해줘."; return; }
  try{
    const online = hasKakao() && location.protocol!=='file:';
    const { city, gu } = parseCityGu(locationName);
    let center = {lat:37.5665,lng:126.9780};
    if (online) center = await getRegionCenter(`${city} ${gu||""}`.trim());

    // 1) 현지 풀 수집
    const pools = online
      ? await collectLocalPools(center, city, gu||"")
      : { food:[],cafe:[],sight:[],culture:[],market:[] };

    // 2) 현지 리스트 렌더(탭)
    window.LOCAL_POOLS = pools;
    renderLocalList("food");
    document.querySelectorAll(".ltab").forEach(btn=>btn.classList.toggle("active", btn.dataset.cat==="food"));

    // 3) 입력값 기반 시드 → 코스 3개
    const [s1,s2,s3] = seedsFromInput();
    courses = [
      buildOneCourse({title:"코스 1", center, totalDays:days, pools, seed:s1}),
      buildOneCourse({title:"코스 2", center, totalDays:days, pools, seed:s2}),
      buildOneCourse({title:"코스 3", center, totalDays:days, pools, seed:s3})
    ];
    renderTabs(); renderTimetable(courses[0]);

  }catch(e){
    console.log(e);
    const center={lat:37.5665,lng:126.9780};
    window.LOCAL_POOLS = { food:[],cafe:[],sight:[],culture:[],market:[] };
    renderLocalList("food");
    courses=[buildOneCourse({title:"코스 1",center,totalDays:days,pools:window.LOCAL_POOLS,seed:7})];
    renderTabs(); renderTimetable(courses[0]);
  }
}
document.addEventListener("DOMContentLoaded", main);
