'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const e=require('../worker.js').createLottoEngine();
const previous=[1,3,5,7,9,11],u=e.generateUniverse(previous,16);
const rows=[];e.walk(16,(a,id)=>{if(e.has(u,id))rows.push({a:Array.from(a),id});});
function common(a,b){return a.filter(x=>b.includes(x)).length;}
function referenceFilter(a,p){return common(a,p)<=2&&[2,3,4].includes(a.filter(x=>x%2).length)&&
  !a.some(x=>a.includes(x+1)&&a.includes(x+2))&&a[5]-a[0]>12&&a.slice(1).every((x,i)=>x-a[i]<=19);}
function covers(selected,k){return new Set(rows.filter(w=>selected.some(id=>common(Array.from(e.unrank(id,16)),w.a)>=k)).map(w=>w.id));}
function referenceValue(selected){return [covers(selected,4).size,covers(selected,5).size];}
function better(a,b,secondary=false){return secondary?a[1]>b[1]||(a[1]===b[1]&&a[0]>b[0]):a[0]>b[0]||(a[0]===b[0]&&a[1]>b[1]);}

test('입력 검증: 개수, 범위, 중복, 소수, NaN, 문자열 형식',()=>{
  assert.deepEqual(e.validateInput('44,31,20,19,13,11'),[11,13,19,20,31,44]);
  for(const a of ['1 2 3','1 2 3 4 5 5','0 2 3 4 5 6','1 2 3 4 5 46','1.5 2 3 4 5 6','1e1 2 3 4 5 6',[true,2,3,4,5,6],[NaN,2,3,4,5,6]]) assert.throws(()=>e.validateInput(a));
});
test('5개 필터 경계: 3연속, 독립 2연속, span 12/13, gap 19/20, 홀짝, 중복',()=>{
  const p=[2,4,6,14,16,18];
  const cases=[[[8,9,25,31,32,44],true],[[10,11,12,25,32,44],false],[[1,2,5,7,10,13],false],
    [[1,2,5,7,10,14],true],[[1,3,8,27,32,44],true],[[1,3,8,28,32,44],false],
    [[2,4,6,25,31,44],false],[[2,4,9,25,31,44],true],[[1,3,9,25,31,44],false],[[2,8,10,26,32,44],false]];
  cases.forEach(([a,want])=>{assert.equal(referenceFilter(a,p),want);assert.equal(e.passesFilters(a,p),want);});
});
test('작은 전체 공간: 독립 필터, 조합 ID 일대일 및 rank 역함수',()=>{
  const ids=new Set();let count=0;
  e.walk(16,(a,id)=>{assert.equal(e.rank(a),id);assert.deepEqual(Array.from(e.unrank(id,16)),Array.from(a));ids.add(id);
    const passed=referenceFilter(Array.from(a),previous);assert.equal(e.has(u,id),passed);if(passed)count++;});
  assert.equal(ids.size,u.total);assert.equal(count,u.size);
});
test('모든 작은 후보 N4/N5 및 부분집합 점수: 독립 교집합과 일치',()=>{
  const state=new e.CoverageState(u);
  for(const {a,id} of rows){const x=e.neighbors(a,u),c4=covers([id],4),c5=covers([id],5);
    assert.deepEqual(new Set(x.ids4),c4);assert.deepEqual(new Set(x.ids5),c5);
    assert.equal(x.ids4.length,c4.size);assert.deepEqual(state.score(a,id),[c4.size,c5.size]);}
});
test('겹치는 커버의 marginal 및 상태 추가/제거 복원',()=>{
  const selected=[rows[0].id,rows[Math.floor(rows.length/2)].id,rows.at(-1).id],state=new e.CoverageState(u);
  selected.forEach(id=>state.change(id,1));const c4=covers(selected,4),c5=covers(selected,5);
  for(const {a,id} of rows){const a4=covers([id],4),a5=covers([id],5);
    assert.deepEqual(state.score(a,id),[[...a4].filter(x=>!c4.has(x)).length,[...a5].filter(x=>!c5.has(x)).length]);}
  selected.reverse().forEach(id=>state.change(id,-1));assert.equal(state.c4,0);assert.equal(state.c5,0);
  assert.deepEqual(state.d4,u.d4);assert.deepEqual(state.d5,u.d5);assert.deepEqual(state.e5,u.d5);
  assert.ok(state.refs4.every(x=>x===0));assert.ok(state.refs5.every(x=>x===0));
});
test('greedy 선택: 독립적인 전수 합집합 기준과 일치',()=>{
  const state=new e.CoverageState(u),selected=e.greedyInitialSolution(state,3),expected=[];
  for(let i=0;i<3;i++){let best=-1,value=[-1,-1];for(const {id} of rows){if(expected.includes(id))continue;
    const v=referenceValue([...expected,id]);if(better(v,value)){best=id;value=v;}}expected.push(best);}
  assert.deepEqual(selected,expected);
});
test('local search 개선, 99.5% 하한, 종료 후 모든 1장 교체 검사',()=>{
  const state=new e.CoverageState(u);let selected=e.greedyInitialSolution(state,3),before=[state.c4,state.c5];
  let local=e.localSearch(selected,state);assert.ok(!better(before,[state.c4,state.c5]));
  local=e.localSearch(local.selected,state,true,local.record);selected=local.selected;
  assert.ok(state.c4*1000>=995*local.record);
  for(let i=0;i<3;i++)for(const {id} of rows){const trial=selected.slice();trial[i]=id;if(new Set(trial).size<3)continue;
    const v=referenceValue(trial);if(v[0]*1000>=995*local.record)assert.ok(!better(v,[state.c4,state.c5],true));}
  const result=e.evaluatePortfolio(u,selected);assert.deepEqual([result.c4,result.c5],[state.c4,state.c5]);
  assert.equal(result.individual.reduce((s,x)=>s+x.marginal4,0),result.c4);
  const histogram=Array(7).fill(0);rows.forEach(w=>histogram[Math.max(...selected.map(id=>common(w.a,Array.from(e.unrank(id,16))))) ]++);
  assert.deepEqual(result.histogram,histogram);
});
test('32/33번 경계 및 45번 비트마스크, popcount 정확성',()=>{
  const a=[1,9,20,32,33,45],b=[2,9,20,31,33,45],ma=e.mask(a),mb=e.mask(b);
  assert.equal(e.popcount(ma[0])+e.popcount(ma[1]),6);assert.equal(e.popcount(ma[0]&mb[0])+e.popcount(ma[1]&mb[1]),4);
  assert.equal(e.popcount(-1),32);
});
test('원본 Python 작은 공간의 U, greedy, local, 최종 평가와 일치',()=>{
  const reference=require('./python-reference.json'),state=new e.CoverageState(u);
  let selected=e.greedyInitialSolution(state,3);
  assert.equal(u.size,reference.small.size);assert.deepEqual(selected.map(id=>Array.from(e.unrank(id,16))),reference.small.greedy);
  let local=e.localSearch(selected,state);local=e.localSearch(local.selected,state,true,local.record);
  const evaluated=e.evaluatePortfolio(u,local.selected);
  assert.deepEqual(evaluated.tickets,reference.small.final);
  assert.deepEqual(evaluated.histogram,reference.small.histogram);
  assert.equal(evaluated.c4,reference.small.c4);assert.equal(evaluated.c5,reference.small.c5);
});
test('고정 seed 다중 초기화 재현성 및 진행률 범위',()=>{
  const options={previous,n:16,restarts:1,seed:1234};
  const one=e.run(options,p=>{assert.ok(p.scan>=0&&p.scan<=1);}),two=e.run(options);
  assert.deepEqual(one.tickets,two.tickets);assert.equal(one.c4,two.c4);assert.equal(one.c5,two.c5);
});
