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

import {
  DESIGN_INTENT_REQUIREMENT,
  DESIGN_INTENT_SENTENCE_FRAMES,
} from '../base44/shared/reportDesignIntent/designIntentBrief.js';
import { buildWritingStyleContract, BANNED_WORDS } from '../base44/shared/reportWritingStyleContract.js';
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
    // The licence to vary the approved wording is gone: where the section's own brief
    // supplies approved sentence frames, they are the register the copy is written in.
    expect(DESIGN_INTENT_WRITING).toMatch(/approved sentence frames, they are the register/i);
    expect(DESIGN_INTENT_WRITING).toMatch(/variation from the approved wording is not a quality goal/i);
    expect(DESIGN_INTENT_WRITING).not.toMatch(/no fixed narrative structure/i);
    // And the copy is stated as what it is: a controlled engineering summary.
    expect(DESIGN_INTENT_WRITING).toMatch(/controlled engineering summary/i);
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

describe('C. The final Design Intent language rules reach the prompt', () => {
  const PROHIBITED = [
    'calculated reserve to draw on',
    'reserve to draw on',
    'alongside its low-frequency output capability',
    'effects have clear positions',
  ];

  it('prohibits the four phrases the brief was written to remove', () => {
    for (const phrase of PROHIBITED) {
      // The Design Intent's own never-use list names it...
      expect(DESIGN_INTENT_REQUIREMENT.toLowerCase()).toContain(phrase);
      // ...and the shared banned-phrase authority refuses it everywhere else.
      expect(BANNED_WORDS.map((word) => word.toLowerCase())).toContain(phrase);
    }
  });

  it('states reserve as useful reserve, and never shows the writer the other wording', () => {
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/never a reserve to draw on/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/useful reserve/);
    // The sentence that invited the phrase is gone: the authority states the
    // reserve as useful reserve, and names the banned wording only to ban it.
    const authority = buildProposalWritingAuthority();
    expect(authority).not.toContain('Capacity is a calculated reserve');
    expect(authority).toContain('never as "calculated reserve to draw on"');
  });

  it('gives the three ideas approved sentence frames, in the approved register', () => {
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/APPROVED SENTENCE FRAMES/);
    expect(DESIGN_INTENT_REQUIREMENT).toContain(
      'dynamic capability is strong, with substantial headroom from the screen channels at the reference position and useful reserve from the surround and overhead speakers',
    );
    // The frames themselves are the approved wording this block is written in.
    const frames = DESIGN_INTENT_SENTENCE_FRAMES.map((entry) => entry.frame).join(' ');
    expect(frames).toContain('at the reference position');
    expect(frames).toContain('provide strong spatial resolution around and above the seating');
    expect(frames).toContain('each maintain close tonal consistency within their respective layers');
  });

  it('takes the bass extension from the project, never from a stored figure', () => {
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/this project's own P18 evidence/i);
    expect(DESIGN_INTENT_SENTENCE_FRAMES.map((entry) => entry.frame).join(' '))
      .toContain('extends the predicted low-frequency response to');
    // No hard-coded extension anywhere in the brief, and no figure in a frame: the
    // extension figure is a slot, filled from this project's own evidence.
    expect(DESIGN_INTENT_REQUIREMENT).not.toMatch(/\b\d+\s?Hz\b/);
    for (const entry of DESIGN_INTENT_SENTENCE_FRAMES) {
      expect(entry.frame).not.toMatch(/\d/);
      expect(entry.frame).not.toMatch(/\bHz\b/);
    }
  });
});

describe('D. The approved sentence frames govern the copy', () => {
  const frameText = DESIGN_INTENT_SENTENCE_FRAMES.map((entry) => entry.frame).join(' ');

  it('writes the frames as they stand, and stops inviting the writer to phrase its own', () => {
    expect(DESIGN_INTENT_SENTENCE_FRAMES).toHaveLength(3);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/APPROVED SENTENCE FRAMES/);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/take each frame as it stands/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/Prefer the frame unchanged/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/Variation is not a quality goal/i);
    // And the paraphrase route is named as a defect, not a style preference.
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/NEVER PARAPHRASE A FRAME INTO A WEAKER FORM/i);
    // Every frame is populated from this project's own evidence, and no bracket is
    // ever left in the copy.
    for (const entry of DESIGN_INTENT_SENTENCE_FRAMES) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.populate).toMatch(/this design|this project|the evidence|the seat scope/);
    }
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/no bracket is ever left in the copy/i);
  });

  it('keeps every project fact dynamic: the frames carry slots, never facts', () => {
    // The layers, the seat scope, the tonal groups, the arrangement and the
    // extension figure are all slots.
    expect(frameText).toMatch(/\[loudspeaker layers this design actually has\]/i);
    expect(frameText).toMatch(/\[seat scope the evidence states that result for\]/i);
    expect(frameText).toMatch(/\[authoritative tonal groups the evidence supports\]/i);
    expect(frameText).toMatch(/\[this design's own subwoofer arrangement\]/i);
    expect(frameText).toMatch(/\[this project's own authoritative extension figure\]/i);
    // No frame names a project, a product, a room, a distance or a figure of its own.
    for (const entry of DESIGN_INTENT_SENTENCE_FRAMES) {
      expect(entry.frame).not.toMatch(/Barton|Marquee|Artcoustic|Genesis/i);
      expect(entry.frame).not.toMatch(/\d/);
      expect(entry.frame).not.toMatch(/\bm\b|\bmetres\b|\bmm\b/);
    }
    // The requirement states where every one of them comes from.
    expect(DESIGN_INTENT_REQUIREMENT)
      .toMatch(/populate its brackets from this project's own frozen evidence/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/this design's own subwoofer arrangement/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/this project's own extension figure/i);
  });

  it('keeps the room-type vocabulary dynamic', () => {
    expect(frameText).toMatch(/dedicated cinema/);
    expect(DESIGN_INTENT_SENTENCE_FRAMES[2].populate).toMatch(/room-type vocabulary/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/room-type vocabulary this room actually has/i);
  });

  it('bans the weaker paraphrases the approved frames replace', () => {
    for (const phrase of [
      'not unused floor space',
      'part of how the room is arranged',
      'covering directions',
      'sound travels around the room',
      'predicted dynamic capability provides',
      'combining bass depth with output capability',
      'demanding effects their impact',
    ]) {
      expect(DESIGN_INTENT_REQUIREMENT.toLowerCase()).toContain(phrase);
    }
    // The phrases already banned stay banned beside them.
    for (const phrase of ['effects have clear positions', 'calculated reserve to draw on', 'reserve to draw on']) {
      expect(DESIGN_INTENT_REQUIREMENT.toLowerCase()).toContain(phrase);
    }
  });

  it('reaches the writer prompt as the section it is given', () => {
    // The authority the Design Intent prompt is composed from states the frames rule,
    // so the writer reads it whether the copy is the report's block or a proposal's.
    const authority = buildProposalWritingAuthority();
    expect(authority).toMatch(/approved sentence frames, they are the register/i);
    expect(authority).toMatch(/controlled engineering summary/i);
    expect(authority).not.toMatch(/no fixed narrative structure/i);
  });
});