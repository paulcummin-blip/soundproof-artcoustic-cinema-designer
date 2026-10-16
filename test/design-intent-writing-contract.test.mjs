/**
 * Sound Proof Design Intent — the writing generation.
 *
 * What is proved here:
 *   - the mandatory recommendation opening is gone from the writing contracts: the
 *     Project Report's Design Intent, the proposal contract's closing Overall
 *     Design, the natural-writing standard and the System Design Summary each ask
 *     for design intent, and none of them requires a recommendation phrase;
 *   - the Design Intent philosophy reaches the prompt the writer is really called
 *     with, on the report contract and on the proposal authority alike, from the
 *     one shared writing authority rather than a second writing system;
 *   - supported professional design-intent language is permitted, and a
 *     recommendation the frozen pack does not allow is still refused by the same
 *     validator release;
 *   - no section identity and no word limit moved.
 *
 * Fixtures only: no proposal is generated, no provider is called, nothing is
 * written, and no saved narrative is touched.
 */
import { describe, it, expect } from 'vitest';

import { DESIGN_INTENT_REQUIREMENT } from '../base44/shared/reportDesignIntent/designIntentBrief.js';
import { buildWritingStyleContract } from '../base44/shared/reportWritingStyleContract.js';
import {
  DESIGN_INTENT_WRITING,
  buildProposalWritingAuthority,
} from '../base44/shared/soundProofWritingAuthority.js';
import {
  WRITER_REJECTION,
  writerSection,
  writerWordLimits,
} from '../base44/shared/proposalWriter/writerContractSchema.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { SYSTEM_SUMMARY_SECTION_PROMPTS } from '../base44/shared/systemDesignSummarySections.js';
import { writer12Fixture } from './fixtures/proposalWriter12Fixtures.mjs';

const codes = (result) => result.violations.map((entry) => entry.code);

/** A fixture draft written with no recommendation claim in the pack at all. */
function runWithoutRecommendation(text, section = 'overall_design') {
  const fixture = writer12Fixture();
  fixture.input.allowed_claims = (fixture.input.allowed_claims || [])
    .filter((claim) => claim?.kind !== 'recommendation');
  expect(fixture.input.allowed_claims.some((claim) => claim?.kind === 'recommendation')).toBe(false);
  fixture.output.sections.find((row) => row.section === section).text = text;
  return validateWriterOutput({ input: fixture.input, output: fixture.output });
}

describe('A. No writing contract requires a recommendation opening', () => {
  it('briefs the Project Report Design Intent as design intent, not a recommendation', () => {
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/design intent/i);
    expect(DESIGN_INTENT_REQUIREMENT).not.toMatch(/Begin with a professional recommendation/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/never announce a recommendation/i);
  });

  it('closes the proposal on the design intent rather than a recommendation', () => {
    const overall = writerSection('overall_design');
    expect(overall.requirement_single).toMatch(/designer's own considered judgement/);
    expect(overall.requirement_single).not.toMatch(/End with a confident recommendation/i);
    expect(overall.requirement).toMatch(/states the design intent without one/);
    expect(overall.requirement).not.toMatch(/recommendation claims the pack allows/);
  });

  it('closes the System Design Summary on the design rather than a recommendation', () => {
    const summary = Object.values(SYSTEM_SUMMARY_SECTION_PROMPTS).join('\n');
    expect(summary).toMatch(/bringing the design together/);
    expect(summary).not.toMatch(/confident professional recommendation/);
  });

  it('carries the Design Intent philosophy through the one shared writing authority', () => {
    expect(buildWritingStyleContract({})).toContain(DESIGN_INTENT_WRITING);
    expect(buildProposalWritingAuthority()).toContain(DESIGN_INTENT_WRITING);
    expect(DESIGN_INTENT_WRITING).toMatch(/never offered as a recommendation and it never opens on one/i);
    expect(DESIGN_INTENT_WRITING).toMatch(/no mandatory opening phrase, no fixed narrative structure/i);
    expect(DESIGN_INTENT_WRITING)
      .toMatch(/Never write "Our recommendation is", "We recommend" or "We have carefully designed"/);
  });

  it('moves no section identity and no word limit', () => {
    expect(writerWordLimits()).toEqual({
      decision_summary: 250,
      what_stays_same: 180,
      what_changes: 220,
      key_performance_highlights: 190,
      spatial_resolution: 180,
      dynamic_range: 170,
      timbre_matching: 170,
      presented_options: 170,
      overall_design: 200,
      appendix_notes: 200,
    });
  });
});

describe('B. The grounding rule is untouched', () => {
  it('permits supported professional design-intent language', () => {
    const intent = runWithoutRecommendation(
      'The room, the seating and the loudspeaker arrangement work together so that sound moves naturally around the audience and overhead.',
    );
    expect(codes(intent)).not.toContain(WRITER_REJECTION.UNSUPPORTED_RECOMMENDATION);
  });

  it('still refuses a recommendation the pack does not allow', () => {
    const unsupported = runWithoutRecommendation(
      'Our recommendation is this seven channel design, and we recommend it for this room.',
    );
    expect(codes(unsupported)).toContain(WRITER_REJECTION.UNSUPPORTED_RECOMMENDATION);
    expect(unsupported.valid).toBe(false);
  });
});