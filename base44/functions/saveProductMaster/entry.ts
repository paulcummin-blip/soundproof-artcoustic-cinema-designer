import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const CATEGORIES = new Set([
  'Loudspeaker',
  'Subwoofer',
  'Amplifier',
  'Acoustic Treatment',
  'Accessory',
]);

const ROLES = new Set([
  'lcr',
  'centre_soundbar',
  'surround',
  'rear_surround',
  'front_wide',
  'overhead',
  'subwoofer',
]);

function badRequest(message) {
  return Response.json({ error: message }, { status: 400 });
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const productId = body.product_id ? String(body.product_id) : '';
    const input = body.product && typeof body.product === 'object' ? body.product : {};

    const sku = String(input.sku || '').trim().toLowerCase();
    const label = String(input.label || '').trim();
    const category = String(input.category || '');
    const needsEngineering = category === 'Loudspeaker' || category === 'Subwoofer';
    const engineeringKey = needsEngineering ? String(input.engineering_key || '').trim() : null;
    const price = input.price_ex_vat === null || input.price_ex_vat === ''
      ? null
      : Number(input.price_ex_vat);
    const selectorOrder = Number(input.selector_order);
    const roles = needsEngineering && Array.isArray(input.roles)
      ? [...new Set(input.roles.map(String).filter((role) => ROLES.has(role)))]
      : [];

    if (!sku || !label) return badRequest('Product ID / SKU and product name are required.');
    if (!CATEGORIES.has(category)) return badRequest('Select a valid product category.');
    if (needsEngineering && !engineeringKey) {
      return badRequest('Select the verified engineering model before saving this acoustic product.');
    }
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      return badRequest('Price must be a positive number or left blank for Price on request.');
    }

    // Client-side checks are only advisory. This server-side comparison is the
    // Product Master authority and prevents stale browser data from creating a
    // second commercial record for the same normalized SKU.
    const products = await base44.asServiceRole.entities.ProductPrice.list('-created_date', 500);
    const conflict = (Array.isArray(products) ? products : []).find((record) => (
      record.id !== productId
      && String(record.sku || '').trim().toLowerCase() === sku
      && record.trashed !== true
    ));
    if (conflict) {
      return Response.json({
        error: 'That Product ID / SKU already exists.',
        code: 'DUPLICATE_SKU',
        conflicting_product_id: conflict.id,
      }, { status: 409 });
    }

    const payload = {
      sku,
      label,
      category,
      price_ex_vat: price,
      active: input.active !== false,
      engineering_key: engineeringKey,
      roles,
      selector_order: Number.isFinite(selectorOrder) ? selectorOrder : null,
      catalog_version: 1,
    };

    if (productId) {
      const current = (Array.isArray(products) ? products : []).find((record) => record.id === productId);
      if (!current) return Response.json({ error: 'Product not found.' }, { status: 404 });
      await base44.asServiceRole.entities.ProductPrice.update(productId, payload);
      return Response.json({ success: true, action: 'updated', product_id: productId, sku });
    }

    const created = await base44.asServiceRole.entities.ProductPrice.create(payload);
    return Response.json({
      success: true,
      action: 'created',
      product_id: created?.id || null,
      sku,
    });
  } catch (error) {
    return Response.json({
      error: error?.message || 'The product could not be saved.',
    }, { status: 500 });
  }
}
