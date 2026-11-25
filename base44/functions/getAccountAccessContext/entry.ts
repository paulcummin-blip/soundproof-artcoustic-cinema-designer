import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveAccountAccess } from '../../shared/accountAccessAuthority.js';
import { recordAuthIncident, safeAuthCorrelation, expectedAuthFailure } from '../../shared/systemHealth/authIncident.js';

export default async function(req) {
  let base44, sessionUser, correlationId, stage='authenticated_session';
  try {
    base44=createClientFromRequest(req);
    const body=await req.json().catch(()=>({}));
    correlationId=safeAuthCorrelation(body.correlation_id);
    sessionUser=await base44.auth.me();
    if(!sessionUser) return Response.json({allowed:false,reason:'UNAUTHENTICATED',correlation_id:correlationId},{status:401});
    stage='resolveAccountAccess';
    const context=await resolveAccountAccess(base44,sessionUser,{onStage:value=>{stage=value;}});
    return Response.json({...context,correlation_id:correlationId},{
      status:context.allowed?200:context.reason==='ACCOUNT_SUSPENDED'?423:403,
      headers:{'cache-control':'no-store'},
    });
  } catch(error) {
    const status=Number(error?.response?.status||error?.status||0);
    if(stage==='authenticated_session' && [401,403].includes(status)) {
      return Response.json({allowed:false,reason:'UNAUTHENTICATED',correlation_id:correlationId},{status:401});
    }
    const reason=error?.message==='ACCOUNT_OPERATION_BUSY'?'ACCOUNT_OPERATION_BUSY':'ACCESS_CONTEXT_FAILED';
    const incident=reason==='ACCOUNT_OPERATION_BUSY'||expectedAuthFailure(error)?null:
      await recordAuthIncident(base44,{user:sessionUser,stage,correlationId,error});
    console.error(JSON.stringify({event:'account_access_failed',correlation_id:correlationId,stage,reason}));
    return Response.json({
      allowed:false,reason,stage,correlation_id:correlationId,
      incident_reference:incident?.reference||null,
      message:reason==='ACCOUNT_OPERATION_BUSY'?'Another account operation is completing. Please retry.':'Sound Proof could not complete the account check. Please retry or quote the support reference.',
    },{status:reason==='ACCOUNT_OPERATION_BUSY'?409:500,headers:{'cache-control':'no-store'}});
  }
}
