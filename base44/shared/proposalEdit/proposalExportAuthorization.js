function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const composition = rows => (Array.isArray(rows) ? rows : []).map(row => ({
  type: row.section_type, title: row.title || '', body: row.body || '',
  enabled: row.is_enabled !== false, order: row.order_index ?? 0,
  metadata: row.metadata || {},
})).sort((a, b) => a.type.localeCompare(b.type));

/** Pure authorization; nothing prints or persists before this passes. */
export function authorizeProposalExport({ validation, proposal, request, copy = [] }) {
  if (!validation?.valid) return { allowed: false, reason: validation?.blocked_reason || 'The complete proposal must pass validation before export.' };
  if (request.export_kind === 'copy') {
    if (request.generation_id !== validation.generation_id || (request.edit_id || null) !== validation.edit_id || !same(request.rendered_copy, copy)) {
      return { allowed: false, reason: 'The proposal copy changed. Reopen it before exporting.' };
    }
  } else if (!same(composition(request.rendered_sections), composition(validation.document_sections))
    || !same(request.engineering_snapshot, proposal.engineering_snapshot)) {
    return { allowed: false, reason: 'The document changed. Reopen the proposal before exporting.' };
  }
  return { allowed: true, reason: null };
}