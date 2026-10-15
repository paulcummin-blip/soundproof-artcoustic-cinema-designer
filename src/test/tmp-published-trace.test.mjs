/**
 * tmp-published-trace.test.mjs — TEMPORARY DIAGNOSTIC (deleted once the mismatch is fixed).
 */

import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

const ROOT = [
  new URL('../', import.meta.url),
  new URL('../../', import.meta.url),
].find((base) => existsSync(new URL('base44/shared/proposalEdit/completeDocumentValidation.js', base)));

const shared = (name) => import(new URL(`base44/shared/${name}`, ROOT).href);

const { validateCompleteDocument } = await shared('proposalEdit/completeDocumentValidation.js');
const { composeWriterSectionBodies } = await shared('proposalWriter/writerSectionMapping.js');
const { renderableProposalCopy } = await shared('proposalEdit/proposalEditHistory.js');
const { buildOptionGuidance } = await shared('proposalWriter/writerOptionGuidance.js');
const { suppressExcludedNarrative } = await shared('proposalNarrativeExclusions.js');
const { removeParameterCommentary } = await shared('clientNarrativeRegister.js');
const { removeAbsentFeatureFraming } = await shared('proposalWriter/absentFeatureFraming.js');
const {
  preparePublishedSectionBody,
  requiredPublishedSentences,
  publishedSentences,
  normalisePublishedText,
  plainTextOf,
} = await shared('proposalEdit/publishedSectionPreparation.js');

const DUMP = JSON.parse(readFileSync('/tmp/marquee-proposals.json', 'utf8'));

const inputsFor = (entry) => {
  const { proposal, sections, generations, edits, assets } = entry;
  const ids = proposal.selected_version_ids?.length ? proposal.selected_version_ids : [proposal.version_id].filter(Boolean);
  const eligible = assets.filter((asset) => asset.scope !== 'version' || ids.includes(asset.version_id));
  return {
    proposal, sections, generations, edits,
    optionGuidance: buildOptionGuidance(eligible),
    privateNotes: eligible.map((asset) => asset.comparison_note),
    publishedAssetText: eligible.filter((asset) => asset.usage !== 'do_not_use' && asset.proposal_importance !== 'Do Not Use')
      .flatMap((asset) => [asset.caption, asset.comparison_option_label, asset.comparison_group]),
  };
};

console.log('\n===== ALL MARQUEE PROPOSALS =====');
for (const entry of DUMP) {
  const result = validateCompleteDocument(inputsFor(entry));
  const missing = result.errors.filter((error) => error.code === 'published_content_missing');
  console.log(
    `${entry.proposal.id} ${result.valid ? 'VALID  ' : 'BLOCKED'} codes=${JSON.stringify([...new Set(result.errors.map((e) => e.code))])}`
    + (missing.length ? `\n    first missing: ${String(missing[0].detail).slice(0, 150)}` : ''),
  );
}

// ── The exact comparison for one proposal ────────────────────────────────────
const TARGET = '6ad0c027a0ed563f6781cd01';
const entry = DUMP.find((row) => row.proposal.id === TARGET);
const { generation } = (() => {
  const generation = entry.generations.find((record) => record.status === 'valid_generated') || entry.generations[0];
  return { generation };
})();
const input = generation?.gpt_input;
const selected = renderableProposalCopy({ generation, edits: entry.edits });
const copy = selected.copy || [];
const stored = entry.sections.find((section) => section.section_type === 'system_design_summary');

const composed = composeWriterSectionBodies({ output: { sections: copy }, mode: input?.proposal_mode });
const approvedHtml = composed.bodies.find((body) => body.section_type === 'system_design_summary')?.html || '';
const originalHtml = composeWriterSectionBodies({ output: generation?.gpt_output, mode: input?.evidence?.proposal_mode })
  .bodies.find((body) => body.section_type === 'system_design_summary')?.html || '';

const excluded = input?.narrative_steer?.excluded_topics || input?.excluded_topics || [];
const writePass = (html) => removeParameterCommentary(removeAbsentFeatureFraming(
  suppressExcludedNarrative(html, { excluded }), {},
));
const writePassNoExclusions = (html) => removeParameterCommentary(removeAbsentFeatureFraming(
  suppressExcludedNarrative(html, { excluded: [] }), {},
));

