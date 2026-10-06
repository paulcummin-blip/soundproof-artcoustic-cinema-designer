/** Internal attribution only. Offsets are zero-based, end-exclusive in section text. */
export function attributeViolation(entry, { text, sentence = null, clause = null, match = null, ruleId = null, blockId = null } = {}) {
  const source = String(text || '');
  let exact = clause || sentence;
  let matched = match;
  // Figure/product errors contain their token as the last part of the detail.
  if (!exact && entry.detail) {
    const token = entry.detail.split(':').pop();
    const at = source.toLowerCase().indexOf(String(token).toLowerCase());
    if (at >= 0) {
      exact = source.split(/(?<=[.!?;])\s+|\n+/).find(s => s.toLowerCase().includes(String(token).toLowerCase())) || source;
      matched = source.slice(at, at + token.length);
    }
  }
  const start = exact ? source.indexOf(exact) : -1;
  const at = matched && start >= 0 ? source.indexOf(matched, start) : -1;
  return {
    ...entry,
    sentence: sentence || exact || null,
    clause: clause || exact || null,
    matched_substring: matched || null,
    span: at >= 0 ? { start: at, end: at + matched.length } : null,
    clause_span: start >= 0 ? { start, end: start + exact.length } : null,
    rule_id: ruleId || entry.code,
    block_id: blockId || (entry.claim_ids || []).find(id => id.startsWith('block_')) || null,
    cited_claim_ids: entry.claim_ids || [],
  };
}