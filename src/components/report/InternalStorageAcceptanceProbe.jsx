import React, {useRef,useState} from 'react';
import {base44} from '@/api/base44Client';
import {saveIssuedArtifact} from '@/components/library/issuedDocument/issuedExportDurability.js';
import {reportUploadReceiptApi} from '@/components/library/issuedDocument/reportUploadReceipt.js';
import {ensureReportRegistration} from '@/components/report/client/reportOperationRegistration.js';
const projectId='6b076940407160e6968fc580',versionId='6b07695b71633ee505553f72';
function pdf(){
 const text='BT /F1 12 Tf 40 760 Td (INTERNAL BROWSER RECOVERY TEST ONLY) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+text.length+' >>\nstream\n'+text+'\nendstream'];
 let out='%PDF-1.4\n', offsets=[];
 objects.forEach((o,i)=>{offsets.push(out.length);out+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});
 const x=out.length;out+='xref\n0 6\n0000000000 65535 f \n'+offsets.map(v=>String(v).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+x+'\n%%EOF\n';
 return new Blob([out],{type:'application/pdf'});
}
export default function InternalStorageAcceptanceProbe(){
 const entry=useRef(null),attempt=useRef({operationId:crypto.randomUUID()}), gate=useRef(null),counts=useRef({pdf:0,upload:0,record:0,verified:0}),events=useRef([]);
 const [display,setDisplay]=useState('Ready'),[busy,setBusy]=useState(false),[waiting,setWaiting]=useState(false),[armed,setArmed]=useState(true),[metadata,setMetadata]=useState('');
 const gateArmed=useRef(true);
 const log=(event,data={})=>{events.current.push({at:new Date().toISOString(),event,...data});setDisplay(JSON.stringify({operationId:attempt.current.operationId,counts:counts.current,events:events.current},null,2));};
 const guard=async()=>{const u=await base44.auth.me();if(u.id!=='6a1166c68ddc81e5ea2cdf6c'||u.role!=='admin')throw Error('Owner-only internal test');return u;};
 const remember=()=>{if(entry.current){const {blob,uploadOperation,recordOperation,...rest}=entry.current;setMetadata(JSON.stringify(rest));}};
 const invoke=async body=>{
  if(body.action==='report_upload_put'){
   if(gateArmed.current){gateArmed.current=false;setArmed(false);setWaiting(true);log('Paused immediately before real upload request');
    await new Promise(resolve=>{gate.current=resolve;});}
   counts.current.upload++;
  }
  if(body.action==='report_record_put')counts.current.record++;
  log('request',{action:body.action});
  try{const r=await base44.functions.invoke('manageMonitoredOperation',body);log('response',{action:body.action,state:r?.data?.state,recorded:r?.data?.recorded});return r;}
  catch(e){log('request failed',{action:body.action,status:e?.response?.status||null,message:e.message});throw e;}
 };
 const prepare=async()=>{setBusy(true);try{
  const u=await guard();
  await ensureReportRegistration({attempt:attempt.current,invoke,projectId,versionId});
  if(!entry.current){const source=(await base44.entities.ProjectAssetExport.filter({id:'6b08365cb8e4618209590204'}))[0];
   if(source?.project_id!==projectId||source.version_id!==versionId)throw Error('Wrong internal fixture');
   entry.current={issued:{recordRecoveryVersion:1,accountId:source.account_id,projectId,versionId,documentType:'project',uploadOperationId:attempt.current.operationId,selectedVersionIds:[versionId],sourceRecordId:source.source_record_id,sourceFingerprints:source.source_fingerprints,title:'INTERNAL BROWSER RECOVERY TEST ONLY',exportedBy:u.email},filename:'INTERNAL TEST ONLY - browser recovery '+attempt.current.operationId+'.pdf',blob:pdf(),pageCount:1,attemptStartedAt:new Date().toISOString()};
   counts.current.pdf++;remember();
  }log('Registered; one small PDF prepared');
 }catch(e){log('Prepare failed',{message:e.message});}finally{setBusy(false);}};
 const save=async()=>{setBusy(true);const start=performance.now();try{
  await guard();const e=entry.current;if(!e)throw Error('Prepare first');
  const update=p=>{Object.assign(e,p);remember();};
  const saved=await saveIssuedArtifact({entry:e,update,onProgress:p=>log(p.stage),api:{...reportUploadReceiptApi({invoke,entry:e,update}),find:q=>base44.entities.ProjectAssetExport.filter(q,'-created_date',2)},verifyFile:async uri=>{
   const signed=await base44.integrations.Core.CreateFileSignedUrl({file_uri:uri,expires_in:60});const response=await fetch(signed.signed_url);if(!response.ok)throw Error('Download failed');
   const bytes=await response.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
   if(hash!==e.uploadSha256||bytes.byteLength!==e.uploadSize)throw Error('Original PDF bytes differ');counts.current.verified++;
  }});
  const rows=await base44.entities.ProjectAssetExport.filter({project_id:projectId,version_id:versionId,file_uri:e.fileUri});
  log('SUCCESS',{assetId:saved.id,records:rows.length,fileUri:e.fileUri,sha256:e.uploadSha256,bytes:e.uploadSize,elapsedMs:Math.round(performance.now()-start)});
  await invoke({action:'complete',operation_id:attempt.current.operationId});
 }catch(e){log('Recoverable save failure',{message:e.message,elapsedMs:Math.round(performance.now()-start)});}finally{remember();setBusy(false);}};
 const restore=async()=>{try{await guard();const e=JSON.parse(metadata);if(e.issued.projectId!==projectId||e.issued.versionId!==versionId||!e.fileUri)throw Error('Completed internal file only');entry.current={...e,blob:null};attempt.current={operationId:e.issued.uploadOperationId,confirmed:true};gateArmed.current=false;setArmed(false);log('Restored stored-file reference; no PDF buffer');}catch(e){log('Restore failed',{message:e.message});}};
 const download=async()=>{try{await guard();const e=entry.current;if(!e?.fileUri)throw Error('No stored PDF');
 const s=await base44.integrations.Core.CreateFileSignedUrl({file_uri:e.fileUri,expires_in:60});const r=await fetch(s.signed_url);if(!r.ok)throw Error('Download failed');const b=await r.blob();const url=URL.createObjectURL(b);const a=document.createElement('a');a.href=url;a.download=e.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);log('Download requested',{bytes:b.size});
 }catch(e){log('Download failed',{message:e.message});}};
 return <main style={{padding:24,fontFamily:'sans-serif',background:'white',color:'black'}}><h1>Internal storage browser acceptance</h1><p>Existing storage handlers. Internal fixture only. No engineering report capture.</p><p>Pause before upload: {armed?'armed':'off'}</p>
 <button disabled={busy} onClick={prepare}>Prepare registered small PDF</button>{' '}
 <button disabled={busy} onClick={save}>Save or Retry same operation</button>{' '}
 <button disabled={!waiting} onClick={()=>{setWaiting(false);gate.current?.();gate.current=null;}}>Send paused upload request</button>{' '}
 <button disabled={busy} onClick={download}>Download exact stored PDF</button>
 <pre style={{whiteSpace:'pre-wrap',fontSize:12}}>{display}</pre>
 <label>Recovery metadata<textarea style={{width:'100%',height:100}} value={metadata} onChange={e=>setMetadata(e.target.value)}/></label>
 <button disabled={busy} onClick={restore}>Restore completed internal operation</button></main>;
}