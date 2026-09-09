(function(root,factory){if(typeof module!=='undefined'&&module.exports)module.exports=factory(require('./shared.js'));else root.LottoProviders=factory(root.LottoShared);})(globalThis,function(S){
 const OFFICIAL_MAIN='https://www.dhlottery.co.kr/selectMainInfo.do';
 const OFFICIAL_ROUND='https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do?srchDir=center&srchLtEpsd=';
 const MIRROR='https://raw.githubusercontent.com/johyunchol/lottogo-python/main/src/constant/';
 async function fetchJSON(url,fetcher=fetch){
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),8000);
  try{const r=await fetcher(url,{mode:'cors',credentials:'omit',cache:'no-store',signal:c.signal,referrerPolicy:'no-referrer'});if(!r.ok)throw Error(`HTTP ${r.status}`);const t=await r.text();if(t.length>3000000)throw Error('응답 용량 제한');return JSON.parse(t);}finally{clearTimeout(timer);}
 }
 async function collect(existing,json,{officialOnly=false}={}){
  const known=S.validateBatch(existing),byDraw=new Map(known.map(r=>[r.draw,r]));let reason='',observedLatest=0;
  async function from(official){
   let latest,available=new Map();
   if(official){const rows=S.officialRows(await json(OFFICIAL_MAIN));rows.forEach(r=>available.set(r.draw,r));latest=Math.max(...rows.map(r=>r.draw));}
   else{latest=(await json(MIRROR+'round_no/latest_round_no.json')).latest_round_no;}
   if(!Number.isInteger(latest)||latest<1||latest>100000)throw Error('최신 회차 형식 오류');
   if(latest<observedLatest)throw Error('대체 출처가 공식 최신 회차보다 늦습니다. 다음에 다시 확인하세요.');observedLatest=latest;
   const pending=[];let count=0;
   // Conflicts in published recent rows are errors, never silently overwritten.
   for(const row of available.values())if(byDraw.has(row.draw)&&!S.same(byDraw.get(row.draw),row))throw S.conflict(row.draw);
   for(let draw=1;draw<=latest;draw++){
    if(byDraw.has(draw))continue;if(++count>2000)throw Error('누락 회차가 2000개를 초과합니다. JSON으로 복구하세요.');
    let row=available.get(draw);
    if(!row&&official){const rows=S.officialRows(await json(OFFICIAL_ROUND+draw));for(const r of rows){if(byDraw.has(r.draw)&&!S.same(byDraw.get(r.draw),r))throw S.conflict(r.draw);available.set(r.draw,r);}row=available.get(draw);}
    if(!official){const d=await json(MIRROR+`draw_no/${draw}.json`);row=S.validateRecord({draw:d.draw_no,numbers:d.winning_numbers,...(d.bonus_number!==undefined?{bonus:d.bonus_number}:{})});}
    if(!row||row.draw!==draw)throw Error(`예상 ${draw}회 응답이 없습니다.`);pending.push(row);
   }
   S.mergeRows(known,pending);return {pending,latest,source:official?'동행복권 공식 JSON':'GitHub 회차별 JSON 미러',fallbackReason:reason};
  }
  try{return await from(true);}catch(e){if(officialOnly||e.code==='CONFLICT')throw e;reason=e.message;}
  return from(false);
 }
 return {OFFICIAL_MAIN,OFFICIAL_ROUND,MIRROR,fetchJSON,collect};
});
