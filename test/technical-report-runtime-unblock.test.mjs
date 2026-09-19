import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { create, act } from 'react-test-renderer';

const require = createRequire(import.meta.url);
const root = process.cwd();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'report-runtime-'));
const reportSource = fs.readFileSync('src/pages/RP22Report.jsx', 'utf8');
async function bundle(entry, name) {
  const outfile = path.join(scratch, name + '.cjs');
  await build({
    entryPoints: [entry], outfile, bundle: true, platform: 'node', format: 'cjs',
    logLevel: 'silent',
    plugins: [{ name: 'runtime-test-dependencies', setup(b) {
      b.onResolve({ filter: /^react$/ }, () => ({ path: require.resolve('react'), external: true }));
      b.onResolve({ filter: /^@\/api\/base44Client$/ }, () => ({ path: 'sdk', namespace: 'test-sdk' }));
      b.onLoad({ filter: /.*/, namespace: 'test-sdk' }, () => ({ contents: 'export const base44 = globalThis.__reportRuntimeSdk;' }));
      b.onResolve({ filter: /^@\// }, args => {
        const base = path.join(root, 'src', args.path.slice(2));
        const resolved = [base, base+'.js', base+'.jsx'].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
        return resolved ? { path: resolved } : null;
      });
    }}],
  });
  return require(outfile);
}

const requests = [];
globalThis.__reportRuntimeSdk = { entities: { ProjectAnalysisCache: { filter(filter) {
  return new Promise((resolve, reject) => requests.push({ filter, resolve, reject }));
}}}};
const store = await bundle('src/components/room/bass/completedBassResultStore.js', 'store');
const versions = await bundle('src/lib/bassAuthorityVersion.js', 'versions');
function uncalculatedRecord() {
 return [{ completed_cache_version: versions.COMPLETED_BASS_CACHE_VERSION,
 instance_authority_version: versions.INSTANCE_AUTHORITY_VERSION,
 metric_schema_version: versions.RP22_BASS_METRIC_SCHEMA_VERSION,
 status: 'uncalculated', current_fingerprint: null, completed_by_fingerprint: {} }];
}
function Probe({ version, snapshots }) {
 const snapshot = store.useCompletedBassAuthority('project', version);
 snapshots[version] = snapshot;
 return null;
}

test('mounted consumers hydrate exact project/version once and publish settlement to the subscribed entry', async () => {
 store._resetCompletedBassStoreForTest(); requests.length = 0;
 const snapshots = {}; let tree;
 await act(async () => { tree = create(React.createElement(React.Fragment, null,
   React.createElement(Probe, { version: 'v1', snapshots }),
   React.createElement(Probe, { version: 'v1', snapshots }),
   React.createElement(Probe, { version: 'v2', snapshots }))); });
 assert.deepEqual(requests.map(r => r.filter), [
   { project_id: 'project', version_id: 'v1' }, { project_id: 'project', version_id: 'v2' }]);
 assert.equal(snapshots.v1.hydrationSettled, false);
 await act(async () => { requests[0].resolve(uncalculatedRecord()); });
 assert.equal(snapshots.v1.projectId, 'project::v1');
 assert.equal(snapshots.v1.hydrationSettled, true);
 assert.equal(snapshots.v1.authorityStatus, 'UNCALCULATED');
 assert.equal(snapshots.v1.contract, null);
 assert.equal(snapshots.v2.hydrationSettled, false);
 await act(async () => { requests[1].resolve(uncalculatedRecord()); });
 assert.equal(snapshots.v2.hydrationSettled, true);
 await act(async () => tree.unmount());
});

test('failed hydration settles visibly instead of leaving a forever-loading subscriber', async () => {
 store._resetCompletedBassStoreForTest(); requests.length = 0;
 const snapshots = {}; let tree;
 await act(async () => { tree = create(React.createElement(Probe, {version:'error', snapshots})); });
 await act(async () => { requests[0].reject(new Error('test network failure')); });
 assert.equal(snapshots.error.hydrationSettled, true);
 assert.equal(snapshots.error.authorityStatus, 'ERROR');
 await act(async () => tree.unmount());
});

test('report render/print gate waits for identity and hydration, not an absent calculation producer', () => {
 const expression = reportSource.match(/const bassReportPending = ([^;]+);/)[1];
 const pending = new Function('projectIdMatch','completedBassAuthority', 'return (' + expression + ')');
 assert.equal(pending(false,{hydrationSettled:true}), true);
 assert.equal(pending(true,{hydrationSettled:false}), true);
 for (const authorityStatus of ['UNCALCULATED','UPDATING','STALE','ERROR','AUTHORITATIVE']) {
   assert.equal(pending(true,{hydrationSettled:true,authorityStatus}), false, authorityStatus);
 }
 assert.match(reportSource, /const showLoadingReport = [^;]*\|\| bassReportPending;/);
});

test('actual report import mounts all three capture effects with the report argument interface', async () => {
 const specifier = reportSource.match(/import \{ usePlanCapture \} from ['"]([^'"]+)['"]/)[1];
 const entry = path.join(root, 'src', specifier.replace(/^@\//,''));
 const resolved = [entry, entry+'.js', entry+'.jsx'].find(p=>fs.existsSync(p));
 const { usePlanCapture } = await bundle(resolved, 'capture');
 const previousDocument = globalThis.document, previousTimeout = globalThis.setTimeout, previousClear = globalThis.clearTimeout;
 const selectors = [], queue = [], result = {};
 globalThis.document = { querySelector(selector) { selectors.push(selector); return null; } };
 globalThis.setTimeout = fn => { queue.push(fn); return queue.length; };
 globalThis.clearTimeout = () => {};
 let tree;
 function Capture() {
   const [clean, setClean] = React.useState(null), [dims, setDims] = React.useState(null), [speaker, setSpeaker] = React.useState(null);
   Object.assign(result, {clean,dims,speaker});
   const guard = React.useRef({active:true}), timeout = React.useRef(null);
   usePlanCapture({isPrinting:true,planImageDataUrl:clean,setPlanImageDataUrl:setClean,
     planDimsImageDataUrl:dims,setPlanDimsImageDataUrl:setDims,
     planSpeakerDimsImageDataUrl:speaker,setPlanSpeakerDimsImageDataUrl:setSpeaker,
     setExportStatus:()=>{},exportTimeoutRef:timeout,exportGuardRef:guard,setIsPrinting:()=>{},debugPlanCapture:false});
   return null;
 }
 try {
   act(()=>{tree=create(React.createElement(Capture));});
   assert.deepEqual([...new Set(selectors)], ['[data-plan-capture]','[data-plan-capture-dims]','[data-plan-capture-speaker-dims]']);
   let count=0;
   while(queue.length && count++<100) act(()=>queue.shift()());
   assert.deepEqual(result,{clean:'__SKIP__',dims:'__SKIP__',speaker:'__SKIP__'});
 } finally {
   if(tree) act(()=>tree.unmount());
   globalThis.document=previousDocument; globalThis.setTimeout=previousTimeout;globalThis.clearTimeout=previousClear;
 }
});
process.on('exit',()=>fs.rmSync(scratch,{recursive:true,force:true}));
