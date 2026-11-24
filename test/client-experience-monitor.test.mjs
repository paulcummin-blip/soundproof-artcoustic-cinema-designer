import test from 'node:test';
import assert from 'node:assert/strict';
import {safeDiagnostic,safeRoute,requestFailureWarrantsAlert} from '../base44/shared/systemHealth/clientIncidentPolicy.js';
import {instrumentClientExperience,configureExperienceTransport,setExperienceContext,reportClientFailure,flushExperienceIncidents} from '../src/components/systemHealth/clientExperienceMonitor.js';
test('diagnostics remove credentials, queries, email and quoted payloads',()=>{
 const x=safeDiagnostic('Failed https://example.test/api?token=secret user@example.test Bearer abc password=xyz "client brief"');
 for(const secret of ['token=secret','user@example.test','abc','xyz','client brief'])assert.ok(!x.includes(secret));
 assert.equal(safeRoute('/RoomDesigner?token=abc'),'/RoomDesigner');
});
test('ordinary validation, denied access and cancellation do not trigger infrastructure alerts',()=>{
 for(const status of [400,401,403,404,409,422])assert.equal(requestFailureWarrantsAlert({status}),false);
 assert.equal(requestFailureWarrantsAlert({name:'AbortError'}),false);
 for(const status of [0,408,429,500,503])assert.equal(requestFailureWarrantsAlert({status}),true);
});
test('SDK instrumentation preserves values, rejection and synchronous subscriptions',async()=>{
 const unsubscribe=()=>{};
 const raw={functions:{invoke:async(name)=>({data:name})},entities:{Project:{filter:async()=>['ok'],subscribe:()=>unsubscribe}}};
 const client=instrumentClientExperience(raw);
 assert.deepEqual(await client.functions.invoke('loadProject'),{data:'loadProject'});
 assert.deepEqual(await client.entities.Project.filter({}),['ok']);
 assert.equal(client.entities.Project.subscribe(),unsubscribe);
 raw.entities.Project.filter=async()=>{throw Object.assign(Error('validation'),{status:422});};
 await assert.rejects(client.entities.Project.filter(),/validation/);
});
test('queued incident preserves initiating project/version and deduplicates rerenders',async()=>{
 const sent=[];configureExperienceTransport(async(name,payload)=>{sent.push({name,payload});return{data:{recorded:true}};});
 setExperienceContext({userId:'u',projectId:'project-a',versionId:'version-a',pagePath:'/RoomDesigner'});
 reportClientFailure({code:'RENDER_FAILED',operation:'test',detail:'Render failed'});
 setExperienceContext({userId:'u',projectId:'project-b',versionId:'version-b',pagePath:'/Projects'});
 await flushExperienceIncidents();
 assert.equal(sent[0].payload.project_id,'project-a');assert.equal(sent[0].payload.version_id,'version-a');
 reportClientFailure({code:'RENDER_FAILED',operation:'test',projectId:'project-a',versionId:'version-a',pagePath:'/RoomDesigner'});
 await flushExperienceIncidents();assert.equal(sent.length,1);
});

test('browser and server diagnostic policies stay identical',async()=>{
 const {readFile}=await import('node:fs/promises');
 assert.equal(await readFile(new URL('../src/components/systemHealth/clientIncidentPolicy.js',import.meta.url),'utf8'),await readFile(new URL('../base44/shared/systemHealth/clientIncidentPolicy.js',import.meta.url),'utf8'));
});
