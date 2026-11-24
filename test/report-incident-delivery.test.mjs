import test from 'node:test';
import assert from 'node:assert/strict';
import {recordSystemIncident} from '../base44/shared/systemHealth/incidentRecorder.js';
function fixture({failEmail=false}={}) {
 const rows=[],mail=[];
 const client={asServiceRole:{entities:{
  SystemHealthIncident:{filter:async q=>rows.filter(x=>x.grouping_fingerprint===q.grouping_fingerprint && ['open','investigating'].includes(x.incident_status)),
   create:async data=>{const row={...data,id:String(rows.length+1)};rows.push(row);return row;},
   update:async(id,patch)=>Object.assign(rows.find(x=>x.id===id),patch)},
  SystemConfig:{filter:async()=>[{system_health:{alerts_enabled:true,alert_recipients:['owner@example.test']}}]},
  Account:{get:async()=>({name:'Test dealer'})},Project:{get:async()=>({name:'Test project'})}
 }},integrations:{Core:{SendEmail:async msg=>{if(failEmail)throw Error('provider unavailable');mail.push(msg);}}}};
 return {client,rows,mail};
}
const details={component:'report_readiness',operation:'technical_report',error_code:'REPORT_SAVED_EVIDENCE_REJECTED',severity:'high',grouping_scope:'project-a::version-a'};
test('saved-evidence rejection records high incident and sends one alert, repeats deduplicate',async()=>{
 const f=fixture();const a=await recordSystemIncident(f.client,details);const b=await recordSystemIncident(f.client,details);
 assert.equal(a.notification_status,'sent');assert.equal(b.created,false);assert.equal(f.rows.length,1);assert.equal(f.mail.length,1);assert.equal(f.rows[0].occurrence_count,2);
 assert.equal(f.rows[0].user_blocked,true);
});
test('different project/version retains a separately actionable incident',async()=>{
 const f=fixture();await recordSystemIncident(f.client,details);await recordSystemIncident(f.client,{...details,grouping_scope:'project-b::version-b'});
 assert.equal(f.rows.length,2);assert.equal(f.mail.length,2);
});
test('email failure is visible on the saved incident and does not throw',async()=>{
 const f=fixture({failEmail:true});const result=await recordSystemIncident(f.client,details);
 assert.equal(result.recorded,true);assert.equal(result.notification_status,'failed');assert.equal(f.rows[0].notification_error,'provider unavailable');
});
