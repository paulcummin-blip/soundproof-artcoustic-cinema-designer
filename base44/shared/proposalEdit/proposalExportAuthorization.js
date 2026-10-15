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

/**
 * Pure authorization; nothing prints or persists before this passes.
 *
 * Two questions are asked, and they are not the same question. The evidence check
 * asks whether the document's own material holds. The approval state asks whether
 * a person has read each generated section and accepted its wording — a document
 * can pass every evidence check and still be unapproved, which is exactly the
 * case this gate exists for. When no approval state is supplied (a proposal with
 * no generated copy) nothing is added to the rules below.
 */
export function authorizeProposalExport({ validation, proposal, request, copy = [], approval = null }) {
  if (!validation?.valid) return { allowed: false, reason: validation?.blocked_reason || 'The complete proposal must pass validation before export.' };
  if (approval && !approval.all_approved) {
    return { allowed: false, reason: approval.block_reason || 'Every generated section has to be approved before the PDF can be issued.' };
  }
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