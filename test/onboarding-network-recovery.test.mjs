import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
const appRoot=process.cwd();
const root=process.env.ONBOARDING_CANDIDATE || appRoot;
const read=p=>fs.readFileSync(fs.existsSync(root+'/'+p)?root+'/'+p:appRoot+'/'+p,'utf8');
const rules=await import(appRoot+'/base44/shared/accountAccessRules.js');
const locks=await import(appRoot+'/base44/shared/projectCreationLock.js');
const constants=await import(appRoot+'/base44/shared/pilotPortalConstants.js');
function load(p,deps,names){
 let s=read(p).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export \{[\s\S]*?\};?\n/gm,'')
 .replace('export default async function(req)','async function handler(req)').replace(/\bexport /g,'');
 return new Function(...Object.keys(deps),s+'\nreturn {'+names.join(',')+'};')(...Object.values(deps));
}
const portal=load('base44/shared/portalActivationAuthority.js',{...rules,...locks,...constants,secrets:{get:()=>null}},['startSoundProofTermOnFirstClaim']);
const access=load('base44/shared/accountAccessAuthority.js',{...rules,...portal,validatePilotPortalAccessIfRequired:async()=>({required:false,allowed:true})},['resolveAccountAccess']);
const recovery=load('src/lib/authRecovery.js',{},['retryAuthRequest','isUnexpectedAuthFailure']);
function storage(values={}){const m=new Map(Object.entries(values));return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
function boot(origin,stored={}){
 const window={location:new URL(origin+'/'),localStorage:storage(stored),sessionStorage:storage(),history:{replaceState(){}}};
 const s=read('src/lib/app-params.js').replaceAll('import.meta.env','env').replaceAll('export const ','const ');
 return vm.runInNewContext(s+';appParams',{window,document:{title:''},URLSearchParams,env:{VITE_BASE44_APP_ID:'6a1166c68ddc81e5ea2cdf6b',VITE_BASE44_BACKEND_URL:'https://base44.app'}});
}
function fixture(){
 const data={"Account":[{"id":"synthetic-account","name":"Synthetic onboarding test","status":"inactive","soundproof_eligible":true,"account_type":"dealer","dealer_group":"RICHER_SOUNDS","creation_lock_holder":null,"first_activated_at":null,"soundproof_access_expires_at":null}],"User":[{"id":"synthetic-user","email":"onboarding-regression@example.com","role":"user","is_verified":true}],"AccountMembership":[{"id":"synthetic-member","account_id":"synthetic-account","email":"onboarding-regression@example.com","user_id":null,"status":"pending","membership_role":"dealer_admin","access_level":"FULL_ACCESS","is_account_admin":true,"accepted_at":null,"portal_activation_request_id":"synthetic-request"}],"AccountUserAudit":[{"id":"synthetic-audit","account_id":"synthetic-account","action":"PORTAL_ACTIVATION_REQUESTED","target_email":"onboarding-regression@example.com","details":{"portal_activation_request_id":"synthetic-request","purpose":"activate","phase":"completed","membership_id":"synthetic-member","admin_email":"onboarding-regression@example.com"}}]};
 const calls=[];let fail=null;
 const matches=(r,q)=>Object.entries(q).every(([k,v])=>v&&typeof v==='object'?'$in'in v?v.$in.includes(r[k]):'$exists'in v?(r[k]!==undefined)===v.$exists:false:v===null?r[k]==null:r[k]===v);
 const entities=new Proxy({}, {get:(_,name)=>({
  filter:async(q,sort,limit=5000,skip=0)=>{if(fail===name+'.filter')throw Error('synthetic storage failure');return structuredClone((data[name]||[]).filter(r=>matches(r,q)).slice(skip,skip+limit));},
  create:async p=>{calls.push(name+'.create');const r={...structuredClone(p),id:'test-'+name+'-'+(data[name]||[]).length};(data[name]||=[]).push(r);return structuredClone(r);},
  update:async(id,p)=>{calls.push(name+'.update');const r=data[name].find(r=>r.id===id);Object.assign(r,structuredClone(p));return structuredClone(r);},
  updateMany:async(q,p)=>{calls.push(name+'.updateMany');let updated=0;for(const r of data[name]||[])if(matches(r,q)){Object.assign(r,structuredClone(p.$set||p));updated++;}return{updated};},
 })});
 const base44={auth:{me:async()=>structuredClone(data.User[0])},asServiceRole:{entities}};
 return{data,calls,base44,fail:x=>fail=x};
}
const incidents=[];
const incidentPolicy=load('base44/shared/systemHealth/clientIncidentPolicy.js',{},['safeDiagnostic']);
const incident=load('base44/shared/systemHealth/authIncident.js',{...incidentPolicy,recordSystemIncident:async(b,d)=>{incidents.push(d);return{recorded:true,reference:'TEST-INCIDENT'};},crypto:globalThis.crypto},['recordAuthIncident','safeAuthCorrelation','expectedAuthFailure','authIncidentAccount']);
function endpoint(f,name='getAccountAccessContext'){
 return load('base44/functions/'+name+'/entry.ts',{...access,...incident,createClientFromRequest:()=>f.base44},['handler']).handler;
}
const request=()=>new Request('https://soundproofcinemadesigner.com/api/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({correlation_id:'test-correlation-12345'})});
test('published custom and Base44 domains stay same-origin despite stale cross-domain server setting',()=>{
 for(const origin of ['https://soundproofcinemadesigner.com','https://www.soundproofcinemadesigner.com','https://sound-proof-cinema-designer.base44.app']){
  assert.equal(boot(origin,{base44_server_url:'https://base44.app'}).serverUrl,origin);
 }
});
test('preview connection and existing token remain unchanged',()=>{
 const p=boot('https://preview.example',{base44_server_url:'https://preview.example',base44_access_token:'synthetic-token'});
 assert.equal(p.serverUrl,'https://preview.example');assert.equal(p.token,'synthetic-token');
});
test('blocked cross-domain reproduction cannot reach membership; same-origin reaches existing verified claim',async()=>{
 const f=fixture(),fn=endpoint(f);let invoked=0;
 async function sessionAt(server){if(server==='https://base44.app')throw Object.assign(Error('Network Error'),{code:'ERR_NETWORK'});return f.base44.auth.me();}
 await assert.rejects(()=>sessionAt('https://base44.app'));
 assert.equal(f.data.AccountMembership[0].status,'pending');assert.equal(f.data.Account[0].status,'inactive');
 await sessionAt(boot('https://soundproofcinemadesigner.com').serverUrl);invoked++;
 const r=await fn(request());assert.equal(r.status,200);assert.equal((await r.json()).allowed,true);
 assert.equal(invoked,1);assert.equal(f.data.AccountMembership[0].user_id,f.data.User[0].id);
 assert.ok(f.data.AccountMembership[0].accepted_at);assert.equal(f.data.Account[0].status,'active');
 assert.equal(Date.parse(f.data.Account[0].soundproof_access_expires_at)-Date.parse(f.data.Account[0].first_activated_at),90*86400000);
});
test('repeat access and recordAccountAccess do not duplicate membership or restart term',async()=>{
 const f=fixture(),fn=endpoint(f);await fn(request());
 const expiry=f.data.Account[0].soundproof_access_expires_at;await fn(request());await endpoint(f,'recordAccountAccess')(request());
 assert.equal(f.data.AccountMembership.length,1);assert.equal(f.data.Account[0].soundproof_access_expires_at,expiry);
 assert.ok(f.data.Account[0].last_access_at);
 assert.ok(f.calls.every(x=>!/(Project|CapacityLedger|Promotion)/.test(x)));
});
test('network retries stop after three and keep original rejection',async()=>{
 let calls=0,pauses=[];const error=Object.assign(Error('Network Error'),{code:'ERR_NETWORK'});
 await assert.rejects(()=>recovery.retryAuthRequest(async()=>{calls++;throw error;},{sleep:async ms=>pauses.push(ms)}),e=>e===error);
 assert.equal(calls,3);assert.deepEqual(pauses,[400,1000]);
});
test('transient failure recovers; incorrect password and normal access denials do not retry or alert',async()=>{
 let calls=0;assert.equal(await recovery.retryAuthRequest(async()=>{if(++calls===1)throw Error('Network Error');return'ok';},{sleep:async()=>{}}),'ok');
 for(const status of [400,401,403,404,422,423]){
  let attempts=0;const error=Object.assign(Error('denied'),{status});
  await assert.rejects(()=>recovery.retryAuthRequest(async()=>{attempts++;throw error;}));
  assert.equal(attempts,1);assert.equal(recovery.isUnexpectedAuthFailure(error),false);
 }
});
test('ordinary unauthenticated requests return 401 and create no incident',async()=>{
 const f=fixture();f.base44.auth.me=async()=>{throw Object.assign(Error('unauthenticated'),{status:403});};
 const count=incidents.length;assert.equal((await endpoint(f)(request())).status,401);assert.equal(incidents.length,count);
});
test('membership claim exception reports verified pending dealer, user, stage and correlation',async()=>{
 const f=fixture();f.fail('Account.filter');const r=await endpoint(f)(request());assert.equal(r.status,500);
 const body=await r.json();assert.equal(body.correlation_id,'test-correlation-12345');assert.equal(body.stage,'account_lookup');
 const last=incidents.at(-1);assert.equal(last.account_id,f.data.AccountMembership[0].account_id);assert.equal(last.operation_id,body.correlation_id);
 assert.ok(last.diagnostic_summary.includes(f.data.User[0].id));assert.equal(last.severity,'critical');
 assert.equal(f.data.Account[0].status,'inactive');
});
test('unverified login cannot claim invitation or start term',async()=>{
 const f=fixture();f.data.User[0].is_verified=false;
 assert.equal((await endpoint(f)(request())).status,403);assert.equal(f.data.AccountMembership[0].status,'pending');assert.equal(f.data.Account[0].status,'inactive');
});
test('auth stage policies and Retry controls compile without granting access',()=>{
 for(const p of ['src/lib/AuthContext.jsx','src/App.jsx','src/components/AccessDeniedScreen.jsx']){
  assert.ok(transformSync(read(p),{loader:'jsx',format:'esm'}).code);
 }
 const s=read('src/components/AccessDeniedScreen.jsx');
 assert.match(s,/onClick=\{onRetry\}/);assert.match(s,/>\s*Retry\s*</);
 assert.match(read('src/lib/AuthContext.jsx'),/authFlight\.current/);
});
test('monitoring resolves pending user account without writing membership or granting access',async()=>{
 const f=fixture();const before=structuredClone(f.data);
 assert.equal(await incident.authIncidentAccount(f.base44.asServiceRole,f.data.User[0]),f.data.Account[0].id);
 assert.deepEqual(f.data,before);
});

test('identity-store outage still records the unexpected failure with user and correlation',async()=>{
 const f=fixture();f.fail('User.filter');const r=await endpoint(f)(request());assert.equal(r.status,500);
 const last=incidents.at(-1);assert.ok(last.diagnostic_summary.includes(f.data.User[0].id));
 assert.equal(last.account_id,null);assert.equal(last.stage_failed,'authoritative_user_read');
});
