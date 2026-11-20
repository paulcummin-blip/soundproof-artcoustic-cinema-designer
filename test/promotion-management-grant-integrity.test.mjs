import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('../test/_alias-loader.mjs', import.meta.url);
const grants=await import('../src/lib/commercial/promotionGrantAuthority.js');
const requestHelpers=await import('../src/lib/commercial/promotionGrantRequest.js');
const {applyPromotionGrant}=await import('../base44/shared/promotionGrantExecution.js');
const {forceReleaseCreationLock}=await import('../base44/shared/projectCreationLock.js');
import {memoryStore,syntheticAccounts} from './promotion-management-fixtures.mjs';
const source=readFileSync(new URL('../src/components/admin/access/ManagePromotionsDialog.jsx',import.meta.url),'utf8');
const body=source.slice(source.indexOf('  async function handleApply() {')+'  async function handleApply() {'.length,source.indexOf('\n  function handleClose()')).trim().replace(/}$/, '');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const actor={id:'synthetic-admin',role:'admin',email:'synthetic@example.invalid'};
function fixture(type='free_credits',selection={type:'partners'}) {
 const m=memoryStore({Account:syntheticAccounts});
 const storage=new Map();
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 const db={promos:m.data.Promotion,ledger:m.data.CapacityLedger,error:null,...m};
 const context={...grants,...requestHelpers,window:{localStorage},applyingRef:{current:false},
 base44:{functions:{invoke:async(name,input)=>{assert.equal(name,'applyManagedPromotion');return {data:await applyPromotionGrant(m.service,input,actor)};}}},
 promoType:type,selection,creditsPerAccount:5,allAccounts:syntheticAccounts,user:actor,
 recipients:grants.resolveRecipients(syntheticAccounts,selection),
 startDate:'2026-11-20',endDate:'2027-02-28',
 setApplying:()=>{},setError:e=>{db.error=e;},setResult:r=>{db.result=r;},setStep:()=>{},onApplied:()=>{}};
 const invoke=new AsyncFunction(...Object.keys(context),body);
 return {db,context,submit:()=>invoke(...Object.values(context))};
}
test('one-account free credits use a separate PROMOTIONAL ledger entry',async()=>{
 const f=fixture('free_credits',{type:'single',accountId:'s1'});await f.submit();assert.equal(f.db.error,null);
 assert.equal(f.db.ledger.length,1);assert.equal(f.db.ledger[0].transaction_type,'PROMOTIONAL');
 assert.equal(f.db.ledger[0].delta,5);assert.equal(f.db.ledger[0].account_id,'s1');
 assert.equal(f.db.ledger[0].idempotency_key,'promo_grant:'+f.db.promos[0].id+':s1');
});
test('category grant affects only matching accounts',async()=>{
 const f=fixture();await f.submit();assert.equal(f.db.error,null);
 assert.deepEqual(f.db.ledger.map(e=>e.account_id),['s1','s2']);
});
test('repeated free-credit submission preserves one grant and five credits',async()=>{
 const f=fixture('free_credits',{type:'single',accountId:'s1'});await f.submit();await f.submit();
 assert.equal(f.db.error,null);assert.equal(f.db.promos.length,1);assert.equal(f.db.ledger.reduce((n,e)=>n+e.delta,0),5);
});
test('partial bulk failure retries only missing recipients',async()=>{
 const f=fixture();f.db.controls.failSecondRead=true;await f.submit();
 assert.equal(f.db.ledger.length,1);assert.ok(f.db.error);await f.submit();assert.equal(f.db.error,null);
 assert.deepEqual(['s1','s2'].map(id=>f.db.ledger.filter(e=>e.account_id===id).reduce((n,e)=>n+e.delta,0)),[5,5]);
 assert.equal(f.db.result.skipped,1);assert.equal(f.db.promos.length,1);
});
test('repeated unlimited submission creates one entitlement and no ledger writes',async()=>{
 const f=fixture('unlimited_projects',{type:'all'});await f.submit();await f.submit();
 assert.equal(f.db.error,null);assert.equal(f.db.promos.length,1);assert.equal(f.db.ledger.length,0);
 assert.equal(f.db.result.totalRecipients,3);
 assert.equal(f.db.promos[0].starts_at,'2026-11-20T00:00:00.000Z');
 assert.equal(f.db.promos[0].ends_at,'2027-03-01T00:00:00.000Z');
});
test('lost acknowledgements are read back without duplicate promotion or credit',async()=>{
 const f=fixture();f.db.controls.losePromotionAck=true;f.db.controls.loseLedgerAck=true;
 await f.submit();await f.submit();assert.equal(f.db.error,null);assert.equal(f.db.promos.length,1);assert.equal(f.db.ledger.length,2);
});
test('unknown write stops grants until explicit reconciliation, then resumes safely',async()=>{
 const f=fixture();f.db.controls.failLedgerWrite=true;await f.submit();
 assert.match(f.db.error,/Reconcile/);assert.ok(f.db.data.Account.find(a=>a.id==='internal').creation_lock_holder);
 await f.submit();assert.match(f.db.error,/reconciliation/);assert.equal(f.db.ledger.length,0);
 // The test store knows the failed write never committed and none is in flight.
 await forceReleaseCreationLock(f.db.service,'internal');await f.submit();
 assert.equal(f.db.error,null);assert.equal(f.db.ledger.length,2);assert.equal(f.db.promos.length,1);
});
test('simultaneous server submissions serialize and subsequent replay adds nothing',async()=>{
 const f=fixture();const promo=grants.buildBonusPromotion({selection:{type:'partners'},creditsPerAccount:5,accounts:syntheticAccounts,actor});
 const input={promotion:promo,recipient_ids:['s1','s2']};
 const outcomes=await Promise.allSettled([applyPromotionGrant(f.db.service,input,actor),applyPromotionGrant(f.db.service,input,actor)]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(outcomes.find(r=>r.status==='rejected').reason.code,'GRANT_BUSY');
 await applyPromotionGrant(f.db.service,input,actor);assert.equal(f.db.promos.length,1);assert.equal(f.db.ledger.length,2);
});
test('fresh tab same daily grant with different timestamp reuses the original promotion',async()=>{
 const f=fixture();const make=now=>grants.buildBonusPromotion({selection:{type:'partners'},creditsPerAccount:5,accounts:syntheticAccounts,actor,now:new Date(now)});
 await applyPromotionGrant(f.db.service,{promotion:make('2026-11-20T10:00:00Z'),recipient_ids:['s1','s2']},actor);
 await applyPromotionGrant(f.db.service,{promotion:make('2026-11-20T12:00:00Z'),recipient_ids:['s1','s2']},actor);
 assert.equal(f.db.promos.length,1);assert.equal(f.db.ledger.length,2);
});
test('non-admin and stale recipient selection are rejected without grants',async()=>{
 const f=fixture();const promotion=grants.buildBonusPromotion({selection:{type:'partners'},creditsPerAccount:5,accounts:syntheticAccounts,actor});
 await assert.rejects(applyPromotionGrant(f.db.service,{promotion,recipient_ids:['s1','s2']},{role:'user'}),e=>e.code==='FORBIDDEN');
 await assert.rejects(applyPromotionGrant(f.db.service,{promotion,recipient_ids:['s1']},actor),e=>e.code==='RECIPIENTS_CHANGED');
 assert.equal(f.db.promos.length,0);assert.equal(f.db.ledger.length,0);
});
test('reload keeps pending request and rejects a replacement configuration',()=>{
 const storage=new Map();const adapter={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 const one=requestHelpers.preparePromotionRequest(adapter,'k','signature',()=>({id:'original'}),['s1'],'2026-11-20');
 const retry=requestHelpers.preparePromotionRequest(adapter,'k','signature',()=>{throw new Error('must not rebuild');},['s1'],'2026-11-21');
 assert.deepEqual(one,retry);
 assert.throws(()=>requestHelpers.preparePromotionRequest(adapter,'k','changed',()=>({}),['s2'],'2026-11-21'),/unfinished/);
});

test('244-account isolated bulk grant preserves existing credits, promotions and dealer access',async()=>{
 const accounts=Array.from({length:244},(_,i)=>({id:'dealer-'+String(i).padStart(3,'0'),name:'Synthetic '+i,account_type:'dealer',status:i%2?'active':'inactive'}));
 accounts.push({id:'admin',name:'Synthetic internal',account_type:'admin'});
 const existing=[{id:'earned',account_id:'dealer-000',transaction_type:'UK_TURNOVER_REWARD',delta:10},
  {id:'purchased',account_id:'dealer-000',transaction_type:'PURCHASED',delta:3}];
 const oldPromo={id:'historical',name:'Historical',status:'CANCELLED'};
 const m=memoryStore({Account:accounts,CapacityLedger:existing,Promotion:[oldPromo]});
 const before=structuredClone(m.data.Account.filter(a=>a.account_type==='dealer'));
 const promotion=grants.buildBonusPromotion({selection:{type:'all'},creditsPerAccount:5,accounts,actor,now:new Date('2026-11-20T12:00:00Z')});
 const input={promotion,recipient_ids:accounts.filter(a=>a.account_type!=='admin').map(a=>a.id)};
 const first=await applyPromotionGrant(m.service,input,actor);const repeat=await applyPromotionGrant(m.service,input,actor);
 assert.equal(first.affected,244);assert.equal(repeat.skipped,244);assert.equal(repeat.affected,0);
 assert.equal(m.data.CapacityLedger.length,246);
 assert.deepEqual(m.data.CapacityLedger.slice(0,2),existing);
 assert.deepEqual(m.data.Promotion[0],oldPromo);
 assert.deepEqual(m.data.Account.filter(a=>a.account_type==='dealer'),before);
 assert.equal(m.data.CapacityLedger.some(e=>e.account_id==='admin'),false);
});
test('actual credit aggregator keeps promotional, rewarded and purchased amounts separate',async()=>{
 const raw=readFileSync(new URL('../src/lib/commercial/capacityService.js',import.meta.url),'utf8')
  .replace(/import \{ base44 \} from "[^"]+";/,'');
 const mod=await import('data:text/javascript;base64,'+Buffer.from(raw).toString('base64'));
 const b=mod.aggregateCapacityBreakdown([{transaction_type:'PROMOTIONAL',delta:5},{transaction_type:'UK_TURNOVER_REWARD',delta:10},{transaction_type:'PURCHASED',delta:3}]);
 assert.equal(b.promotional,5);assert.equal(b.rewarded,10);assert.equal(b.purchased,3);assert.equal(b.remaining,18);
});
