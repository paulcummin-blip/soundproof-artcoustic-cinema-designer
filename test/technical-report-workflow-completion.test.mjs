import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { readWizardDraft, writeWizardDraft, clearWizardDraft } from '../src/components/proposal/wizard/proposalWizardDraft.js';
import { resolveWorkflowStatus } from '../src/components/documentWorkflow/documentWorkflowStatus.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
async function loadModule(path, mocks, globals = {}) {
  const context = vm.createContext({ console, setTimeout, clearTimeout, ...globals });
  const source = new vm.SourceTextModule(read(path), { context });
  await source.link((specifier) => {
    assert.ok(specifier in mocks, 'Unmocked dependency: ' + specifier);
    const values = mocks[specifier];
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await source.evaluate();
  return source.namespace;
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function exportFixture(store) {
  const values = [];
  let prints = 0, closes = 0;
  const mocks = {
    react: { useState: value => { const i = values.length; values.push(value); return [value, next => { values[i] = typeof next === 'function' ? next(values[i]) : next; }]; },
      useCallback: fn => fn, useRef: value => ({current:value}), useEffect() {} },
    '@/components/report/reportPdfTitle': { buildProjectReportTitle: () => 'Sound Proof Technical Report - Audit - Original Design' },
    '@/components/report/printDocumentTitle': { applyPrintDocumentTitle() {}, restorePrintDocumentTitle() {} },
    '@/components/report/reportPrintWindow': { findReportPrintNode: () => ({}), openReportPrintWindow: () => ({}),
      printReportInWindow: async () => { prints++; return { printed:true }; }, closeReportPrintWindow: () => { closes++; } },
    '@/components/report/printReadiness': { PRINT_NOT_READY_MESSAGE:'Not ready', describePrintReadinessFailure: () => 'Not ready', preparePrintDocument: async () => ({ready:true}) },
    '@/components/library/issuedDocument/recordIssuedExport': { snapshotIssuedComposition: () => ({nodeHtml:'<div>Audit</div>'}) },
    '@/components/report/projectReport/storeProjectReportPublication': { storeProjectReportPublication: store, retryPublicationDocument: async () => ({ok:true}), PUBLICATION_DOCUMENT: {PROJECT_REPORT:'project_report',SPEAKER_DESIGN:'speaker_design'} }
  };
  const mod = await loadModule('src/components/report/client/useClientReportPdfExport.js', mocks, {
    window: {}, document: {body:{classList:{remove(){},add(){}}}},
    Image: class { set src(value) { queueMicrotask(() => this.onload()); } },
  });
  const flow = mod.useClientReportPdfExport({activePageCount:1, projectName:'Audit',logoUrl:'logo',issuedDocument:{projectId:'p1',versionId:'v1',documentType:'project'}});
  return {flow, values, prints:()=>prints, closes:()=>closes};
}
test('Print/download cannot precede durable storage; exact project/version reaches storage', async () => {
  const pending = deferred(); let input;
  const f = await exportFixture(params => { input=params; return pending.promise; });
  const run=f.flow.handleExport(); let settled=false; run.then(()=>{settled=true;});
  await new Promise(r=>setImmediate(r));
  assert.equal(f.prints(),0); assert.equal(settled,false);
  assert.equal(f.values[2].status,'storing');
  assert.equal(input.projectId,'p1'); assert.equal(input.versionId,'v1');
  pending.resolve({complete:true,failed:[],stored:['project_report']});
  await run; assert.equal(f.prints(),1); assert.equal(f.values[2].status,'complete');
});
test('Storage rejection preserves actionable failure and never opens print', async () => {
  const f=await exportFixture(async()=>{throw new Error('Asset registration refused');});
  await f.flow.handleExport();
  assert.equal(f.prints(),0); assert.equal(f.closes(),1);
  assert.equal(f.values[2].status,'incomplete');
  assert.match(f.values[2].failed[0].error,/registration refused/);
  assert.equal(f.values[0],false);
});
test('Reported partial storage failure never counts as creation', async () => {
  const f=await exportFixture(async()=>({complete:false,stored:['speaker_design'],failed:[{key:'project_report',error:'Upload failed'}]}));
  await f.flow.handleExport(); assert.equal(f.prints(),0); assert.equal(f.values[2].status,'incomplete');
});
test('A companion without a Technical Report composition cannot complete publication', async () => {
  let calls=0;
  const mod=await loadModule('src/components/report/projectReport/storeProjectReportPublication.js', {
    '@/components/library/issuedDocument/recordIssuedExport':{storeIssuedDocument:async()=>{calls++;},retryIssuedExportStorage:async()=>({ok:true})},
    '@/components/library/issuedDocument/pendingIssuedExportStore':{clearPendingExport(){},pendingExportKey:()=>'',peekPendingExport:()=>null},
    '@/components/report/speakerDesign/ensureSpeakerDesignForVersion':{ensureSpeakerDesignForVersion:async()=>{calls++;return {status:'stored'};}},
    '@/components/library/issuedDocument/exportStorageFailure':{asExportStorageError:e=>e,buildExportStorageDiagnostic:x=>x},
    '@/components/library/issuedDocument/exportStorageDiagnosticLog':{writeExportStorageDiagnostic(){}},
    '@/components/proposal/sourceAuthority/reportSourceSignal':{notifyReportSourceStored(){}}
  });
  const result=await mod.storeProjectReportPublication({speakerDesignParams:{projectId:'p1',groups:[{}]}});
  assert.equal(result.complete,false); assert.equal(result.failed[0].key,'project_report'); assert.equal(calls,0);
});
test('A draft can only resume for its own explicitly requested project/version', () => {
  const memory=new Map(); globalThis.window={sessionStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}};
  writeWizardDraft({projectId:'holborn',selectedVersionIds:['h1'],clientBrief:'Showroom',clarificationAnswers:{q1:{status:'answered',answer:'Holborn'}}});
  assert.equal(readWizardDraft({projectId:'doran',versionId:'d1'}),null);
  assert.equal(readWizardDraft({versionId:'d1'}),null);
  assert.equal(readWizardDraft({projectId:'holborn',versionId:'h2'}),null);
  assert.equal(readWizardDraft({projectId:'holborn',versionId:'h1'}).clientBrief,'Showroom');
  clearWizardDraft(); delete globalThis.window;
});
test('Duplicate/missing/wrong-version files cannot create false readiness; final deletion relocks proposal', () => {
  const file=(type,patch={})=>({document_type:type,version_id:'v1',file_uri:'stored.pdf',source_fingerprints:{engineeringFingerprint:'fp1'},...patch});
  const status=exports=>resolveWorkflowStatus({exports,versionId:'v1',engineeringFingerprint:'fp1'});
  const speaker=file('speaker_design'),report=file('project');
  assert.equal(status([speaker,report,report]).proposalAvailable,true);
  assert.equal(status([speaker,report]).proposalAvailable,true);
  assert.equal(status([speaker]).technicalReport.state,'not_created');
  assert.equal(status([speaker]).proposalAvailable,false);
  for(const patch of [{version_id:'v2'},{file_uri:null},{source_fingerprints:{engineeringFingerprint:'old'}}])
    assert.equal(status([speaker,file('project',patch),file('project',patch)]).proposalAvailable,false);
});
