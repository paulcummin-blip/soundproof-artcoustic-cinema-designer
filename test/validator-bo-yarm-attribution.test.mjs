/**
 * Regression tests for the B&O Yarm comparison-validation defects.
 *
 * Two defects were confirmed and corrected in the proposal writer's product
 * attribution and factual-equipment-change logic:
 *
 * 1. PRODUCT ATTRIBUTION — "from X to Y" directional mentions.
 *    "The front stage also changes from the C4-1 and EVOLVE 3-1 combination
 *    in Original Design to Q4-3 speakers in 120\" Projector." must attribute
 *    Q4-3 to 120" Projector (the option that owns it), not to Original Design.
 *    A sentence that wrongly assigns Original Design's C4-1 to 120" Projector
 *    must still be rejected.
 *
 * 2. FACTUAL EQUIPMENT CHANGE vs P17 PERFORMANCE CLAIM.
 *    "Six overhead speakers replace the overhead pair" is a neutral factual
 *    equipment change grounded by the overheads factual_change claim; it must
 *    NOT trip the P17 no-claimed-change block. A sentence that names the graded
 *    performance ("improve the overhead timbre") must still be rejected.
 *
 * Only `toBe` is used, so the assertions run under the bundled test runner as
 * well as under vitest.
 */
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';

const saved = JSON.parse(readFileSync(new URL('./fixtures/boYarmComparisonGeneration.json', import.meta.url)));
const input = saved.input;

/** Claims the what_changes section cites, matching the actual generation. */
const WHAT_CHANGES_CLAIM_IDS = [
  'claim_room_factual_change_01',
  'claim_seating_factual_change_01',
  'claim_rp23_viewing_material_gain_01',
  'claim_rp23_viewing_modest_result_01',
  'claim_surrounds_factual_change_01',
  'claim_overheads_factual_change_01',
  'claim_p2_material_gain_01',
  'claim_lcr_factual_change_01',
  'claim_p12_material_gain_01',
];

/** Run the validator with the given section text and claim IDs. */
function run(text, claimIds = WHAT_CHANGES_CLAIM_IDS) {
  const output = {
    contract_version: 2,
    pack_fingerprint: input.evidence_pack.pack_fingerprint,
    sections: [{ section: 'what_changes', text, claim_ids: claimIds }],
  };
  return validateWriterOutput({ input, output });
}

/** Only the product-scope findings. */
const scopeIssues = (result) => result.violations.filter((v) => v.code === 'extra_product'
  || /^product_belongs_to_another_option/.test(String(v.detail)));

/** Only the unsupported-improvement findings. */
const improvementIssues = (result) => result.violations.filter((v) => v.code === 'unsupported_improvement');

// ── Product attribution: "from X to Y" directional mentions ──

test('Q4-3 attributed to 120" Projector via "from ... to" carries no product finding', () => {
  const text = 'The front stage also changes from the C4-1 and EVOLVE 3-1 combination in Original Design to Q4-3 speakers in 120" Projector.';
  expect(scopeIssues(run(text)).length).toBe(0);
});

test('C4-1 wrongly assigned to 120" Projector is rejected as product_belongs_to_another_option', () => {
  const text = '120" Projector uses C4-1 speakers at the screen for its front stage.';
  const issues = scopeIssues(run(text));
  expect(issues.length).toBeGreaterThan(0);
  expect(issues.some((v) => /product_belongs_to_another_option:C4-1/.test(String(v.detail)))).toBe(true);
});

test('Q4-3 wrongly assigned to Original Design is rejected as product_belongs_to_another_option', () => {
  const text = 'Original Design uses Q4-3 speakers at the screen for its front stage.';
  const issues = scopeIssues(run(text));
  expect(issues.length).toBeGreaterThan(0);
  expect(issues.some((v) => /product_belongs_to_another_option:Q4-3/.test(String(v.detail)))).toBe(true);
});

test('shared product EVOLVE 2-1 in both options passes in either option', () => {
  const text = 'Original Design uses EVOLVE 2-1 × 2 for surrounds and wides; 120" Projector uses EVOLVE 2-1 × 6 for surrounds and wides.';
  expect(scopeIssues(run(text)).length).toBe(0);
});

// ── Factual equipment change vs P17 performance claim ──

test('six overhead speakers replace the overhead pair is a factual equipment change, not an unsupported improvement', () => {
  const text = 'Front wides and rear surrounds join the side surrounds, and six overhead speakers replace the overhead pair specified in Original Design.';
  expect(improvementIssues(run(text)).length).toBe(0);
});

test('improve the overhead timbre names the graded P17 performance and is still rejected', () => {
  const text = '120" Projector improves the overhead timbre across the listening area.';
  const issues = improvementIssues(run(text));
  expect(issues.length).toBeGreaterThan(0);
  expect(issues.some((v) => /no_claimed_change/.test(String(v.detail)))).toBe(true);
});

test('six overhead speakers improve the surround timbre names the graded performance and is still rejected', () => {
  const text = 'Six overhead speakers replace the overhead pair and improve the surround timbre.';
  const issues = improvementIssues(run(text));
  expect(issues.length).toBeGreaterThan(0);
  expect(issues.some((v) => /no_claimed_change/.test(String(v.detail)))).toBe(true);
});

// ── Combined: the actual B&O Yarm what_changes section passes ──

test('the full what_changes section from the B&O Yarm generation passes validation', () => {
  const text = `The room's arrangement changes substantially. Original Design places one seating row across the wider orientation; 120" Projector runs along the longer orientation and provides two rows. Original Design offers a consistent viewing relationship across its row, while 120" Projector gives the front row a more enveloping image and the rear row a less expansive view.

Sound extends into more positions around and above the audience in 120" Projector. Front wides and rear surrounds join the side surrounds, and six overhead speakers replace the overhead pair specified in Original Design. This is a substantial change in spatial resolution, not simply a different loudspeaker model.

The front stage also changes from the C4-1 and EVOLVE 3-1 combination in Original Design to Q4-3 speakers in 120" Projector. The latter provides greater output capability for demanding score and on-screen effects, a meaningful distinction for focused film playback.`;
  const result = run(text);
  expect(scopeIssues(result).length).toBe(0);
  expect(improvementIssues(result).length).toBe(0);
});