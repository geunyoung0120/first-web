"use strict";

/* 파일 모드 경고 */
const warnEl = document.getElementById("fileWarn");
if (location.protocol === "file:") {
  warnEl.classList.remove("hidden");
  warnEl.innerHTML = '지금 <b>file://</b>로 열렸어. Kakao Places가 차단될 수 있어. 터미널에서 <code>python3 -m http.server 5500</code> 실행 → <b>http://localhost:5500/gpt.html</b> 로 접속하고, 콘솔에 도메인 등록해줘.';
}

/* ====== 구 단위 자동완성 ====== */
const input = document.getElementById("searchInput");
const suggest = document.getElementById("suggestList");
const pickedRegionEl = document.getElementById("pickedRegion").querySelector("span");

let selectedRegion = ""; // 예: "부산 해운대구"
let debounceTimer;
const debounce = (fn, ms=300) => (...args)=>{ clearTimeout(debounceTimer); debounceTimer=setTimeout(()=>fn(...args), ms); };

function hasKakao(){ return window.kakao && kakao.maps && kakao.maps.services; }

function normalizeCity(city){
  // "부산광역시" → "부산", "서울특별시" → "서울"
  return city
    .replace(/광역시|특별시|특별자치시|특별자치도/g, "")
    .replace(/도$/, "");
}

function extractCityGu(addr){
  // 예: "부산광역시 해운대구 우동 123" → "부산 해운대구"
  if (!addr) return null;
  const parts = addr.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const city = normalizeCity(parts[0]);
  // 2번째가 "OO구" 또는 "OO시/군/구" (예외는 추가 처리)
  const gu = parts[1];
  if (/(구|군|시)$/.test(gu)) return `${city} ${gu}`;
  // 일부는 시/군이 2~3토큰일 수 있으니 보강
  if (parts[2] && /(구|군|시)$/.test(parts[2])) return `${city} ${parts[1]} ${parts[2]}`;
  return null;
}

function renderSuggestions(list){
  if (!list.length){ suggest.classList.add("hidden"); suggest.innerHTML=""; return; }
  suggest.classList.remove("hidden");
  suggest.innerHTML = list.map(({city, gu, full}) =>
    `<div class="s-item" data-full="${full}">
      <span><span class="s-city">${city}</span> <span class="s-gu">${gu}</span></span>
      <span>선택</span>
     </div>`).join("");
  Array.from(suggest.querySelectorAll(".s-item")).forEach(el=>{
    el.onclick = ()=>{
      selectedRegion = el.getAttribute("data-full");
      input.value = selectedRegion;
      pickedRegionEl.textContent = selectedRegion;
      suggest.classList.add("hidden");
      suggest.innerHTML = "";
    };
  });
}

async function fetchSuggestions(q){
  if (!q || !hasKakao()){ renderSuggestions([]); return; }
  const ps = new kakao.maps.services.Places();
  const results = await new Promise((resolve)=>{
    ps.keywordSearch(q, (data, status)=>{
      if (status !== kakao.maps.services.Status.OK) return resolve([]);
      resolve(data);
    });
  });

  // 주소에서 unique한 "도시 구" 추출
  const uniq = new Map();
  results.forEach(r=>{
    const addr = r.road_address_name || r.address_name;
    const cg = extractCityGu(addr);
    if (cg){
      const [city, ...rest] = cg.split(" ");
      uniq.set(cg, { city, gu: rest.join(" "), full: cg });
    }
  });

  // 시청/구청을 활용한 보강
  const more = await new Promise((resolve)=>{
    ps.keywordSearch(q + " 구청", (data, status)=>{
      if (status !== kakao.maps.services.Status.OK) return resolve([]);
      resolve(data);
    });
  });
  more.forEach(r=>{
    const cg = extractCityGu(r.address_name);
    if (cg && !uniq.has(cg)){
      const [city, ...rest] = cg.split(" ");
      uniq.set(cg, { city, gu: rest.join(" "), full: cg });
    }
  });

  renderSuggestions(Array.from(uniq.values()).slice(0, 12));
}

input.addEventListener("input", debounce(e => fetchSuggestions(e.target.value), 300));
input.addEventListener("focus", ()=>{ if (suggest.innerHTML) suggest.classList.remove("hidden"); });
document.addEventListener("click", (e)=>{
  if (!suggest.contains(e.target) && e.target !== input) suggest.classList.add("hidden");
});

/* ====== 날짜 → 일수 계산 ====== */
const startDateEl = document.getElementById("startDate");
const endDateEl   = document.getElementById("endDate");
const daysLabel   = document.getElementById("daysLabel");

function calcDays(){
  const s = startDateEl.value ? new Date(startDateEl.value) : null;
  const e = endDateEl.value   ? new Date(endDateEl.value)   : null;
  if (!s || !e || isNaN(s) || isNaN(e)) { daysLabel.textContent = "여행 일수: -"; return; }
  const diff = Math.max(0, Math.round((e - s) / 86400000)) + 1; // 양끝 포함
  daysLabel.textContent = `여행 일수: ${diff}일`;
  return diff;
}
[startDateEl, endDateEl].forEach(el => el.addEventListener("change", calcDays));

/* ====== 세그/칩 토글 ====== */
function bindSeg(containerId, key){
  const box = document.getElementById(containerId);
  box.addEventListener("click", e=>{
    const btn = e.target.closest(".seg-item"); if (!btn) return;
    Array.from(box.querySelectorAll(".seg-item")).forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    box.dataset.value = btn.dataset[key];
  });
}
bindSeg("budgetTier", "tier");
bindSeg("transport", "mode");
bindSeg("weather", "w");

// 칩(복수 선택)
const moodBox = document.getElementById("moodFilters");
moodBox.addEventListener("click", e=>{
  const chip = e.target.closest(".chip"); if (!chip) return;
  chip.classList.toggle("active");
});

/* ====== 결과 페이지로 이동 ====== */
document.getElementById("goPlan").addEventListener("click", ()=>{
  const region = selectedRegion || input.value.trim();
  if (!region){ input.focus(); return; }

  const start = startDateEl.value || "";
  const end   = endDateEl.value   || "";
  const budgetTier = (document.getElementById("budgetTier").dataset.value) || "low";
  const transport  = (document.getElementById("transport").dataset.value)  || "대중교통";
  const weather    = (document.getElementById("weather").dataset.value)    || "무관";
  const budgetAmount = document.getElementById("budgetAmount").value || "";

  const moods = Array.from(moodBox.querySelectorAll(".chip.active")).map(c=>c.dataset.m);

  const params = new URLSearchParams({
    location: region,
    start, end,
    budgetTier, budgetAmount,
    transport, weather,
    moods: moods.join(",")
  });

  // 호환용 filters(문자열)도 같이 전달
  const filters = [budgetTier, transport, weather, calcDays() ? `${calcDays()}일` : ""].concat(moods).filter(Boolean).join(",");
  params.set("filters", filters);

  location.href = `gpt_result.html?${params.toString()}`;
});
