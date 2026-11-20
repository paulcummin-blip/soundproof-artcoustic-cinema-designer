import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.env.SOUNDPROOF_SOURCE_ROOT || '/app';
const candidate = process.env.ACTIVATION_CANDIDATE_ROOT;
const rules = await import(pathToFileURL(path.join(root, 'base44/shared/accountAccessRules.js')));
const locks = await import(pathToFileURL(path.join(root, 'base44/shared/projectCreationLock.js')));
const constants = await import(pathToFileURL(path.join(root, 'base44/shared/pilotPortalConstants.js')));
function source(file) {
  const draft = candidate && path.join(candidate, file);
  return fs.readFileSync(draft && fs.existsSync(draft) ? draft : path.join(root,file),'utf8');
}
function moduleAt(file, deps, exports) {
  const code = source(file).replace(/^import[\s\S]*?;\n/gm,'')
    .replace(/^export \{[\s\S]*?\};?\n/gm,'').replace(/export default resolveAccountAccessReadOnly;/g,'').replace(/\bexport /g,'');
  return new Function(...Object.keys(deps), code+'\nreturn {'+exports.join(',')+'};')(...Object.values(deps));
}
const portal = moduleAt('base44/shared/portalActivationAuthority.js', {
  ...rules, ...locks, ...constants, secrets:{get:()=> 'synthetic-secret'},
}, ['validateActivationGrant','verifyActivationBearerToken','resolveDealerAccountFromGrant',
'createPortalActivation','renewPortalAccess','startSoundProofTermOnFirstClaim']);
const access = moduleAt('base44/shared/accountAccessAuthority.js', {
  ...rules, ...portal, validatePilotPortalAccessIfRequired:async()=>({required:false,allowed:true}),
}, ['resolveAccountAccess','appendAccountUserAudit']);
const account = (p={}) => ({id:'a',name:'Synthetic A',status:'inactive',soundproof_eligible:true,...p});
const link = (p={}) => ({id:'link-a',source_system:constants.PORTAL_SOURCE,active:true,
  account_id:'a',partner_user_id:'portal-a',external_account_number:'trade-a',...p});
const rawGrant = (p={}) => ({purpose:'activate',jti:'portal-a:nonce-1',exp:Math.floor(Date.now()/1000)+240,
  target:'SOUND_PROOF',portal_user_id:'portal-a',portal_profile_id:'profile-a',
  dealer_account_id:'11111111-2222-4333-8444-555555555555',external_account_number:'trade-a',
  admin_email:'first@example.invalid',...p});
const grant = p => {
  const r=portal.validateActivationGrant({grant:rawGrant(p)});
  assert.equal(r.ok,true, r.error);return r.grant;
};
const member=(p={})=>({id:'admin-seat',account_id:'a',user_id:'admin',email:'admin@example.invalid',
  membership_role:'dealer_admin',is_account_admin:true,status:'active',access_level:'FULL_ACCESS',...p});
const user=(p={})=>({id:'admin',email:'admin@example.invalid',role:'user',is_verified:true,
  account_id:'a',account_role:'admin',access_level:'FULL_ACCESS',soundproof_access_enabled:true,...p});
