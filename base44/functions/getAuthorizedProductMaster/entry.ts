import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveAccountAccess } from '../../shared/accountAccessAuthority.js';

function forbidden() {
  const error = new Error('FORBIDDEN');
  error.code = 'FORBIDDEN';
  throw error;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const sessionUser = await base44.auth.me();
    if (!sessionUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const context = await resolveAccountAccess(base44, sessionUser);
    const canEdit = sessionUser.role === 'admin' || context?.capabilities?.masterAdmin === true;
    const canUseSoundProof = context?.capabilities?.soundProof === true;
    const canViewPrices = canEdit || context?.capabilities?.priceList === true;

    if (!context?.allowed || (!canUseSoundProof && !canViewPrices)) forbidden();

    const products = await base44.asServiceRole.entities.ProductPrice.filter({ trashed: { $ne: true } }, 'selector_order', 500);
    const safeProducts = (Array.isArray(products) ? products : []).map((record) => {
      if (canViewPrices) return record;
      const { price_ex_vat: _redactedPrice, ...redacted } = record;
      return redacted;
    });

    return Response.json({
      products: safeProducts,
      can_edit: canEdit,
      can_view_prices: canViewPrices,
      territory: context.account?.territory || context.user?.territory || 'UK',
    });
  } catch (error) {
    if (error?.code === 'FORBIDDEN' || error?.message === 'FORBIDDEN') {
      return Response.json({ error: 'Product catalogue access is not enabled for this login.' }, { status: 403 });
    }
    return Response.json({ error: error?.message || 'Unable to load the Product Master.' }, { status: 500 });
  }
}