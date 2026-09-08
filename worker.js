/* Local Lotto engine. No network, imports, BigInt or external dependencies.
 * Loaded as a classic script, its factory can be serialized into a Blob Worker.
 * This also avoids file:// Worker script-origin restrictions in desktop browsers.
 */
function createLottoEngine() {
  'use strict';
  const B = Array.from({length: 7}, () => new Int32Array(46));
  for (let n=0;n<=45;n++) {
    B[0][n]=1;
    for(let k=1;k<=6;k++) B[k][n]=n===0?0:B[k][n-1]+B[k-1][n-1];
  }
  const S4=[], S5=[];
  function subsets(k,start=0,a=[]) {
    if(a.length===k) { (k===4?S4:S5).push(a.slice()); return; }
    for(let i=start;i<6;i++) subsets(k,i+1,a.concat(i));
  }
  subsets(4); subsets(5);
  function validateInput(input) {
    let a;
    if(typeof input==='string') {
      const tokens=input.trim().split(/[\s,]+/);
      if(tokens.some(t=>!/^\d+$/.test(t))) throw Error('정수 6개를 입력해주세요.');
      a=tokens.map(Number);
    } else if(Array.isArray(input)) a=input.slice();
    else throw Error('번호 6개를 입력해주세요.');
    if(a.length!==6) throw Error('번호를 정확히 6개 입력해주세요.');
    if(a.some(x=>!Number.isInteger(x)||x<1||x>45)) throw Error('번호는 1~45 사이의 정수여야 합니다.');
    if(new Set(a).size!==6) throw Error('같은 번호를 두 번 입력할 수 없습니다.');
    return a.sort((x,y)=>x-y);
  }
  function passes(a,p) {
    let odd=0,overlap=0;
    for(let i=0;i<6;i++) {
      odd+=a[i]&1; overlap+=p[a[i]];
      if(i && a[i]-a[i-1]>19) return false;
      if(i>=2 && a[i]===a[i-1]+1 && a[i-1]===a[i-2]+1) return false;
    }
    return overlap<=2 && odd>=2 && odd<=4 && a[5]-a[0]>12;
  }
  function passesFilters(a,previous) {
    try {
      a=validateInput(Array.from(a)); previous=validateInput(previous);
      const p=new Uint8Array(46); previous.forEach(x=>p[x]=1);
      return passes(a,p);
    } catch(_) { return false; }
  }
  function rank(a) { let r=0; for(let i=0;i<a.length;i++) r+=B[i+1][a[i]-1]; return r; }
  function unrank(id,n=45,a=new Uint8Array(6)) {
    let upper=n-1;
    for(let k=6;k>=1;k--) {
      let low=k-1,high=upper;
      while(low<high) { const mid=(low+high+1)>>1; if(B[k][mid]<=id) low=mid; else high=mid-1; }
      a[k-1]=low+1; id-=B[k][low]; upper=low-1;
    }
    return a;
  }
  // These straight-line subset ranks are generated at authoring time only.
  function subsetRanks(a,r4,r5) {
    r4[0]=B[1][a[0]-1]+B[2][a[1]-1]+B[3][a[2]-1]+B[4][a[3]-1];
    r4[1]=B[1][a[0]-1]+B[2][a[1]-1]+B[3][a[2]-1]+B[4][a[4]-1];
    r4[2]=B[1][a[0]-1]+B[2][a[1]-1]+B[3][a[2]-1]+B[4][a[5]-1];
    r4[3]=B[1][a[0]-1]+B[2][a[1]-1]+B[3][a[3]-1]+B[4][a[4]-1];
    r4[4]=B[1][a[0]-1]+B[2][a[1]-1]+B[3][a[3]-1]+B[4][a[5]-1];
    r4[5]=B[1][a[0]-1]+B[2][a[1]-1]+B[3][a[4]-1]+B[4][a[5]-1];
    r4[6]=B[1][a[0]-1]+B[2][a[2]-1]+B[3][a[3]-1]+B[4][a[4]-1];
    r4[7]=B[1][a[0]-1]+B[2][a[2]-1]+B[3][a[3]-1]+B[4][a[5]-1];
    r4[8]=B[1][a[0]-1]+B[2][a[2]-1]+B[3][a[4]-1]+B[4][a[5]-1];
    r4[9]=B[1][a[0]-1]+B[2][a[3]-1]+B[3][a[4]-1]+B[4][a[5]-1];
    r4[10]=B[1][a[1]-1]+B[2][a[2]-1]+B[3][a[3]-1]+B[4][a[4]-1];
    r4[11]=B[1][a[1]-1]+B[2][a[2]-1]+B[3][a[3]-1]+B[4][a[5]-1];
    r4[12]=B[1][a[1]-1]+B[2][a[2]-1]+B[3][a[4]-1]+B[4][a[5]-1];
    r4[13]=B[1][a[1]-1]+B[2][a[3]-1]+B[3][a[4]-1]+B[4][a[5]-1];
    r4[14]=B[1][a[2]-1]+B[2][a[3]-1]+B[3][a[4]-1]+B[4][a[5]-1];
    r5[0]=B[1][a[0]-1]+B[2][a[1]-1]+B[3][a[2]-1]+B[4][a[3]-1]+B[5][a[4]-1];
    r5[1]=B[1][a[0]-1]+B[2][a[1]-1]+B[3][a[2]-1]+B[4][a[3]-1]+B[5][a[5]-1];
    r5[2]=B[1][a[0]-1]+B[2][a[1]-1]+B[3][a[2]-1]+B[4][a[4]-1]+B[5][a[5]-1];
    r5[3]=B[1][a[0]-1]+B[2][a[1]-1]+B[3][a[3]-1]+B[4][a[4]-1]+B[5][a[5]-1];
    r5[4]=B[1][a[0]-1]+B[2][a[2]-1]+B[3][a[3]-1]+B[4][a[4]-1]+B[5][a[5]-1];
    r5[5]=B[1][a[1]-1]+B[2][a[2]-1]+B[3][a[3]-1]+B[4][a[4]-1]+B[5][a[5]-1];
  }
  function has(u,id) { return (u.bits[id>>>3] & (1<<(id&7)))!==0; }
  // One six-byte scratch row; no array of all combinations is retained.
  function walk(n,visit,tick=()=>{},u=null) {
    const a=new Uint8Array(6),total=B[6][n]; let visited=0;
    for(let x0=1;x0<n-4;x0++) { a[0]=x0;
      for(let x1=x0+1;x1<n-3;x1++) { a[1]=x1;
        for(let x2=x1+1;x2<n-2;x2++) { a[2]=x2;
          for(let x3=x2+1;x3<n-1;x3++) { a[3]=x3;
            for(let x4=x3+1;x4<n;x4++) { a[4]=x4;
              const base=B[1][x0-1]+B[2][x1-1]+B[3][x2-1]+B[4][x3-1]+B[5][x4-1];
              for(let x5=x4+1;x5<=n;x5++) { a[5]=x5; const id=base+B[6][x5-1];
                if(!u || has(u,id)) visit(a,id);
                if((++visited & 131071)===0) tick(visited/total);
              }
            }
          }
        }
      }
    }
    tick(1);
  }
  function generateUniverse(previous,n=45,tick) {
    previous=validateInput(previous);
    if(!Number.isInteger(n)||n<6||n>45) throw Error('잘못된 번호 공간입니다.');
    const u={previous,n,total:B[6][n],size:0,bits:new Uint8Array(Math.ceil(B[6][n]/8)),
      d4:new Int32Array(B[4][n]),d5:new Int32Array(B[5][n])};
    const p=new Uint8Array(46),r4=new Int32Array(15),r5=new Int32Array(6);
    previous.forEach(x=>p[x]=1);
    walk(n,(a,id)=>{
      if(!passes(a,p)) return;
      u.bits[id>>>3]|=1<<(id&7); u.size++;
      subsetRanks(a,r4,r5);
      for(let i=0;i<15;i++) u.d4[r4[i]]++;
      for(let i=0;i<6;i++) u.d5[r5[i]]++;
    },tick);
    return u;
  }
  function neighbors(ticket,u) {
    const t=validateInput(Array.from(ticket));
    if(t[5]>u.n) throw Error('번호가 Universe 범위를 벗어났습니다.');
    const outside=[]; for(let x=1;x<=u.n;x++) if(!t.includes(x)) outside.push(x);
    const ids4=new Int32Array(11350),ids5=new Int32Array(235),a=new Uint8Array(6);
    let n4=0,n5=0;
    function add(five) {
      a.sort(); const id=rank(a);
      if(has(u,id)) { ids4[n4++]=id; if(five) ids5[n5++]=id; }
    }
    for(const s of S4) for(let i=0;i<outside.length;i++) for(let j=i+1;j<outside.length;j++) {
      for(let k=0;k<4;k++) a[k]=t[s[k]];
      a[4]=outside[i];a[5]=outside[j];add(false);
    }
    for(const s of S5) for(const x of outside) {
      for(let k=0;k<5;k++) a[k]=t[s[k]];
      a[5]=x;add(true);
    }
    a.set(t);add(true);
    return {ids4:ids4.slice(0,n4),ids5:ids5.slice(0,n5)};
  }
  class CoverageState {
    constructor(u) {
      this.u=u; this.d4=u.d4.slice(); this.d5=u.d5.slice(); this.e5=u.d5.slice();
      this.refs4=new Uint8Array(u.total);this.refs5=new Uint8Array(u.total);
      this.c4=0;this.c5=0;this.cache=new Map();
      this.a=new Uint8Array(6);this.r4=new Int32Array(15);this.r5=new Int32Array(6);
    }
    reset() {
      this.d4.set(this.u.d4);this.d5.set(this.u.d5);this.e5.set(this.u.d5);
      this.refs4.fill(0);this.refs5.fill(0);this.c4=0;this.c5=0;
    }
    neighborhood(id) {
      if(!this.cache.has(id)) {
        if(this.cache.size>=32) this.cache.delete(this.cache.keys().next().value);
        this.cache.set(id,neighbors(unrank(id,this.u.n),this.u));
      }
      return this.cache.get(id);
    }
    change(ticketId,delta) {
      const {ids4,ids5}=this.neighborhood(ticketId),sign=-delta;
      for(const id of ids4) {
        const old=this.refs4[id];
        if(old+delta<0||old+delta>10) throw Error('커버리지 참조 수 오류');
        this.refs4[id]=old+delta;
        if((old===0)!==(this.refs4[id]===0)) {
          this.c4-=sign;subsetRanks(unrank(id,this.u.n,this.a),this.r4,this.r5);
          for(let i=0;i<15;i++) this.d4[this.r4[i]]+=sign;
          for(let i=0;i<6;i++) this.d5[this.r5[i]]+=sign;
        }
      }
      for(const id of ids5) {
        const old=this.refs5[id];this.refs5[id]=old+delta;
        if((old===0)!==(this.refs5[id]===0)) {
          this.c5-=sign;subsetRanks(unrank(id,this.u.n,this.a),this.r4,this.r5);
          for(let i=0;i<6;i++) this.e5[this.r5[i]]+=sign;
        }
      }
    }
    score(a,id=rank(a)) {
      subsetRanks(a,this.r4,this.r5);
      let v4=this.refs4[id]===0?10:0,v5=this.refs5[id]===0?-5:0;
      for(let i=0;i<15;i++) v4+=this.d4[this.r4[i]];
      for(let i=0;i<6;i++) {v4-=4*this.d5[this.r5[i]];v5+=this.e5[this.r5[i]];}
      return [v4,v5];
    }
    best(excluded=[],floor4=0,secondary=false,tick) {
      const exclusions=new Set(excluded),r4=this.r4,r5=this.r5;
      let best=-1,best4=-1,best5=-1;
      walk(this.u.n,(a,id)=>{
        if(exclusions.has(id)) return;
        subsetRanks(a,r4,r5);
        let v4=this.refs4[id]===0?10:0;
        for(let j=0;j<15;j++) v4+=this.d4[r4[j]];
        for(let j=0;j<6;j++) v4-=4*this.d5[r5[j]];
        if(this.c4+v4<floor4 || (!secondary && v4<best4)) return;
        let v5=this.refs5[id]===0?-5:0;
        for(let j=0;j<6;j++) v5+=this.e5[r5[j]];
        if(secondary ? v5>best5||(v5===best5&&v4>best4) : v4>best4||(v4===best4&&v5>best5)) {
          best=id;best4=v4;best5=v5;
        }
      },tick,this.u);
      if(best<0) throw Error('조건을 만족하는 후보가 없습니다.');
      return best;
    }
  }
  function greedyInitialSolution(state,games=10,first=null,progress=()=>{}) {
    if(state.u.size<games) throw Error('필터 통과 후보가 충분하지 않습니다.');
    const selected=[];
    for(let slot=0;slot<games;slot++) {
      const id=slot===0&&first!==null?first:state.best(selected,0,false,p=>progress({slot,scan:p}));
      selected.push(id);state.change(id,1);
      progress({slot,scan:1,c4:state.c4,c5:state.c5});
    }
    return selected;
  }
  function localSearch(selected,state,secondary=false,record=state.c4,progress=()=>{}) {
    selected=selected.slice();record=Math.max(record,state.c4);let sweep=0;
    while(true) {
      sweep++;let improved=false;
      for(let slot=0;slot<selected.length;slot++) {
        const old=selected[slot],before4=state.c4,before5=state.c5;
        state.change(old,-1);
        const others=selected.filter((_,i)=>i!==slot);
        const candidate=state.best(others,secondary?Math.ceil(record*995/1000):0,secondary,
          p=>progress({sweep,slot,scan:p,c4:before4,c5:before5}));
        state.change(candidate,1);
        const better=secondary ? state.c5>before5||(state.c5===before5&&state.c4>before4)
          :state.c4>before4||(state.c4===before4&&state.c5>before5);
        if(better) {selected[slot]=candidate;record=Math.max(record,state.c4);improved=true;}
        else {state.change(candidate,-1);state.change(old,1);}
        progress({sweep,slot,scan:1,c4:state.c4,c5:state.c5});
      }
      if(!improved) return {selected,record};
    }
  }
  function popcount(x) {
    x-= (x>>>1)&0x55555555;
    x=(x&0x33333333)+((x>>>2)&0x33333333);
    return (((x+(x>>>4))&0x0f0f0f0f)*0x01010101)>>>24;
  }
  function mask(a) {
    let low=0,high=0;
    for(const x of a) if(x<=32) low|=1<<(x-1); else high|=1<<(x-33);
    return [low,high];
  }
  function evaluatePortfolio(u,selected,tick) {
    if(new Set(selected).size!==selected.length||selected.some(id=>!has(u,id))) throw Error('잘못된 티켓 세트입니다.');
    const seen4=new Uint8Array(Math.ceil(u.total/8)),seen5=new Uint8Array(Math.ceil(u.total/8));
    const tickets=selected.map(id=>Array.from(unrank(id,u.n))),individual=[];
    let union4=0,union5=0;
    for(const ticket of tickets) {
      const {ids4,ids5}=neighbors(ticket,u);let marginal4=0;
      for(const id of ids4) if(!(seen4[id>>>3]&(1<<(id&7)))) {seen4[id>>>3]|=1<<(id&7);marginal4++;}
      for(const id of ids5) if(!(seen5[id>>>3]&(1<<(id&7)))) {seen5[id>>>3]|=1<<(id&7);union5++;}
      union4+=marginal4;individual.push({n4:ids4.length,n5:ids5.length,marginal4});
    }
    const lows=new Int32Array(selected.length),highs=new Int32Array(selected.length);
    tickets.forEach((t,i)=>{[lows[i],highs[i]]=mask(t);});
    const histogram=Array(7).fill(0);let checked=0;
    // Independent exact validation of EVERY W in U using split 32-bit masks.
    walk(u.n,a=>{
      let low=0,high=0;
      for(let i=0;i<6;i++) {const x=a[i];if(x<=32) low|=1<<(x-1);else high|=1<<(x-33);}
      let best=0;
      for(let i=0;i<lows.length;i++) best=Math.max(best,popcount(low&lows[i])+popcount(high&highs[i]));
      histogram[best]++;checked++;
    },tick,u);
    const c5=histogram[5]+histogram[6],c4=histogram[4]+c5;
    if(c4!==union4||c5!==union5||checked!==u.size) throw Error('전체 Universe 검산 불일치: 결과를 사용할 수 없습니다.');
    const matrix=tickets.map(a=>tickets.map(b=>a.filter(x=>b.includes(x)).length));
    const upper=selected.length*(15*B[2][u.n-6]+6*(u.n-6)+1);
    return {tickets,previous:u.previous,total:u.total,universeSize:u.size,c4,c5,p4:c4/u.size,p5:c5/u.size,
      histogram,individual,matrix,upper,verified:true,checked,globalOptimal:false};
  }
  function run(options={},emit=()=>{}) {
    const started=Date.now(),previous=validateInput(options.previous),n=options.n===undefined?45:options.n;
    const restarts=options.restarts===undefined?2:options.restarts,seed=options.seed===undefined?20260908:options.seed;
    if(!Number.isInteger(restarts)||restarts<0||restarts>10) throw Error('추가 재시작은 0~10회입니다.');
    if(!Number.isInteger(seed)||seed<0||seed>4294967295) throw Error('seed 범위 오류');
    let last=0;
    function progress(stage,detail,scan,extra={}) {
      const now=Date.now();if(scan<1&&now-last<150) return;last=now;
      emit({type:'progress',stage,detail,scan,elapsedMs:now-started,...extra});
    }
    progress('universe','전체 조합 필터링 · 부분집합 집계',0);
    const u=generateUniverse(previous,n,p=>progress('universe','전체 조합 필터링 · 부분집합 집계',p));
    // One state reused for all restarts: old large arrays never accumulate.
    const state=new CoverageState(u),primaries=[];let record=0,randomState=seed>>>0;
    function random() {randomState=(randomState+0x6D2B79F5)>>>0;let t=randomState;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
    for(let runIndex=0;runIndex<=restarts;runIndex++) {
      state.reset();let first=null;
      if(runIndex>0) {do {first=Math.floor(random()*u.total);} while(!has(u,first));}
      let selected=greedyInitialSolution(state,10,first,p=>progress('greedy',`초기해 ${runIndex+1}/${restarts+1} · ${p.slot+1}/10게임 후보 평가`,p.scan,{...p,runIndex,universeSize:u.size}));
      const local=localSearch(selected,state,false,state.c4,p=>progress('local4',`초기해 ${runIndex+1}/${restarts+1} · 4+ 개선 ${p.sweep}차 · ${p.slot+1}/10 교체`,p.scan,{...p,runIndex}));
      selected=local.selected;record=Math.max(record,state.c4);primaries.push({selected,c4:state.c4,c5:state.c5});
    }
    const finalists=[];
    for(let i=0;i<primaries.length;i++) {
      const initial=primaries[i];if(initial.c4*1000<record*995) continue;
      state.reset();initial.selected.forEach(id=>state.change(id,1));
      const local=localSearch(initial.selected,state,true,record,p=>progress('local5',`후보 세트 ${i+1}/${primaries.length} · 5+ 개선 ${p.sweep}차 · ${p.slot+1}/10 교체`,p.scan,p));
      record=local.record;finalists.push({selected:local.selected,c4:state.c4,c5:state.c5});
    }
    const feasible=finalists.filter(x=>x.c4*1000>=record*995);
    feasible.sort((a,b)=>b.c5-a.c5||b.c4-a.c4);
    const chosen=feasible[0];
    const result=evaluatePortfolio(u,chosen.selected,p=>progress('verify','전체 Universe와 10게임 독립 검산',p));
    if(result.c4!==chosen.c4||result.c5!==chosen.c5) throw Error('최적화 상태와 최종 검산 불일치');
    return {...result,record,restarts,seed,elapsedMs:Date.now()-started,createdAt:new Date().toISOString(),
      version:1,algorithm:'전체 후보 greedy + 전수 1장 교체 + 다중 초기해',
      arrayBytes:u.bits.byteLength+u.d4.byteLength+u.d5.byteLength+state.d4.byteLength+state.d5.byteLength+
      state.e5.byteLength+state.refs4.byteLength+state.refs5.byteLength};
  }
  return {validateInput,passesFilters,rank,unrank,walk,generateUniverse,neighbors,CoverageState,
    greedyInitialSolution,localSearch,evaluatePortfolio,popcount,mask,run,has};
}
function lottoWorkerMain() {
  const engine=createLottoEngine();
  self.onmessage=event=>{
    try { const result=engine.run(event.data,data=>self.postMessage(data));self.postMessage({type:'result',result}); }
    catch(error) { self.postMessage({type:'error',message:error.message||String(error)}); }
  };
  self.postMessage({type:'ready'});
}
if(typeof module!=='undefined'&&module.exports) module.exports={createLottoEngine,lottoWorkerMain};
else if(typeof document==='undefined') lottoWorkerMain();