function fixture(seed={}) {
  const data={Account:[account()],ExternalAccountLink:[link()],AccountMembership:[],AccountUserAudit:[],User:[],...structuredClone(seed)};
  const calls={emails:0,writes:[]};let fault=null;
  const match=(r,q)=>Object.entries(q).every(([k,v])=>{
    if(v&&typeof v==='object') {
      if('$exists'in v)return (r[k]!==undefined)===v.$exists;
      if('$in'in v)return v.$in.includes(r[k]);
    }
    return v===null?r[k]==null:r[k]===v;
  });
  const entities=new Proxy({}, {get:(_,name)=>({
    filter:async(q,sort,limit=5000,skip=0)=>structuredClone((data[name]||[]).filter(r=>match(r,q)).slice(skip,skip+limit)),
    list:async(sort,limit=5000,skip=0)=>structuredClone((data[name]||[]).slice(skip,skip+limit)),
    create:async p=>{
      calls.writes.push(name+'.create');
      const rows=data[name]||=[];const r={...structuredClone(p),id:name+'-'+(rows.length+1)};rows.push(r);
      if(fault===name+'.create.after'){fault=null;throw Error('lost acknowledgement');}
      return structuredClone(r);
    },
    update:async(id,p)=>{
      calls.writes.push(name+'.update');
      const row=(data[name]||[]).find(r=>r.id===id);if(!row)throw Error('missing');
      Object.assign(row,structuredClone(p));return structuredClone(row);
    },
    updateMany:async(q,p)=>{
      calls.writes.push(name+'.updateMany');
      let updated=0;for(const r of data[name]||[])if(match(r,q)){Object.assign(r,structuredClone(p.$set||p));updated++;}
      if(fault===name+'.term.after'&&p.$set?.soundproof_access_expires_at){fault=null;throw Error('lost term acknowledgement');}
      return {updated};
    },
  })});
  const service={entities,functions:{invoke:async()=>{
    calls.emails++;if(fault==='email.after'){fault=null;throw Error('delivery unknown');}
    if(fault==='email.false')return {data:{sent:false}};
    return {data:{sent:true}};
  }}};
  const base44={asServiceRole:service,auth:{me:async()=>data.User[0]}};
  return {data,calls,service,base44,setFault:f=>fault=f};
}
const activate=(f,g=grant())=>portal.createPortalActivation(f.service,f.base44,{grant:g,account:structuredClone(f.data.Account[0]),link:f.data.ExternalAccountLink[0]});
const renew=(f,g=grant({purpose:'renew'}))=>portal.renewPortalAccess(f.service,{grant:g,account:structuredClone(f.data.Account[0])});
function handler(f) {
  const deps={...rules,...access,...locks,createClientFromRequest:()=>f.base44};
  const code=source('base44/functions/manageAccountUsers/entry.ts')
    .replace(/^import[\s\S]*?;\n/gm,'').replace('export default async function(req)','return async function(req)');
  return new Function(...Object.keys(deps),code)(...Object.values(deps));
}
const invite=(fn,email,p={})=>fn(new Request('https://synthetic.invalid/members',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({action:'invite',email,access_level:'FULL_ACCESS',...p}),
}));
const activeFixture=(extra=[])=>fixture({Account:[account({status:'active'})],User:[user()],
  AccountMembership:[member(),...extra]});
