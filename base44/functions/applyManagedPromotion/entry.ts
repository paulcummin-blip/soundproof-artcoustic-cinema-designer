import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { applyPromotionGrant } from '../../shared/promotionGrantExecution.js';

export default async function(req) {
  const base44=createClientFromRequest(req);
  const user=await base44.auth.me();
  if(user?.role!=='admin') return Response.json({error:'Administrator access required.'},{status:403});
  try {
    return Response.json(await applyPromotionGrant(base44.asServiceRole,await req.json(),user));
  } catch(error) {
    return Response.json({error:error.message,code:error.code || 'GRANT_FAILED'},
      {status:error.code==='FORBIDDEN'?403:error.code==='INVALID_GRANT'?400:409});
  }
}
