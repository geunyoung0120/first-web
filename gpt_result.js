"use strict";

/* 파일 모드 경고 */
const fileWarnEl = document.getElementById("fileWarn");
if (location.protocol === "file:") {
  fileWarnEl.style.display = "block";
  fileWarnEl.innerHTML = '지금 <b>file://</b>로 열렸어. 실제 장소 검색/지도가 차단돼. 빠른 확인용 폴백 코스를 보여주고, 실제 데이터는 <code>python3 -m http.server 5500</code> → <b>http://localhost:5500/gpt.html</b> 로 접속 + 카카오 콘솔 도메인 등록해줘.';
}

/* ===== 파라미터 파싱 ===== */
const qs = new URLSearchParams(location.search);
const locationName = (qs.get("location") || "").trim();
const filtersStr   = (qs.get("filters")  || "").trim();
const startStr     = qs.get("start") || "";
const endStr       = qs.get("end") || "";
const budgetTier   = qs.get("budgetTier") || "low";
const budgetAmount = +(qs.get("budgetAmount") || 0); // 1인 총예산(원)
const transportSel = qs.get("transport") || "대중교통";
const weatherSel   = qs.get("weather") || "무관";
const moodsStr     = qs.get("moods") || ""; // "힐링,먹거리,오후..."

function parseDaysByDates(s, e){
  if (!s || !e) return null;
  const sd = new Date(s), ed = new Date(e);
  if (isNaN(sd) || isNaN(ed)) return null;
  return Math.max(1, Math.round((ed - sd)/86400000) + 1);
}
let days = parseDaysByDates(startStr, endStr);
if (!days) {
  // filtersStr 호환
  const m = filtersStr.match(/(\d+)\s*일/);
  days = m ? +m[1] : 1;
}

/* 헤더 설명 */
document.getElementById("selectedInfo").textContent =
  `지역: ${locationName||"-"} | 기간: ${startStr||"?"} ~ ${endStr||"?"} (${days}일) | 예산: ${budgetAmount?budgetAmount.toLocaleString()+"원/1인":"미설정"} | 예산수준: ${budgetTier} | 이동: ${transportSel} | 날씨: ${weatherSel} | 필터: ${moodsStr||"없음"}`;

