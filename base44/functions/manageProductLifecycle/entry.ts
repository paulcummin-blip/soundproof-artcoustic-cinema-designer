import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Admin-only Product Master lifecycle management for the test-stage catalogue.
 * Deactivation preserves the commercial record.
 * Deletion permanently removes only the ProductPrice record and never touches
 * the linked engineering registry stored in application code.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const productId = String(body.product_id || '');

    if (!productId || !['deactivate', 'delete'].includes(action)) {
      return Response.json({ error: 'A valid action and product_id are required.' }, { status: 400 });
    }

    const products = await base44.asServiceRole.entities.ProductPrice.filter({ id: productId });
    const product = Array.isArray(products) && products.length > 0 ? products[0] : null;
    if (!product) {
      return Response.json({ error: 'Product not found.' }, { status: 404 });
    }

    if (action === 'deactivate') {
      await base44.asServiceRole.entities.ProductPrice.update(productId, { active: false });
      return Response.json({
        success: true,
        action,
        product_id: productId,
        sku: product.sku,
      });
    }

    await base44.asServiceRole.entities.ProductPrice.delete(productId);
    return Response.json({
      success: true,
      action,
      product_id: productId,
      sku: product.sku,
    });
  } catch (error) {
    return Response.json({
      error: error?.message || 'Unable to manage this Product Master record.',
    }, { status: 500 });
  }
}
