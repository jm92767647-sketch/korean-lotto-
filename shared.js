/* One validation and filter definition for UI, database, Worker and Actions. */
function createLottoShared(){
 'use strict';
 const FILTERS=['역대 1등 동일조합 제외','완전 등차수열 제외','직전회차 3개 이상 중복 제외','3연속 이상 제외','최대 인접간격 ≤20','인접간격 ≤3이 최대 2개','4구간 중 한 구간 4개 이상 쏠림 제외','16칸 이내 초밀집 제외','전부 홀수 또는 전부 짝수 제외'];
 function validateNumbers(input){
  let a=input;
  if(typeof a==='string'){const parts=a.trim().split(/[\s,]+/);if(parts.some(x=>!/^\d+$/.test(x)))throw Error('정수 본번호 6개를 입력하세요.');a=parts.map(Number);}
  if(!Array.isArray(a)||a.length!==6||a.some(x=>!Number.isInteger(x)||x<1||x>45)||new Set(a).size!==6)throw Error('중복 없는 1~45 정수 본번호 6개가 필요합니다.');
  return a.slice().sort((x,y)=>x-y);
 }
 function validateRecord(row){
  if(!row||!Number.isSafeInteger(row.draw)||row.draw<1||row.draw>100000)throw Error('회차는 1~100000 사이 양의 정수여야 합니다.');
  const result={draw:row.draw,numbers:validateNumbers(row.numbers)};
  if(row.bonus!==undefined){if(!Number.isInteger(row.bonus)||row.bonus<1||row.bonus>45||result.numbers.includes(row.bonus))throw Error(`${row.draw}회 보너스 형식 오류`);result.bonus=row.bonus;}
  return result;
 }
 function same(a,b){return !!a&&!!b&&a.numbers.join(',')===b.numbers.join(',')&&(a.bonus===undefined||b.bonus===undefined||a.bonus===b.bonus);}
 function conflict(draw){const e=Error(`${draw}회 데이터 충돌: 기존 기록을 덮어쓰지 않았습니다.`);e.code='CONFLICT';return e;}
 function validateBatch(rows){
  if(!Array.isArray(rows)||rows.length>100000)throw Error('회차 배열 JSON이 필요합니다.');const m=new Map();
  for(const raw of rows){const row=validateRecord(raw),old=m.get(row.draw);if(old&&!same(old,row))throw conflict(row.draw);m.set(row.draw,{...old,...row});}
  return [...m.values()].sort((a,b)=>a.draw-b.draw);
 }
 function mergeRows(existing,incoming){
  const m=new Map(validateBatch(existing).map(x=>[x.draw,x]));
  for(const row of validateBatch(incoming)){const old=m.get(row.draw);if(old&&!same(old,row))throw conflict(row.draw);m.set(row.draw,{...old,...row});}
  return [...m.values()].sort((a,b)=>a.draw-b.draw);
 }
 function fingerprint(rows){let h=2166136261;for(const r of rows){const s=r.draw+':'+r.numbers.join(',')+';';for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}}return (h>>>0).toString(16).padStart(8,'0');}
 function context(records,mode='live',targetDraw){
  if(mode!=='live'&&mode!=='backtest')throw Error('생성 모드 오류');
  if(mode==='live'){const rows=validateBatch(records);if(!rows.length)throw Error('당첨번호 DB가 비어 있습니다.');targetDraw=rows[rows.length-1].draw+1;}
  if(!Number.isInteger(targetDraw)||targetDraw<2||targetDraw>100001)throw Error('대상 회차는 2회 이상이어야 합니다.');
  // Slice BEFORE reading numbers: future rows cannot influence a backtest.
  const history=validateBatch(records.filter(r=>Number.isInteger(r.draw)&&r.draw<targetDraw));
  if(history.length!==targetDraw-1||history.some((r,i)=>r.draw!==i+1))throw Error(`1~${targetDraw-1}회 누락 데이터를 먼저 복구하세요.`);
  return {mode,targetDraw,previousDraw:targetDraw-1,previous:history[history.length-1].numbers,history,fingerprint:fingerprint(history)};
 }
 function flags(previous){const p=new Uint8Array(46);for(const n of validateNumbers(previous))p[n]=1;return p;}
 // a must already be sorted. All nine tests evaluated independently.
 function failureMask(a,p,historyHit=false){
  let mask=historyHit?1:0,overlap=0,odd=0,small=0,maxGap=0,triple=false,ap=true;
  let z0=0,z1=0,z2=0,z3=0;const gap=a[1]-a[0];
  for(let i=0;i<6;i++){
   const x=a[i];overlap+=p[x];odd+=x&1;
   if(x<=11)z0++;else if(x<=22)z1++;else if(x<=33)z2++;else z3++;
   if(i){const d=x-a[i-1];if(d!==gap)ap=false;if(d<=3)small++;if(d>maxGap)maxGap=d;}
   if(i>1&&x===a[i-1]+1&&a[i-1]===a[i-2]+1)triple=true;
  }
  if(ap)mask|=2;if(overlap>=3)mask|=4;if(triple)mask|=8;if(maxGap>20)mask|=16;if(small>2)mask|=32;
  if(z0>=4||z1>=4||z2>=4||z3>=4)mask|=64;if(a[5]-a[0]<=15)mask|=128;if(odd===0||odd===6)mask|=256;
  return mask;
 }
 function officialRows(data){const rows=data?.data?.list||data?.data?.result?.pstLtEpstInfo?.lt645;
  if(!Array.isArray(rows)||!rows.length)throw Error('공식 JSON 결과 형식 오류');
  return validateBatch(rows.map(r=>({draw:r.ltEpsd,numbers:[r.tm1WnNo,r.tm2WnNo,r.tm3WnNo,r.tm4WnNo,r.tm5WnNo,r.tm6WnNo],...(r.bnsWnNo!==undefined?{bonus:r.bnsWnNo}:{})})));
 }
 return {FILTERS,validateNumbers,validateRecord,validateBatch,same,conflict,mergeRows,fingerprint,context,flags,failureMask,officialRows};
}
if(typeof module!=='undefined'&&module.exports)module.exports={createLottoShared,...createLottoShared()};
else globalThis.LottoShared=createLottoShared();
