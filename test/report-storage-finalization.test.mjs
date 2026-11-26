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
    calls.upload++; const uri='mp/private/6a1166c68ddc81e5ea2cdf6b/app-users/owner/file'+calls.upload+'_SoundProofReport-'+op.operation_id+'.pdf'; files.set(uri,new Uint8Array(await file.arrayBuffer())); return {file_uri:uri};
  }}}};
  const service={entities:{MonitoredOperation:operations}};
  const entry={issued:{recordRecoveryVersion:1,accountId:'account',projectId:'internal',versionId:'original',documentType:'project',uploadOperationId:op.operation_id,selectedVersionIds:['original'],sourceRecordId:'frozen',sourceFingerprints:{engineeringFingerprint:'unchanged'}},filename:'Sound Proof Technical Report.pdf',blob:new Blob(['%PDF-1.7 completed PDF bytes']),pageCount:35,attemptStartedAt:'2026-11-26T00:00:00.000Z'};
  const fixture={op,user,assets,files,calls,caller,service,entry,operations,dropBefore:false,dropAfter:false,recordRefused:false,recordResponseLost:false};
  const invoke=async value=>{
    const multipart=value instanceof FormData; const body=multipart?Object.fromEntries(value):value;
    if(body.action==='report_upload_put'){
      calls.put++;
      if(fixture.dropBefore){fixture.dropBefore=false;throw Error('browser offline before server receives request');}
    }
    if(body.action==='report_record_put'&&fixture.dropRecordBefore){fixture.dropRecordBefore=false;throw Error('offline before record endpoint');}
    const data=await handleReportUpload({service,caller,user,body,file:multipart?value.get('file'):value.file});
    if(body.action==='report_upload_put'&&fixture.dropAfter){fixture.dropAfter=false;throw Error('browser lost completed upload response');}
    if(body.action==='report_record_put'&&fixture.dropRecordAfter){fixture.dropRecordAfter=false;throw Error('lost record endpoint response');}
    return {data};
  };
  fixture.invoke=invoke;
  caller.entities.ProjectAssetExport={filter:async()=>assets,create:async row=>{
    calls.create++;
    if(fixture.recordRefused){fixture.recordRefused=false;throw Object.assign(Error('refused'),{status:422});}
    if(fixture.recordUnknown){throw Error('upstream outcome unknown');}
    const saved={...row,id:'asset'};assets.push(saved);
    if(fixture.recordResponseLost){fixture.recordResponseLost=false;throw Error('lost internal response');}
    return saved;
  }};
  caller.integrations.Core.CreateFileSignedUrl=async({file_uri})=>({signed_url:'https://media.base44.com/private?uri='+encodeURIComponent(file_uri)});
  fixture.fakeFetch=async url=>new Response(files.get(new URL(url).searchParams.get('uri')));

  fixture.save=async(e=entry)=>saveIssuedArtifact({entry:e,timeoutMs:50,update:patch=>Object.assign(e,patch),api:{
    ...reportUploadReceiptApi({invoke,entry:e,update:patch=>Object.assign(e,patch)}),
    find:async()=>assets,

  },verifyFile:async(uri,blob)=>{assert.ok(files.has(uri));if(blob)assert.deepEqual(files.get(uri),new Uint8Array(await blob.arrayBuffer()));}});
  return fixture;
}


