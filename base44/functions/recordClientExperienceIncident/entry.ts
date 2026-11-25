import { authIncidentAccount, safeAuthCorrelation } from '../../shared/systemHealth/authIncident.js';
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {loadOwnedProject, loadOwnedProjectVersion} from '../../shared/publishedEngineeringRead.js';
import {recordSystemIncident} from '../../shared/systemHealth/incidentRecorder.js';
import {CLIENT_FAILURES, safeDiagnostic, safeRoute} from '../../shared/systemHealth/clientIncidentPolicy.js';

export default async function(req) {
 try {
  const base44=createClientFromRequest(req);
  const user=await base44.auth.me();
  if(!user) return Response.json({error:'UNAUTHENTICATED'},{status:401});
  const body=await req.json().catch(()=>({}));
  const code=body.error_code;
  if(!Object.hasOwn(CLIENT_FAILURES,code)) return Response.json({error:'INVALID_CODE'},{status:400});
  // Authenticated identity and project ownership are checked on the server.
  // Monitoring never bootstraps memberships, activation or account links.
  const access={isMasterAdmin:user.role==='admin',user};
  const id=x=>/^[a-f0-9]{24}$/.test(String(x||''))?String(x):null;
  let projectId=id(body.project_id),versionId=id(body.version_id),accountId=id(user.account_id);
  if(projectId) {
   try {
    const owned=versionId ? await loadOwnedProjectVersion(base44.asServiceRole,projectId,versionId,access)
     : await loadOwnedProject(base44.asServiceRole,projectId,access);
    accountId=owned.projectAccountId || accountId;
    versionId ||= owned.project.active_version_id || null;
   } catch(error) {
    if(error.code==='FORBIDDEN')return Response.json({error:'FORBIDDEN'},{status:403});
    // Record a failed project read for the authenticated account, without
    // claiming an unverified project belongs to it or disclosing its identity.
    projectId=null;versionId=null;
   }
  }
  const authenticationFailure=code==='AUTHENTICATION_CONTEXT_FAILED';
  if(authenticationFailure) {
    if(user.is_verified!==true)return Response.json({recorded:false,reason:'unverified_session'});
    try { accountId=await authIncidentAccount(base44.asServiceRole,user); } catch { accountId=null; }
    projectId=null;versionId=null;
  }
  const route=safeRoute(body.page_path);
  const operation=String(body.operation||'application').replace(/[^a-zA-Z0-9_.:-]/g,'').slice(0,100)||'application';
  const detail=safeDiagnostic(body.error_detail);
  const stack=safeDiagnostic(body.component_stack,1800);
  const testRunId=user.role==='admin' && /^ux-test-[a-zA-Z0-9-]{5,80}$/.test(String(body.test_run_id||'')) ? body.test_run_id : null;
  const result=await recordSystemIncident(base44,{
   runtime_environment:body.runtime_environment==='preview'?'preview':'deployed',component:authenticationFailure?'authentication':'user_experience',operation:testRunId?'controlled_alert_test':operation,error_code:code,severity:authenticationFailure?'critical':'high',
   operation_id:authenticationFailure?safeAuthCorrelation(body.correlation_id):null,
   account_id:accountId,project_id:projectId,version_id:versionId,page_path:route,
   error_detail:detail,component_stack:stack,
   test_run_id:testRunId,diagnostic_summary:(testRunId?'CONTROLLED TEST — '+operation+'. ':'')+CLIENT_FAILURES[code]+(authenticationFailure?' Authenticated user: '+user.id+'.':''), grouping_scope:[route,operation,authenticationFailure?user.id:'',testRunId||''].join('::'),
   stage_failed:operation, data_integrity_summary:'Monitoring did not change project data. Completion of the interrupted action has not been verified.',
  });
  return Response.json(result||{recorded:false,fail_open:true});
 }catch{return Response.json({recorded:false,fail_open:true});}
}