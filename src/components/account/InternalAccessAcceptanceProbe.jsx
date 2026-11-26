import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';

// Temporary browser acceptance surface; removed before release.
// Uses the real signed-in SDK client and ordinary RLS. No impersonation.
export default function InternalAccessAcceptanceProbe() {
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (kind) => {
    if (busy) return;
    setBusy(true);
    try {
      const me = await base44.auth.me();
      if (kind === 'identity') { setResult(JSON.stringify({id:me.id,email:me.email,role:me.role},null,2)); return; }
      if (me.id !== '6b082619a79038b8d957121f' || me.role !== 'user' || me.account_id !== '6afec9e83b4359ee843e1b36') throw new Error('Use the existing internal non-admin identity. No probe was performed.');
      const rows = [];
      if (kind === 'read') {
        const records = await base44.entities.Project.filter({id:'6b08548c4d63965ed1665c4e'});
        rows.push({test:'protected_project_read',returned:records.length,at:new Date().toISOString()});
      } else if (kind === 'locks') {
        const attempts = {account_id:'INTERNAL-NO-ACCOUNT',account_role:'admin',access_level:'PRICE_LIST_ONLY',app_role:'Viewer',dealer_account_id:'INTERNAL-NO-DEALER',dealer_name:'INTERNAL FIELD LOCK TEST',soundproof_access_enabled:!me.soundproof_access_enabled};
        for (const [field,value] of Object.entries(attempts)) {
          try {
            await base44.auth.updateMe({[field]:value});
            const after = await base44.auth.me();
            const changed = after[field] === value && me[field] !== value;
            rows.push({field,denied:!changed,response:'accepted',changed});
            if(changed) { setResult(JSON.stringify(rows,null,2)); throw new Error('STOP: authoritative field changed; internal test restoration is required.'); }
          } catch (error) {
            if (String(error.message).startsWith('STOP:')) throw error;
            const status=error?.status || error?.response?.status;
            rows.push({field,denied:status===403,message:error?.message,status});
          }
        }
      }
      setResult(JSON.stringify({identity:me.email,role:me.role,results:rows},null,2));
    } catch(error) { setResult(previous=>previous+'\n'+error.message); }
    finally {setBusy(false);}
  };
  return <div className="fixed inset-0 z-[20000] overflow-auto bg-white p-8">
    <h1>Internal access acceptance</h1>
    <p>Existing internal test identity only. These controls use normal application permissions.</p>
    <div className="flex gap-4 my-4">
      <button disabled={busy} onClick={()=>run('identity')}>Check signed-in identity</button>
      <button disabled={busy} onClick={()=>run('read')}>Check protected project read</button>
      <button disabled={busy} onClick={()=>run('locks')}>Check seven protected fields</button>
      <button disabled={busy} onClick={()=>base44.auth.logout(window.location.href)}>Sign out for internal test</button>
    </div>
    <pre className="whitespace-pre-wrap">{busy?'Checking…':result}</pre>
  </div>;
}
