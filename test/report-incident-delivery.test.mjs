import test from 'node:test';
import assert from 'node:assert/strict';
import {recordSystemIncident} from '../base44/shared/systemHealth/incidentRecorder.js';
function fixture({failEmail=false}={}) {
 const rows=[],occurrences=[],mail=[];
 const incidentsById=new Map();
 function syncMap(){for(const r of rows)incidentsById.set(r.id,r);}
 const client={asServiceRole:{entities:{
  SystemHealthIncident:{
   filter:async q=>{
    const gk=q.notification_group_key;
    const statusFilter=q.incident_status;
    const matches=rows.filter(x=>{
     if(gk&&x.notification_group_key!==gk)return false;
     if(statusFilter){
      if(statusFilter.$in&&!statusFilter.$in.includes(x.incident_status))return false;
      if(typeof statusFilter==='string'&&x.incident_status!==statusFilter)return false;
     }
     return true;
    });
    if(q.$or){
     return matches.filter(x=>{
      return q.$or.some(cond=>{
       for(const[k,v]of Object.entries(cond)){
        if(v===null){if(x[k]!=null)return false;}
        else if(v&&v.$lt){if(!(x[k]&&new Date(x[k])<new Date(v.$lt)))return false;}
        else if(x[k]!==v)return false;
       }
       return true;
      });
     });
    }
    return matches;
   },
   create:async data=>{const row={occurrence_count:1,initial_notification_claimed:false,critical_notification_sent:false,recurrence_claimed:false,notifications_sent_count:0,affected_production_accounts:[],...data,id:String(rows.length+1)};rows.push(row);syncMap();return row;},
   get:async id=>incidentsById.get(id)||rows.find(x=>x.id===id)||null,
   update:async(id,patch)=>{const r=rows.find(x=>x.id===id);if(r)Object.assign(r,patch);return r;},
   updateMany:async(query,update)=>{
    const matches=rows.filter(x=>{
     if(query.id&&x.id!==query.id)return false;
     for(const[k,v]of Object.entries(query)){
      if(k==='id'||k==='$or')continue;
      if(k==='incident_status'){
       if(v&&v.$in&&!v.$in.includes(x.incident_status))return false;
       if(typeof v==='string'&&x.incident_status!==v)return false;
       continue;
      }
      if(k==='initial_notification_claimed'&&x[k]!==v)return false;
      if(k==='critical_notification_sent'&&x[k]!==v)return false;
      if(k==='recurrence_claimed'&&x[k]!==v)return false;
      if(k==='affected_production_accounts'&&v&&v.$nin){
       const arr=x[k]||[];if(v.$nin.some(a=>arr.includes(a)))return false;continue;
      }
      if(v===null){if(x[k]!=null)return false;continue;}
      if(x[k]!==v)return false;
     }
     if(query.$or){
      const orMatch=query.$or.some(cond=>{
       for(const[k,v]of Object.entries(cond)){
        if(v===null){if(x[k]!=null)return false;}
        else if(v&&v.$lt){if(!(x[k]&&new Date(x[k])<new Date(v.$lt)))return false;}
        else if(x[k]!==v)return false;
       }
       return true;
      });
      if(!orMatch)return false;
     }
     return true;
    });
    for(const r of matches){
     if(update.$set)Object.assign(r,update.$set);
     if(update.$inc){for(const[k,v]of Object.entries(update.$inc))r[k]=(r[k]||0)+v;}
     if(update.$addToSet){for(const[k,v]of Object.entries(update.$addToSet)){if(!Array.isArray(r[k]))r[k]=[];if(!r[k].includes(v))r[k].push(v);}}
    }
    return{updated:matches.length};
   },
  },
  IncidentOccurrence:{
   create:async data=>{const row={...data,id:String(occurrences.length+1)};occurrences.push(row);return row;},
   update:async(id,patch)=>{const r=occurrences.find(x=>x.id===id);if(r)Object.assign(r,patch);return r;},
  },
  SystemConfig:{filter:async()=>[{system_health:{alerts_enabled:true,alert_recipients:['owner@example.test']}}]},
  Account:{filter:async()=>[{name:'Test dealer'}]},Project:{filter:async()=>[{name:'Test project',client_name:'Client A',project_reference:'Cinema Room',account_id:'account-a'}]},ProjectVersion:{filter:async()=>[{name:'Original Design'}]}
}},integrations:{Core:{SendEmail:async msg=>{if(failEmail)throw Error('provider unavailable');mail.push(msg);}}}};
 return {client,rows,mail,occurrences};
}
const details={component:'report_readiness',operation:'technical_report',error_code:'REPORT_SAVED_EVIDENCE_REJECTED',severity:'high'};
test('saved-evidence rejection records high incident and sends one alert, repeats deduplicate',async()=>{
 const f=fixture();const a=await recordSystemIncident(f.client,details);const b=await recordSystemIncident(f.client,details);
 assert.equal(a.notification_status,'sent');assert.equal(b.created,false);assert.equal(f.rows.length,1);assert.equal(f.mail.length,1);
 assert.equal(f.rows[0].occurrence_count,2);
 assert.equal(f.occurrences.length,2,'two occurrence records preserved');
 assert.equal(f.rows[0].user_blocked,true);
});
test('different error mechanisms retain separately actionable incidents',async()=>{
 const f=fixture();
 await recordSystemIncident(f.client,details);
 await recordSystemIncident(f.client,{...details,error_code:'REPORT_EVIDENCE_READ_FAILED'});
 assert.equal(f.rows.length,2,'different mechanisms → different groups');
 assert.equal(f.mail.length,2,'each group sends its own initial email');
});
test('email failure is visible on the saved incident and does not throw',async()=>{
 const f=fixture({failEmail:true});const result=await recordSystemIncident(f.client,details);
 assert.equal(result.recorded,true);assert.equal(result.notification_status,'failed');
});
test('verified account, project, client, reference and version are saved and included in email',async()=>{
 const f=fixture();await recordSystemIncident(f.client,{...details,account_id:'account-a',project_id:'project-a',version_id:'version-a',error_detail:'Known rendering failure'});
 for(const value of ['Test dealer','Test project','Client A','Cinema Room','Original Design','project-a','version-a','Known rendering failure'])assert.ok(f.mail[0].html.includes(value),value);
 assert.equal(f.rows[0].account_name,'Test dealer');assert.equal(f.rows[0].version_name,'Original Design');
});
test('names are escaped in email and controlled tests do not claim a dealer is blocked',async()=>{
 const f=fixture();f.client.asServiceRole.entities.Project.filter=async()=>[{name:'<script>bad</script>',account_id:'account-a'}];
 await recordSystemIncident(f.client,{...details,project_id:'project-a',test_run_id:'ux-test-12345',operation:'controlled_alert_test',error_code:'RENDER_FAILED'});
 assert.ok(!f.mail[0].html.includes('<script>'),'raw script tag must not be present');
 assert.ok(f.mail[0].html.includes('script'),'escaped script text must be present');
 assert.equal(f.rows[0].user_blocked,false);
});
test('email subject identifies PREVIEW or PRODUCTION',async()=>{
 const f=fixture();await recordSystemIncident(f.client,{...details,runtime_environment:'preview'});
 assert.ok(f.mail[0].subject.includes('| PREVIEW |'),'preview subject');
 const f2=fixture();await recordSystemIncident(f2.client,{...details,runtime_environment:'deployed'});
 assert.ok(f2.mail[0].subject.includes('| PRODUCTION |'),'production subject');
});
test('occurrence count and notifications sent count are distinct',async()=>{
 const f=fixture();
 await recordSystemIncident(f.client,details);
 await recordSystemIncident(f.client,details);
 await recordSystemIncident(f.client,details);
 assert.equal(f.rows[0].occurrence_count,3,'3 occurrences recorded');
 assert.equal(f.rows[0].notifications_sent_count,1,'only 1 email sent');
 assert.equal(f.occurrences.length,3,'3 occurrence records in the database');
});