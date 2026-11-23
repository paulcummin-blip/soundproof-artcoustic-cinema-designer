import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
const require=createRequire(import.meta.url);
test('first generation waits for confirmed persistence, never calls writer after failure, and forwards retry revision',async()=>{
let snapshot={id:'test',generated_at:'test-generation',payload:{},source_fingerprints:{}};
let resolveReview,rejectReview;const calls=[];
globalThis.window={localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},dispatchEvent:()=>{}};
globalThis.__contextSequencingApi={entities:{ReportSnapshot:{filter:async()=>({items:[snapshot]})}},functions:{invoke:async(name,body)=>{calls.push({name,body});snapshot={...snapshot,payload:{design_intent:{status:'accepted'}}};return{data:{ok:true}}}}};
let source=await fs.readFile(new URL('../src/components/report/projectReport/useAutoDesignIntent.js',import.meta.url),'utf8');
source=source.replace("from 'react'","from "+JSON.stringify(pathToFileURL(require.resolve('react')).href))
.replace("import { base44 } from '@/api/base44Client';","const base44 = globalThis.__contextSequencingApi;");
for(const name of ['autoDesignIntentStorage','autoDesignIntentGate'])source=source.replace("from './"+name+"'","from "+JSON.stringify(new URL('../src/components/report/projectReport/'+name+'.js',import.meta.url).href));
const {default:useIntent}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const before=()=>new Promise((resolve,reject)=>{resolveReview=resolve;rejectReview=reject;});let api,view;
function Host(){api=useIntent({projectId:'isolated-sequence',versionId:'v',enabled:true,onBeforeGenerate:before});return null;}
try{
await act(async()=>{view=Renderer.create(React.createElement(Host));});
await act(async()=>{await new Promise(resolve=>setTimeout(resolve,650));});
assert.equal(calls.length,0,'no writer before save completes');
await act(async()=>{rejectReview(Error('save unsuccessful'));});
assert.equal(calls.length,0,'no writer after unsuccessful save');assert.equal(api.status,'failed');
let pending;await act(async()=>{pending=api.retry();});
assert.equal(calls.length,0,'retry also awaits persistence');
await act(async()=>{resolveReview({contextRevision:'dc2:confirmed:revision',skippedQuestionIds:[]});await pending;});
assert.equal(calls.length,1);assert.equal(calls[0].name,'generateReportDesignIntent');assert.equal(calls[0].body.context_revision,'dc2:confirmed:revision');assert.equal(api.status,'complete');
}finally{await act(async()=>view?.unmount());delete globalThis.window;delete globalThis.__contextSequencingApi;}
});
