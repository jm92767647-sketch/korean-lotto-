'use strict';
(() => {
  const $=id=>document.getElementById(id), inputs=Array.from(document.querySelectorAll('.number-inputs input'));
  const storageKey='local-lotto-result-v1', engine=createLottoEngine();
  const fmt=x=>Number(x).toLocaleString('ko-KR'),pct=x=>(x*100).toFixed(6)+'%';
  let worker=null,blobURL=null,result=null,timer=null,started=0,wakeLock=null,lastMessage=0;
  function status(message) { $('status').textContent=message;$('status').hidden=!message; }
  function node(tag,text,className) {const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(className)x.className=className;return x;}
  function setNumbers(numbers) {inputs.forEach((input,i)=>{input.value=numbers[i]===undefined?'':numbers[i];input.removeAttribute('aria-invalid');});$('input-error').hidden=true;}
  function validate() {
    try {
      const raw=inputs.map(x=>x.value.trim());
      if(raw.some(x=>!/^\d{1,2}$/.test(x))) throw Error('입력칸 6개에 번호를 모두 입력해주세요.');
      const numbers=engine.validateInput(raw.map(Number));
      inputs.forEach(x=>x.removeAttribute('aria-invalid'));$('input-error').hidden=true;return numbers;
    } catch(error) {
      $('input-error').textContent=error.message;$('input-error').hidden=false;
      inputs.forEach(x=>x.setAttribute('aria-invalid','true'));inputs[0].focus();return null;
    }
  }
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
  function start() {
    if(worker) return;
    const previous=validate();if(!previous) return;
    if(!window.Worker) {status('이 브라우저는 계산용 Web Worker를 지원하지 않습니다. 최신 Safari, Chrome 또는 Edge에서 열어주세요.');return;}
    $('input-fields').disabled=true;$('generate').disabled=true;$('recalculate').disabled=true;
    $('progress-panel').hidden=false;$('empty').hidden=true;$('progress-percent').textContent='0%';$('progress-bar').value=0;
    $('progress-title').textContent='계산 준비 중';$('progress-detail').textContent='계산 전용 작업 공간을 준비합니다.';$('live-coverage').textContent='';status('');
    started=Date.now();lastMessage=started;
    const options={previous,restarts:Number($('restarts').value),seed:20260908};
    try {
      const source=`'use strict';\n${createLottoEngine.toString()}\n(${lottoWorkerMain.toString()})();`;
      blobURL=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
      worker=new Worker(blobURL);
      worker.onmessage=event=>{
        const data=event.data;lastMessage=Date.now();
        if(data.type==='ready') {worker.postMessage(options);return;}
        if(data.type==='progress') {showProgress(data);return;}
        if(data.type==='error') {fail('계산을 완료하지 못했습니다. '+data.message);return;}
        if(data.type==='result') {
          result=data.result;finish();render(result);
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
    $('result-input').textContent='입력 직전 회차 · '+r.previous.map(x=>String(x).padStart(2,'0')).join('  ');
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
      ['전체 조합',fmt(r.total)+'개'],['5조건 통과 |U|',fmt(r.universeSize)+'개'],
      ['생존율',(r.universeSize/r.total*100).toFixed(4)+'%'],['제외율',((1-r.universeSize/r.total)*100).toFixed(4)+'%']
    ]);
    stats('optimization-stats',[
      ['정확히 4개 · 최대 일치 기준',fmt(r.histogram[4])+'개'],['정확히 5개 · 최대 일치 기준',fmt(r.histogram[5])+'개'],['6개 일치',fmt(r.histogram[6])+'개'],
      ['탐색 중 최고 C4',fmt(r.record)+'개'],['최종 / 탐색 중 최고 C4',(r.c4/r.record*100).toFixed(4)+'%'],
      ['이론적 4+ 상한',fmt(r.upper)+'개'],['이론적 상한 / |U|',pct(r.upper/r.universeSize)],
      ['상한 대비 달성률',(r.c4/r.upper*100).toFixed(4)+'%'],['상한과 P4의 차이',((r.upper-r.c4)/r.universeSize*100).toFixed(6)+'%p'],
      ['U 안에 있고 4+ 일치할 확률',pct(r.c4/r.total)],['전체 U 검산',fmt(r.checked)+'개 확인']
    ]);
    table('contribution-table',['게임','N4','N5','새 커버 C4'],r.individual.map((x,i)=>[i+1,fmt(x.n4),fmt(x.n5),fmt(x.marginal4)]));
    table('matrix-table',['게임',...r.tickets.map((_,i)=>i+1)],r.matrix.map((row,i)=>[i+1,...row]),true);
  }
  function gamesText() {return result.tickets.map((t,i)=>`${i+1}. ${t.map(x=>String(x).padStart(2,'0')).join(' ')}`).join('\n');}
  function reportText() {
    const r=result;
    return `로컬 로또 6/45\n입력 직전 회차: ${r.previous.join(' ')}\n\n${gamesText()}\n\n`+
      `전체 조합: ${fmt(r.total)}\n필터 통과 U: ${fmt(r.universeSize)}\n생존율: ${pct(r.universeSize/r.total)}\n제외율: ${pct(1-r.universeSize/r.total)}\n`+
      `C4: ${fmt(r.c4)}\n조건부 4등 이상 P4: ${pct(r.p4)} (약 1 / ${(r.universeSize/r.c4).toFixed(2)})\nC5: ${fmt(r.c5)}\n조건부 3등 이상 P5: ${pct(r.p5)}\n`+
      `최대 일치가 정확히 4개: ${r.histogram[4]}\n최대 일치가 정확히 5개: ${r.histogram[5]}\n6개 일치: ${r.histogram[6]}\n`+
      `탐색 중 최고 C4: ${r.record}\n최종 / 탐색 중 최고: ${pct(r.c4/r.record)}\n이론적 상한: ${r.upper} (${pct(r.upper/r.universeSize)})\n상한 달성률: ${pct(r.c4/r.upper)}\n`+
      `상한과 P4의 차이: ${((r.upper-r.c4)/r.universeSize*100).toFixed(6)}%p\n\n게임별 N4 / N5 / marginal C4\n`+
      r.individual.map((x,i)=>`${i+1}. ${x.n4} / ${x.n5} / ${x.marginal4}`).join('\n')+
      '\n\n게임 간 공통번호\n'+r.matrix.map(row=>row.join(' ')).join('\n')+
      `\n\n전체 U ${fmt(r.checked)}개 독립 검산 완료. 전역 최적해 보장 없음.\n99.5% 하한은 탐색 중 최고 C4 기준입니다.\n`+
      `조건부 확률은 당첨번호가 5조건을 만족한다는 가정입니다. 필터로 실제 무조건부 당첨확률이 증가했다는 뜻이 아닙니다.\n`+
      `C4/전체 조합 = ${pct(r.c4/r.total)}는 U 안에 있고 4+ 일치할 결합확률입니다. U 밖 당첨을 포함한 무조건부 4+ 확률과 다릅니다.\n`+
      `보너스는 예측하지 않습니다.\n추가 재시작 ${r.restarts}회, seed ${r.seed}, 실행 ${duration(r.elapsedMs)}\n${r.createdAt}\n`;
  }
  $('input-form').addEventListener('submit',event=>{event.preventDefault();start();});
  $('example').onclick=()=>setNumbers([11,13,19,20,31,44]);
  $('reset').onclick=()=>{setNumbers([]);inputs[0].focus();};
  $('cancel').onclick=()=>{finish();status('계산을 중단했습니다. 새 결과는 저장하지 않았습니다.');};
  $('recalculate').onclick=()=>{start();$('progress-panel').scrollIntoView({block:'start'});};
  inputs.forEach((input,index)=>{
    input.addEventListener('input',()=>{input.removeAttribute('aria-invalid');$('input-error').hidden=true;});
    input.addEventListener('paste',event=>{
      const text=event.clipboardData?.getData('text');if(!text||!/[\s,]/.test(text)) return;
      try {const nums=engine.validateInput(text);event.preventDefault();setNumbers(nums);} catch(_) {}
    });
    input.addEventListener('keydown',event=>{if(event.key==='ArrowRight'&&index<5)inputs[index+1].focus();if(event.key==='ArrowLeft'&&index>0)inputs[index-1].focus();});
  });
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
      return r.version===1&&r.verified===true&&r.total===8145060&&r.checked===r.universeSize&&
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
  try {
    const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
    if(saved&&validStored(saved)) {result=saved;setNumbers(saved.previous);$('restarts').value=String(saved.restarts);render(saved);status('이 브라우저에 저장된 최근 계산 결과입니다.');}
  } catch(_) { /* Storage denial must not disable the calculator. */ }
  async function initOffline() {
    if(location.protocol==='file:') {$('offline-status').textContent='로컬 파일 모드 · 계산은 연결 없이 실행됩니다. PWA 설치는 HTTPS 페이지에서 지원됩니다.';return;}
    if(!('serviceWorker' in navigator)||!window.isSecureContext) {$('offline-status').textContent='계산은 로컬에서 실행됩니다. 이 주소에서는 오프라인 앱 설치를 지원하지 않습니다. PWA에는 HTTPS 또는 같은 기기의 localhost가 필요합니다.';return;}
    try {
      const registration=await navigator.serviceWorker.register('./service-worker.js');
      await navigator.serviceWorker.ready;
      $('offline-status').textContent='오프라인 저장 완료 · 홈 화면에 추가한 뒤, 연결을 끊고 다시 열어 확인하세요.';
      if(registration.waiting) $('offline-status').textContent+=' 새 버전은 다음 실행에 적용됩니다.';
    } catch(_) {$('offline-status').textContent='오프라인 저장을 완료하지 못했습니다. 현재 페이지에서 계산은 가능합니다. 저장 공간과 실행 주소를 확인하세요.';}
  }
  initOffline();
})();
