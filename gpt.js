"use strict";

/* 파일 모드 경고 */
const warnEl = document.getElementById("fileWarn");
if (location.protocol === "file:") {
  warnEl.classList.remove("hidden");
  warnEl.innerHTML =
    '지금 <b>file://</b>로 열렸어. Kakao Places가 차단될 수 있어. 터미널에서 <code>python3 -m http.server 5500</code> 실행 → <b>http://localhost:5500/gpt.html</b> 로 접속하고, 카카오 콘솔에 도메인 등록해줘.';
}

/* ====== 공통 ====== */
function hasKakao(){ return window.kakao && kakao.maps && kakao.maps.services; }
const debounce = (fn, ms=200) => {
  let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
};
function normalizeCity(city){
  return city.replace(/광역시|특별시|특별자치시|특별자치도/g,"").replace(/도$/,"");
}

/* ====== 구 단위 자동완성 ====== */
const input = document.getElementById("searchInput");
const suggest = document.getElementById("suggestList");
const pickedRegionEl = document.getElementById("pickedRegion").querySelector("span");
let selectedRegion = ""; // 예: "부산 해운대구"

function extractCityGu(addr){
  if (!addr) return null;
  const parts = addr.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const city = normalizeCity(parts[0]);
  const gu = parts[1];
  if (/(구|군|시)$/.test(gu)) return `${city} ${gu}`;
  if (parts[2] && /(구|군|시)$/.test(parts[2])) return `${city} ${parts[1]} ${parts[2]}`;
  return null;
}

/* --- 교체 완료: 렌더러(빈 메시지/안내 지원) --- */
function renderSuggestions(list, message=""){
  if ((!list || !list.length) && !message) {
    suggest.classList.add("hidden");
    suggest.innerHTML = "";
    return;
  }
  suggest.classList.remove("hidden");

  if (message && (!list || !list.length)){
    suggest.innerHTML = `<div class="s-item" style="justify-content:center;color:#55616d;">${message}</div>`;
    return;
  }

  suggest.innerHTML = list.map(({city, gu, full}) => `
    <div class="s-item" data-full="${full}">
      <span><span class="s-city">${city}</span> <span class="s-gu">${gu}</span></span>
      <span>선택</span>
    </div>
  `).join("");

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

/* --- 교체 완료: Kakao 실패 시 프리셋 폴백 --- */
async function fetchSuggestions(q){
  if (!q || q.trim().length < 2){
    renderSuggestions([], "검색어를 2자 이상 입력해줘");
    return;
  }

  const PRESETS = {
    "부산": ["해운대구","수영구","남구","중구","서구","동래구","연제구","사하구","사상구","북구","금정구","강서구","기장군"],
    "서울": ["종로구","중구","용산구","성동구","광진구","동대문구","중랑구","성북구","강북구","도봉구","노원구","은평구","서대문구","마포구","양천구","강서구","구로구","금천구","영등포구","동작구","관악구","서초구","강남구","송파구","강동구"],
    "제주": ["제주시","서귀포시","애월읍","조천읍","한림읍","한경면","대정읍","안덕면","남원읍","표선면","구좌읍","성산읍"],
    "대구": ["중구","동구","서구","남구","북구","수성구","달서구","달성군"],
    "대전": ["동구","중구","서구","유성구","대덕구"],
    "광주": ["동구","서구","남구","북구","광산구"],
    "인천": ["중구","동구","미추홀구","연수구","남동구","부평구","계양구","서구","강화군","옹진군"]
  };

  // 1) Kakao 우선 시도
  if (hasKakao()){
    try{
      const ps = new kakao.maps.services.Places();
      const results = await new Promise(resolve=>{
        ps.keywordSearch(q, (data,status)=>{
          if (status !== kakao.maps.services.Status.OK) return resolve([]);
          resolve(data);
        });
      });

      const uniq = new Map();
      results.forEach(r=>{
        const addr = r.road_address_name || r.address_name;
        const cg = extractCityGu(addr);
        if (cg && !uniq.has(cg)){
          const [city, ...rest] = cg.split(" ");
          uniq.set(cg, { city, gu: rest.join(" "), full: cg });
        }
      });

      // "구청" 보강
      const more = await new Promise(resolve=>{
        ps.keywordSearch(q+" 구청", (data,status)=>{
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

      const list = Array.from(uniq.values());
      if (list.length){
        renderSuggestions(list.slice(0,12));
        return;
      }
      // 0건이면 폴백 진행
    }catch(e){
      // 폴백 진행
    }
  }

  // 2) 프리셋 폴백: 첫 단어로 도시 추정
  const first = q.split(/\s+/)[0];
  let cityKey = Object.keys(PRESETS).find(k => first.includes(k)) || "";
  if (!cityKey && /부산/.test(q)) cityKey = "부산";
  if (!cityKey && /서울/.test(q)) cityKey = "서울";
  if (!cityKey && /제주|서귀포/.test(q)) cityKey = "제주";

  if (cityKey){
    const list = PRESETS[cityKey].map(gu => ({ city: cityKey, gu, full: `${cityKey} ${gu}` }));
    const filtered = list.filter(x => x.full.includes(q));
    renderSuggestions(filtered.length ? filtered.slice(0,12) : list.slice(0,12));
  }else{
    renderSuggestions([], "도시명을 포함해 입력해줘 (예: 부산 해…, 서울 …)");
  }
}

/* 이벤트 바인딩 */
input.addEventListener("input", debounce(e=>fetchSuggestions(e.target.value), 200));
input.addEventListener("focus", ()=>{ if (suggest.innerHTML) suggest.classList.remove("hidden"); });
document.addEventListener("click", e=>{
  if (!suggest.contains(e.target) && e.target !== input) suggest.classList.add("hidden");
});

/* ====== 날짜 → 일수 ====== */
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

  // 호환용 filters 문자열도 함께 전달
  const d = calcDays();
  const filters = [budgetTier, transport, weather, d ? `${d}일` : ""].concat(moods).filter(Boolean).join(",");
  params.set("filters", filters);

  location.href = `gpt_result.html?${params.toString()}`;
});
