/**
 * The shared-product scope rule.
 *
 * A product that legitimately appears in more than one option validates in
 * either option when the role and the quantity the sentence states for it match
 * that option's own frozen evidence, and is still blocked when the option does
 * not have it, uses it in another role, or is not specified with that quantity.
 *
 * Only `toBe` is used, so the assertions run under the bundled test runner as
 * well as under vitest.
 */
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';

const saved = JSON.parse(readFileSync(new URL('./fixtures/marqueeLiveGeneration.json', import.meta.url)));
const input = saved.input;

/** The live section, with one text under test and the product claims it grounds. */
export function run(text) {
  const output = structuredClone(saved.output);
  const section = output.sections.find((entry) => entry.section === 'what_changes');
  section.text = text;
  section.claim_ids = input.allowed_claims
    .filter((claim) => ['speakers', 'lcr', 'surrounds', 'overheads', 'p12', 'p13', 'p14'].includes(claim.area)
      && ['material_gain', 'factual_change'].includes(claim.kind))
    .map((claim) => claim.claim_id);
  return validateWriterOutput({ input, output });
}

/** Only the product-scope findings, so a case is judged on this rule alone. */
export const scopeIssues = (result) => result.violations.filter((entry) => entry.code === 'extra_product'
  || /^product_(?:belongs_to_another_option|role_not_the_one_the_option_uses|quantity_not_stated_by_the_reports)/.test(String(entry.detail)));

export const LIVE_SENTENCE = 'The loudspeaker package changes at the screen, around the seats, overhead and in the bass system. '
  + 'Level 4 version uses Q8-5 × 3 at the screen, Q6-3 × 6 for surrounds and wides, SPITFIRE CLOUD × 6 overhead, '
  + 'and SUB4-12 × 2 (front), SUB4-12 × 2 (rear). '
  + 'Level 1 version uses Q6-3 × 3, EVOLVE 2-1 × 6, ARCHITECT 2-1 × 6 and SUB4-12 (front), SUB4-12 (rear).';

test('the live sentence the name-only rule wrongly flagged carries no product finding', () => {
  expect(scopeIssues(run(LIVE_SENTENCE)).length).toBe(0);
});

const PASSING = [
  ['shared product, correct role and count in each option', 'Level 4 version uses Q6-3 × 6 for surrounds and wides; Level 1 version uses Q6-3 × 3 at LCR.'],
  ['shared subwoofer, correct count in each option', 'Level 4 version uses four SUB4-12; Level 1 version uses two SUB4-12.'],
  ['shared product, each option in its own role', 'Level 4 version uses Q8-5 × 3 at the screen; Level 1 version uses Q6-3 × 3 at the screen.'],
  ['a rejected alternative naming the other option\'s product', 'Level 4 version uses Q8-5 × 3 at the screen rather than the EVOLVE 2-1 package.'],
  ['a rejected alternative naming the other option\'s quantity', 'Level 4 version uses four SUB4-12 rather than two SUB4-12.'],
];
for (const [label, text] of PASSING) {
  test(`passes: ${label}`, () => expect(scopeIssues(run(text)).length).toBe(0));
}

const BLOCKED = [
  ['shared product in the wrong role', 'Level 4 version uses Q6-3 × 6 at the screen.', 'extra_product'],
  ['shared product with the wrong quantity', 'Level 4 version uses Q6-3 × 3 for surrounds and wides.', 'changed_parameter_value'],
  ['shared subwoofer with the wrong quantity', 'Level 4 version uses six SUB4-12.', 'changed_parameter_value'],
  ['a screen product the option does not have', 'Level 1 version uses Q8-5 × 3 at the screen.', 'extra_product'],
  ['a height product the option does not have', 'Level 1 version uses SPITFIRE CLOUD × 6 overhead.', 'extra_product'],
  ['another option\'s product named before the contrast, not in its alternative', 'Level 1 version uses Q8-5 × 3 at the screen rather than the SPITFIRE CLOUD package.', 'extra_product'],
];
for (const [label, text, code] of BLOCKED) {
  test(`blocks: ${label}`, () => {
    const issues = scopeIssues(run(text));
    expect(issues.length > 0).toBe(true);
    expect(issues[0].code).toBe(code);
  });
}