import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { assertCapability, resolveAccountAccess } from '../../shared/accountAccessAuthority.js';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const sessionUser = await base44.auth.me();
    if (!sessionUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const context = await resolveAccountAccess(base44, sessionUser);
    assertCapability(context, 'priceList');

    const prices = await base44.asServiceRole.entities.ProductPrice.list('-created_date', 500);
    return Response.json({
      prices: Array.isArray(prices) ? prices : [],
      territory: context.account?.territory || context.user?.territory || 'UK',
    });
  } catch (error) {
    if (error?.code === 'FORBIDDEN' || error?.message === 'FORBIDDEN') {
      return Response.json({ error: 'Price list access is not enabled for this login.' }, { status: 403 });
    }
    return Response.json({ error: error?.message || 'Unable to load prices.' }, { status: 500 });
  }
}
