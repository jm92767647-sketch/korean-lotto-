'use strict';
(() => {
  const $=id=>document.getElementById(id), S=LottoShared;
  const storageKey='local-lotto-result-v1', engine=createLottoEngine();
  const fmt=x=>Number(x).toLocaleString('ko-KR'),pct=x=>(x*100).toFixed(6)+'%';
  let worker=null,blobURL=null,result=null,timer=null,started=0,wakeLock=null,lastMessage=0;
  let launching=false,activeHistoryFingerprint=null,activePlan=null;
  let indexedDB;try{indexedDB=window.indexedDB;}catch(_){}
  const historyDB=new LottoHistory.HistoryDB({builtIn:LOTTO_HISTORY_BUILTIN,builtInUpdatedAt:LOTTO_HISTORY_BUILTIN_UPDATED,
    store:new LottoHistory.IndexedStore(indexedDB),fetcher:window.fetch.bind(window)});
  const historyReady=historyDB.init();
  let historyChannel;try{historyChannel=new BroadcastChannel('local-lotto-history-changed');}catch(_){}
  function status(message) { $('status').textContent=message;$('status').hidden=!message; }
  function node(tag,text,className) {const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(className)x.className=className;return x;}
  async function keepAwake() {
    try {
      if(worker&&document.visibilityState==='visible'&&'wakeLock' in navigator) {
        const lock=await navigator.wakeLock.request('screen');
        if(worker) wakeLock=lock;else await lock.release();
      }
    }
    catch(_) { /* Optional capability; computation does not depend on it. */ }
  }
  function finish() {
    if(worker) worker.terminate();worker=null;
    if(blobURL) URL.revokeObjectURL(blobURL);blobURL=null;
    clearInterval(timer);timer=null;
    if(wakeLock) {wakeLock.release().catch(()=>{});wakeLock=null;}
    $('input-fields').disabled=false;$('generate').disabled=false;$('recalculate').disabled=false;
    $('progress-panel').hidden=true;$('empty').hidden=!!result;
  }
  function fail(message) {finish();status(message);}
  async function start() {
    if(worker||launching) return;
    launching=true;$('generate').disabled=true;
    let plan;
    try{
      await historyReady;await historyDB.merge([]);refreshHistory();
      const mode=$('mode').value,target=Number($('target-draw').value);
      if(mode==='backtest'&&target>historyDB.info().last)throw Error('발표된 과거 회차를 선택하세요.');
      plan=S.context(historyDB.list(),mode,target);
      if(historyDB.info().conflicts.some(draw=>draw<plan.targetDraw))throw Error('사용할 역사 DB에 충돌 기록이 있습니다. 데이터 메뉴를 확인하세요.');
      $('input-error').hidden=true;
    }catch(e){$('input-error').textContent=e.message;$('input-error').hidden=false;return;}
    finally{launching=false;$('generate').disabled=false;}
    if(!window.Worker) {status('이 브라우저는 계산용 Web Worker를 지원하지 않습니다. 최신 Safari, Chrome 또는 Edge에서 열어주세요.');return;}
    $('input-fields').disabled=true;$('generate').disabled=true;$('recalculate').disabled=true;
    $('progress-panel').hidden=false;$('empty').hidden=true;$('progress-percent').textContent='0%';$('progress-bar').value=0;
    $('progress-title').textContent='계산 준비 중';$('progress-detail').textContent='계산 전용 작업 공간을 준비합니다.';$('live-coverage').textContent='';status('');
    started=Date.now();lastMessage=started;
    const historyInfo={...historyDB.info(),fingerprint:plan.fingerprint};activeHistoryFingerprint=plan.fingerprint;activePlan=plan;
    // No target result or future rows are sent to the calculation Worker.
    const options={records:plan.history,mode:plan.mode,targetDraw:plan.targetDraw,restarts:Number($('restarts').value),seed:20260908,historyInfo};
    try {
      const source=`'use strict';\n${createLottoShared.toString()}\n${createLottoEngine.toString()}\n(${lottoWorkerMain.toString()})();`;
      blobURL=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
      worker=new Worker(blobURL);
      worker.onmessage=event=>{
        const data=event.data;lastMessage=Date.now();
        if(data.type==='ready') {worker.postMessage(options);return;}
        if(data.type==='progress') {showProgress(data);return;}
        if(data.type==='error') {fail('계산을 완료하지 못했습니다. '+data.message);return;}
        if(data.type==='result') {
          result=data.result;
          if(result.mode==='backtest'){
            const actual=historyDB.list().find(row=>row.draw===result.targetDraw)?.numbers;
            if(actual)result.backtest={actual,matches:result.tickets.map(t=>t.filter(x=>actual.includes(x)).length),insideUniverse:engine.passesFilters(actual,plan.previous,plan.history)};
          }
          finish();render(result);
          try {localStorage.setItem(storageKey,JSON.stringify(result));status('계산 완료. 검산한 결과를 이 브라우저에 저장했습니다.');}
          catch(_) {status('계산 완료. 브라우저 저장이 제한되어 있습니다. 결과 저장 버튼으로 파일을 보관하세요.');}
        }
      };
      worker.onerror=event=>{event.preventDefault();fail('계산 작업을 시작하거나 계속할 수 없습니다. 메모리가 부족하면 다른 탭을 닫고 다시 시도하세요. 파일 실행이 제한된 환경에서는 README의 정적 파일 실행 방법을 사용하세요.');};
      timer=setInterval(()=>{
        $('elapsed').textContent=duration(Date.now()-started)+' 경과';
        if(Date.now()-lastMessage>30000) $('activity-note').textContent='기기에서 계산 중입니다. 브라우저가 잠시 정지했을 수 있습니다. 화면을 열어두고 기다리거나 계산을 중단할 수 있습니다.';
      },1000);
      keepAwake();
    } catch(error) {fail('계산용 Worker를 열 수 없습니다. README의 로컬 실행 방법을 확인해주세요. '+error.message);}
  }
  function duration(ms) {const s=Math.floor(ms/1000);return s>=60?`${Math.floor(s/60)}분 ${s%60}초`:`${s}초`;}
  function showProgress(data) {
    const names={universe:'조합 필터링 중',greedy:'초기 10게임 생성 중',local4:'4+ 커버리지 개선 중',local5:'5+ 커버리지 개선 중',verify:'최종 검증 중'};
    $('progress-title').textContent=names[data.stage]||'계산 중';$('progress-detail').textContent=data.detail;
    const percent=Math.min(100,Math.max(0,data.scan*100));
    $('progress-percent').textContent=percent.toFixed(1)+'%';$('progress-bar').value=percent;
    if(data.c4!==undefined) $('live-coverage').textContent=`C4 ${fmt(data.c4)} · C5 ${fmt(data.c5)}`;
    $('activity-note').textContent='이 화면을 열어두세요. 다른 앱으로 전환하면 계산이 일시 정지될 수 있습니다.';
  }
  function stats(id,entries) {
    const box=$(id);box.replaceChildren();
    for(const [label,value] of entries) box.append(node('dt',label),node('dd',value));
  }
  function table(id,headers,rows,matrix=false) {
    const box=$(id);box.replaceChildren();const head=node('thead'),hr=node('tr');
    headers.forEach(label=>{const th=node('th',label);th.scope='col';hr.append(th);});head.append(hr);box.append(head);
    const body=node('tbody');rows.forEach((row,i)=>{
      const tr=node('tr');row.forEach((value,j)=>{
        const cell=node(j===0?'th':'td',value);if(j===0) cell.scope='row';
        if(matrix&&j>0) cell.className=i===j-1?'diag':Number(value)>0?'overlap':'';
        tr.append(cell);
      });body.append(tr);
    });box.append(body);
  }
  function render(r) {
    $('result').hidden=false;$('empty').hidden=true;
    $('result-input').textContent=`생성 대상: ${r.targetDraw}회 · 직전 ${r.previousDraw}회 · `+r.previous.map(x=>String(x).padStart(2,'0')).join('  ');
    $('p4').textContent=pct(r.p4);$('one-in').textContent='약 1 / '+(r.universeSize/r.c4).toFixed(2);
    $('c4').textContent=fmt(r.c4);$('c5').textContent=fmt(r.c5);$('p5').textContent='조건부 3등 이상 '+pct(r.p5);
    $('result-time').textContent=duration(r.elapsedMs)+' · 추가 '+r.restarts+'회';
    $('tickets').replaceChildren();
    r.tickets.forEach((ticket,i)=>{
      const row=node('div',undefined,'ticket-row');row.append(node('span',String(i+1).padStart(2,'0'),'ticket-id'));
      const balls=node('div',undefined,'balls');ticket.forEach(number=>{
        const color=number<=10?'gold':number<=20?'blue':number<=30?'red':number<=40?'gray':'green';
        balls.append(node('span',String(number).padStart(2,'0'),'ball '+color));
      });row.append(balls);$('tickets').append(row);
    });
    stats('filter-stats',[
      ['전체 조합',fmt(r.total)+'개'],['최종 Universe |U|',fmt(r.universeSize)+'개'],['제거 조합 수',fmt(r.total-r.universeSize)+'개'],
      ['최종 생존율',pct(r.universeSize/r.total)],['최종 제거율',pct(1-r.universeSize/r.total)]
    ]);
    table('filter-table',['필터','독립 제거','독립 %','순차 추가','순차 %'],r.filterStats.map((f,i)=>[`${i+1}. ${f.name}`,fmt(f.independent),pct(f.independent/r.total),fmt(f.sequential),pct(f.sequential/r.total)]));
    $('backtest-result').hidden=!r.backtest;
    if(r.backtest)$('backtest-summary').textContent=`${r.targetDraw}회 실제 본번호: ${r.backtest.actual.join(' ')} · 최대 ${Math.max(...r.backtest.matches)}개 일치 · 실제 조합 ${r.backtest.insideUniverse?'U 안':'U 밖'} · 게임별 일치: ${r.backtest.matches.join(', ')}`;
    const hi=r.historyInfo;
    $('result-history-range').textContent=`당첨번호 DB: ${hi.first}회 ~ 최신 ${hi.last}회 · ${fmt(hi.total)}개 회차`;
    $('result-history-excluded').textContent=`역대 1등 동일 조합으로 제외된 후보: ${fmt(r.filterStats[0].sequential)}개`;
    $('result-history-updated').textContent='마지막 데이터 업데이트: '+dateTime(hi.updatedAt);
    refreshHistory();
    stats('optimization-stats',[
      ['정확히 4개 · 최대 일치 기준',fmt(r.histogram[4])+'개'],['정확히 5개 · 최대 일치 기준',fmt(r.histogram[5])+'개'],['6개 일치',fmt(r.histogram[6])+'개'],
      ['탐색 중 최고 C4',fmt(r.record)+'개'],['최종 / 탐색 중 최고 C4',(r.c4/r.record*100).toFixed(4)+'%'],
      ['이론적 4+ 상한',fmt(r.upper)+'개'],['이론적 상한 / |U|',pct(r.upper/r.universeSize)],
      ['상한 대비 달성률',(r.c4/r.upper*100).toFixed(4)+'%'],['상한과 P4의 차이',((r.upper-r.c4)/r.universeSize*100).toFixed(6)+'%p'],
      ['U 안에 있고 4+ 일치할 확률',pct(r.c4/r.total)],['전체 U 검산',fmt(r.checked)+'개 확인'],['후보 전수 스캔',fmt(r.iterations.candidateScans)+'회'],['local search 순회',fmt(r.iterations.localSweeps)+'회'],['채택한 교체',fmt(r.iterations.acceptedSwaps)+'회']
    ]);
    table('contribution-table',['게임','N4','N5','새 커버 C4'],r.individual.map((x,i)=>[i+1,fmt(x.n4),fmt(x.n5),fmt(x.marginal4)]));
    table('matrix-table',['게임',...r.tickets.map((_,i)=>i+1)],r.matrix.map((row,i)=>[i+1,...row]),true);
  }
  function gamesText() {return result.tickets.map((t,i)=>`${i+1}. ${t.map(x=>String(x).padStart(2,'0')).join(' ')}`).join('\n');}
  function reportText() {
    const r=result;
    return `로컬 로또 6/45 · 고정 필터 9/9\n생성 대상: ${r.targetDraw}회 (${r.mode})\n직전 회차: ${r.previous.join(' ')}\n\n${gamesText()}\n\n`+
      `전체 조합: ${fmt(r.total)}\n역대 1등 동일 조합 추가 제외: ${fmt(r.filterStats[0].sequential)}\n최종 U: ${fmt(r.universeSize)}\n생존율: ${pct(r.universeSize/r.total)}\n제외율: ${pct(1-r.universeSize/r.total)}\n`+
      `역대 1등 중복 제외: ON\n당첨번호 DB: ${r.historyInfo.first}회 ~ 최신 ${r.historyInfo.last}회 (${r.historyInfo.total}개 회차)\n마지막 데이터 업데이트: ${dateTime(r.historyInfo.updatedAt)}\n`+
      `C4: ${fmt(r.c4)}\n조건부 4등 이상 P4: ${pct(r.p4)} (약 1 / ${(r.universeSize/r.c4).toFixed(2)})\nC5: ${fmt(r.c5)}\n조건부 3등 이상 P5: ${pct(r.p5)}\n`+
      `최대 일치가 정확히 4개: ${r.histogram[4]}\n최대 일치가 정확히 5개: ${r.histogram[5]}\n6개 일치: ${r.histogram[6]}\n`+
      `탐색 중 최고 C4: ${r.record}\n최종 / 탐색 중 최고: ${pct(r.c4/r.record)}\n이론적 상한: ${r.upper} (${pct(r.upper/r.universeSize)})\n상한 달성률: ${pct(r.c4/r.upper)}\n`+
      `상한과 P4의 차이: ${((r.upper-r.c4)/r.universeSize*100).toFixed(6)}%p\n\n게임별 N4 / N5 / marginal C4\n`+
      r.individual.map((x,i)=>`${i+1}. ${x.n4} / ${x.n5} / ${x.marginal4}`).join('\n')+
      '\n\n게임 간 공통번호\n'+r.matrix.map(row=>row.join(' ')).join('\n')+
      `\n\n전체 U ${fmt(r.checked)}개 독립 검산 완료. 전역 최적해 보장 없음.\n99.5% 하한은 탐색 중 최고 C4 기준입니다.\n`+
      `조건부 확률은 당첨번호가 9조건을 만족한다는 가정입니다. 과거 조합이 다시 나오지 않는다는 법칙이 아니라 선택한 제외 필터입니다.\n필터로 실제 무조건부 당첨확률이 증가했다는 뜻이 아닙니다.\n`+
      `C4/전체 조합 = ${pct(r.c4/r.total)}는 U 안에 있고 4+ 일치할 결합확률입니다. U 밖 당첨을 포함한 무조건부 4+ 확률과 다릅니다.\n`+
      `보너스는 예측하지 않습니다.\n추가 재시작 ${r.restarts}회, seed ${r.seed}, 실행 ${duration(r.elapsedMs)}\n${r.createdAt}\n`;
  }
  $('input-form').addEventListener('submit',event=>{event.preventDefault();start();});
  $('cancel').onclick=()=>{finish();status('계산을 중단했습니다. 새 결과는 저장하지 않았습니다.');};
  $('recalculate').onclick=()=>{start();$('progress-panel').scrollIntoView({block:'start'});};
  $('mode').onchange=()=>{$('backtest-controls').hidden=$('mode').value!=='backtest';refreshHistory();};
  $('target-draw').oninput=()=>refreshHistory();
  for(const name of S.FILTERS)$('fixed-filter-list').append(node('li',name));
  $('copy').onclick=async()=>{
    if(!result) return;
    try {if(!navigator.clipboard) throw Error();await navigator.clipboard.writeText(gamesText());status('10게임을 복사했습니다.');}
    catch(_) {$('copy-fallback').hidden=false;$('copy-fallback').open=true;$('copy-text').value=gamesText();$('copy-text').focus();$('copy-text').select();status('자동 복사가 제한되어 있습니다. 선택된 번호를 복사해주세요.');}
  };
  $('save').onclick=()=>{
    if(!result)return;
    const text=reportText(),name='lotto-'+result.previous.join('-')+'.txt';
    const blob=new Blob(['\uFEFF',text],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob);
    const a=node('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    status('결과 파일을 저장합니다. iPhone에서 미리보기가 열리면 공유 → 파일에 저장을 선택하세요.');
  };
  document.addEventListener('visibilitychange',()=>{
    if(!worker)return;
    if(document.visibilityState==='visible')keepAwake();
    else $('activity-note').textContent='화면이 백그라운드로 이동했습니다. 돌아오면 계산이 이어질 수 있습니다.';
  });
  window.addEventListener('pagehide',()=>{if(worker)finish();});
  function validStored(r) {
    try {
      return r.version===3&&r.filterVersion===9&&r.historyFilter===true&&r.historyInfo?.fingerprint&&r.verified===true&&r.total===8145060&&r.checked===r.universeSize&&
        Number.isInteger(r.universeSize)&&r.universeSize>0&&r.universeSize<=r.total&&
        ['c4','c5','record','upper','elapsedMs','restarts','seed'].every(k=>Number.isFinite(r[k])&&r[k]>=0)&&
        r.c5<=r.c4&&r.c4<=r.universeSize&&r.c4>0&&r.record>0&&
        r.p4===r.c4/r.universeSize&&r.p5===r.c5/r.universeSize&&
        engine.validateInput(r.previous).length===6&&r.tickets.length===10&&
        r.tickets.every(t=>engine.passesFilters(t,r.previous))&&new Set(r.tickets.map(t=>t.join(','))).size===10&&
        r.individual.length===10&&r.individual.every(x=>['n4','n5','marginal4'].every(k=>Number.isInteger(x[k])&&x[k]>=0))&&
        r.histogram.length===7&&r.histogram.every(Number.isInteger)&&r.matrix.length===10&&
        r.matrix.every(row=>row.length===10&&row.every(x=>Number.isInteger(x)&&x>=0&&x<=6));
    } catch(_) {return false;}
  }
  function dateTime(iso) {
    const d=new Date(iso);if(!Number.isFinite(d.getTime()))return '기록 없음';
    const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function planFingerprint(plan){try{return S.context(historyDB.list(),plan.mode,plan.targetDraw).fingerprint;}catch(_){return null;}}
  function refreshHistory() {
    const info=historyDB.info();$('history-badge').textContent=info.last+'회까지';
    stats('history-stats',[
      ['마지막 회차',fmt(info.last)+'회'],['저장된 총 회차',fmt(info.total)+'개'],['연속 저장 범위',`1 ~ ${info.contiguous}회`],
      ['마지막 데이터 업데이트',dateTime(info.updatedAt)],['마지막 온라인 확인',dateTime(info.lastCheckedAt)],['마지막 확인 시도',dateTime(info.lastOnlineAttempt)],['데이터 출처',info.source]
    ]);
    if(info.warning)$('history-notice').textContent=info.warning;
    if(worker&&activeHistoryFingerprint!==planFingerprint(activePlan)){finish();status('당첨번호 데이터가 변경되어 이전 DB 기준 계산을 중단했습니다. 다시 계산하면 즉시 반영됩니다.');}
    let plan;try{plan=S.context(historyDB.list(),$('mode').value,Number($('target-draw').value));}catch(_){}
    $('input-title').textContent=$('mode').value==='backtest'?'과거 회차 검증':'최신 DB로 다음 회차 생성';
    stats('generation-context', [['생성 대상',plan?plan.targetDraw+'회':'누락 데이터 확인'],['직전 회차',plan?plan.previousDraw+'회':'—'],['이번 계산의 DB',plan?`1회 ~ ${plan.previousDraw}회`:'누락 데이터 확인'],['마지막 업데이트',dateTime(info.updatedAt)]]);
    $('auto-previous').textContent=plan?'직전 본번호 · '+plan.previous.join('  '):'당첨번호 데이터 메뉴에서 누락 회차를 복구하세요.';
    const stale=!!result&&result.historyInfo?.fingerprint!==planFingerprint(result);
    $('history-stale').hidden=!stale;$('copy').disabled=stale;$('save').disabled=stale;
    if(stale){$('copy-fallback').hidden=true;document.querySelector('.verified').textContent='DB 변경 · 재계산 필요';}
    else document.querySelector('.verified').textContent='전체 U 검산 완료';
  }
  function announceMutation() {refreshHistory();try{historyChannel?.postMessage('changed');}catch(_){} }
  async function updateHistory() {
    await historyReady;$('history-update').disabled=true;$('result-history-update').disabled=true;
    $('history-notice').textContent='신규 회차 확인 중입니다. 현재 저장된 DB로 계산할 수 있습니다.';
    try {
      const update=await historyDB.update();announceMutation();
      $('history-notice').textContent=(update.ok
        ? (update.added?`${update.added}개 신규 회차를 반영했습니다.`:`출처 최신 ${update.latest}회 확인. 추가할 새 기록이 없습니다.`)
        : `갱신하지 못했습니다. 저장된 ${update.info.total}개 회차로 정상 계산합니다. ${update.error}`)+
        (update.info.warning?' '+update.info.warning:'');
    } finally{$('history-update').disabled=false;$('result-history-update').disabled=false;}
  }
  $('history-update').onclick=updateHistory;
  $('result-history-update').onclick=()=>{$('history-panel').open=true;updateHistory();};
  $('history-manual').onsubmit=async event=>{
    event.preventDefault();
    try {
      await historyReady;const raw=$('history-draw').value.trim();if(!/^\d+$/.test(raw))throw Error('회차를 정수로 입력해주세요.');
      const record=LottoHistory.normalizeRecord({draw:Number(raw),numbers:engine.validateInput($('history-numbers').value)});
      const change=await historyDB.merge([record],'manual');announceMutation();
      $('history-notice').textContent=(change.unchanged?'이미 저장된 동일 회차·번호입니다.':`${record.draw}회 저장 완료. 다음 회차의 역대 동일조합 제외에 즉시 반영했습니다.`)+(historyDB.warning?' '+historyDB.warning:'');
    } catch(error){$('history-notice').textContent=error.message;}
  };
  $('history-import').onchange=async event=>{
    const file=event.target.files[0];if(!file)return;
    try {
      if(file.size>10000000)throw Error('JSON 파일은 10MB 이하여야 합니다.');
      const records=JSON.parse((await file.text()).replace(/^\uFEFF/,''));await historyReady;
      const change=await historyDB.merge(records,'import');announceMutation();
      $('history-notice').textContent=`가져오기 완료: 추가 ${change.added}회, 수정 ${change.replaced}회, 동일 ${change.unchanged}회.`+(historyDB.warning?' '+historyDB.warning:'');
    } catch(error){$('history-notice').textContent='가져오기 실패: '+error.message;}
    finally{event.target.value='';}
  };
  $('history-export').onclick=async()=>{
    await historyReady;const url=URL.createObjectURL(new Blob([historyDB.exportJSON()],{type:'application/json;charset=utf-8'}));
    const a=node('a');a.href=url;a.download=`lotto-history-through-${historyDB.info().last}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  };
  if(historyChannel)historyChannel.onmessage=async()=>{await historyReady;await historyDB.merge([]);refreshHistory();};
  historyReady.then(()=>{
    refreshHistory();
    try {
      const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
      if(saved&&validStored(saved)){result=saved;$('mode').value=saved.mode; if(saved.mode==='backtest'){$('target-draw').value=saved.targetDraw;$('backtest-controls').hidden=false;}$('restarts').value=String(saved.restarts);render(saved);status('이 브라우저에 저장된 최근 계산 결과입니다.');}
      else if(saved)status('기존 결과는 이전 필터 기준입니다. 새 9조건으로 다시 계산해주세요.');
    }catch(_){}
    if(navigator.onLine!==false){
      (async()=>{try{
        if(location.protocol!=='file:'){const snapshot=await LottoProviders.fetchJSON(new URL('./lotto_history.json',location.href).href);await historyDB.merge(snapshot,'GitHub Pages bundled JSON');announceMutation();}
      }catch(error){$('history-notice').textContent='기본 JSON 확인 실패: '+error.message;}
      await updateHistory();})();
    }else $('history-notice').textContent='오프라인: 저장된 당첨번호 DB로 정상 계산합니다.';
  });
  async function initOffline() {
    if(location.protocol==='file:') {$('offline-status').textContent='로컬 파일 모드 · 계산은 연결 없이 실행됩니다. PWA 설치는 HTTPS 페이지에서 지원됩니다.';return;}
    if(!('serviceWorker' in navigator)||!window.isSecureContext) {$('offline-status').textContent='계산은 로컬에서 실행됩니다. 이 주소에서는 오프라인 앱 설치를 지원하지 않습니다. PWA에는 HTTPS 또는 같은 기기의 localhost가 필요합니다.';return;}
    try {
      const registration=await navigator.serviceWorker.register('./service-worker.js',{updateViaCache:'none'});
      function showUpdate(){if(registration.waiting)$('app-update').hidden=false;}
      showUpdate();registration.addEventListener('updatefound',()=>{registration.installing?.addEventListener('statechange',showUpdate);});
      $('apply-update').onclick=()=>{if(worker||launching){status('계산 중에는 앱을 갱신하지 않습니다. 먼저 완료하거나 중단해주세요.');return;}registration.waiting?.postMessage({type:'ACTIVATE'});};
      let refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!refreshing&&!worker){refreshing=true;location.reload();}});
      registration.update().catch(()=>{});
      await navigator.serviceWorker.ready;
      $('offline-status').textContent='오프라인 저장 완료 · 홈 화면에 추가한 뒤, 연결을 끊고 다시 열어 확인하세요.';
      if(registration.waiting) $('offline-status').textContent+=' 새 버전은 다음 실행에 적용됩니다.';
    } catch(_) {$('offline-status').textContent='오프라인 저장을 완료하지 못했습니다. 현재 페이지에서 계산은 가능합니다. 저장 공간과 실행 주소를 확인하세요.';}
  }
  initOffline();
})();
