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
  DESIGN_INTENT_CONTENT_BRIEF,
  DESIGN_INTENT_REQUIREMENT,
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
    // The brief states the content to develop and the evidence to draw from; the
    // writer develops each idea naturally from the evidence.
    expect(DESIGN_INTENT_WRITING).toMatch(/section's brief states the content to develop and the evidence to draw from/i);
    expect(DESIGN_INTENT_WRITING).toMatch(/natural expression are the goal, not verbatim repetition/i);
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

  it('gives the three ideas as content areas, not as fixed sentence frames', () => {
    // The brief states the content areas without prescribing their wording or
    // their paragraph order.
    expect(DESIGN_INTENT_CONTENT_BRIEF).toMatch(/spatial resolution/i);
    expect(DESIGN_INTENT_CONTENT_BRIEF).toMatch(/timbre matching/i);
    expect(DESIGN_INTENT_CONTENT_BRIEF).toMatch(/dynamic range/i);
    expect(DESIGN_INTENT_REQUIREMENT).toContain(
      'substantial headroom from the screen channels at the reference position and useful reserve from the surround and overhead speakers',
    );
    // No literal sentence frames remain.
    expect(DESIGN_INTENT_REQUIREMENT).not.toMatch(/APPROVED SENTENCE FRAMES/);
  });

  it('takes the bass extension from the project, never from a stored figure', () => {
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/this project's own P18 evidence/i);
    expect(DESIGN_INTENT_REQUIREMENT).toContain('extends the predicted low-frequency response to');
    // No hard-coded extension anywhere in the brief: the extension figure comes
    // from this project's own evidence.
    expect(DESIGN_INTENT_REQUIREMENT).not.toMatch(/\b\d+\s?Hz\b/);
  });
});

describe('D. The content brief lets the writer choose emphasis and order', () => {
  it('states the content areas without prescribing paragraph structure or wording', () => {
    expect(DESIGN_INTENT_CONTENT_BRIEF).toMatch(/design choices/i);
    expect(DESIGN_INTENT_CONTENT_BRIEF).toMatch(/No fixed opening, paragraph sequence or conclusion/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/no fixed order is imposed beyond that/i);
    // No literal sentence frames remain.
    expect(DESIGN_INTENT_REQUIREMENT).not.toMatch(/APPROVED SENTENCE FRAMES/);
    expect(DESIGN_INTENT_REQUIREMENT).not.toMatch(/take each frame as your starting point/i);
    expect(DESIGN_INTENT_REQUIREMENT).not.toMatch(/KEEP THE MEANING, EXPRESS IT NATURALLY/i);
    expect(DESIGN_INTENT_REQUIREMENT).not.toMatch(/no bracket is ever left in the copy/i);
  });

  it('keeps every project fact dynamic: the brief carries no hard-coded figure', () => {
    // The brief never names a project, a product, a room, a distance or a figure.
    expect(DESIGN_INTENT_CONTENT_BRIEF).not.toMatch(/Barton|Marquee|Artcoustic|Genesis/i);
    expect(DESIGN_INTENT_CONTENT_BRIEF).not.toMatch(/\b\d+\s?Hz\b/);
    // The requirement states where every fact comes from.
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/taken from the frozen evidence/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/this design's own subwoofer arrangement/i);
  });

  it('bans the weaker paraphrases the brief still rejects', () => {
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

  it('reaches the writer prompt through the shared authority', () => {
    const authority = buildProposalWritingAuthority();
    expect(authority).toMatch(/controlled engineering summary/i);
    expect(authority).not.toMatch(/no fixed narrative structure/i);
  });
});

/**
 * E. THE PROJECT RENDERS ARE EXPERIENCE CONTEXT, NEVER EVIDENCE.
 *
 * The Design Intent is where a render could most easily drift into the copy, so the
 * brief states the boundary itself: what a render may add — at most one restrained
 * experience idea — and everything it may never be read for. The block's own shape is
 * untouched: three paragraphs, three approved frames, engineering-led.
 */
describe('E. The project renders are experience context, never evidence', () => {
  it('DESIGN INTENT REMAINS ENGINEERING-LED: the content brief governs, unchanged', () => {
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/a few short paragraphs/i);
    // No literal sentence frames remain.
    expect(DESIGN_INTENT_REQUIREMENT).not.toMatch(/APPROVED SENTENCE FRAMES/);
    // The render's influence is bounded to ONE restrained place, and the block is
    // still the design explanation.
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/at most ONE restrained place in this block/);
    expect(DESIGN_INTENT_REQUIREMENT)
      .toMatch(/Keep the block what it is: an experienced cinema designer explaining the design/);
  });

  it('NO DUPLICATE ENGINEERING FACTS: a technical fact is never read out of a render', () => {
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/NEVER READ A FACT OUT OF A CONCEPT VISUAL/);
    for (const fact of [
      'the room type', 'the display', 'the seating count or arrangement',
      'a loudspeaker count or position', 'a dimension', 'an architectural constraint',
    ]) {
      expect(DESIGN_INTENT_REQUIREMENT.toLowerCase()).toContain(fact);
    }
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/canonical project and engineering data always wins/i);
  });

  it('NO COLOUR, STYLE, MATERIAL OR APPROVAL CLAIM FROM A RENDER', () => {
    const requirement = DESIGN_INTENT_REQUIREMENT.toLowerCase();
    for (const subject of [
      'colours', 'fabrics', 'timber', 'stone', 'wall finishes', 'furniture', 'lighting', 'style',
      'a luxury aesthetic', 'a contemporary or traditional look',
    ]) {
      expect(requirement).toContain(subject);
    }
    expect(DESIGN_INTENT_REQUIREMENT)
      .toMatch(/never imply that an interior shown is approved, final, specified or built/i);
    // Where a finish genuinely belongs to the design, it comes from the brief.
    expect(DESIGN_INTENT_REQUIREMENT)
      .toMatch(/its wording comes from this project's own brief and never from a visual/i);
  });

  it('VISUAL CONTEXT MAY SUPPORT ROOM AND EXPERIENCE, and only that', () => {
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/THE PROJECT RENDERS ARE EXPERIENCE CONTEXT, NOT EVIDENCE/);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/the system designed as part of a complete cinema room/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/the room intended to work as a place people want to spend time in/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/help the client picture the room/i);
  });

  it('NO RENDER DISCLAIMER IN THE COPY, and no describing a picture', () => {
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/NO RENDER DISCLAIMER IN THE COPY/);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/never state in prose what a picture is or is not/i);
    for (const phrase of [
      'the render shows', 'the visual confirms', 'shown in the visual',
      'the approved interior', 'the finishes shown',
    ]) {
      expect(DESIGN_INTENT_REQUIREMENT.toLowerCase()).toContain(phrase);
    }
  });
});