/* ===== 공통 유틸 ===== */
const delay = ms => new Promise(r=>setTimeout(r,ms));
function hasKakao(){ return window.kakao && kakao.maps && kakao.maps.services; }
function haversineKm(lat1, lon1, lat2, lon2){
  const R=6371, toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function etaBy(mode, km){
  const spd = mode==="도보" ? 4.5 : mode==="대중교통" ? 15 : 22;
  return Math.max(5, Math.round(km/spd*60));
}
function thumbByTag(tag){
  if (/카페|cafe/i.test(tag)) return "https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?q=80&w=800&auto=format&fit=crop";
  if (/맛집|음식|식당|market/i.test(tag)) return "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?q=80&w=800&auto=format&fit=crop";
  return "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=800&auto=format&fit=crop";
}

/* 예산 수준에 따라 기본 단가 */
const COST_TABLE = {
  low:  { cafe:6000, lunch:9000,  dinner:12000, sight:0 },
  mid:  { cafe:8000, lunch:12000, dinner:18000, sight:0 },
  high: { cafe:12000,lunch:20000, dinner:30000, sight:0 }
};
const COST = COST_TABLE[budgetTier] || COST_TABLE.low;

/* Kakao Places 검색 with 캐시 */
const MAX_RESULTS = 7;
const USE_SESSION_CACHE = true;
const SEARCH_CACHE = new Map();

function searchPlaces(keyword, centerLatLng=null){
  const key = `${keyword}|${centerLatLng?centerLatLng.lat+",":""}${centerLatLng?centerLatLng.lng:""}`;
  if (USE_SESSION_CACHE){
    const s = sessionStorage.getItem(key);
    if (s) return Promise.resolve(JSON.parse(s));
  }
  if (SEARCH_CACHE.has(key)) return Promise.resolve(SEARCH_CACHE.get(key));
  if (!hasKakao()) return Promise.resolve([]);

  return new Promise((resolve)=>{
    const ps = new kakao.maps.services.Places();
    const opts = {};
    if (centerLatLng) opts.location = new kakao.maps.LatLng(centerLatLng.lat, centerLatLng.lng);
    ps.keywordSearch(keyword, (data,status)=>{
      if (status !== kakao.maps.services.Status.OK) return resolve([]);
      const list = data.slice(0,MAX_RESULTS).map(p=>({
        name:p.place_name, address:p.road_address_name||p.address_name||"",
        lat:+p.y, lng:+p.x, url:p.place_url, category:p.category_name||""
      }));
      SEARCH_CACHE.set(key,list);
      if (USE_SESSION_CACHE) sessionStorage.setItem(key, JSON.stringify(list));
      resolve(list);
    }, opts);
  });
}

async function getCityCenter(name){
  if (!hasKakao()) return {lat:35.1587,lng:129.1604};
  let r = await searchPlaces(`${name} 구청`);
  if (!r.length) r = await searchPlaces(`${name} 시청`);
  if (!r.length) r = await searchPlaces(name);
  return r.length ? {lat:r[0].lat,lng:r[0].lng} : {lat:37.5665,lng:126.9780};
}

/* ===== 필터 가중치 ===== */
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

function buildKeywords(city){
  const sights = [`${city} 관광지`, `${city} 명소`, `${city} 공원`, `${city} 전망`];
  const foods  = [`${city} 맛집`, `${city} 로컬 맛집`, `${city} 시장 맛집`];
  const cafes  = [`${city} 카페`, `${city} 디저트`, `${city} 루프탑 카페`];
  const night  = [`${city} 야경`, `${city} 야시장`, `${city} 나이트뷰`];

  if (picked.healing) sights.push(`${city} 산책`, `${city} 호수공원`, `${city} 정원`, `${city} 스파`);
  if (picked.activity) sights.push(`${city} 액티비티`, `${city} 서핑`, `${city} 레저`);
  if (picked.culture) sights.push(`${city} 박물관`, `${city} 미술관`, `${city} 고궁`);
  if (picked.romantic){ sights.push(`${city} 야경 명소`, `${city} 전망대`); cafes.push(`${city} 오션뷰 카페`, `${city} 뷰 카페`); }

  if (picked.weather==="비"){ sights.push(`${city} 실내 데이트`, `${city} 실내 명소`, `${city} 아쿠아리움`, `${city} 쇼핑몰`); }
  if (picked.weather==="맑음"){ sights.push(`${city} 야외 명소`, `${city} 해변`); }

  return { sights, foods, cafes, night };
}

/* ===== 슬롯/스코어 ===== */
function buildSlots(totalDays){
  const slots = [];
  for (let d=1; d<=totalDays; d++){
    slots.push({day:d, time:"09:00", tag:"오전"});
    slots.push({day:d, time:"12:00", tag:"점심"});
    slots.push({day:d, time:"15:00", tag:"오후"});
    slots.push({day:d, time:"18:00", tag:"저녁"});
    slots.push({day:d, time:"20:00", tag:"야간"});
  }
  return slots;
}

function scorePlace(place, base, slotTag){
  let s = 0;
  const cat = (place.category||"");

  // 취향
  if (picked.healing   && /공원|정원|스파|온천|호수|숲/.test(cat)) s += 3;
  if (picked.activity  && /레저|테마파크|서핑|스포츠|체험|클라이밍/.test(cat)) s += 3;
  if (picked.culture   && /박물관|미술관|고궁|전시|역사/.test(cat)) s += 3;
  if (picked.food      && /음식점|한식|시장|분식|회|해산물|맛집/.test(cat)) s += 3;
  if (picked.romantic  && /전망|야경|루프탑|해변|강|오션|브릿지/.test(cat)) s += 3;

  // 시간대 적합
  if (slotTag==="점심" || slotTag==="저녁"){
    if (/음식|맛집|식당|market|시장/.test(cat)) s += 2;
  } else if (slotTag==="야간"){
    if (/전망|야경|루프탑|해변|브릿지|타워/.test(cat)) s += 2;
  } else {
    if (/공원|박물관|미술관|고궁|산책|관광/.test(cat)) s += 1.5;
  }

  // 날씨
  if (picked.weather==="비"){
    if (/박물관|미술관|쇼핑|실내|아쿠아리움|백화점|카페|음식/.test(cat)) s += 2;
    if (/해변|공원|야외/.test(cat)) s -= 1;
  }
  if (picked.weather==="맑음"){
    if (/해변|공원|전망|산책|야외/.test(cat)) s += 2;
  }

  // 거리 패널티
  if (base.prev){
    const km = (place.lat&&place.lng) ? haversineKm(base.prev.lat, base.prev.lng, place.lat, place.lng) : 5;
    s -= Math.min(3, km/3);
  }
  return s;
}

/* ===== 데이터 수집 & 코스 빌더 ===== */
function uniqByName(arr){ return Array.from(new Map(arr.map(p=>[p.name,p])).values()); }
function randPick(arr, seed){ seed.v=(seed.v*1103515245+12345)&0x7fffffff; return arr.length?arr[seed.v%arr.length]:null; }

function buildOneCourse({title, center, totalDays, pools, seed}){
  const plan=[]; let prev=center;
  let totalCost=0,totalMoveMin=0,totalMoveKm=0;
  const slots = buildSlots(totalDays);
  const used = new Set(); const seedBox={v:seed};

  for (const slot of slots){
    const pool = slot.tag==="점심"||slot.tag==="저녁" ? pools.foods : (slot.tag==="야간" ? (pools.nightPool.length?pools.nightPool:pools.sights) : pools.sights);

    const scored = pool.filter(c=>!used.has(c.name)).map(c=>{
      let s = scorePlace(c, {prev}, slot.tag);
      s += ((seedBox.v=(seedBox.v*1664525+1013904223)>>>0)%100)/500; // 다양성
      return {p:c,s};
    }).sort((a,b)=>b.s-a.s).slice(0,6).map(o=>o.p);

    const pick = scored.length ? randPick(scored, seedBox) : randPick(pool, seedBox);
    if (pick) used.add(pick.name);

    // 이동/비용
    let km=0,min=0,price=0;
    if (pick && pick.lat && pick.lng){
      km = haversineKm(prev.lat, prev.lng, pick.lat, pick.lng);
      min = etaBy(transportSel, km);
      prev = {lat:pick.lat, lng:pick.lng};
    }
    if (slot.tag==="점심") price = COST.lunch;
    else if (slot.tag==="저녁") price = COST.dinner;
    else if (slot.tag==="야간" && /카페|디저트/i.test(pick?.category||"")) price = COST.cafe;

    totalCost += price; totalMoveKm += km; totalMoveMin += min;

    if (slot.time==="09:00") plan.push({type:"day-start",label:(totalDays===1?"당일":`${slot.day}일차`)});

    plan.push({
      time:slot.time,
      title:pick?.name || `${slot.tag} 추천`,
      desc:pick?.category || slot.tag,
      address:pick?.address || "",
      url:pick?.url || "",
      moveText:km>0?`이동 약 ${Math.round(min)}분(약 ${km.toFixed(1)}km)`:"이동 없음",
      costText:price?`예상 비용 약 ${price.toLocaleString()}원/1인`:"비용 없음",
      thumb:thumbByTag(pick?.category||slot.tag),
      _lat:pick?.lat||null,_lng:pick?.lng||null
    });
  }

  return { title, center, plan, totalCost, totalMoveMin, totalMoveKm };
}

async function generateDynamicCourses(city, totalDays){
  const center = await getCityCenter(city);
  const K = buildKeywords(city);

  const [sights, foods, cafes, nights] = await Promise.all([
    Promise.all(K.sights.map(k=>searchPlaces(k, center))).then(a=>uniqByName(a.flat())),
    Promise.all(K.foods .map(k=>searchPlaces(k, center))).then(a=>uniqByName(a.flat())),
    Promise.all(K.cafes .map(k=>searchPlaces(k, center))).then(a=>uniqByName(a.flat())),
    Promise.all(K.night .map(k=>searchPlaces(k, center))).then(a=>uniqByName(a.flat())),
  ]);
  const nightPool = uniqByName([...nights, ...sights.filter(x=>/전망|야경|브릿지|타워|해변/.test(x.category||""))]);

  const seeds=[7,19,103];
  return [
    buildOneCourse({title:"코스 1", center, totalDays, pools:{sights,foods,cafes,nightPool}, seed:seeds[0]}),
    buildOneCourse({title:"코스 2", center, totalDays, pools:{sights,foods,cafes,nightPool}, seed:seeds[1]}),
    buildOneCourse({title:"코스 3", center, totalDays, pools:{sights,foods,cafes,nightPool}, seed:seeds[2]}),
  ];
}

function fallbackCourses(city, totalDays){
  const center = /부산|해운대/.test(city) ? {lat:35.1605,lng:129.1599} : {lat:37.5665,lng:126.9780};
  const mk=(title,steps)=>{
    const plan=[]; for(let d=1; d<=totalDays; d++){
      plan.push({type:"day-start",label:(totalDays===1?"당일":`${d}일차`)});
      steps.forEach(s=>plan.push({
        time:s.t,title:s.name,desc:s.tag,address:s.addr,url:"",
        moveText:"이동 정보(오프라인 모드)", costText:s.price?`예상 비용 약 ${s.price.toLocaleString()}원/1인`:"비용 없음",
        thumb:thumbByTag(s.tag), _lat:null, _lng:null
      }));
    }
    const totalCost = steps.reduce((a,b)=>a+(b.price||0),0)*totalDays;
    return { title, center, plan, totalCost, totalMoveMin:0, totalMoveKm:0 };
  };
  return [
    mk("코스 1",[ {t:"09:00",tag:"관광",name:`${city} 대표 명소`,addr:"중심가",price:0}, {t:"12:00",tag:"점심",name:"로컬 인기 맛집",addr:"시내",price:COST.lunch}, {t:"15:00",tag:"관광",name:"산책 명소",addr:"근처",price:0}, {t:"18:00",tag:"저녁",name:"지역 대표 메뉴",addr:"시내",price:COST.dinner}, {t:"20:00",tag:"카페",name:"감성 카페",addr:"근처",price:COST.cafe}, ]),
    mk("코스 2",[ {t:"09:00",tag:"관광",name:"시장 산책",addr:"중심가",price:0}, {t:"12:00",tag:"점심",name:"시장 맛집",addr:"시장 일대",price:COST.lunch}, {t:"15:00",tag:"관광",name:"전통거리",addr:"근처",price:0}, {t:"18:00",tag:"저녁",name:"핫플 식당",addr:"시내",price:COST.dinner}, {t:"20:00",tag:"카페",name:"디저트 카페",addr:"근처",price:COST.cafe}, ]),
    mk("코스 3",[ {t:"09:00",tag:"관광",name:"자연/공원",addr:"근교",price:0}, {t:"12:00",tag:"점심",name:"테라스 맛집",addr:"근교",price:COST.lunch}, {t:"15:00",tag:"관광",name:"전망 스팟",addr:"근교",price:0}, {t:"18:00",tag:"저녁",name:"뷰 레스토랑",addr:"시내",price:COST.dinner}, {t:"20:00",tag:"카페",name:"루프탑 카페",addr:"시내",price:COST.cafe}, ]),
  ];
}

/* ===== 지도 + 탭/렌더 ===== */
let map, polyline, markers=[];
let courses=[], currentIndex=0;

function initMap(center){
  if (!hasKakao()) return;
  if (map) return;
  map = new kakao.maps.Map(document.getElementById('map'), {
    center:new kakao.maps.LatLng(center.lat, center.lng), level:6
  });
}
function drawRoute(idx){
  if (!hasKakao()) return;
  const c = courses[idx]; if(!c) return;
  if (polyline) polyline.setMap(null);
  markers.forEach(m=>m.setMap(null)); markers=[];

  const path=[];
  c.plan.filter(s=>s.time).forEach((s,i)=>{
    if (!s._lat || !s._lng) return;
    const pos = new kakao.maps.LatLng(s._lat, s._lng);
    path.push(pos);
    const mk = new kakao.maps.Marker({position:pos}); mk.setMap(map); markers.push(mk);
    const iw = new kakao.maps.InfoWindow({content:`<div style="padding:6px 8px;">${i+1}. ${s.title}</div>`});
    kakao.maps.event.addListener(mk,'click',()=>iw.open(map,mk));
  });
  if (path.length){
    polyline = new kakao.maps.Polyline({path,strokeWeight:4,strokeColor:'#4CAF50',strokeOpacity:0.9});
    polyline.setMap(map);
    const b = new kakao.maps.LatLngBounds(); path.forEach(p=>b.extend(p)); map.setBounds(b);
  }
}

document.getElementById('mapToggle').addEventListener('click', async ()=>{
  const el = document.getElementById('map');
  const open = el.style.display !== 'none';
  if (open){ el.style.display='none'; document.getElementById('mapToggle').textContent='지도 열기'; return; }
  el.style.display='block'; document.getElementById('mapToggle').textContent='지도 닫기';
  await delay(50);
  initMap(courses[currentIndex]?.center || {lat:37.5665,lng:126.9780});
  drawRoute(currentIndex);
});

function renderTabs(){
  const tabs = document.getElementById('courseTabs');
  tabs.style.display='flex'; tabs.innerHTML='';
  courses.forEach((c,i)=>{
    const tab = document.createElement('div');
    tab.className='course-tab'+(i===currentIndex?' active':'');
    tab.textContent = c.title;
    tab.onclick = ()=>{
      currentIndex=i;
      document.querySelectorAll('.course-tab').forEach(e=>e.classList.remove('active'));
      tab.classList.add('active');
      renderTimetable(courses[i]);
      if (document.getElementById('map').style.display!=='none'){ initMap(courses[i].center); drawRoute(i); }
    };
    tabs.appendChild(tab);
  });
}

function renderTimetable(course){
  document.getElementById('courseTitle').textContent = `${locationName||"여행지"} 맞춤 일정 – ${course.title}`;

  const wrap = document.getElementById('timetable'); wrap.innerHTML='';
  course.plan.forEach(item=>{
    if (item.type==='day-start'){
      const h=document.createElement('div'); h.className='day-title'; h.textContent=item.label; wrap.appendChild(h); return;
    }
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

  const sum=document.getElementById('summary');
  const budgetInfo = budgetAmount ? ` · 예산 대비: ${budgetAmount.toLocaleString()}원/1인 기준 ${course.totalCost<=budgetAmount?"여유":"초과"}`
                                  : "";
  sum.style.display='block';
  sum.innerHTML=`총 이동: 약 ${Math.round(course.totalMoveKm)}km / ${Math.round(course.totalMoveMin)}분 · 식음료/식사 예상 합계(1인): 약 ${course.totalCost.toLocaleString()}원${budgetInfo}`;
}

/* ===== 메인 ===== */
async function main(){
  if (!locationName){
    document.getElementById('selectedInfo').textContent = "검색 지역이 없습니다. gpt.html에서 지역을 입력해줘.";
    return;
  }
  try{
    const online = hasKakao() && location.protocol!=='file:';
    courses = online ? await generateDynamicCourses(locationName, days)
                     : fallbackCourses(locationName, days);

    currentIndex = 0;
    renderTabs();
    renderTimetable(courses[currentIndex]);
  }catch(e){
    console.log(e);
    courses = fallbackCourses(locationName, days);
    currentIndex = 0;
    renderTabs();
    renderTimetable(courses[currentIndex]);
  }
}
document.addEventListener("DOMContentLoaded", main);