test('modern clean save has one durable claim and exactly one original asset',async()=>{
 const f=fixture();await f.save();assert.equal(f.op.report_record.state,'stored');assert.equal(f.calls.create,1);assert.equal(f.calls.upload,1);
});
test('record request interrupted before server receipt is safely retried without upload',async()=>{
 const f=fixture();f.dropRecordBefore=true;await assert.rejects(f.save(),/offline/);assert.equal(f.calls.create,0);
 await f.save();assert.equal(f.calls.create,1);assert.equal(f.calls.upload,1);assert.equal(f.assets.length,1);
});
test('lost record endpoint response reconciles original asset',async()=>{
 const f=fixture();f.dropRecordAfter=true;await f.save();await f.save();assert.equal(f.calls.create,1);assert.equal(f.assets.length,1);
});
test('lost internal database acknowledgement reconciles original asset',async()=>{
 const f=fixture();f.recordResponseLost=true;await f.save();assert.equal(f.calls.create,1);assert.equal(f.assets.length,1);
});
test('explicit record rejection permits retry after cause is removed',async()=>{
 const f=fixture();f.recordRefused=true;await assert.rejects(f.save(),/refused/);assert.equal(f.op.report_record.state,'refused');
 await f.save();assert.equal(f.calls.create,2);assert.equal(f.calls.upload,1);assert.equal(f.assets.length,1);
});
test('unknown upstream record outcome is explicit and cannot cause duplicate writes',async()=>{
 const f=fixture();f.recordUnknown=true;await assert.rejects(f.save(),/uncertain/);
 for(let i=0;i<3;i++) await assert.rejects(f.save(),/administrator recovery/);
 assert.equal(f.op.report_record.state,'unknown');assert.equal(f.calls.create,1);assert.equal(f.calls.upload,1);
});
test('repeated Retry actions after successful recovery do not create extra records',async()=>{
 const f=fixture();f.dropRecordBefore=true;await assert.rejects(f.save());for(let i=0;i<5;i++)await f.save();assert.equal(f.calls.create,1);assert.equal(f.calls.upload,1);
});
test('reload without PDF bytes can finish the same guarded record save',async()=>{
 const f=fixture();f.dropRecordBefore=true;await assert.rejects(f.save());
 const cold={...f.entry,blob:null,recordOperation:undefined,uploadOperation:undefined};await f.save(cold);assert.equal(f.calls.create,1);assert.equal(f.calls.upload,1);
});
test('receipt-write failure retains URI and repairs the receipt after checksum verification',async t=>{
 const f=fixture();t.mock.method(globalThis,'fetch',f.fakeFetch);
 const update=f.operations.updateMany;f.operations.updateMany=async(q,u)=>{if(u.$set['report_upload.state']==='stored')throw Error('receipt unavailable');return update(q,u);};
 await assert.rejects(f.save(),/file reference is retained/);assert.ok(f.entry.fileUri);assert.equal(f.assets.length,0);
 f.operations.updateMany=update;await f.save();assert.equal(f.op.report_upload.state,'stored');assert.equal(f.calls.upload,1);assert.equal(f.assets.length,1);
});
test('receipt-write failure plus lost browser response remains uncertain without reupload',async()=>{
 const f=fixture();const update=f.operations.updateMany;f.operations.updateMany=async(q,u)=>{if(u.$set['report_upload.state']==='stored')throw Error('receipt unavailable');return update(q,u);};f.dropAfter=true;
 await assert.rejects(f.save());f.operations.updateMany=update;await assert.rejects(f.save(),/still running/);assert.equal(f.calls.upload,1);assert.equal(f.assets.length,0);assert.equal(f.entry.fileUri,undefined);
});
test('receipt recovery rejects wrong PDF bytes',async t=>{
 const f=fixture();const update=f.operations.updateMany;f.operations.updateMany=async(q,u)=>{if(u.$set['report_upload.state']==='stored')throw Error('receipt unavailable');return update(q,u);};await assert.rejects(f.save());f.operations.updateMany=update;
 t.mock.method(globalThis,'fetch',async()=>new Response('%PDF-WRONG'));
 await assert.rejects(f.save(),/BYTES_MISMATCH/);assert.equal(f.calls.create,0);assert.equal(f.calls.upload,1);
});
test('receipt recovery rejects a reference belonging to another operation',async()=>{
 const f=fixture();const update=f.operations.updateMany;f.operations.updateMany=async(q,u)=>{if(u.$set['report_upload.state']==='stored')throw Error('receipt unavailable');return update(q,u);};await assert.rejects(f.save());f.operations.updateMany=update;await assert.rejects(f.invoke({action:'report_upload_recover',operation_id:f.op.operation_id,sha256:f.entry.uploadSha256,size:f.entry.uploadSize,file_uri:f.entry.fileUri.replace(f.op.operation_id,'different-operation')}),/INVALID_RECOVERY_FILE/);assert.equal(f.calls.create,0);
});
test('concurrent finalization calls acquire one existing-operation claim',async()=>{
 const f=fixture();f.dropRecordBefore=true;await assert.rejects(f.save());
 const {buildIssuedDocumentRow}=await import('../src/components/library/issuedDocument/issuedDocumentRowPayload.js');
 const row=buildIssuedDocumentRow({issued:f.entry.issued,filename:f.entry.filename,pageCount:f.entry.pageCount,fileUri:f.entry.fileUri,exportedAt:f.entry.attemptStartedAt});
 await Promise.all([f.invoke({action:'report_record_put',operation_id:f.op.operation_id,row}),f.invoke({action:'report_record_put',operation_id:f.op.operation_id,row})]);assert.equal(f.calls.create,1);assert.equal(f.assets.length,1);
});

test('guarded finalization rejects a different project and cannot overwrite a completed document',async()=>{
 const f=fixture();await f.save();const row={...f.assets[0]};delete row.id;
 await assert.rejects(f.invoke({action:'report_record_put',operation_id:f.op.operation_id,row:{...row,project_id:'other-project'}}),/IDENTITY/);
 await assert.rejects(f.invoke({action:'report_record_put',operation_id:f.op.operation_id,row:{...row,source_fingerprints:{engineeringFingerprint:'changed'}}}),/IDENTITY/);
 assert.equal(f.calls.create,1);assert.equal(f.assets.length,1);
});
