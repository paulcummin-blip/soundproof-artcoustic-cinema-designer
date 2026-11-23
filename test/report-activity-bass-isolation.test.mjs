import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=await mkdtemp(path.join(tmpdir(),'bass-asset-isolation-'));
const output=path.join(dir,'isolated.mjs');
globalThis.__assetTestCalls=[];
await build({stdin:{contents:`export {deleteProjectAsset} from './src/components/projectAssets/deleteProjectAsset.js'; export {subscribeIssuedExportStored} from './src/components/library/issuedExportSignal.js';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:output,logLevel:'silent',plugins:[{name:'isolated-assets',setup(b){
 b.onResolve({filter:/^@\/api\/base44Client$/},()=>({path:'api',namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`export const base44={entities:new Proxy({}, {get(_,key) {if(key!=='ProjectAssetExport')throw Error('Unexpected entity '+key);return {delete:async id=>{globalThis.__assetTestCalls.push(id);}};}})};`}));
 b.onResolve({filter:/^@\//},args=>({path:path.resolve('src',args.path.slice(2)+'.js')}));
}}]});
const m=await import(pathToFileURL(output));
test.after(async()=>{delete globalThis.__assetTestCalls;await rm(dir,{recursive:true});});
test('actual PDF deletion helper touches only the specified asset, with no bass/project/version writes',async()=>{
 const announcements=[];const unsub=m.subscribeIssuedExportStored(id=>announcements.push(id));
 await m.deleteProjectAsset({id:'isolated-test-asset',project_id:'audit-copy'},'export');
 assert.deepEqual(globalThis.__assetTestCalls,['isolated-test-asset']);
 assert.deepEqual(announcements,['audit-copy']);unsub();
});
