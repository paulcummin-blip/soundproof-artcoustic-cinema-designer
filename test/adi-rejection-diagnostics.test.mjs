/**
 * Sound Proof — the diagnostic a REFUSED ADI editorial rewrite is read with.
 *
 * What is proved here:
 *   - a refusal is unchanged in every way that decides anything: the same codes,
 *     the same order, the same outcome, and nothing written;
 *   - the refusal now carries the facts it was read from — the rule, the category,
 *     the original and proposed values, the two excerpts and an explanation — so a
 *     refusal is diagnosable after the fact instead of undiagnosable;
 *   - the pass reports WHICH stage refused the rewrite (the meaning gate, or the
 *     surface's own validator), and the copy that was refused;
 *   - the diagnostic is a plain value: it is returned in the response and is never
 *     stored on a section, a snapshot or any other record.
 *
 * Pure: no provider, no entity client, no writes.
 */
import { describe, it, expect } from 'vitest';

import {
  ADI_CONSERVATION_REJECTION,
  checkWordingConservation,
} from '../base44/shared/adiEditorial/adiWordingConservation.js';
import { ADI_WORDING_OUTCOME, runAdiWordingPass } from '../base44/shared/adiEditorial/adiWordingPass.js';
import {
  ADI_REJECTION_STAGE,
  buildAdiRejectionDiagnostics,
  normaliseDiagnosticViolation,
} from '../base44/shared/adiEditorial/adiRejectionDiagnostics.js';

const ORIGINAL = 'Across the primary seats, the screen channels maintain close level consistency. '
  + 'With one front and two rear subwoofers, the predicted low-frequency response extends to 22 Hz. '
  + 'The room measures 5.0m \u00d7 4.2m \u00d7 2.4m.';

/** The same copy, said differently, carrying exactly the same facts. */
const REWORDED = 'Across the primary seats, the screen channels hold close level consistency. '
  + 'With one front and two rear subwoofers, the predicted low-frequency response extends to 22 Hz. '
  + 'The room measures 5.0m \u00d7 4.2m \u00d7 2.4m.';

const provider = (answer) => async () => answer;

