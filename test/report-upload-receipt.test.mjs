import test from 'node:test';
import assert from 'node:assert/strict';
import { handleReportUpload } from '../base44/shared/reportUploadRecovery.js';
import { reportUploadReceiptApi } from '../src/components/library/issuedDocument/reportUploadReceipt.js';
import { saveIssuedArtifact } from '../src/components/library/issuedDocument/issuedExportDurability.js';

function fixture() {
  const op = { id: 'op-record', operation_id: 'internal-report-uuid', operation_type: 'report_export', initiated_by: 'owner', account_id: 'account', project_id: 'internal', version_id: 'original', report_upload: null };
  const user = { id: 'owner', role: 'admin' };
  const assets = []; const files = new Map(); const calls = { upload: 0, create: 0, capture: 1, put: 0 };
  const get = key => key.split('.').reduce((v,k) => v?.[k],op);
  const set = (key,value) => { const parts=key.split('.'); let at=op; while(parts.length>1){const k=parts.shift();at=at[k]??=( {} );}at[parts[0]]=structuredClone(value); };
  const operations = {
    async filter(query) { return (query.id === op.id || query.operation_id === op.operation_id) ? [structuredClone(op)] : []; },
    async updateMany(query, update) {
      assert.equal(query.id, op.id, 'claims must name a plain single id');
      const matches = Object.entries(query).every(([key,v])=> v && typeof v === 'object' ? ('$exists' in v ? (get(key)!==undefined)===v.$exists : v.$in.includes(get(key))) : (v === null ? get(key) == null : get(key)===v));
      if(!matches) return {updated:0};
      for(const [key,value] of Object.entries(update.$set))set(key,value);
      return {updated:1};
    },
  };
  const caller = { entities: { Project: {filter:async()=>[{id:'internal',account_id:'account'}]}, ProjectVersion:{filter:async()=>[{id:'original'}]} }, integrations: {Core:{UploadPrivateFile:async({file})=>{
    calls.upload++; const uri='private/report-'+calls.upload; files.set(uri,new Uint8Array(await file.arrayBuffer())); return {file_uri:uri};
  }}}};
  const service={entities:{MonitoredOperation:operations}};
  const entry={issued:{projectId:'internal',versionId:'original',documentType:'project',uploadOperationId:op.operation_id,selectedVersionIds:['original'],sourceRecordId:'frozen',sourceFingerprints:{engineeringFingerprint:'unchanged'}},filename:'Sound Proof Technical Report.pdf',blob:new Blob(['%PDF-1.7 completed PDF bytes']),pageCount:35,attemptStartedAt:'2026-11-26T00:00:00.000Z'};
  const fixture={op,user,assets,files,calls,caller,service,entry,operations,dropBefore:false,dropAfter:false,recordRefused:false,recordResponseLost:false};
  const invoke=async value=>{
    const multipart=value instanceof FormData; const body=multipart?Object.fromEntries(value):value;
    if(body.action==='report_upload_put'){
      calls.put++;
      if(fixture.dropBefore){fixture.dropBefore=false;throw Error('browser offline before server receives request');}
    }
    const data=await handleReportUpload({service,caller,user,body,file:multipart?value.get('file'):value.file});
    if(body.action==='report_upload_put'&&fixture.dropAfter){fixture.dropAfter=false;throw Error('browser lost completed upload response');}
    return {data};
  };
  fixture.invoke=invoke;
  fixture.save=async(e=entry)=>saveIssuedArtifact({entry:e,timeoutMs:50,update:patch=>Object.assign(e,patch),api:{
    ...reportUploadReceiptApi({invoke,entry:e,update:patch=>Object.assign(e,patch)}),
    find:async()=>assets,
    create:async row=>{calls.create++;if(fixture.recordRefused){fixture.recordRefused=false;throw Object.assign(Error('record validation refused'),{status:422});} const saved={...row,id:'asset'}; assets.push(saved); if(fixture.recordResponseLost){fixture.recordResponseLost=false;throw Error('lost record response');}return saved;},
  },verifyFile:async(uri,blob)=>{assert.ok(files.has(uri));if(blob)assert.deepEqual(files.get(uri),new Uint8Array(await blob.arrayBuffer()));}});
  return fixture;
}