test('short-lived grants reject expired, long-lived, wrong-target and wrong-subject nonces',()=>{
  for(const p of [{exp:1},{exp:Math.floor(Date.now()/1000)+301},{target:'OTHER'},{jti:'portal-b:nonce'},
    {external_account_number:''}])assert.equal(portal.validateActivationGrant({grant:rawGrant(p)}).ok,false);
  assert.equal(portal.validateActivationGrant({grant:rawGrant()}).ok,true);
});
test('activation endpoint bearer validation rejects missing and wrong secrets',()=>{
  assert.equal(portal.verifyActivationBearerToken(new Request('https://synthetic.invalid')),null);
  assert.equal(portal.verifyActivationBearerToken(new Request('https://synthetic.invalid',{headers:{authorization:'Bearer wrong'}})),null);
  assert.equal(portal.verifyActivationBearerToken(new Request('https://synthetic.invalid',{headers:{authorization:'Bearer synthetic-secret'}})),'synthetic-secret');
});
test('canonical Portal subject resolves one account without confusing dealer UUID and trade number',async()=>{
  const f=fixture();const r=await portal.resolveDealerAccountFromGrant(f.service,grant());
  assert.equal(r.ok,true);assert.equal(r.account.id,'a');
  assert.notEqual(grant().dealer_account_id,f.data.ExternalAccountLink[0].external_account_number);
});
test('wrong Portal subject, trade number, missing or ambiguous mapping denied',async()=>{
  const f=fixture();
  assert.equal((await portal.resolveDealerAccountFromGrant(f.service,grant({external_account_number:'trade-b'}))).ok,false);
  assert.equal((await portal.resolveDealerAccountFromGrant(f.service,grant({portal_user_id:'portal-b',jti:'portal-b:n'}))).ok,false);
  f.data.ExternalAccountLink.push(link({id:'duplicate',account_id:'b'}));
  assert.equal((await portal.resolveDealerAccountFromGrant(f.service,grant())).error,'DEALER_LINK_AMBIGUOUS');
});
test('activation replay creates one pending admin and one email, leaving term unset',async()=>{
  const f=fixture();const a=await activate(f),b=await activate(f);
  assert.equal(a.ok,true);assert.equal(b.replay,true);
  assert.equal(f.data.AccountMembership.length,1);assert.equal(f.calls.emails,1);
  assert.equal(f.data.Account[0].status,'inactive');assert.equal(f.data.Account[0].soundproof_access_expires_at,undefined);
});
test('simultaneous redemption and different grants produce at most one admin',async()=>{
  for(const different of [false,true]){
    const f=fixture();const r=await Promise.all([activate(f),activate(f,grant({jti:different?'portal-a:n2':'portal-a:nonce-1'}))]);
    assert.equal(r.filter(x=>x.ok).length,1);assert.equal(f.data.AccountMembership.length,1);assert.equal(f.calls.emails,1);
    const again=await activate(f,grant({jti:different?'portal-a:n2':'portal-a:nonce-1'}));
    assert.equal(different?again.ok:again.replay,different?false:true);
  }
});
test('rebound email or dealer UUID cannot reuse consumed grant',async()=>{
  const f=fixture();await activate(f);
  for(const p of [{admin_email:'other@example.invalid'},{dealer_account_id:'other-dealer'}]){
    assert.equal((await activate(f,grant(p))).error,'GRANT_REPLAY_MISMATCH');
  }
  assert.equal(f.calls.emails,1);
});
test('wrong-account membership and removed activation grant cannot be reused',async()=>{
  const f=fixture();await activate(f);f.data.AccountMembership[0].account_id='b';
  assert.equal((await activate(f)).ok,false);
  f.data.AccountMembership[0].account_id='a';f.data.AccountMembership[0].status='removed';
  assert.equal((await activate(f)).error,'GRANT_ALREADY_USED');assert.equal(f.calls.emails,1);
});
test('lost membership-write acknowledgement retains lock and prevents duplicate redemption',async()=>{
  const f=fixture();f.setFault('AccountMembership.create.after');
  await assert.rejects(()=>activate(f),/lost acknowledgement/);
  assert.equal((await activate(f)).error,'ACCOUNT_OPERATION_BUSY');
  assert.equal(f.data.AccountMembership.length,1);assert.equal(f.calls.emails,0);
});
test('unconfirmed invitation delivery is not reported as sent or repeated on replay',async()=>{
  for(const fault of ['email.after','email.false']){
    const f=fixture();f.setFault(fault);const r=await activate(f);
    assert.equal(r.invitation_sent,false);assert.equal(r.invitation_error,'INVITATION_DELIVERY_UNCONFIRMED');
    await activate(f);assert.equal(f.calls.emails,1);
  }
});
test('renewal repeated or concurrent adds exactly one 90-day term',async()=>{
  const f=fixture({Account:[account({status:'active',first_activated_at:'2026-01-01T00:00:00Z',soundproof_access_expires_at:'2027-02-01T00:00:00Z'})]});
  const start=Date.parse(f.data.Account[0].soundproof_access_expires_at);
  await Promise.all([renew(f),renew(f)]);
  const expiry=f.data.Account[0].soundproof_access_expires_at;
  assert.equal(Date.parse(expiry)-start,90*86400000);assert.equal((await renew(f)).replay,true);
  assert.equal(f.data.Account[0].soundproof_access_expires_at,expiry);
});
test('renewal cannot reuse activation nonce or renew an unactivated/suspended account',async()=>{
  const f=fixture();assert.equal((await renew(f)).ok,false);await activate(f);
  assert.equal((await renew(f)).ok,false);
  f.data.Account[0].status='suspended';assert.equal((await renew(f)).error,'ACCOUNT_SUSPENDED');
});
test('renewal does not re-enable removed, suspended or price-list-only users',async()=>{
  const f=fixture({Account:[account({status:'active',first_activated_at:'2026-01-01T00:00:00Z',soundproof_access_expires_at:'2027-02-01T00:00:00Z'})],
    User:[user({soundproof_access_enabled:false,access_level:'PRICE_LIST_ONLY'})],AccountMembership:[member({status:'removed'})]});
  const before=structuredClone(f.data.User);assert.equal((await renew(f)).ok,true);
  assert.deepEqual(f.data.User,before);
});
test('lost renewal acknowledgement cannot add another term',async()=>{
  const f=fixture({Account:[account({status:'active',first_activated_at:'2026-01-01T00:00:00Z',soundproof_access_expires_at:'2027-02-01T00:00:00Z'})]});
  f.setFault('Account.term.after');await assert.rejects(()=>renew(f));
  const expiry=f.data.Account[0].soundproof_access_expires_at;
  assert.equal((await renew(f)).error,'ACCOUNT_OPERATION_BUSY');
  // Model an explicit administrator release only to verify the durable reservation.
  f.data.Account[0].creation_lock_holder=null;
  assert.equal((await renew(f)).error,'RENEWAL_REQUIRES_REVIEW');
  assert.equal(f.data.Account[0].soundproof_access_expires_at,expiry);
});
test('first verified invited login starts the 90-day term once; returning never extends it',async()=>{
  const f=fixture();await activate(f);const u=user({id:'first',email:'first@example.invalid',account_id:null,account_role:null,soundproof_access_enabled:false});
  f.data.User.push(u);const r=await access.resolveAccountAccess(f.base44,u,{bootstrapLegacyMembership:false});
  assert.equal(r.allowed,true);assert.equal(f.data.Account[0].status,'active');
  const expiry=f.data.Account[0].soundproof_access_expires_at,first=f.data.Account[0].first_activated_at;
  assert.equal(Date.parse(expiry)-Date.parse(first),90*86400000);
  assert.equal(f.data.AccountMembership[0].user_id,'first');assert.equal(f.data.User[0].soundproof_access_enabled,true);
  assert.equal((await access.resolveAccountAccess(f.base44,f.data.User[0])).allowed,true);
  assert.equal(f.data.Account[0].soundproof_access_expires_at,expiry);
});
test('unverified, wrong-email and wrong-account claims never start a term',async()=>{
  for(const p of [{is_verified:false},{email:'wrong@example.invalid'},{account_id:'b'}]){
    const f=fixture();await activate(f);const u=user({id:'first',email:'first@example.invalid',account_id:null,...p});f.data.User.push(u);
    await assert.rejects(()=>portal.startSoundProofTermOnFirstClaim(f.service,{accountId:'a',user:u,membership:f.data.AccountMembership[0]}));
    assert.equal(f.data.Account[0].status,'inactive');assert.equal(f.data.Account[0].soundproof_access_expires_at,undefined);
  }
});
test('simultaneous first claims cannot extend or restart the term',async()=>{
  const f=fixture();await activate(f);const u=user({id:'first',email:'first@example.invalid',account_id:null});f.data.User.push(u);
  const results=await Promise.allSettled([1,2].map(()=>access.resolveAccountAccess(f.base44,u,{bootstrapLegacyMembership:false})));
  assert.ok(results.some(r=>r.status==='fulfilled'&&r.value.allowed));
  const expiry=f.data.Account[0].soundproof_access_expires_at;
  await access.resolveAccountAccess(f.base44,f.data.User[0]);assert.equal(f.data.Account[0].soundproof_access_expires_at,expiry);
});
test('ordinary users cannot manage or invite members',async()=>{
  const f=activeFixture();f.data.AccountMembership[0]={...member(),is_account_admin:false,membership_role:'full_access'};
  f.data.User[0].account_role='account_user';
  const r=await invite(handler(f),'new@example.invalid');assert.equal(r.status,403);assert.equal(f.calls.emails,0);
});
test('administrator invites second independent user, verified login joins same account without admin rights',async()=>{
  const f=activeFixture();const fn=handler(f);
  assert.equal((await invite(fn,'second@example.invalid')).status,201);
  const second=user({id:'second',email:'second@example.invalid',account_id:null,account_role:null,soundproof_access_enabled:false});
  f.data.User.push(second);const r=await access.resolveAccountAccess(f.base44,second,{bootstrapLegacyMembership:false});
  assert.equal(r.allowed,true);assert.equal(r.user.account_id,'a');assert.equal(r.capabilities.manageUsers,false);
  assert.equal(f.data.AccountMembership.length,2);
});
test('duplicate and simultaneous invitations reserve one seat and send one email',async()=>{
  const f=activeFixture(),fn=handler(f);
  await Promise.all([invite(fn,'second@example.invalid'),invite(fn,'second@example.invalid')]);
  assert.equal((await invite(fn,'second@example.invalid')).status,409);
  assert.equal(f.data.AccountMembership.length,2);assert.equal(f.calls.emails,1);
});
test('five-seat limit holds for competing invitations with four occupied seats',async()=>{
  const extra=[1,2,3].map(i=>member({id:'seat'+i,email:'seat'+i+'@example.invalid',user_id:null,status:'pending',is_account_admin:false,membership_role:'full_access'}));
  const f=activeFixture(extra),fn=handler(f);
  const r=await Promise.all([invite(fn,'new1@example.invalid'),invite(fn,'new2@example.invalid')]);
  assert.equal(f.data.AccountMembership.length,5);assert.equal(r.filter(x=>x.status===201).length,1);
  assert.equal((await invite(fn,'new3@example.invalid')).status,409);assert.equal(f.calls.emails,1);
});
test('invitation target linked to another account is rejected without email or record changes',async()=>{
  const f=activeFixture();f.data.User.push(user({id:'foreign',email:'foreign@example.invalid',account_id:'b'}));
  assert.equal((await invite(handler(f),'foreign@example.invalid')).status,409);
  assert.equal(f.calls.emails,0);assert.equal(f.data.AccountMembership.length,1);
});
test('lost invitation acknowledgement reserves the seat and does not automatically resend',async()=>{
  const f=activeFixture(),fn=handler(f);f.setFault('email.after');
  assert.equal((await invite(fn,'second@example.invalid')).status,201);
  assert.equal((await invite(fn,'second@example.invalid')).status,409);
  assert.equal(f.data.AccountMembership.length,2);assert.equal(f.calls.emails,1);
  assert.equal(f.data.AccountUserAudit.find(a=>a.action==='INVITED').details.invitation_sent,false);
});
test('immediate repeated explicit resend cannot duplicate a delivery attempt',async()=>{
  const f=activeFixture(),fn=handler(f);await invite(fn,'second@example.invalid');
  const seat=f.data.AccountMembership[1];
  const r=await invite(fn,seat.email,{action:'resend',membership_id:seat.id});
  assert.equal(r.status,409);assert.equal(f.calls.emails,1);
});
test('activation and membership handling never write credits, promotions or projects',async()=>{
  const f=fixture();await activate(f);
  const m=activeFixture();await invite(handler(m),'second@example.invalid');
  assert.ok([...f.calls.writes,...m.calls.writes].every(x=>!/(CapacityLedger|Promotion|Project)/.test(x)));
});

