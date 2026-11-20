import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
register('../test/_alias-loader.mjs', import.meta.url);
const overview = await import('../src/lib/commercial/promotionEntitlementOverview.js');
const { findEffectivePromotion } = await import('../base44/shared/promotionAuthority.js');
const p = (id,start,end,extra={}) => ({id,starts_at:start,ends_at:end,status:'ACTIVE',promotion_type:'UNLIMITED_PRO_PROJECTS',target_scope:'ALL_ACCOUNTS',...extra});
const now=Date.parse('2026-11-20T12:00:00Z');
const old=p('old','2026-08-16T23:00:00Z','2027-01-01T00:00:00Z');
const latest=p('new','2026-11-20T00:00:00Z','2027-03-01T00:00:00Z');
test('overlapping active promotions display 28 February, independent of order',()=>{
 for(const promos of [[old,latest],[latest,old]]) {
  const effective=overview.resolveEffectivePromotion(promos,now);
  assert.equal(overview.derivePromotionStatus(effective,promos,now).expiryDisplay,'28 Feb 2027');
 }
});
test('backend selects same latest active entitlement',async()=>{
 const effective=await findEffectivePromotion({entities:{Promotion:{filter:async()=>[old,latest]}}},{id:'synthetic',account_type:'dealer'},now);
 assert.equal(effective.id,'new');
});
test('longer existing entitlements are preserved',()=>{
 const long=p('long','2026-08-16T23:00:00Z','2035-01-01T00:00:00Z');
 assert.equal(overview.resolveEffectivePromotion([old,latest,long],now).id,'long');
});
test('exclusive expiry, cancelled, draft and future grants do not grant current entitlement',()=>{
 assert.equal(overview.resolveEffectivePromotion([latest],Date.parse(latest.ends_at)),null);
 for(const extra of [{status:'CANCELLED'},{status:'DRAFT'},{starts_at:'2027-01-01T00:00:00Z'}])
  assert.equal(overview.resolveEffectivePromotion([{...latest,...extra}],now),null);
});

test('contiguous scheduled windows extend expiry but gaps do not',()=>{
 const adjacent=p('future','2027-03-01T00:00:00Z','2027-04-01T00:00:00Z');
 const gap=p('gap','2027-04-02T00:00:00Z','2027-05-01T00:00:00Z');
 const list=[gap,adjacent,latest,old];
 const before=JSON.stringify(list);
 const effective=overview.resolveEffectivePromotion(list,now);
 assert.equal(effective.id,'new');
 assert.equal(effective.ends_at,latest.ends_at);
 assert.equal(overview.derivePromotionStatus(effective,list,now).expiryDisplay,'31 Mar 2027');
 assert.equal(JSON.stringify(list),before);
});
