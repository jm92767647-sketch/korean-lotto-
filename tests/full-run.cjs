'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const e=require('../worker.js').createLottoEngine();
let lastStage='';
const result=e.run({previous:[11,13,19,20,31,44],restarts:2},p=>{
  if(p.detail!==lastStage){console.log(p.detail);lastStage=p.detail;}
});
assert.equal(result.universeSize,5239128);assert.equal(result.verified,true);
assert.equal(result.histogram.reduce((a,b)=>a+b),result.universeSize);
assert.ok(result.c4*1000>=995*result.record);
fs.writeFileSync(path.join(__dirname,'full-result.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({size:result.universeSize,c4:result.c4,c5:result.c5,elapsedMs:result.elapsedMs,arrayBytes:result.arrayBytes,tickets:result.tickets},null,2));
