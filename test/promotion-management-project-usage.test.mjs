import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {memoryStore,syntheticAccounts} from './promotion-management-fixtures.mjs';
import * as capacity from '../base44/shared/capacityAuthority.js';
import * as promotion from '../base44/shared/promotionAuthority.js';
import * as locks from '../base44/shared/projectCreationLock.js';
import * as receipts from '../base44/shared/projectCreationIdempotency.js';
import * as recovery from '../base44/shared/projectCreationRecovery.js';
const source=readFileSync(new URL('../base44/functions/createProfessionalProject/entry.ts',import.meta.url),'utf8').replace(/import[\s\S]*?from ['"][^'"]+['"];\n/g,'').replace('export default async function(req)','return async function(req)');
function fixture(status='active') {
 const user={id:'user',role:'user',account_id:'s1',dealer_account_id:'dealer-s1',dealer_name:'Synthetic A'};
 const m=memoryStore({
  Account:[{...syntheticAccounts[0],status}],User:[user],
  Promotion:[{id:'unlimited',promotion_type:'UNLIMITED_PRO_PROJECTS',status:'ACTIVE',target_scope:'ALL_ACCOUNTS',starts_at:'2026-11-20T00:00:00Z',ends_at:'2027-03-01T00:00:00Z'}],
  CapacityLedger:[{id:'earned',account_id:'s1',transaction_type:'UK_TURNOVER_REWARD',delta:10},{id:'purchased',account_id:'s1',transaction_type:'PURCHASED',delta:2}],
 });
 const deps={...capacity,...promotion,...locks,...receipts,...recovery,
  createClientFromRequest:()=>({auth:{me:async()=>user},asServiceRole:m.service}),
  associateDealerIdentityCore:async()=>({resolved:true}),
  resolveAccountAccess:async()=>({active:status==='active'}),
  assertCapability:ctx=>{if(!ctx.active)throw new Error('Access denied');},
 };
 const handler=new Function(...Object.keys(deps),source)(...Object.values(deps));
 const request=id=>new Request('https://synthetic.invalid/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({request_id:id,name:'Synthetic promotion project'})});
 return {...m,create:async id=>{const response=await handler(request(id));return {status:response.status,body:await response.json()};}};
}
async function at(iso,fn) {
 const original=Date.now;Date.now=()=>Date.parse(iso);
 try{return await fn();}finally{Date.now=original;}
}
test('active unlimited project records usage and leaves earned/purchased credits intact',async()=>{
 const f=fixture();const before=structuredClone(f.data.CapacityLedger);
 await at('2026-11-20T12:00:00Z',async()=>{
  const r=await f.create('request-1');assert.equal(r.status,201);assert.equal(r.body.status,'SUCCESS');
  assert.equal(r.body.project.commercial_source,'PROMOTION');assert.equal(r.body.ledger_entry,null);
 });
 assert.equal(f.data.PromotionUsage.length,1);assert.equal(f.data.PromotionUsage[0].project_id,f.data.Project[0].id);
 assert.deepEqual(f.data.CapacityLedger,before);
});
test('after exclusive expiry only a new project consumes one credit; replay never charges the promotional project',async()=>{
 const f=fixture();let oldId;
 await at('2027-02-28T23:59:59Z',async()=>{oldId=(await f.create('before')).body.project.id;});
 await at('2027-03-01T00:00:00Z',async()=>{
  const replay=await f.create('before');assert.equal(replay.body.project.id,oldId);
  assert.equal(f.data.CapacityLedger.length,2);
  const fresh=await f.create('after');assert.equal(fresh.status,201);
  assert.equal(fresh.body.capacity_before,12);assert.equal(fresh.body.capacity_after,11);
 });
 assert.equal(f.data.Project.length,2);assert.equal(f.data.PromotionUsage.length,1);
 const charge=f.data.CapacityLedger.filter(e=>e.transaction_type==='PROJECT_ACTIVATION');
 assert.equal(charge.length,1);assert.notEqual(charge[0].source_ref.project_id,oldId);assert.equal(charge[0].delta,-1);
});
test('promotion cannot bypass the separate denied login capability',async()=>{
 for(const status of ['inactive','suspended']) {
  const f=fixture(status);
  await at('2026-11-20T12:00:00Z',async()=>assert.equal((await f.create('denied')).status,403));
  assert.equal(f.data.Project.length,0);assert.equal(f.data.PromotionUsage.length,0);assert.equal(f.data.CapacityLedger.length,2);
 }
});
