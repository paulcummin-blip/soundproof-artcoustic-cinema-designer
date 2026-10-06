/** Narrow clause boundaries and screen-location readings; never a blanket exemption. */
export function independentClauses(text) {
  const sentence = String(text || '');
  // A contrast's asserted half must not inherit the denial in its first half.
  const parts = sentence.split(/(?<=[;])\s+|,\s*(?=but\b)|\s+(?=but\b)/i);
  let offset = 0;
  return parts.filter(Boolean).map((clause) => {
    const start = sentence.indexOf(clause, offset);
    offset = start + clause.length;
    return { clause, start, end: offset };
  });
}

export function screenLocationQualifier(sentence, at, term) {
  if (!/^screens?$/i.test(term)) return false;
  const before = sentence.slice(0, at);
  const after = sentence.slice(at + term.length);
  // Only a named loudspeaker package changing AT the screen, not its size.
  return /\b(?:speaker|loudspeaker)\s+package\b[^.;!?]*\b(?:at|around)\s+(?:the\s+)?$/i.test(before)
    && /^(?:\s*[,.;!?]|\s+(?:and|around|overhead)\b|\s*$)/i.test(after);
}

/** Matches a real area change even when it is written with "different". */
export function directAreaDifference(sentence, head) {
  const term = `\\b${head}\\w*\\b`;
  const patterns = [
    new RegExp(`${term}\\s+(?:is|are|was|were)\\s+different\\b`, 'i'),
    new RegExp(`\\bdifferent\\s+${term}`, 'i'),
    new RegExp(`${term}\\s+(?:is|are)\\s+(?:larger|bigger|wider)\\b`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(sentence);
    if (match) return { at: match.index, keyword: head, phrase: false, matched: match[0] };
  }
  return null;
}

/** A change needs support for the subject, not an unrelated equipment claim. */
export function supportedChangeClause(clause, claims) {
  const changes = claims.filter(c => c.kind === 'factual_change' || c.kind === 'material_gain');
  const subjects = [];
  if (/\b(?:speaker|loudspeaker)\s+package\b|\bdifferent\s+(?:speakers|loudspeakers)\b/i.test(clause)) subjects.push('speakers');
  if (/\bdifferent\s+equipment\b/i.test(clause)) subjects.push('equipment');
  if (/\bdifferent\s+(?:cinema\s+)?formats?\b|\b(?:cinema\s+)?formats?\s+(?:is|are)\s+different\b/i.test(clause)) subjects.push('system_layout');
  if (/\bdifferent\s+room\b|\broom\s+is\s+different\b/i.test(clause)) subjects.push('room');
  if (/\bscreen\s+(?:size\s+)?(?:is\s+different|changes?)\b|\bdifferent\s+screen\b/i.test(clause)) subjects.push('screen_size');
  const equipment = ['speakers', 'lcr', 'surrounds', 'overheads', 'subwoofers', 'amplification'];
  return subjects.length === 0 || subjects.every(subject => changes.some(c =>
    subject === 'equipment' ? equipment.includes(c.area)
      : subject === 'speakers' ? ['speakers', 'lcr', 'surrounds', 'overheads'].includes(c.area)
      : c.area === subject));
}