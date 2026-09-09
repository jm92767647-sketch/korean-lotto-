'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const S=require('../shared.js'),P=require('../providers.js');
async function update(root=path.resolve(__dirname,'..'),json=P.fetchJSON){
 const files=['lotto_history.json','history-data.js','history-provenance.json'];
 const originals=await Promise.all(files.map(f=>fs.readFile(path.join(root,f),'utf8')));
 const existing=S.validateBatch(JSON.parse(originals[0]));
 const collected=await P.collect(existing,json,{officialOnly:true});
 const merged=S.mergeRows(existing,collected.pending);
 if(merged.length!==collected.latest||merged.some((r,i)=>r.draw!==i+1))throw Error('공식 회차 누락/최신 회차 불일치');
 if(!collected.pending.length)return {changed:false,last:collected.latest};
 const rows=merged.map(({draw,numbers})=>({draw,numbers})),stamp=new Date().toISOString(),data=JSON.stringify(rows)+'\n';
 const contents=[data,`const LOTTO_HISTORY_BUILTIN_UPDATED=${JSON.stringify(stamp)};\nconst LOTTO_HISTORY_BUILTIN=${JSON.stringify(rows)};\n`,JSON.stringify({source:P.OFFICIAL_MAIN,roundSource:P.OFFICIAL_ROUND,first:1,last:collected.latest,total:rows.length,fetchedAt:stamp,sha256:crypto.createHash('sha256').update(data).digest('hex')},null,2)+'\n'];
 // All network, batch and continuity validation completes before any file writes.
 try{for(let i=0;i<files.length;i++)await fs.writeFile(path.join(root,files[i]),contents[i]);}
 catch(error){await Promise.all(files.map((f,i)=>fs.writeFile(path.join(root,f),originals[i])));throw error;}
 return {changed:true,added:collected.pending.length,last:collected.latest};
}
module.exports={update};
if(require.main===module)update().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
