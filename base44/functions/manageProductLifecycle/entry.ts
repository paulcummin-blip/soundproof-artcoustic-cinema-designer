import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Admin-only product lifecycle management.
 * Actions:
 *   - check_references: scans saved projects for references to the product SKU/label
 *   - trash: verifies the product is unreferenced, then marks it trashed (hidden, preserved)
 * Hard delete is intentionally not available.
 */

function buildSearchTokens(product) {
  const tokens = new Set();
  const sku = String(product.sku || '').trim().toLowerCase();
  if (sku) tokens.add(sku);
  if (sku.includes(':')) tokens.add(sku.split(':')[0]);
  const engineeringKey = String(product.engineering_key || '').trim().toLowerCase();
  if (engineeringKey) tokens.add(engineeringKey);
  const label = String(product.label || '').replace(/\s*\(surround\)\s*$/i, '').trim().toLowerCase();
  if (label) tokens.add(label);
  return [...tokens];
}

function findReferencesInProject(project, tokens) {
  const matches = [];
  const checkModel = (model, field, context) => {
    if (!model) return;
    const modelLower = String(model).trim().toLowerCase();
    if (!modelLower) return;
    for (const token of tokens) {
      if (modelLower === token) {
        matches.push({ field, ...context, matched_model: model });
        break;
      }
    }
  };

  if (Array.isArray(project.selected_speakers)) {
    for (const sp of project.selected_speakers) {
      if (sp && typeof sp === 'object') {
        checkModel(sp.model, 'selected_speakers', { role: sp.role });
      }
    }
  }

  if (project.selected_speakers_by_role && typeof project.selected_speakers_by_role === 'object' && !Array.isArray(project.selected_speakers_by_role)) {
    for (const [role, model] of Object.entries(project.selected_speakers_by_role)) {
      if (typeof model === 'string') {
        checkModel(model, 'selected_speakers_by_role', { role });
      }
    }
  }

  for (const field of ['subwoofers', 'subwooferInstances']) {
    if (Array.isArray(project[field])) {
      for (const sub of project[field]) {
        if (sub && typeof sub === 'object') {
          checkModel(sub.model, field, {});
        }
      }
    }
  }

  if (Array.isArray(project.spl_speaker_nodes)) {
    for (const node of project.spl_speaker_nodes) {
      if (node && typeof node === 'object') {
        checkModel(node.model || node.sku, 'spl_speaker_nodes', {});
      }
    }
  }

  return matches;
}

async function scanProjectReferences(base44, tokens) {
  const references = [];
  let cursor = null;
  let hasMore = true;

  while (hasMore) {
    const query = cursor ? { created_date: { $lt: cursor } } : {};
    const batch = await base44.asServiceRole.entities.Project.filter(query, '-created_date', 500);
    const items = Array.isArray(batch) ? batch : [];

    for (const project of items) {
      const matches = findReferencesInProject(project, tokens);
      if (matches.length > 0) {
        references.push({
          project_id: project.id,
          project_name: project.name,
          client_name: project.client_name,
          match_count: matches.length,
          fields: [...new Set(matches.map((m) => m.field))],
        });
      }
    }

    if (items.length < 500) {
      hasMore = false;
    } else {
      cursor = items[items.length - 1]?.created_date;
      if (!cursor) hasMore = false;
    }
  }

  return references;
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
    const action = String(body.action || '');
    const productId = String(body.product_id || '');
    const sku = String(body.sku || '');

    if (!action || !productId || !sku) {
      return Response.json({ error: 'action, product_id and sku are required.' }, { status: 400 });
    }

    const products = await base44.asServiceRole.entities.ProductPrice.filter({ id: productId });
    const product = Array.isArray(products) && products.length > 0 ? products[0] : null;
    if (!product) return Response.json({ error: 'Product not found.' }, { status: 404 });

    const tokens = buildSearchTokens(product);
    const references = await scanProjectReferences(base44, tokens);
    const referenceCount = references.length;

    if (action === 'check_references') {
      return Response.json({
        can_trash: referenceCount === 0,
        reference_count: referenceCount,
        references: references.slice(0, 50),
        total_references: referenceCount,
      });
    }

    if (action === 'trash') {
      if (referenceCount > 0) {
        return Response.json({
          can_trash: false,
          reference_count: referenceCount,
          references: references.slice(0, 50),
          error: 'Product is referenced by saved projects and cannot be moved to trash.',
        }, { status: 409 });
      }
      await base44.asServiceRole.entities.ProductPrice.update(productId, {
        active: false,
        trashed: true,
      });
      return Response.json({
        can_trash: true,
        trashed: true,
        reference_count: 0,
      });
    }

    return Response.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error?.message || 'Unable to process product lifecycle action.' }, { status: 500 });
  }
}