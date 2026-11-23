import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveIssuedArtifact } from '../src/components/library/issuedDocument/issuedExportDurability.js';
function setup(overrides={}) {
 const rows=[]; const calls={upload:0,create:0,read:0,verify:0};
 const entry={issued:{projectId:'dixon',versionId:'original',documentType:'project',selectedVersionIds:['original'],sourceRecordId:'snapshot',sourceFingerprints:{engineeringFingerprint:'frozen'}},filename:'report.pdf',blob:new Blob(['%PDF-1.7 test']),pageCount:42,attemptStartedAt:'2026-11-23T16:35:07.000Z',previewStatus:'available',rendering:'page_raster'};
 const api={upload:async()=>{calls.upload++;return{file_uri:'private/pdf'};},find:async()=>{calls.read++;return rows;},create:async row=>{calls.create++;const saved={...row,id:'saved'};rows.push(saved);return saved;},...overrides};
 const args={entry,api,verifyFile:async()=>{calls.verify++;},timeoutMs:10};
 return {rows,calls,entry,api,args};
}
test('success requires stored file validation and durable record readback',async()=>{
 const f=setup(); const result=await saveIssuedArtifact(f.args);
 assert.equal(result.id,'saved'); assert.equal(f.calls.read,2); assert.equal(f.calls.verify,1);
 assert.equal(result.page_count,42); assert.equal(result.preview_status,'available');
});
test('committed save with lost acknowledgement is recovered without another write',async()=>{
 const f=setup(); f.api.create=async row=>{f.calls.create++;f.rows.push({...row,id:'saved'});throw Error('connection lost');};
 assert.equal((await saveIssuedArtifact(f.args)).id,'saved');
 await saveIssuedArtifact(f.args); assert.equal(f.calls.create,1);assert.equal(f.calls.upload,1);
});
test('a never-returning acknowledgement reconciles a committed row',async()=>{
 const f=setup();f.api.create=row=>{f.calls.create++;f.rows.push({...row,id:'saved'});return new Promise(()=>{});};
 assert.equal((await saveIssuedArtifact(f.args)).id,'saved');assert.equal(f.calls.create,1);
});
test('failed reconciliation read cannot cause a new asset write or upload on retry',async()=>{
 const f=setup();f.entry.fileUri='private/pdf';f.api.find=async()=>{throw Error('read unavailable');};
 await assert.rejects(saveIssuedArtifact(f.args),/read unavailable/);
 assert.equal(f.calls.create,0);assert.equal(f.calls.upload,0);
});
test('acknowledged save invisible to readback is not accepted and retry never repeats create',async()=>{
 const f=setup();f.api.create=async()=>{f.calls.create++;return{id:'ack'};};
 for(let n=0;n<2;n++) await assert.rejects(saveIssuedArtifact(f.args),/durable readback/);
 assert.equal(f.calls.create,1);assert.equal(f.calls.upload,1);
});
test('delayed upload is reused after timeout; only one upload occurs',async()=>{
 const f=setup();let resolve;f.api.upload=()=>{f.calls.upload++;return new Promise(r=>resolve=r);};
 await assert.rejects(saveIssuedArtifact(f.args),/upload acknowledgement/);
 resolve({file_uri:'private/pdf'});await Promise.resolve();
 assert.equal((await saveIssuedArtifact(f.args)).id,'saved');assert.equal(f.calls.upload,1);
});
test('unacknowledged upload failure never automatically uploads another PDF',async()=>{
 const f=setup();f.api.upload=async()=>{f.calls.upload++;throw Error('uncertain upload');};
 for(let n=0;n<2;n++) await assert.rejects(saveIssuedArtifact(f.args),/uncertain upload/);
 assert.equal(f.calls.upload,1);assert.equal(f.calls.create,0);
});
test('wrong version or changed source is rejected without writing',async()=>{
 const f=setup();await saveIssuedArtifact(f.args);f.rows[0].version_id='other-version';
 await assert.rejects(saveIssuedArtifact(f.args),/does not match/);assert.equal(f.calls.create,1);
});
test('unreadable stored PDF prevents record creation',async()=>{
 const f=setup();f.args.verifyFile=async()=>{throw Error('invalid stored PDF');};
 await assert.rejects(saveIssuedArtifact(f.args),/invalid stored PDF/);assert.equal(f.calls.create,0);
});
test('a second report identity is retained independently',async()=>{
 const f=setup();f.entry.issued.projectId='doran';f.entry.issued.versionId='second';f.entry.issued.selectedVersionIds=['second'];f.entry.pageCount=28;
 const row=await saveIssuedArtifact(f.args);assert.equal(row.project_id,'doran');assert.equal(row.version_id,'second');assert.equal(row.page_count,28);
});

test('reload recovers an already committed record with no PDF blob or duplicate write',async()=>{
 const f=setup();await saveIssuedArtifact(f.args);
 const restored={...f.entry,blob:null,uploadOperation:undefined,recordOperation:undefined};
 assert.equal((await saveIssuedArtifact({...f.args,entry:restored})).id,'saved');
 assert.equal(f.calls.upload,1);assert.equal(f.calls.create,1);
});
test('reload with an uncertain record save checks only; it cannot create another row',async()=>{
 const f=setup();f.entry.fileUri='private/pdf';f.entry.blob=null;f.entry.recordStarted=true;
 await assert.rejects(saveIssuedArtifact(f.args),/previous asset save/);
 assert.equal(f.calls.create,0);assert.equal(f.calls.upload,0);
});
test('reload with an unknown upload path cannot automatically upload again',async()=>{
 const f=setup();f.entry.uploadStarted=true;
 await assert.rejects(saveIssuedArtifact(f.args),/no confirmed file path/);
 assert.equal(f.calls.upload,0);
});
test('pending recovery metadata survives module reload without persisting PDF bytes',async()=>{
 const memory=new Map();
 globalThis.window={sessionStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)}};
 const first=await import('../src/components/library/issuedDocument/pendingIssuedExportStore.js?initial');
 const key=first.holdPendingExport({identity:{projectId:'dixon',versionId:'original',documentType:'project'},filename:'report.pdf',blob:new Blob(['private report'])});
 first.updatePendingExport(key,{fileUri:'private/pdf',recordStarted:true,pageCount:42});
 assert.equal([...memory.values()][0].includes('private report'),false);
 const cold=await import('../src/components/library/issuedDocument/pendingIssuedExportStore.js?cold');
 assert.equal(cold.peekPendingExport(key).fileUri,'private/pdf');
 assert.equal(cold.peekPendingExport(key).recordStarted,true);
 assert.equal(cold.peekPendingExport(key).blob,null);
 cold.clearPendingExport(key);assert.equal([...memory.values()][0],'[]');
 delete globalThis.window;
});
