"use strict";

/* file:// 경고 */
const warnEl=document.getElementById("fileWarn");
if(location.protocol==="file:"){
  warnEl.classList.remove("hidden");
  warnEl.innerHTML='지금 <b>file://</b>로 열려 있어. 카카오 검색/지도가 제한될 수 있어. 터미널에서 <code>python3 -m http.server 5500</code> → <b>http://localhost:5500/gpt.html</b> 로 접속하고, 카카오 콘솔에 <b>http://localhost:5500</b> 도메인을 등록해줘.';
}

/* Kakao 체크 + 보조 프리셋 */
const hasKakao=()=>window.kakao&&kakao.maps&&kakao.maps.services;
const PRESETS={
  "부산":["해운대구","수영구","남구","동래구","연제구","중구","사상구","사하구","북구","금정구","강서구","기장군"],
  "서울":["강남구","서초구","송파구","마포구","종로구","용산구","관악구","광진구","성동구","동작구"],
  "제주":["제주시","서귀포시","애월읍","조천읍","성산읍","구좌읍"]
};
const input=document.getElementById("searchInput");
const suggest=document.getElementById("suggestList");
const pickedSpan=document.getElementById("pickedRegion");
let selectedRegion="";

const debounce=(f,ms=200)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>f(...a),ms);}};

function extractCityGu(addr){
  if(!addr) return null;
  const parts=addr.split(/\s+/);
  if(parts.length<2) return null;
  const city=parts[0].replace(/광역시|특별시|특별자치시|특별자치도|도$/g,"");
  const gu=parts[1].match(/(구|군|시)$/)?parts.slice(1,2).join(" "):parts.slice(1,3).join(" ");
  return `${city} ${gu}`.trim();
}
function renderSuggestions(list,msg=""){
  if((!list||!list.length)&&!msg){suggest.classList.add("hidden");suggest.innerHTML="";return;}
  suggest.classList.remove("hidden");
  if(msg && (!list||!list.length)){suggest.innerHTML=`<div class="s-item" style="justify-content:center;color:#55616d;">${msg}</div>`;return;}
  suggest.innerHTML=list.map(({city,gu,full})=>`
    <div class="s-item" data-full="${full}">
      <span><span class="s-city">${city}</span> <span class="s-gu">${gu}</span></span><span>선택</span>
    </div>`).join("");
  Array.from(suggest.querySelectorAll(".s-item")).forEach(el=>{
    el.onclick=()=>{selectedRegion=el.dataset.full;input.value=selectedRegion;pickedSpan.textContent=selectedRegion;suggest.classList.add("hidden");};
  });
}
async function fetchSuggestions(q){
  if(!q||q.trim().length<2){renderSuggestions([], "검색어를 2자 이상 입력해줘");return;}
  if(hasKakao()){
    try{
      const ps=new kakao.maps.services.Places();
      const data=await new Promise(r=>ps.keywordSearch(q,(d,s)=>r(s===kakao.maps.services.Status.OK?d:[])));
      const uniq=new Map();
      data.forEach(p=>{
        const cg=extractCityGu(p.road_address_name||p.address_name);
        if(cg&&!uniq.has(cg)){const [c,...rest]=cg.split(" ");uniq.set(cg,{city:c,gu:rest.join(" "),full:cg});}
      });
      if(uniq.size){renderSuggestions(Array.from(uniq.values()).slice(0,12));return;}
    }catch(_){}
  }
  // 폴백
  const key=Object.keys(PRESETS).find(k=>q.includes(k));
  if(key){const list=PRESETS[key].map(gu=>({city:key,gu,full:`${key} ${gu}`}));renderSuggestions(list.filter(v=>v.full.includes(q)).slice(0,12));}
  else renderSuggestions([], "도시명을 포함해 입력해줘 (예: 부산 해운대)");
}
input.addEventListener("input",debounce(e=>fetchSuggestions(e.target.value),200));
input.addEventListener("focus",()=>{if(suggest.innerHTML)suggest.classList.remove("hidden")});
document.addEventListener("click",e=>{if(!suggest.contains(e.target)&&e.target!==input)suggest.classList.add("hidden")});

/* 날짜 → 일수 */
const sEl=document.getElementById("startDate"), eEl=document.getElementById("endDate"), daysLabel=document.getElementById("daysLabel");
function calcDays(){ if(!sEl.value||!eEl.value){daysLabel.textContent="여행 일수: -";return null;}
  const s=new Date(sEl.value), e=new Date(eEl.value); const d=Math.max(1,Math.round((e-s)/86400000)+1); daysLabel.textContent=`여행 일수: ${d}일`; return d;}
[sEl,eEl].forEach(el=>el.addEventListener("change",calcDays));

/* 세그/칩 */
function bindSeg(id,attr){const box=document.getElementById(id);box.addEventListener("click",e=>{const b=e.target.closest(".seg-item");if(!b)return;box.querySelectorAll(".seg-item").forEach(x=>x.classList.remove("active"));b.classList.add("active");box.dataset.value=b.dataset[attr];});}
bindSeg("budgetTier","tier"); bindSeg("transport","mode"); bindSeg("weather","w");
const moodBox=document.getElementById("moodFilters");
moodBox.addEventListener("click",e=>{const c=e.target.closest(".chip");if(!c)return;c.classList.toggle("active");});

/* 이동 */
document.getElementById("goPlan").addEventListener("click",()=>{
  const region=selectedRegion||input.value.trim(); if(!region){input.focus();return;}
  const params=new URLSearchParams({
    location:region,
    start:sEl.value||"", end:eEl.value||"",
    budgetTier:document.getElementById("budgetTier").dataset.value||"mid",
    budgetAmount:document.getElementById("budgetAmount").value||"",
    transport:document.getElementById("transport").dataset.value||"대중교통",
    weather:document.getElementById("weather").dataset.value||"무관",
    moods:Array.from(moodBox.querySelectorAll(".chip.active")).map(c=>c.dataset.m).join(",")
  });
  // 호환 필드
  const d=calcDays(); const filters=[params.get("budgetTier"),params.get("transport"),params.get("weather"),d?`${d}일`:""].concat(params.get("moods")||"").filter(Boolean).join(",");
  params.set("filters",filters);
  location.href=`gpt_result.html?${params.toString()}`;
});