const show = (label, html) => console.log(`\n--- ${label} (${String(html).length}) ---\n${String(html).slice(0, 900)}`);

// ── Which composition / which pass empties the heading? ──────────────────────
const { writerSectionsForMode } = await shared('proposalWriter/writerContractSchema.js');
const singleTitles = new Map(writerSectionsForMode('single').map((entry) => [entry.section, entry.title]));
const comparisonTitles = new Map(writerSectionsForMode('comparison').map((entry) => [entry.section, entry.title]));
console.log('\n===== WRITE-PATH COMPOSITION =====');
console.log('single-mode titles     :', JSON.stringify(['decision_summary', 'what_stays_same', 'what_changes'].map((id) => singleTitles.get(id) ?? null)));
console.log('comparison-mode titles :', JSON.stringify(['decision_summary', 'what_stays_same', 'what_changes'].map((id) => comparisonTitles.get(id) ?? null)));
const singleComposed = composeWriterSectionBodies({ output: { sections: copy }, mode: 'single' })
  .bodies.find((body) => body.section_type === 'system_design_summary')?.html || '';
console.log('compose(mode=single) len:', singleComposed.length, '| head:', JSON.stringify(singleComposed.slice(0, 140)));
const steps = [
  ['after suppressExcludedNarrative', suppressExcludedNarrative(approvedHtml, { excluded })],
  ['after removeAbsentFeatureFraming', removeAbsentFeatureFraming(suppressExcludedNarrative(approvedHtml, { excluded }), {})],
  ['after removeParameterCommentary', writePass(approvedHtml)],
];
for (const [label, html] of steps) console.log(`${label} len=${String(html).length} head=${JSON.stringify(String(html).slice(0, 90))}`);

console.log('\n\n===== EXACT COMPARISON — SYSTEM DESIGN SUMMARY =====');
console.log('section id          :', stored?.id, '| title', JSON.stringify(stored?.title));
console.log('generation          :', generation?.generation_id, '| evidence_pack.mode', generation?.evidence_pack?.mode, '| input.proposal_mode', input?.proposal_mode);
console.log('excluded topics     :', JSON.stringify(excluded));
console.log('copy source         :', selected.source, '| edit id', selected.edit_id);
console.log('lengths  stored / approved / original :', String(stored?.body || '').length, '/', approvedHtml.length, '/', originalHtml.length);
console.log('writePass(approved) length           :', writePass(approvedHtml).length);
console.log('writePass(approved) == stored        :', normalisePublishedText(writePass(approvedHtml)) === normalisePublishedText(stored?.body));
console.log('writePassNoExclusions(approved)==stored:', normalisePublishedText(writePassNoExclusions(approvedHtml)) === normalisePublishedText(stored?.body));
console.log('stored == approved                   :', normalisePublishedText(stored?.body) === normalisePublishedText(approvedHtml));

show('STORED body (raw)', stored?.body);
show('APPROVED body (raw)', approvedHtml);
show('writePass(APPROVED) (raw)', writePass(approvedHtml));

const publishedHtml = preparePublishedSectionBody(stored?.body || '', {
  title: stored?.title, sectionType: 'system_design_summary', highChannel: false, proposalType: entry.proposal?.proposal_type,
});
const required = requiredPublishedSentences({ approvedHtml, title: stored?.title, sectionType: 'system_design_summary' });
const publishedNorm = normalisePublishedText(publishedHtml);
const approvedNorm = normalisePublishedText(approvedHtml);
const storedSentences = publishedSentences(stored?.body || '');
console.log('\nrequired sentences            :', required.length);
console.log('required missing from published:', JSON.stringify(required.filter((sentence) => !publishedNorm.includes(sentence)), null, 1));
console.log('required missing from approved :', required.filter((sentence) => !approvedNorm.includes(sentence)).length);
console.log('stored sentences not in approved:', JSON.stringify(storedSentences.filter((sentence) => !approvedNorm.includes(sentence)), null, 1));
console.log('approved-only sentences         :', JSON.stringify(publishedSentences(approvedHtml).filter((sentence) => !normalisePublishedText(stored?.body || '').includes(sentence)), null, 1));

const result = validateCompleteDocument(inputsFor(entry));
console.log('\n--- VALIDATION ---');
for (const error of result.errors) console.log(' ', error.code, '|', String(error.detail).slice(0, 180));

test('trace printed', () => {});