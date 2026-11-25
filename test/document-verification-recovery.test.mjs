import { register } from 'node:module';
import assert from 'node:assert/strict';
register('./_mount-loader.mjs', import.meta.url);
const {installBrowserGlobals}=await import('../src/test/mocks/browserGlobals.mjs');
installBrowserGlobals();
const {base44}=await import('../src/test/mocks/base44ClientMock.mjs');
const React=await import('react');
const {default:Renderer,act}=await import('react-test-renderer');
const {useDocumentWorkflowStatus}=await import('../src/components/documentWorkflow/useDocumentWorkflowStatus.js');
const {default:DocumentCard}=await import('../src/components/documentWorkflow/DocumentCard.jsx');
const records=['project','speaker_design','system_design_summary'].map(document_type=>({
 document_type,version_id:'v1',selected_version_ids:['v1'],file_uri:'private/saved.pdf',
 source_fingerprints:{engineeringFingerprint:'saved'},
}));
const pub=(width=5)=>({report_snapshot:{report_project:{roomDims:{widthM:width,lengthM:6,heightM:2.5}}}});
let pending, calls=0, mode='delay';
base44.entities={
 ProjectAssetExport:{filter:async()=>({items:records})},
 ProjectVersion:{filter:async()=>({items:[{id:'v1',published_fingerprint:'current'}]})},
 ProjectAnalysisCache:{filter:async(query,options)=>{
  calls++; assert.deepEqual(query,{project_id:'p1',version_id:'v1'});
  assert.deepEqual(options.fields,['engineering_publications']);
  if(mode==='delay')return new Promise((resolve,reject)=>{pending={resolve,reject}});
  if(mode==='error')throw Object.assign(new Error('unavailable'),{status:503});
  return {items:[{engineering_publications:{saved:pub(),...(mode==='missing'?{}:{current:pub(mode==='changed'?6:5)})}}]};
 }},
};
let api;function Host(){api=useDocumentWorkflowStatus({projectId:'p1',versionId:'v1'});return null}
let tree;await act(async()=>{tree=Renderer.create(React.createElement(Host))});
assert.equal(api.loading,true);const started=calls;
await act(async()=>{api.retry();api.retry()});assert.equal(calls,started,'retry cannot discard pending source read');
const card=Renderer.create(React.createElement(DocumentCard,{number:'1',label:'Technical Report',state:'verification_unavailable',verifying:api.loading,canAct:true,actLabel:'Retry verification',onAct:api.retry}));
assert.match(JSON.stringify(card.toJSON()),/Checking sources/);
assert.doesNotMatch(JSON.stringify(card.toJSON()),/Retry verification/);
await act(async()=>pending.reject(Object.assign(new Error('offline'),{status:503})));
assert.equal(api.loading,false);assert.match(api.verificationError,/503/);
assert.equal(api.technicalReport.state,'verification_unavailable');
mode='ok';await act(async()=>api.retry());
assert.equal(calls,started+1);assert.equal(api.verificationError,null);
for(const key of ['technicalReport','speakerDesign','clientProposal'])assert.equal(api[key].state,'ready');
mode='missing';await act(async()=>api.retry());assert.equal(api.technicalReport.state,'verification_unavailable');
mode='changed';await act(async()=>api.retry());assert.equal(api.technicalReport.state,'outdated');
mode='ok';await act(async()=>api.retry());assert.equal(api.technicalReport.state,'ready');
act(()=>{tree.unmount();card.unmount()});
await act(async()=>{tree=Renderer.create(React.createElement(Host))});
assert.equal(api.clientProposal.state,'ready','remount resolves stored equivalent sources');
act(()=>tree.unmount());
console.log('PASS: pending read, repeated retry guard, explicit failure, fresh retry recovery, missing evidence, material change and remount.');
