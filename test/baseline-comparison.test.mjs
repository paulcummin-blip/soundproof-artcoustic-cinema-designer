/**
 * test/baseline-comparison.test.mjs
 * ---------------------------------
 * TEMPORARY verification: the same in-memory fixtures run through the PREVIOUS
 * implementation and the CURRENT one, side by side.
 *
 * The previous implementation is read straight out of git (read-only: `git show`
 * of a committed revision — the working tree is never touched, nothing is
 * reverted, no file is written) and loaded in memory. The fixtures are string
 * literals. Only pure functions are called: no record is read, written or deleted,
 * no project, proposal, report or engineering value is touched.
 *
 * It answers three questions with evidence rather than assertion:
 *   1. was the C4-1 cabinet-count false positive present before, and is it gone?
 *   2. does the previous code carry an interpretation-vs-evidence check at all?
 *   3. does the previous code carry a client-brief coverage audit at all?
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { cabinetCounts, logicalChannelCounts } from '../base44/shared/proposalWriter/writerCabinetLanguage.js';
import { multiCabinetChannelViolations as currentRules } from '../base44/shared/proposalWriter/writerMultiCabinetRules.js';
import { checkInterpretationAgainstEvidence } from '../base44/shared/proposalWriter/writerInterpretationEvidenceCheck.js';
import { buildClientBriefCoverage } from '../base44/shared/proposalWriter/writerClientBriefCoverage.js';

const WRITER_DIR = 'base44/shared/proposalWriter';

/** Read a file as it stood at a committed revision. Read-only. */
const readAtRevision = (rev, file) => execSync(`git show ${rev}:${WRITER_DIR}/${file}`, { encoding: 'utf8' });

