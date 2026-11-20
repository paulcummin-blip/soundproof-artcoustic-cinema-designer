import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('../test/_alias-loader.mjs', import.meta.url);
const grants=await import('../src/lib/commercial/promotionGrantAuthority.js');
const source=readFileSync(new URL('../src/components/admin/access/ManagePromotionsDialog.jsx',import.meta.url),'utf8');
// Execute the real dialog submit body, with synthetic entity storage only.
// No SDK client, credentials or network calls are loaded.
const body=source.slice(source.indexOf('  async function handleApply() {')+'  async function handleApply() {'.length,source.indexOf('\n  function handleClose()')).trim().replace(/}$/, '');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
function fixture(type='free_credits', selection={type:'partners'}) {
 const accounts=[{id:'s1',name:'Synthetic A',dealer_group:'PREMIUM_PARTNER',status:'active',account_type:'dealer'},
 {id:'s2',name:'Synthetic B',dealer_group:'PREMIUM_PARTNER',status:'active',account_type:'dealer'},
 {id:'s3',name:'Synthetic other',dealer_group:'OTHER_DEALER',status:'active',account_type:'dealer'},
 {id:'internal',name:'Synthetic admin',account_type:'admin'}];
 const db={promos:[],ledger:[],failBulk:false,error:null};
 const base44={entities:{Promotion:{create:async data=>{const row={id:'p'+(db.promos.length+1),...data};db.promos.push(row);return row;}},
 CapacityLedger:{bulkCreate:async rows=>{
   for (let i=0;i<rows.length;i++) {
    if(db.failBulk && i===1){db.failBulk=false;throw new Error('Synthetic failure after first committed row');}
    db.ledger.push({...rows[i]});
   }
   return rows;
 }}}};
 const context={...grants,base44,promoType:type,selection,creditsPerAccount:5,allAccounts:accounts,
 user:{id:'synthetic-admin',email:'synthetic@example.invalid'},recipients:grants.resolveRecipients(accounts,selection),
 allLedgerEntries:[],startDate:'2026-11-20',endDate:'2027-02-28',
 setApplying:()=>{},setError:e=>{db.error=e;},setResult:r=>{db.result=r;},setStep:()=>{},onApplied:()=>{}};
 const invoke=new AsyncFunction(...Object.keys(context),body);
 return {db,accounts,submit:()=>invoke(...Object.values(context))};
}
test('one-account credit grant creates the correct separate PROMOTIONAL entry',async()=>{
 const f=fixture('free_credits',{type:'single',accountId:'s1'});await f.submit();
 assert.equal(f.db.ledger.length,1);assert.equal(f.db.ledger[0].transaction_type,'PROMOTIONAL');
 assert.equal(f.db.ledger[0].delta,5);assert.equal(f.db.ledger[0].account_id,'s1');
 assert.equal(f.db.ledger[0].idempotency_key,'promo_grant:p1:s1');
});
test('category grant affects only matching accounts',async()=>{
 const f=fixture();await f.submit();assert.deepEqual(f.db.ledger.map(e=>e.account_id),['s1','s2']);
});
test('repeated free-credit request must not duplicate credit',async()=>{
 const f=fixture('free_credits',{type:'single',accountId:'s1'});await f.submit();await f.submit();
 assert.equal(f.db.ledger.reduce((n,e)=>n+e.delta,0),5);
});
test('partial bulk failure retry must only credit missing recipients',async()=>{
 const f=fixture();f.db.failBulk=true;await f.submit();assert.equal(f.db.ledger.length,1);await f.submit();
 assert.deepEqual(f.accounts.slice(0,2).map(a=>f.db.ledger.filter(e=>e.account_id===a.id).reduce((n,e)=>n+e.delta,0)),[5,5]);
});
test('repeated unlimited submission must not create duplicate entitlements',async()=>{
 const f=fixture('unlimited_projects',{type:'all'});await f.submit();await f.submit();
 assert.equal(f.db.promos.length,1);assert.equal(f.db.ledger.length,0);
});
