/**
 * proposalNarrativeEvidenceGuard.js (shared)
 * ------------------------------------------
 * The final prompt constraints for a COMPARISON draft, derived from the frozen
 * comparison table and the per-version evidence. It is appended last, so it
 * overrides any earlier prose guidance that conflicts with it.
 *
 * It states, in the writer's own instructions:
 *   - no AI-written table anywhere in a narrative section
 *   - predicted data is never called measured, proven or confirmed
 *   - no P20 claim unless the P20 evidence supports one
 *   - P14, P18, P19 and P20 keep their separate meanings
 *   - a P17 difference is disclosed honestly, and the stronger option is named
 *   - no blanket tonal guarantee
 *   - the supported experience for each difference, and level one respected
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/** The approved evidence vocabulary for calculated (not measured) results. */
const EVIDENCE_VOCABULARY_RULE = [
  'EVIDENCE STATUS: every value in this draft is predicted, modelled or calculated, never measured in the room.',
  'Use "predicted", "modelled", "calculated" or "shown in the Technical Report".',
  'Never use "measured", "proven" or "confirmed" for any value in this report.',
].join(' ');

const TABLE_RULE = [
  'NO AI-WRITTEN TABLE: never output a <table>, a pipe table, a row of values or a "Performance area / option / option / change" grid.',
  'The report has exactly one calculated table, the Key Differences table, and Sound Proof builds and renders it from calculated data.',
  'Write prose only. Refer to that table, never reproduce it.',
].join(' ');

const SECTION_FOCUS_RULE = [
  'SECTION FOCUS (each section covers its own theme only):',
  '- System Options Summary: what the options share, then each option and its headline result.',
  '- Spatial Resolution: P2, P5, P7, P9 and the seating/geometry results. Do not discuss dynamic range or timbre results here.',
  '- Dynamic Range: P12, P13 and P14 only. Do not discuss P16, P17, P19 or P20 here.',
  '- Timbre Matching: P16, P17, then P18, P19 and P20 as their own separate ideas.',
  '- Key Differences: the introduction only, in one or two sentences.',
  '- Overall Design: the decision, using values already stated and no new ones.',
].join('\n');

const BASS_SEPARATION_RULE = [
  'KEEP THE BASS CONCEPTS SEPARATE (never merge them):',
  '- P14 = output capability, impact and authority. It is not depth, smoothness or evenness.',
  '- P18 = extension and depth. It is not output or consistency.',
  '- P19 = tonal balance at the reference listening position against target. It is not every seat.',
  '- P20 = seat-to-seat consistency. It is the only parameter that speaks about consistency between seats.',
  'Never use P14, P18, P19 or a subwoofer count as proof of P20.',
].join('\n');

/** The option with the higher numeric value in a frozen comparison row. */
function higherValueIndex(values = []) {
  const numbers = values.map(value => {
    const match = String(value).match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  });
  if (numbers.some(number => number === null)) return -1;
  const best = Math.max(...numbers);
  const index = numbers.indexOf(best);
  return numbers.filter(number => number === best).length === 1 ? index : -1;
}

/**
 * @param {{versions?: Array, rows?: Array}} comparisonTable - frozen comparison table
 * @param {Array} versionEvidence - per-version frozen evidence
 * @returns {string} the final constraint block, or '' when there is no comparison
 */