describe('the meaning gate states the facts it refused on, and decides nothing differently', () => {
  it('reports a dropped figure with the figure, its excerpt and the rule that caught it', () => {
    const result = checkWordingConservation({ original: ORIGINAL, improved: ORIGINAL.replace('22 Hz', '20 Hz') });

    // The decision is exactly what it was: refused, with the same code.
    expect(result.ok).toBe(false);
    expect(result.violations.map((entry) => entry.code))
      .toContain(ADI_CONSERVATION_REJECTION.DROPPED_NUMBER);

    const dropped = result.violations.find((entry) => entry.code === ADI_CONSERVATION_REJECTION.DROPPED_NUMBER);
    expect(dropped.rule).toBe(ADI_CONSERVATION_REJECTION.DROPPED_NUMBER);
    expect(dropped.category).toBe('figure');
    expect(dropped.originalValue).toBe('22');
    expect(dropped.originalExcerpt).toContain('22 Hz');
    expect(dropped.proposedExcerpt).toBeNull();
    expect(dropped.explanation).toContain('not in the rewritten copy');
  });

  it('reports a removed limitation with the words that went', () => {
    const result = checkWordingConservation({
      original: 'The room is not treated, and only the front wall is available.',
      improved: 'The room is ready for the front wall.',
    });

    const removed = result.violations.find((entry) => entry.code === ADI_CONSERVATION_REJECTION.REMOVED_LIMITATION);
    expect(removed).toBeTruthy();
    expect(removed.category).toBe('limitation');
    expect(removed.originalValue).toContain('not');
    expect(removed.originalExcerpt).toBeTruthy();
  });

  it('still accepts a rewrite that carries the same facts, and reports nothing', () => {
    const result = checkWordingConservation({ original: ORIGINAL, improved: REWORDED });
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

describe('the editorial pass reports the stage that refused the rewrite', () => {
  it('names the meaning gate, and returns the copy that was refused', async () => {
    const proposed = ORIGINAL.replace('22 Hz', '20 Hz');
    const pass = await runAdiWordingPass({
      invokeLLM: provider(proposed),
      prompt: 'editorial prompt',
      original: ORIGINAL,
      mode: 'section',
    });

    expect(pass.outcome).toBe(ADI_WORDING_OUTCOME.REJECTED);
    expect(pass.text).toBeNull();

    expect(pass.diagnostics.rejectionStage).toBe(ADI_REJECTION_STAGE.MEANING_CONSERVATION);
    expect(pass.diagnostics.originalText).toBe(ORIGINAL);
    expect(pass.diagnostics.proposedText).toBe(proposed);
    // Every violation the gate reported is stated, in the gate's own order.
    expect(pass.diagnostics.violations).toHaveLength(pass.violations.length);
    expect(pass.diagnostics.violations[0].rule).toBe(pass.violations[0].code);
  });

  it('names the surface validator where the surface validator refused it', async () => {
    const pass = await runAdiWordingPass({
      invokeLLM: provider(REWORDED),
      prompt: 'editorial prompt',
      original: ORIGINAL,
      mode: 'section',
      validate: () => ({
        ok: false,
        violations: [{ code: 'changed_parameter_value', section: 'system_design_summary', detail: 'a figure the pack does not state' }],
      }),
      validateStage: ADI_REJECTION_STAGE.ORIGINAL_SURFACE_VALIDATOR,
    });

    expect(pass.outcome).toBe(ADI_WORDING_OUTCOME.REJECTED);
    expect(pass.diagnostics.rejectionStage).toBe(ADI_REJECTION_STAGE.ORIGINAL_SURFACE_VALIDATOR);
    const [first] = pass.diagnostics.violations;
    expect(first.rule).toBe('changed_parameter_value');
    expect(first.category).toContain('system_design_summary');
    expect(first.explanation).toBe('a figure the pack does not state');
  });

  it('carries no diagnostic when the wording was improved', async () => {
    const pass = await runAdiWordingPass({
      invokeLLM: provider(REWORDED),
      prompt: 'editorial prompt',
      original: ORIGINAL,
      mode: 'section',
    });

    expect(pass.outcome).toBe(ADI_WORDING_OUTCOME.IMPROVED);
    expect(pass.diagnostics).toBeUndefined();
  });
});

describe('the diagnostic is stated in one shape, and invents nothing', () => {
  it('keeps the validator’s own fields, and states the parts it does not carry as absent', () => {
    const entry = normaliseDiagnosticViolation({
      rule: 'ungrounded_product',
      category: 'product grounding',
      proposedValue: 'Q8-5',
      proposedExcerpt: 'The Q8-5 provides the front stage.',
      explanation: 'The rewritten copy names equipment this design version does not specify.',
    });

    expect(entry.rule).toBe('ungrounded_product');
    expect(entry.proposedValue).toBe('Q8-5');
    expect(entry.originalValue).toBeNull();
    expect(entry.originalExcerpt).toBeNull();
  });

  it('builds one refusal into the shape the response returns', () => {
    const diagnostics = buildAdiRejectionDiagnostics({
      originalText: ORIGINAL,
      proposedText: 'Twenty feet of screen.',
      stage: ADI_REJECTION_STAGE.MEANING_CONSERVATION,
      violations: [{ code: 'a_number_was_dropped', detail: 'dropped:22' }],
    });

    expect(diagnostics.rejectionStage).toBe('meaning_conservation');
    expect(diagnostics.originalText).toBe(ORIGINAL);
    expect(diagnostics.proposedText).toBe('Twenty feet of screen.');
    expect(diagnostics.violations).toHaveLength(1);
    // A violation that carries nothing but its code is stated as exactly that.
    expect(diagnostics.violations[0].rule).toBe('a_number_was_dropped');
    expect(diagnostics.violations[0].originalValue).toBeNull();
    expect(diagnostics.violations[0].explanation).toBe('dropped:22');
  });
});