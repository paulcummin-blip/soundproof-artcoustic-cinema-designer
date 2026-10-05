// Final prompt constraints, derived from frozen evidence. No engineering changes.
export function buildProposalNarrativeEvidenceGuard(table, versionEvidence = []) {
  if (!table?.versions?.length) return '';
  const names = table.versions.map(v => v.version_name || v.label);
  const rows = table.rows || [];
  const p17 = rows.find(row => row.key === 'p17');
  const positiveP20 = versionEvidence.length === names.length && versionEvidence.every(v => v.bass_evidence_if_reliable?.p20);
  return [
    '=== FINAL OUTPUT REQUIREMENTS: OVERRIDE CONFLICTING LEGACY NARRATIVE SUGGESTIONS ===',
    `Use ONLY these exact option names: ${names.join(' | ')}. Never prepend Version 1/2 or substitute slot numbers.`,
    'No section heading in the body, no extra summary tables, no boilerplate definitions. Write decision-led prose that makes the principal upgrade clear and compelling.',
    'The assessment predicts capability; never guarantee clear dialogue, distortion-free playback, no compression, perfect coverage or stable tonal character everywhere.',
    p17 ? `P17 ACTUAL TRADE-OFF: ${names.map((name,i) => `${name}: ${p17.values[i]}`).join(' | ')}. If the grades differ, explicitly name the stronger tonal-consistency option and the lower graded option in Timbre Matching and Overall Design. Never claim identical voicing or universal seamlessness across all speakers.` : '',
    positiveP20 ? 'P20 benefits may use ONLY the approved P20 evidence and its seat scope, never subwoofer count.'
      : 'NO POSITIVE P20 CLAIM IS AUTHORISED. P20 is absent or excluded from positive narrative evidence. Any P20 row in the table is NEUTRAL DISCLOSURE ONLY. Never say more even bass, improved bass consistency, less seat variation as a benefit, or that four subs were chosen for consistency. If useful disclose the supplied values neutrally and say they do not support a positive consistency claim. Explain added subs via P14 output ONLY.',
    'P19 is reference-position response only, not all seats. P14 is output only, never control, smoothness or freedom from boom. P18 is extension only.',
    'Shared 9.1.6 and P2 L4 are shared strengths, not proof of smooth movement or good spacing at every seat. Do not contradict low assessed P5 or P9.',
    'For Dynamic Range: state both exact P12, P13 and P14 values and levels where supplied, then explain the supported listening benefit. Lead with the main upgrade, not a generic definition. Respect what the lower option retains.',
    'Final check before returning: no unsupported P20 claim, no reversed P17 trade-off, no version-slot names, no guaranteed results. Return premium, calm, specific, evidence-led sales prose.',
  ].filter(Boolean).join('\n');
}