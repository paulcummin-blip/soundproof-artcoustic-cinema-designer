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

/**
 * A SOUND MOVING BETWEEN LOUDSPEAKERS during playback: "a moving effect ... as
 * different speakers take over", "the voice passes from one speaker to another".
 *
 * This is tonal-continuity language about reproduction inside ONE design, not a
 * claim that the design's equipment differs from another option's. It is read as
 * such only where BOTH hold: the clause names the reproduced content (a voice, an
 * effect, the sound, the source) AND a handover or transition carries it between
 * loudspeakers. A comparison that says the loudspeaker package differs has neither,
 * so it stays exactly the change claim it always was.
 */
const REPRODUCED_CONTENT = /\b(?:voice|voices|effect|effects|sound|sounds|dialogue|instrument|instruments|music|score|source|track|soundtrack|audio|speech|line)\b/i;
const PLAYBACK_HANDOVER = /\b(?:takes?|taking)\s+over\b|\bhand(?:s|ing|ed)?\s+(?:over|it|them|on)\b|\bpass(?:es|ing)?\s+(?:to|between|from|into|through)\b|\bmov(?:es|ing)\s+(?:to|between|from|into|across|around)\b|\bcross(?:es|ing)\s+(?:to|between|over|from)\b|\btransition(?:s|ing)?\b|\bchanges?\s+direction\b|\bpicks?\s+up\b|\bcontinues?\s+(?:in|into|through|across|beside|above)\b|\b(?:carry|carries|carrying)\s+(?:on|over|it|them)\b|\breproduc(?:e|es|ing|ed)\b|\bhandl(?:e|es|ing|ed)\b|\b(?:drive|drives|driving|driven)\b/i;

/** Whether a clause describes playback handover rather than an equipment change. */
export function playbackHandoverClause(text) {
  const clause = String(text || '');
  if (clause.length === 0) return false;
  return REPRODUCED_CONTENT.test(clause) && PLAYBACK_HANDOVER.test(clause);
}

/** The loudspeaker families whose difference is read as an equipment change. */
const SPEAKER_FAMILY = /^(?:speakers?|loudspeakers?)$/i;

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
    if (!match) continue;
    // "different speakers" in a clause about a sound being handed between them is
    // playback handover, not a difference between designs.
    if (SPEAKER_FAMILY.test(head) && /\bdifferent\b/i.test(match[0]) && playbackHandoverClause(sentence)) continue;
    return { at: match.index, keyword: head, phrase: false, matched: match[0] };
  }
  return null;
}

/** A change needs support for the subject, not an unrelated equipment claim. */
export function supportedChangeClause(clause, claims) {
  const changes = claims.filter(c => c.kind === 'factual_change' || c.kind === 'material_gain');
  const subjects = [];
  // A named loudspeaker package is always a change of equipment. A bare "different
  // speakers" is only a change where the clause is NOT describing a sound handed
  // between the loudspeakers of this one design.
  if (/\b(?:speaker|loudspeaker)\s+package\b/i.test(clause)) subjects.push('speakers');
  else if (/\bdifferent\s+(?:speakers|loudspeakers)\b/i.test(clause) && !playbackHandoverClause(clause)) subjects.push('speakers');
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

/**
 * Comparison framing — a clause that says where the difference LIES between the
 * options ("the choice is between different equipment and levels of
 * performance within that format"), rather than asserting that a named area
 * itself changed. The distinction matters: a section can state what is shared
 * and still place the difference correctly, and test C in
 * test/proposal-shared-contrast-grounding.test.mjs holds a direct area
 * difference to the ordinary citation rule.
 */
const FRAMING_BETWEEN = /\bbetween\s+(?:the\s+)?(?:two\s+)?(?:different|differing)\b|\b(?:it|this|the\s+choice|the\s+difference|the\s+decision)\b[^.;!?]{0,40}\b(?:is|lies|comes)\s+between\b/i;

/** The families a framing clause can name, and the evidence each one needs. */
const FRAMING_FAMILIES = [
  {
    family: 'equipment',
    named: /\bequipment\b|\bspeakers?\b|\bloudspeakers?\b|\bsystems?\b/i,
    areas: ['speakers', 'lcr', 'surrounds', 'overheads', 'subwoofers', 'amplification'],
  },
  {
    family: 'performance',
    named: /\bperformance\b|\blevels?\s+of\s+performance\b|\bdynamic\s+range\b/i,
    areas: null,
  },
];

/**
 * A framing clause is grounded only when BOTH hold:
 *
 *   1. the section cites shared-result claims — the shared half of a
 *      shared-and-contrast section is genuinely cited, so this is never a bare
 *      change assertion dressed as framing; and
 *   2. the writer's own input carries the change evidence for every family the
 *      clause names — a factual-change claim for the equipment it points at, a
 *      material-gain claim for the performance it points at.
 *
 * With no such evidence, framing is not an exemption: the clause stays an
 * unsupported change. A section that cites only change claims for another area
 * is not framed by this rule either — its citation must cover what it names.
 */
export function framingContrastGrounded(clause, input, citedKinds = []) {
  const text = String(clause || '');
  if (!FRAMING_BETWEEN.test(text)) return false;

  const kinds = new Set(Array.isArray(citedKinds) ? citedKinds : []);
  if (!kinds.has('shared_result')) return false;

  const families = FRAMING_FAMILIES.filter(family => family.named.test(text));
  if (families.length === 0) return false;

  const claims = Array.isArray(input?.allowed_claims) ? input.allowed_claims : [];
  const changes = claims.filter(claim => claim?.kind === 'factual_change' || claim?.kind === 'material_gain');
  if (changes.length === 0) return false;

  return families.every(family => (family.areas
    ? changes.some(claim => family.areas.includes(claim.area))
    : changes.some(claim => claim.kind === 'material_gain')));
}