test('stale admin user metadata cannot override an explicit ordinary membership',async()=>{
  const f=activeFixture();
  f.data.AccountMembership[0]={...member(),is_account_admin:false,membership_role:'full_access'};
  const r=await invite(handler(f),'second@example.invalid');
  assert.equal(r.status,403);assert.equal(f.calls.emails,0);
});


test('read-only authority also ignores stale admin metadata for an ordinary membership',async()=>{
  const readonly=moduleAt('base44/shared/accountAccessReadOnly.js',{
    ...rules,readPilotPortalAccess:async()=>({required:false,allowed:true}),
  },['resolveAccountAccessReadOnly']);
  const f=activeFixture();f.data.AccountMembership[0]={...member(),is_account_admin:false,membership_role:'full_access'};
  const r=await readonly.resolveAccountAccessReadOnly({
    base44:f.base44,entities:f.service.entities,sessionUser:f.data.User[0],bootstrapLegacyMembership:false,
  });
  assert.equal(r.allowed,true);assert.equal(r.capabilities.manageUsers,false);
});
test('actual Portal handler rejects unauthorised calls and returns retryable conflict for competing redemption',async()=>{
  const esbuild=await import('/app/node_modules/esbuild/lib/main.js');
  const f=fixture();
  const transformed=esbuild.transformSync(source('base44/functions/portalSoundProofAccess/entry.ts'),{loader:'ts',format:'esm'}).code
    .replace(/^import[\s\S]*?;\n/gm,'').replace(/export\s*\{[\s\S]*?\};?/g,'');
  const deps={...portal,createClientFromRequest:()=>f.base44};
  const name=/async function ([\w$]+)\(/.exec(transformed)[1];
  const fn=new Function(...Object.keys(deps),transformed+'\nreturn '+name)(...Object.values(deps));
  const req=(authorized=true)=>new Request('https://synthetic.invalid/activate',{method:'POST',
    headers:{'Content-Type':'application/json',...(authorized?{authorization:'Bearer synthetic-secret'}:{})},
    body:JSON.stringify({grant:rawGrant()}),
  });
  assert.equal((await fn(req(false))).status,401);assert.equal(f.calls.emails,0);
  const responses=await Promise.all([fn(req()),fn(req())]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(f.calls.emails,1);
  assert.equal((await (await fn(req())).json()).replay,true);
});
test('existing unexpired account with unknown historical first activation can renew without rewriting history',async()=>{
  const f=fixture({Account:[account({status:'active',soundproof_access_expires_at:'2027-02-01T00:00:00Z'})]});
  assert.equal((await renew(f)).ok,true);assert.equal(f.data.Account[0].first_activated_at,undefined);
});

