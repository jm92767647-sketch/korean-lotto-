/* Independent nine-condition reference over all 8,145,060 combinations. */
const A=require('node:assert/strict'),fs=require('node:fs'),E=require('../worker.js').createLottoEngine();
const r=JSON.parse(fs.readFileSync(process.argv[2]||require('node:path').join(__dirname,'evidence-nine/full-result.json'),'utf8'));
const history=require('../lotto_history.json').filter(x=>x.draw<r.targetDraw),past=new Set(history.map(x=>x.numbers.join(','))),previous=new Set(history.at(-1).numbers);
const independent=Array(9).fill(0),sequential=Array(9).fill(0);let size=0,c4=0,c5=0;const start=Date.now();
E.walk(45,a=>{
 const gaps=Array.from(a).slice(1).map((n,i)=>n-a[i]),fail=[
 past.has(a.join(',')),new Set(gaps).size===1,Array.from(a).filter(n=>previous.has(n)).length>=3,
 gaps.some((g,i)=>i>0&&g===1&&gaps[i-1]===1),Math.max(...gaps)>20,gaps.filter(g=>g<=3).length>2,
 [[1,11],[12,22],[23,33],[34,45]].some(([lo,hi])=>a.filter(n=>n>=lo&&n<=hi).length>=4),a[5]-a[0]<=15,
 a.every(n=>n%2===0)||a.every(n=>n%2===1)];
 fail.forEach((f,i)=>{if(f)independent[i]++;});const first=fail.indexOf(true);if(first>=0){sequential[first]++;return;}size++;
 let best=0;for(const t of r.tickets){let common=0;for(const n of t)if(a.includes(n))common++;if(common>best)best=common;}if(best>=4)c4++;if(best>=5)c5++;
});
A.equal(size,r.universeSize);A.equal(c4,r.c4);A.equal(c5,r.c5);A.deepEqual(independent,r.filterStats.map(f=>f.independent));A.deepEqual(sequential,r.filterStats.map(f=>f.sequential));
console.log(JSON.stringify({verified:true,target:r.targetDraw,total:r.total,size,c4,c5,independent,sequential,elapsedMs:Date.now()-start},null,2));
