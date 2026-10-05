/**
 * client-facing-parameters.test.mjs
 * ---------------------------------
 * Contract: an assumed or administrative RP22 parameter — P8 (upfiring /
 * elevation speakers), P15 (background noise floor), P21 (early reflections) —
 * never appears in client-facing proposal copy, the comparison table, the
 * At a Glance page or a generated section prompt, unless the designer explicitly
 * asks for it, and then only labelled as an assumption.
 *
 * Fixtures only: no SDK, no database.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  EXCLUDED_CLIENT_PARAMETER_CODES,
  EXCLUDED_CLIENT_PARAMETERS,
  CLIENT_FACING_PARAMETER_SET,
  buildExcludedParameterPolicy,
  requestedExcludedParameters,
  isExcludedClientParameterRow,
  excludeExcludedClientParameterRows,
  stripExcludedParameterSentences,
  buildClientFacingParameterRule,
  mentionsExcludedClientParameter,
} from '../base44/shared/clientFacingParameterAuthority.js';
import { buildProjectContext } from '../base44/shared/proposalGenerationPrompts.js';
import { buildProposalNarrativeEvidenceGuard } from '../base44/shared/proposalNarrativeEvidenceGuard.js';
import { sanitizeNarrativeHtml } from '../base44/shared/proposalNarrativeSanitizer.js';
import { formatComparisonTableForPrompt } from '../base44/shared/comparisonTable.js';
import { buildComparisonGlance } from '../src/components/proposal/print/atAGlanceVersions.js';
import {
  EXCLUDED_CLIENT_PARAMETER_CODES as MIRRORED_CODES,
  isExcludedClientParameterRow as mirrorRow,
  excludeClientFacingRows,
} from '../src/components/proposal/designIndexRowAuthority.js';

const PROJECT = { name: 'Fixture', client_name: 'Client' };
const SNAPSHOT = { available: true, room: {}, system: {} };

test('the excluded set is P8, P15 and P21, and none of them is in the client-facing set', () => {
  assert.deepEqual(EXCLUDED_CLIENT_PARAMETER_CODES, ['P8', 'P15', 'P21']);
  assert.deepEqual(EXCLUDED_CLIENT_PARAMETERS.map((entry) => entry.id), [8, 15, 21]);
  const clientFacing = Object.values(CLIENT_FACING_PARAMETER_SET).flat();
  for (const code of EXCLUDED_CLIENT_PARAMETER_CODES) {
    assert.ok(!clientFacing.includes(code), `${code} must not be a client-facing parameter`);
  }
  assert.deepEqual(CLIENT_FACING_PARAMETER_SET.dynamic_range, ['P12', 'P13', 'P14']);
  assert.deepEqual(CLIENT_FACING_PARAMETER_SET.timbre_matching, ['P16', 'P17', 'P18', 'P19', 'P20']);
  assert.deepEqual(CLIENT_FACING_PARAMETER_SET.spatial_resolution, ['P2', 'P4', 'P5', 'P6', 'P7', 'P9', 'P10']);
});

test('by default every excluded parameter is excluded and stated as a prohibition', () => {
  const policy = buildExcludedParameterPolicy();
  assert.deepEqual(policy.excluded.map((entry) => entry.code), ['P8', 'P15', 'P21']);
  assert.deepEqual(policy.requested, []);
  const rule = buildClientFacingParameterRule(policy);
  for (const code of EXCLUDED_CLIENT_PARAMETER_CODES) assert.match(rule, new RegExp(`NEVER MENTION[^\\n]*${code}`));
  assert.match(rule, /no table row for them/);
});

test('an explicit request lifts the exclusion for that parameter only, as an assumption', () => {
  const policy = buildExcludedParameterPolicy({ clientBrief: 'Please include the P15 background noise floor assumption in the pack.' });
  assert.deepEqual(policy.requested, ['P15']);
  assert.deepEqual(policy.excluded.map((entry) => entry.code), ['P8', 'P21']);
  assert.equal(policy.allows('P15'), true);
  assert.equal(policy.allows('P21'), false);
  const rule = buildClientFacingParameterRule(policy);
  assert.match(rule, /DESIGNER-REQUESTED ASSUMPTIONS: P15/);
  assert.match(rule, /label it clearly as an assumption/i);
  assert.doesNotMatch(rule, /NEVER MENTION[^\n]*P15/);
});

test('a passing mention of a subject is not an explicit request', () => {
  const policy = buildExcludedParameterPolicy({ clientBrief: 'The room is quiet and the noise floor is low.' });
  assert.deepEqual(policy.requested, []);
  assert.deepEqual(requestedExcludedParameters('A quiet room with early reflections from the rear wall.'), []);
});

test('rows for the excluded parameters are dropped, whatever a stored table carries', () => {
  const rows = [
    { key: 'p12', area: 'Screen Dynamic Range (P12)', values: ['L3', 'L4'] },
    { key: 'p15', area: 'Background noise floor (P15)', values: ['L2', 'L2'] },
    { key: 'p21', area: 'Early reflections (P21)', values: ['L2', 'L3'] },
    { key: 'p8', area: 'Upfiring / elevation speakers (P8)', values: ['L4', 'L4'] },
  ];
  assert.equal(isExcludedClientParameterRow(rows[1]), true);
  assert.equal(mirrorRow(rows[2]), true);
  assert.deepEqual(excludeExcludedClientParameterRows(rows).map((row) => row.key), ['p12']);
  assert.deepEqual(excludeClientFacingRows(rows).map((row) => row.key), ['p12']);
  assert.deepEqual(MIRRORED_CODES, EXCLUDED_CLIENT_PARAMETER_CODES);
});

test('a sentence naming an excluded parameter is removed, but room treatment copy is kept', () => {
  const html = '<p>The assumed P15 background noise floor is L2.</p><p>The Abfuser controls early reflections and room reverberation.</p><p>Parameter 21 is an administrative check.</p>';
  const cleaned = stripExcludedParameterSentences(html, buildExcludedParameterPolicy());
  assert.doesNotMatch(cleaned, /P15|background noise floor/i);
  assert.doesNotMatch(cleaned, /Parameter 21/i);
  assert.match(cleaned, /Abfuser controls early reflections/);
  // The sanitizer is the backstop for every generated or refined section body.
  const viaSanitizer = sanitizeNarrativeHtml('<p>Screen Dynamic Range reaches L4.</p><p>The assumed noise floor is L2.</p>', { sectionType: 'dynamic_range' });
  assert.doesNotMatch(viaSanitizer, /noise floor/i);
  assert.match(viaSanitizer, /Screen Dynamic Range reaches L4/);
});

test('the generated section prompt and the comparison guard carry the exclusion rule', () => {
  const context = buildProjectContext(PROJECT, 'luxury_cinema', null, '', SNAPSHOT, 'comparison', ['Level 1 version', 'Level 4 version'], null, '');
  assert.match(context, /CLIENT-FACING PARAMETER SET/);
  assert.match(context, /NEVER MENTION P8 \(upfiring \/ elevation speakers\), P15 \(background noise floor\), P21 \(early reflections\)/);
  const guard = buildProposalNarrativeEvidenceGuard({ versions: [{ version_name: 'Level 1 version' }, { version_name: 'Level 4 version' }], rows: [] }, []);
  assert.match(guard, /NEVER MENTION P8/);
  assert.match(guard, /no assumed or administrative parameter/i);
});

test('the comparison table prompt, the highlights rows and At a Glance cannot carry an excluded row', () => {
  const table = { versions: [{ label: 'Level 1 version' }, { label: 'Level 4 version' }], rows: [
    { key: 'p15', area: 'Background noise floor (P15)', values: ['L2', 'L2'], change: 'No change' },
    { key: 'p12', area: 'Screen Dynamic Range (P12)', values: ['L3', 'L4'], change: 'L3 → L4' },
  ] };
  const promptText = formatComparisonTableForPrompt(table);
  assert.doesNotMatch(promptText, /P15|background noise floor/i);
  assert.match(promptText, /Screen Dynamic Range \(P12\)/);

  const glance = buildComparisonGlance({
    comparisonRows: table.rows,
    comparisonVersions: [{ version_name: 'Level 1 version' }, { version_name: 'Level 4 version' }],
  });
  const glanceText = JSON.stringify(glance);
  assert.doesNotMatch(glanceText, /P15|background noise floor/i);
  assert.match(glanceText, /Screen Dynamic Range \/ P12/);
});

test('the authority recognises an excluded parameter wherever it is written', () => {
  assert.equal(mentionsExcludedClientParameter('Upfiring speakers are allowed under P8.'), true);
  assert.equal(mentionsExcludedClientParameter('Screen Dynamic Range is L4.'), false);
});