export function buildProposalNarrativeEvidenceGuard(table, versionEvidence = []) {
  if (!table?.versions?.length) return '';
  const names = table.versions.map(version => version.version_name || version.label);
  const rows = table.rows || [];
  const rowFor = key => rows.find(row => row.key === key);
  const p12 = rowFor('p12');
  const p13 = rowFor('p13');
  const p14 = rowFor('p14');
  const p17 = rowFor('p17');
  const p20Supported = versionEvidence.length === names.length
    && versionEvidence.every(version => version.bass_evidence_if_reliable?.p20);
  const p17Differs = Boolean(p17) && p17.identical === false && new Set(p17.values || []).size > 1;
  const outputIndex = higherValueIndex(p12?.values || p14?.values || []);
  const outputName = outputIndex >= 0 ? names[outputIndex] : null;

  const supportedExperiences = [
    p12 ? `P12, Screen Dynamic Range (${names.map((name,i) => `${name}: ${p12.values[i]}`).join(' | ')}): explain it as more screen-stage authority, cleaner dialogue under load, and more scale and impact at the front of the room.` : '',
    p13 ? `P13, Non-screen Dynamic Range (${names.map((name,i) => `${name}: ${p13.values[i]}`).join(' | ')}): explain it as the surround and overhead field keeping up with the screen at higher playback levels.` : '',
    p14 ? `P14, LFE and subwoofer Dynamic Range (${names.map((name,i) => `${name}: ${p14.values[i]}`).join(' | ')}): explain it as more bass output authority and more physical impact. Output only.` : '',
  ].filter(Boolean);

  return [
    '=== FINAL OUTPUT REQUIREMENTS: THESE OVERRIDE ANY CONFLICTING EARLIER PROSE GUIDANCE ===',
    `Use ONLY these exact option names: ${names.join(' | ')}. Never prepend a slot number and never write "Version 1" or "Version 2".`,
    TABLE_RULE,
    EVIDENCE_VOCABULARY_RULE,
    SECTION_FOCUS_RULE,
    BASS_SEPARATION_RULE,
    supportedExperiences.length ? `WHAT EACH SUPPORTED DIFFERENCE MEANS:\n- ${supportedExperiences.join('\n- ')}` : '',
    'SHARED DISCRETE CHANNEL CAPABILITY: where every option shares the same layout and the same top P2 level, state it as a strength both options already hold and say plainly that the upgrade is not more channels: it is what those channels can deliver.',
    p17Differs
      ? [
        'P17 TRADE-OFF (mandatory, state it plainly in Timbre Matching and in Overall Design):',
        `Say: "${outputName || 'The higher-output option'} wins on output and scale, but the ${names[(p17.values || []).length - 1 - higherValueIndex((p17.values || []).map(v => ({ L1: 1, L2: 2, L3: 3, L4: 4 }[String(v).trim().toUpperCase()] || 0)))] || 'other option'} currently shows the stronger P17 surround and overhead timbre result in the frozen evidence."`,
        'Then add calmly: "That does not make the higher-output option poor. It means the stronger system should be reviewed for surround and overhead timbre matching before final specification."',
        'Never claim matched voicing, consistent tonal character, or a seamless transition across every channel when this trade-off exists.',
      ].join('\n')
      : '',
    'NO BLANKET TONAL GUARANTEE: do not write "matched character throughout the room", "seamless tonal transition across all channels" or "uniform tonal balance", and do not state that a voice, instrument or effect retains its character everywhere in the room. Describe only the assessed P16 and P17 results.',
    p20Supported
      ? 'P20: a positive seat-to-seat consistency statement is permitted only from the supplied P20 evidence and its own seat scope. Never derive it from subwoofer count.'
      : 'P20: NO POSITIVE CLAIM IS AUTHORISED. The P20 evidence is absent, weak or excluded from positive narrative. Any P20 row in the table is neutral disclosure only. Say: "Any added subwoofers give the more powerful option more output capability and more placement tools for calibration, but seat-to-seat consistency should only be claimed where P20 evidence is available." Never say more even bass, improved bass consistency, less seat-to-seat variation, or that the subwoofers were chosen for consistency.',
    'LEVEL 1 MUST BE RESPECTED: it remains a credible 9.1.6 cinema design. Say what it keeps before saying what the higher option adds. It is more powerful where the evidence supports it, not a compromise to be corrected.',
    'NO GUARANTEED OUTCOMES: never promise clear dialogue, distortion-free playback, perfect coverage, uniform bass or a guaranteed listening result. Say what the design supports and what the client should expect.',
    'FINAL SILENT CHECK: no table, no "measured"/"proven"/"confirmed", no unsupported P20 claim, bass concepts kept separate, the P17 trade-off stated with the stronger option named, no blanket tonal guarantee, all values exact and attached to the right option, and the stronger option compelling but never overstated. Return premium, calm, specific, evidence-led prose.',
  ].filter(Boolean).join('\n\n');
}

export default buildProposalNarrativeEvidenceGuard;