import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveAccountAccess } from '../../shared/accountAccessAuthority.js';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const sessionUser = await base44.auth.me();
    if (!sessionUser) {
      return Response.json({ allowed: false, reason: 'UNAUTHENTICATED' }, { status: 401 });
    }

    const context = await resolveAccountAccess(base44, sessionUser);
    const status = context.allowed
      ? 200
      : context.reason === 'ACCOUNT_SUSPENDED'
        ? 423
        : 403;
    return Response.json(context, { status });
  } catch (error) {
    return Response.json({
      allowed: false,
      reason: 'ACCESS_CONTEXT_FAILED',
      message: error?.message || 'Unable to resolve account access.',
    }, { status: 500 });
  }
}