test('clean creation retains frozen identity and verifies one stored PDF/asset',async()=>{
  const f=fixture();const row=await f.save();assert.equal(row.id,'asset');assert.equal(row.source_fingerprints.engineeringFingerprint,'unchanged');assert.equal(row.page_count,35);assert.equal(f.calls.upload,1);assert.equal(f.assets.length,1);
});
test('request interrupted before upload recovers exact PDF with no capture',async()=>{
  const f=fixture();const blob=f.entry.blob;f.dropBefore=true;await assert.rejects(f.save(),/Retry storage/);assert.equal(f.calls.upload,0);await f.save();assert.equal(f.entry.blob,blob);assert.equal(f.calls.upload,1);assert.equal(f.calls.capture,1);assert.equal(f.assets.length,1);
});
test('successful upload with lost response recovers receipt without uploading again',async()=>{
  const f=fixture();f.dropAfter=true;await assert.rejects(f.save(),/Retry storage/);assert.equal(f.op.report_upload.state,'stored');await f.save();assert.equal(f.calls.put,1);assert.equal(f.calls.upload,1);assert.equal(f.assets.length,1);
});
test('record refusal retries only record, retains the verified storage reference',async()=>{
  const f=fixture();f.recordRefused=true;await assert.rejects(f.save(),/record validation refused/);await f.save();assert.equal(f.calls.upload,1);assert.equal(f.calls.create,2);assert.equal(f.assets.length,1);assert.equal(f.calls.capture,1);
});
test('lost record response reconciles exactly one completed record',async()=>{
  const f=fixture();f.recordResponseLost=true;await f.save();await f.save();assert.equal(f.calls.create,1);assert.equal(f.assets.length,1);
});
test('repeated retries after success do not duplicate records or uploads',async()=>{
  const f=fixture();f.dropAfter=true;await assert.rejects(f.save());for(let i=0;i<5;i++)await f.save();assert.equal(f.calls.upload,1);assert.equal(f.calls.create,1);
});
test('reload after lost upload response recovers using metadata without PDF bytes',async()=>{
  const f=fixture();f.dropAfter=true;await assert.rejects(f.save());const restored={...f.entry,blob:null,uploadOperation:undefined};await f.save(restored);assert.equal(f.calls.upload,1);assert.equal(f.assets.length,1);
});
test('storage-side uncertainty never permits a second private upload',async()=>{
  const f=fixture();f.caller.integrations.Core.UploadPrivateFile=async()=>{f.calls.upload++;throw Error('upstream response lost');};await assert.rejects(f.save());for(let i=0;i<3;i++)await assert.rejects(f.save(),/not yet established/);assert.equal(f.calls.upload,1);assert.equal(f.assets.length,0);
});
test('storage explicit refusal permits safe retry of retained bytes',async()=>{
  const f=fixture();const original=f.caller.integrations.Core.UploadPrivateFile;f.caller.integrations.Core.UploadPrivateFile=async()=>{throw Object.assign(Error('refused'),{status:403});};await assert.rejects(f.save());f.caller.integrations.Core.UploadPrivateFile=original;await f.save();assert.equal(f.calls.upload,1);assert.equal(f.assets.length,1);
});
test('delayed concurrent upload requests are atomically claimed once',async()=>{
  const f=fixture();const api=reportUploadReceiptApi({invoke:f.invoke,entry:f.entry,update:p=>Object.assign(f.entry,p)});await api.reconcileUpload();const results=await Promise.allSettled([api.upload(f.entry.blob),api.upload(f.entry.blob)]);assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(f.calls.upload,1);await f.save();assert.equal(f.assets.length,1);
});
test('same operation refuses different PDF bytes',async()=>{
  const f=fixture();const api=reportUploadReceiptApi({invoke:f.invoke,entry:f.entry,update:p=>Object.assign(f.entry,p)});await api.reconcileUpload();await assert.rejects(handleReportUpload({service:f.service,caller:f.caller,user:f.user,body:{action:'report_upload_prepare',operation_id:f.op.operation_id,sha256:'a'.repeat(64),size:f.entry.blob.size}}),/IDENTITY_CONFLICT/);assert.equal(f.calls.upload,0);
});
test('disabled caller and inaccessible project cannot recover storage references',async()=>{
  const f=fixture();f.user.role='user';f.user.account_id='account';f.user.access_level='FULL_ACCESS';f.user.soundproof_access_enabled=false;await assert.rejects(f.save(),/FORBIDDEN/);f.user.soundproof_access_enabled=true;f.caller.entities.Project.filter=async()=>[];await assert.rejects(f.save(),/FORBIDDEN/);assert.equal(f.calls.upload,0);
});
test('receipt-write failure retains the known reference for legacy caller recovery',async()=>{
  const f=fixture();const update=f.operations.updateMany;f.operations.updateMany=async(q,u)=>{if(u.$set['report_upload.state']==='stored')throw Error('database unavailable');return update(q,u);};await assert.rejects(f.save());f.operations.updateMany=update;assert.ok(f.entry.fileUri);await f.save();assert.equal(f.calls.upload,1);assert.equal(f.files.size,1);assert.equal(f.assets.length,1);
});


test('held completed PDFs are not silently evicted by additional attempts',async()=>{
  const store=await import('../src/components/library/issuedDocument/pendingIssuedExportStore.js?retention-test');
  const keys=[];for(let i=0;i<5;i++)keys.push(store.holdPendingExport({identity:{projectId:'internal-'+i,documentType:'project'},filename:'report.pdf',blob:new Blob(['%PDF-held'])}));
  assert.throws(()=>store.holdPendingExport({identity:{projectId:'sixth',documentType:'project'},filename:'report.pdf',blob:new Blob(['%PDF-sixth'])}),/earlier PDF/);
  assert.equal(store.heldPendingExportCount(),5);for(const key of keys){assert.ok(store.peekPendingExport(key).blob);store.clearPendingExport(key);}
});