/** Whether a file exists at a committed revision. Read-only. */
const existsAtRevision = (rev, file) => {
  try {
    execSync(`git cat-file -e ${rev}:${WRITER_DIR}/${file}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

/** The newest committed revision whose cabinet reading predates the identifier guard. */
function resolveBaselineRevision() {
  for (let depth = 1; depth <= 6; depth += 1) {
    const rev = `HEAD~${depth}`;
    if (!readAtRevision(rev, 'writerCabinetLanguage.js').includes('identifierSpans')) return rev;
  }
  throw new Error('no pre-change baseline revision found');
}

const REV = resolveBaselineRevision();
const REV_HASH = execSync(`git rev-parse --short ${REV}`, { encoding: 'utf8' }).trim();
const load = (source) => import(`data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`);
const appModule = (file) => pathToFileURL(path.resolve(WRITER_DIR, file)).href;

/** The baseline modules, with their relative imports pointed at the same revision. */
const baselineLanguage = await load(readAtRevision(REV, 'writerCabinetLanguage.js'));
const baselineRulesSource = readAtRevision(REV, 'writerMultiCabinetRules.js').replace(
  /from '\.\/([A-Za-z]+)\.js'/g,
  (_match, name) => (name === 'writerCabinetLanguage' ? `from '${baselineLanguageUrl()}'` : `from '${appModule(`${name}.js`)}'`),
);
function baselineLanguageUrl() {
  return `data:text/javascript;base64,${Buffer.from(readAtRevision(REV, 'writerCabinetLanguage.js'), 'utf8').toString('base64')}`;
}
const { multiCabinetChannelViolations: baselineRules } = await load(baselineRulesSource);

/** The frozen centre arrangement of the Genesis design: two cabinets, one channel. */
const CENTRE = { position: 'centre', label: 'Centre', cabinets: 2, channels: 1, models: ['C4-1'] };

const INPUT = {
  multi_cabinet_channels: { required: [] },
  allowed_claims: [],
  evidence_pack: {
    mode: 'single',
    options: [{
      version_id: 'v1',
      version_name: 'Original Design',
      facts: {
        system: {
          front_stage: {
            physical_centre_cabinets: 2,
            logical_centre_channels: 1,
            centre: 'two C4-1 cabinets working as one logical centre channel',
          },
        },
      },
    }],
  },
};

const asSection = (text) => [{ section: 'what_stays_same', text, claim_ids: [] }];
const details = (violations) => (violations.length ? violations.map((row) => row.detail).join(' + ') : 'none');

const CASES = [
  { name: 'A. stored Genesis centre sentence', text: 'The front stage uses Q6-3 for the left and right channels, and two C4-1 cabinets for the single centre channel.' },
  { name: 'B. Genesis LCR sentence', text: 'The LCR stage features high-performance cabinets, with the centre channel consisting of two physical cabinets that function as one logical source for consistent dialogue delivery.' },
  { name: 'C. identifier with no quantity', text: 'The centre uses C4-1 cabinets for dialogue.' },
  { name: 'D. quantity stated against the model', text: 'The centre uses 2 x C4-1 (mono).' },
  { name: 'E. genuinely wrong quantity', text: 'The centre uses 3 x C4-1.' },
];

/** The saved Genesis interpretation as Stage 1 wrote it, and a television evidence pack. */
const SAVED_INTERPRETATION = {
  source: 'saved-adi-project-interpretation',
  room_type: 'Multi-row cinema',
  presentation: 'Projection',
  intended_use: 'Discreet system with low visual impact',
  strongest_areas: [{ area: 'Spatial Resolution', evidence: 'project floor L2' }],
  constraints: ['Rear row geometry'],
  design_decisions: [
    'Spitfire Q Series selected for headroom and dialogue clarity',
    'Acoustically transparent screen selected so the LCR can sit behind it',
    'Four subs chosen for seat-to-seat consistency',
  ],
};

const TV_PACK = {
  options: [{ version_id: 'v1', version_name: 'Original Design', facts: { screen: { screen_type: 'TV', size_inches: 115 }, bass: { available: true, subwoofer_strategy_summary: 'Extension to 24 Hz' } } }],
  allowed_claims: [{ claim_id: 'claim_p19_modest_result_01', area: 'p19', basis: { levels: ['L4'] } }],
  blocked_claims: [],
};

test('baseline and current read the identical fixtures', () => {
  const rows = CASES.map((entry) => ({
    name: entry.name,
    baselineCabinets: JSON.stringify(baselineLanguage.cabinetCounts(entry.text, CENTRE)),
    currentCabinets: JSON.stringify(cabinetCounts(entry.text, CENTRE)),
    baselineChannels: JSON.stringify(baselineLanguage.logicalChannelCounts(entry.text, CENTRE)),
    currentChannels: JSON.stringify(logicalChannelCounts(entry.text, CENTRE)),
    baseline: details(baselineRules({ input: INPUT, sections: asSection(entry.text) })),
    current: details(currentRules({ input: INPUT, sections: asSection(entry.text) })),
  }));

  console.log(`\n=== BASELINE ${REV} (${REV_HASH}) vs CURRENT — in-memory fixtures ===`);
  for (const row of rows) {
    console.log(
      `\n${row.name}`
      + `\n  cabinets   baseline ${row.baselineCabinets}  ->  current ${row.currentCabinets}`
      + `\n  channels   baseline ${row.baselineChannels}  ->  current ${row.currentChannels}`
      + `\n  violations baseline: ${row.baseline}`
      + `\n  violations current:  ${row.current}`,
    );
  }
  console.log('\n=== END BASELINE COMPARISON ===\n');

  const by = (prefix) => rows.find((row) => row.name.startsWith(prefix));

  // A — the stored Genesis sentence: the count read is unchanged, and neither
  // implementation rejects it.
  assert.deepEqual(JSON.parse(by('A.').baselineCabinets), [2]);
  assert.deepEqual(JSON.parse(by('A.').currentCabinets), [2]);
  assert.equal(by('A.').current, 'none');

  // B — the real Genesis LCR wording. The baseline did not recognise the arrangement
  // at all and falsely rejected the sentence; the current implementation accepts it.
  assert.equal(
    by('B.').baseline.includes('required_arrangement_not_described'),
    true,
    'baseline: the described arrangement was reported as not described',
  );
  assert.equal(by('B.').current, 'none', 'current: the same sentence is accepted');
  assert.equal(JSON.parse(by('B.').currentChannels)[0], 1, 'current: one logical source states one channel');

  // C — a model name with no quantity: the baseline read its numeral as a cabinet
  // count and rejected the sentence for a count it never stated.
  assert.equal(
    baselineLanguage.cabinetCounts('The centre uses C4-1 cabinets for dialogue.', CENTRE).includes(1),
    true,
    'baseline: the numeral inside C4-1 was read as a cabinet quantity',
  );
  assert.deepEqual(cabinetCounts('The centre uses C4-1 cabinets for dialogue.', CENTRE), [], 'current: no quantity is read');
  assert.equal(
    by('C.').baseline.includes('cabinet_count_contradicts_the_frozen_specification:centre:1'),
    true,
    'baseline: rejected for a count that was never stated',
  );
  assert.equal(by('C.').current.includes('cabinet_count_contradicts'), false, 'current: no count contradiction invented');

  // D — a legitimate quantity attached to the model: unreadable before, read now.
  assert.deepEqual(JSON.parse(by('D.').baselineCabinets), [], 'baseline: "2 x C4-1" stated no count');
  assert.equal(JSON.parse(by('D.').currentCabinets).includes(2), true, 'current: "2 x C4-1" places two cabinets');
  assert.equal(JSON.parse(by('D.').currentChannels).includes(1), true, 'current: "(mono)" states one channel');
  assert.equal(by('D.').current, 'none');

  // E — a genuinely wrong quantity: unreadable before, read and rejected now.
  assert.equal(
    by('E.').current.includes('cabinet_count_contradicts_the_frozen_specification:centre:3'),
    true,
    'current: a genuinely wrong cabinet count is still rejected',
  );
});

test('the interpretation check and the brief audit did not exist at the baseline', () => {
  assert.equal(existsAtRevision(REV, 'writerInterpretationEvidenceCheck.js'), false, 'no interpretation check at baseline');
  assert.equal(existsAtRevision(REV, 'writerClientBriefCoverage.js'), false, 'no brief audit at baseline');
  assert.equal(readAtRevision(REV, 'writerDesignContext.js').includes('corrections'), false, 'no correction record at baseline');
  assert.equal(readAtRevision(REV, 'writerInputBuilder.js').includes('evidence_classification'), false, 'no statement classes at baseline');

  // And what the current implementation does with the same contradictory input.
  const { view, corrections, context } = checkInterpretationAgainstEvidence({ view: SAVED_INTERPRETATION, pack: TV_PACK });
  const reasons = corrections.map((row) => `${row.field}:${row.reason}`);
  console.log(`\n=== INTERPRETATION CORRECTIONS (current) ===\n${reasons.join('\n') || 'none'}\n=== END ===\n`);

  assert.equal(context.isTv, true);
  assert.equal(view.presentation, null, 'a projection assumption is excluded on a television design');
  assert.equal(
    view.design_decisions.includes('Acoustically transparent screen selected so the LCR can sit behind it'),
    false,
    'a screen-assumption decision is excluded',
  );
  assert.equal(
    view.design_decisions.includes('Four subs chosen for seat-to-seat consistency'),
    false,
    'an unsupported seat-to-seat claim is excluded',
  );
  assert.equal(
    view.design_decisions.includes('Spitfire Q Series selected for headroom and dialogue clarity'),
    true,
    'the valid, project-specific decision is kept',
  );
  assert.deepEqual(view.constraints, ['Rear row geometry'], 'the rest of the interpretation stands');
  assert.equal(reasons.length, 3);

  // Brief coverage, on the same in-memory fixtures.
  const coverage = buildClientBriefCoverage({
    brief: { supplied: true, client_brief: '• Explain the 9.1.6 system layout\n• Explain the bass extension result\n• Emphasise the 220 inch screen' },
    pack: TV_PACK,
    sections: [{ section: 'what_stays_same', text: 'The system is arranged as a 9.1.6 layout.', claim_ids: [] }],
  });
  console.log(`\n=== CLIENT BRIEF COVERAGE (current) ===\n${coverage.items.map((row) => `${row.status} :: ${row.item} :: ${row.sections.join(',')}`).join('\n')}\n=== END ===\n`);

  assert.deepEqual(coverage.items.map((row) => row.status), ['addressed', 'unaddressed', 'unsupported']);
});