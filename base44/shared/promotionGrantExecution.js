import { acquireCreationLock, releaseCreationLock } from './projectCreationLock.js';
import { matchesTarget } from './promotionAuthority.js';

const fields = ['name','headline','message','promotion_type','target_scope','target_dealer_group','target_account_id','starts_at','ends_at','status','bonus_projects'];
const sameTarget = (a,b) => a.target_scope === b.target_scope &&
  (a.target_dealer_group || null) === (b.target_dealer_group || null) &&
  (a.target_account_id || null) === (b.target_account_id || null);
const fail = (message, code='INVALID_GRANT') => Object.assign(new Error(message), {code});

/**
 * Admin-only callers. Reuse the existing atomic Account mutex on the central
 * admin account, not a dealer account. No access fields or schemas are changed.
 * A write with an unknown outcome retains this lock: never guess and replay.
 * Existing admin reconciliation can release it after checking the write settled.
 */
export async function applyPromotionGrant(service, input, actor) {
  if (actor?.role !== 'admin') throw fail('Administrator access required.', 'FORBIDDEN');
  const incoming=input?.promotion;
  if (!incoming || !['BONUS_PROJECTS','UNLIMITED_PRO_PROJECTS'].includes(incoming.promotion_type))
    throw fail('Unsupported promotion type.');
  const promotion=Object.fromEntries(fields.filter(k=>incoming[k] !== undefined).map(k=>[k,incoming[k]]));
  if (!['SINGLE_ACCOUNT','ALL_DEALER_GROUP','ALL_ACCOUNTS'].includes(promotion.target_scope) ||
      (promotion.target_scope==='SINGLE_ACCOUNT' && !promotion.target_account_id) ||
      (promotion.target_scope==='ALL_DEALER_GROUP' && !promotion.target_dealer_group))
    throw fail('Invalid recipient selection.');
  if (!Number.isFinite(Date.parse(promotion.starts_at)) || !Number.isFinite(Date.parse(promotion.ends_at)) ||
      Date.parse(promotion.ends_at) <= Date.parse(promotion.starts_at)) throw fail('Invalid promotion dates.');
  promotion.status='ACTIVE';
  const credits=Number(promotion.bonus_projects);
  if (promotion.promotion_type==='BONUS_PROJECTS' && (!Number.isSafeInteger(credits) || credits<=0))
    throw fail('Credits must be a positive whole number.');
  const expected=[...new Set(input.recipient_ids || [])].sort();
  if (!expected.length) throw fail('No confirmed recipients.');

  const adminAccounts=await service.entities.Account.filter({account_type:'admin'}, 'id', 1);
  if (!adminAccounts?.[0]?.id) throw fail('Central admin account is unavailable.', 'GRANT_UNAVAILABLE');
  const lockAccountId=adminAccounts[0].id;
  const lock=await acquireCreationLock(service,lockAccountId);
  if (!lock.acquired) throw fail('Another promotion request is running or awaiting reconciliation. Retry the same request; do not create a replacement.', 'GRANT_BUSY');
  let uncertain=false;
  try {
    // Read every account page; never grant against a stale browser category list.
    const accounts=[];
    for(let skip=0;;skip+=500) {
      const page=await service.entities.Account.list('id',500,skip);
      if(!Array.isArray(page)) throw fail('Cannot verify recipients.');
      accounts.push(...page); if(page.length<500) break;
    }
    const actual=accounts.filter(a=>matchesTarget(promotion,a)).map(a=>a.id).sort();
    if(JSON.stringify(actual)!==JSON.stringify(expected))
      throw fail('Recipients have changed. Review the account selection again.', 'RECIPIENTS_CHANGED');

    // A retained request keeps these dates/target/amount unchanged on every retry.
    // Unlimited grants also recognise the already-created equivalent live grant.
    const lookup=async()=>{
      const rows=await service.entities.Promotion.filter({
        promotion_type:promotion.promotion_type,
        target_scope:promotion.target_scope,
        starts_at:promotion.starts_at,
        ends_at:promotion.ends_at,
      });
      const matching=rows.filter(p=>sameTarget(p,promotion) &&
        (promotion.promotion_type!=='BONUS_PROJECTS' || Number(p.bonus_projects)===credits));
      if(matching.length>1) throw fail('Multiple matching promotions require reconciliation.', 'GRANT_RECONCILING');
      if(matching[0] && matching[0].status!=='ACTIVE')
        throw fail('This request refers to a cancelled or draft promotion; review it before continuing.', 'GRANT_RECONCILING');
      return matching[0] || null;
    };
    let saved=await lookup();
    if(!saved) {
      try { saved=await service.entities.Promotion.create(promotion); }
      catch(error) {
        uncertain=true;
        try { saved=await lookup(); } catch { /* retain lock */ }
        if(!saved) throw fail('Promotion creation could not be confirmed. Reconcile before retrying.', 'GRANT_RECONCILING');
        uncertain=false;
      }
    }
    if(promotion.promotion_type==='UNLIMITED_PRO_PROJECTS')
      return {type:'unlimited_projects',promotionId:saved.id,affected:expected.length,skipped:0,totalRecipients:expected.length};

    let affected=0,skipped=0;
    for(const accountId of expected) {
      const key=`promo_grant:${saved.id}:${accountId}`;
      const existing=await service.entities.CapacityLedger.filter({idempotency_key:key});
      if(existing.length>1 || existing.some(e=>e.account_id!==accountId || e.transaction_type!=='PROMOTIONAL' || Number(e.delta)!==credits))
        throw fail('Existing credit grant does not match the request. Reconciliation required.', 'GRANT_RECONCILING');
      if(existing.length) {skipped++;continue;}
      const entry={
        account_id:accountId,transaction_type:'PROMOTIONAL',delta:credits,idempotency_key:key,
        source_system:'ADMIN_PANEL',reason:`Promotional credit grant (${credits} credits)`,
        source_ref:{promotion_id:saved.id,granted_by_user_id:actor.id,granted_by_email:actor.email || null,granted_at:new Date().toISOString()},
      };
      try { await service.entities.CapacityLedger.create(entry); affected++; }
      catch(error) {
        uncertain=true;
        let committed=[];
        try {committed=await service.entities.CapacityLedger.filter({idempotency_key:key});} catch { /* retain lock */ }
        if(committed.length!==1 || committed[0].account_id!==accountId ||
          committed[0].transaction_type!=='PROMOTIONAL' || Number(committed[0].delta)!==credits)
          throw fail('Credit write could not be confirmed. Reconcile this request before retrying; existing grants are retained.', 'GRANT_RECONCILING');
        uncertain=false; affected++;
      }
    }
    return {type:'free_credits',promotionId:saved.id,affected,skipped,totalRecipients:expected.length};
  } finally {
    if(!uncertain) await releaseCreationLock(service,lockAccountId,lock.token);
  }
}
