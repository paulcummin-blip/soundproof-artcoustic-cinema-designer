/**
 * report-design-intent.test.mjs
 * -----------------------------
 * The Project Report's Astra Design Intent: the brief, the section-scoped writer
 * input, the failure-isolated attempt, and the display rule that decides whether
 * a narrative is ever shown.
 *
 * The report evidence is the project's own saved-report fixture, so the pack and
 * the writer input are the real ones. The provider and the clock are injected, so
 * every ending is exercised without a live project and without a real provider.
 * The engineering path is untouched by all of this: each case below ends with the
 * report still standing on its own deterministic Design Intent.
 */

import { describe, expect, it } from 'vitest';
import { buildProposalEvidence } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { EVIDENCE_AT, option } from './fixtures/proposalEvidenceFixtures.mjs';
import {
  DESIGN_INTENT_SENTENCE_FRAMES,
  DESIGN_INTENT_DECISION_SENTENCE,
  DESIGN_INTENT_REQUIREMENT,
  DESIGN_INTENT_SECTION,
  DESIGN_INTENT_WORD_LIMIT,
} from '../base44/shared/reportDesignIntent/designIntentBrief.js';
import { buildDesignIntentWriterInput } from '../base44/shared/reportDesignIntent/buildDesignIntentWriterInput.js';
import {
  DESIGN_INTENT_STATUS,
  buildDesignIntentRecord,
  isCompleteNarrative,
  readAcceptedDesignIntent,
} from '../base44/shared/reportDesignIntent/reportDesignIntentRecord.js';
import {
  DESIGN_INTENT_REFUSAL,
  designIntentTextFromOutput,
  runReportDesignIntent,
} from '../base44/shared/reportDesignIntent/reportDesignIntentRunner.js';
import {
  DESIGN_INTENT_SOURCE,
  resolveDesignIntent,
} from '../src/components/report/projectReport/designIntentAuthority.js';

const REPORT_VERSIONS = [option('a')];
const reportPack = () => buildProposalEvidence({ versions: REPORT_VERSIONS, generatedAt: EVIDENCE_AT });

const FINGERPRINTS = {
  engineeringFingerprint: 'eng-1',
  calculationFingerprint: 'calc-1',
  seatPriorityFingerprint: 'seat-1',
};

const ACCEPTED_TEXT = [
  'Our recommendation for this room is a seven-channel cinema with a height layer, built around the projection screen the seating is planned from.',
  'The front stage sits behind the screen so dialogue and score arrive from the picture itself, the surrounds carry the room around and behind the seats, and the bass is delivered from both ends so it stays even wherever the client sits.',
  'Every part of the design answers the same brief: a cinema that feels effortless on the first evening and every evening after it.',
].join(' ');

/** The contract's own returned draft: one section, in the writer's output shape. */
function draft(text, claimIds = []) {
  return JSON.stringify({
    contract_version: 2,
    pack_fingerprint: reportPack().pack_fingerprint,
    sections: [{ section: DESIGN_INTENT_SECTION, text, claim_ids: claimIds }],
  });
}

function baseAttempt(overrides = {}) {
  return runReportDesignIntent({
    flag: { enabled: true, model: null },
    versionIds: ['a'],
    readEvidence: async () => REPORT_VERSIONS,
    invokeLLM: async () => draft(ACCEPTED_TEXT, ['claim_1']),
    sourceFingerprints: FINGERPRINTS,
    user: { email: 'designer@example.com' },
    now: '2026-01-02T00:00:00.000Z',
    ...overrides,
  });
}

describe('the Design Intent brief', () => {
  it('states the report requirements and never a treatment product', () => {
    // The Design Intent is not a recommendation: the block is written as the
    // design team's own account of the design, and no opening phrase is mandated.
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/design intent/i);
    expect(DESIGN_INTENT_REQUIREMENT).not.toMatch(/Begin with a professional recommendation/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/never announce a recommendation/i);
    // The three things the block explains, and nothing else.
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/what this room is designed around/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/why the layout was chosen for it/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/what the system does well/i);
    // The copy is driven by this project's own facts rather than recited from a
    // schedule, and the room dimensions are not repeated.
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/DRIVE THE COPY WITH THIS PROJECT'S OWN FACTS/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/no equipment-by-equipment schedule/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/no repeated room dimensions/i);
    // The three core performance ideas, developed as prose and never as headings.
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/SPATIAL RESOLUTION is how the loudspeaker arrangement/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/TIMBRE MATCHING is how the loudspeaker layers/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/DYNAMIC RANGE is how much headroom/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/never as headings/i);
    // The plain register, and the rhetoric the block refuses.
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/short direct sentences, active voice/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/no figurative or anthropomorphic language/i);
    // The shape and length on the report's first page.
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/three short paragraphs/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/130 to 175 words/i);
    // The safety rules are unchanged.
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/translate the established engineering principles/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/recorded designer intent/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/never paraphrase the designer/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/natural British English/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/never name a treatment product/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/never invent a physical loudspeaker position/i);
  });

  it('shows the approved sentence frames, which carry no project fact of their own', () => {
    // The frames state the approved wording and hold no figure, product, layout or
    // distance of their own, so no fact can be carried across from them: every fact
    // in a report's copy comes from that project's own frozen evidence.
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/DESIGN INTENT SENTENCE FRAMES/);
    expect(DESIGN_INTENT_SENTENCE_FRAMES).toHaveLength(3);
    for (const entry of DESIGN_INTENT_SENTENCE_FRAMES) {
      expect(entry.frame).not.toMatch(/\d/);
      expect(entry.populate.length).toBeGreaterThan(0);
    }
  });

  it('opens on the cinema experience and keeps the detailed decisions until last', () => {
    // Paragraph one is the cinema the client is buying: the display and its format,
    // and the seat count and row arrangement, both filled from this project's own
    // evidence rather than from any stored figure.
    const [experience, spatial, capability] = DESIGN_INTENT_SENTENCE_FRAMES;
    expect(experience.id).toBe('cinema_experience');
    expect(experience.label).toMatch(/PARAGRAPH ONE: THE CINEMA EXPERIENCE/);
    expect(experience.frame).toMatch(/this project's own display and its format/);
    expect(experience.frame).toMatch(/this project's own seat count and row arrangement/);
    // The system that carries the experience follows it, and the capability closes
    // the block: spatial resolution and timbre matching, then dynamic range and bass.
    expect(spatial.label).toMatch(/PARAGRAPH TWO/);
    expect(capability.label).toMatch(/PARAGRAPH THREE/);
    expect(capability.frame).toMatch(/substantial headroom from the screen channels/);
    expect(capability.frame).toMatch(/extends the predicted low-frequency response to/);
    // The detailed design decision is neither an opening frame nor a fourth
    // paragraph: it is the one OPTIONAL sentence of paragraph three, written only
    // where this project's own geometry records the clearance.
    expect(DESIGN_INTENT_DECISION_SENTENCE.frame).toMatch(/seating is set forward of the rear wall/);
    expect(DESIGN_INTENT_DECISION_SENTENCE.include_when).toMatch(/never add it because the frame exists/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/DETAILED DESIGN DECISIONS COME LAST/);
    // The hierarchy and the experience rule reach the requirement the writer reads.
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/THE ORDER IS THE HIERARCHY/);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/never claim the same experience at every seat/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/never a figure, a size or a seat count from any other project/i);
  });

  it('writes design reasoning, never the summary again, and never marketing filler', () => {
    // Paragraph one is the cinema experience instead of a detailed constraint.
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/OPEN ON THE CINEMA EXPERIENCE/);
    // The facts the Project Summary above the block already states are not recited.
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/NEVER REPEAT THE SUMMARY ABOVE THIS BLOCK/);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/only where it helps explain why the design works/i);
    // Spatial resolution, timbre and dynamic range are made specific.
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/name the loudspeaker layers and channels THIS design actually has/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/close tonal consistency/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/excellent tonal consistency/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/only where the authoritative evidence supports it/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/the whole system's capability/i);
    // The bass is stated from the published extension, and no gain is invented.
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/predicted low-frequency response/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/never invent room gain/i);
    // The marketing filler the block refuses is named, so it is never written.
    for (const phrase of [
      'remarkably',
      'exceptional experience',
      'serious cinema-scale',
      'drawn into the action',
      'becomes part of the scene',
      'preserve their own tonal character',
      'stable connection between sound and picture',
      'substantial scale alongside quiet dialogue',
    ]) {
      expect(DESIGN_INTENT_REQUIREMENT.toLowerCase()).toContain(phrase);
    }
    // And the register it is written with instead.
    for (const preferred of ['consistent', 'close', 'strong', 'substantial headroom', 'useful reserve', 'clear coverage', 'predicted response', 'tonal consistency']) {
      expect(DESIGN_INTENT_REQUIREMENT.toLowerCase()).toContain(preferred);
    }
  });

  it('scopes the real writer input to the one Design Intent section', () => {
    const pack = reportPack();
    const input = buildDesignIntentWriterInput({ pack });

    expect(input.section_requirements).toHaveLength(1);
    expect(input.section_requirements[0].section).toBe(DESIGN_INTENT_SECTION);
    expect(input.section_requirements[0].word_limit).toBe(DESIGN_INTENT_WORD_LIMIT);
    // The tightened brief is the requirement the writer is actually called with,
    // never a second copy of it.
    expect(input.section_requirements[0].requirement).toBe(DESIGN_INTENT_REQUIREMENT);
    expect(input.section_requirements[0].requirement).toMatch(/OPEN ON THE CINEMA EXPERIENCE/);
    expect(input.section_requirements[0].requirement).toMatch(/NEVER REPEAT THE SUMMARY ABOVE THIS BLOCK/);
    expect(Object.keys(input.word_limits)).toEqual([DESIGN_INTENT_SECTION]);
    expect(input.output.sections).toHaveLength(1);
    expect(input.design_intent_scope.section).toBe(DESIGN_INTENT_SECTION);
    // The frozen evidence travels whole, and the scope is its own identity.
    expect(input.evidence_pack.pack_fingerprint).toBe(pack.pack_fingerprint);
    expect(typeof input.input_fingerprint).toBe('string');
    expect(input.input_fingerprint).not.toBe(pack.pack_fingerprint);
  });
});

describe('one attempt', () => {
  it('accepts a validated draft and records the evidence it was written from', async () => {
    const pack = reportPack();
    const attempt = await baseAttempt({
      validate: () => ({ valid: true, output: { sections: [{ section: DESIGN_INTENT_SECTION, text: ACCEPTED_TEXT, claim_ids: ['claim_1'] }] }, violations: [] }),
    });

    expect(attempt.ok).toBe(true);
    expect(attempt.text).toBe(ACCEPTED_TEXT);
    expect(attempt.record.status).toBe(DESIGN_INTENT_STATUS.ACCEPTED);
    expect(attempt.record.text).toBe(ACCEPTED_TEXT);
    expect(attempt.record.evidence_fingerprints).toEqual(FINGERPRINTS);
    expect(attempt.record.evidence_pack_fingerprint).toBe(pack.pack_fingerprint);
    expect(attempt.record.generated_by).toBe('designer@example.com');
    expect(readAcceptedDesignIntent(attempt.record, FINGERPRINTS).displayable).toBe(true);
  });

  it('refuses when the writer is switched off, without reading evidence', async () => {
    let read = false;
    const attempt = await baseAttempt({
      flag: { enabled: false },
      readEvidence: async () => { read = true; return REPORT_VERSIONS; },
    });
    expect(attempt.ok).toBe(false);
    expect(attempt.reason).toBe(DESIGN_INTENT_REFUSAL.FLAG_OFF);
    expect(read).toBe(false);
    expect(attempt.text).toBe(null);
  });

  it('falls back when the provider times out or throws, and writes no text', async () => {
    const attempt = await baseAttempt({
      invokeLLM: async () => { throw new Error('Request timed out.'); },
    });
    expect(attempt.ok).toBe(false);
    expect(attempt.reason).toBe(DESIGN_INTENT_REFUSAL.PROVIDER_FAILED);
    expect(attempt.text).toBe(null);
    expect(attempt.record.status).toBe(DESIGN_INTENT_STATUS.FAILED);
    expect(attempt.record.text).toBe(null);
    expect(readAcceptedDesignIntent(attempt.record, FINGERPRINTS).displayable).toBe(false);
  });

  it('falls back when the provider returns nothing at all', async () => {
    const attempt = await baseAttempt({ invokeLLM: async () => '' });
    expect(attempt.ok).toBe(false);
    expect(attempt.reason).toBe(DESIGN_INTENT_REFUSAL.PROVIDER_FAILED);
    expect(attempt.record.text).toBe(null);
  });

  it('rejects a draft the real validator refuses, and stores no text', async () => {
    // A real draft, a real validator: the section cites a claim the pack does not allow.
    const attempt = await baseAttempt({
      invokeLLM: async () => draft(ACCEPTED_TEXT, ['claim_not_in_the_pack']),
    });
    expect(attempt.ok).toBe(false);
    expect(attempt.reason).toBe(DESIGN_INTENT_REFUSAL.VALIDATION_FAILED);
    expect(attempt.record.status).toBe(DESIGN_INTENT_STATUS.REJECTED);
    expect(attempt.record.text).toBe(null);
    expect(attempt.validation_errors.length).toBeGreaterThan(0);
  });

  it('rejects a draft that is not the contract shape', async () => {
    const attempt = await baseAttempt({
      invokeLLM: async () => 'I have written the design intent for you.',
    });
    expect(attempt.ok).toBe(false);
    expect(attempt.reason).toBe(DESIGN_INTENT_REFUSAL.VALIDATION_FAILED);
    expect(attempt.text).toBe(null);
  });

  it('accepts no text from a draft whose Design Intent section is empty', () => {
    expect(designIntentTextFromOutput({ sections: [{ section: DESIGN_INTENT_SECTION, text: '   ' }] })).toBe(null);
    expect(designIntentTextFromOutput({ sections: [] })).toBe(null);
    expect(designIntentTextFromOutput(null)).toBe(null);
  });
});

describe('what may be displayed', () => {
  it('shows an accepted narrative written against the evidence the report stands on', () => {
    const saved = buildDesignIntentRecord({
      status: DESIGN_INTENT_STATUS.ACCEPTED,
      text: ACCEPTED_TEXT,
      sourceFingerprints: FINGERPRINTS,
      generatedAt: '2026-01-02T00:00:00.000Z',
      generatedBy: 'designer@example.com',
    });
    const resolved = resolveDesignIntent({
      deterministic: 'The report’s own intent. It reads as it always has.',
      saved,
      currentSourceFingerprints: FINGERPRINTS,
    });
    expect(resolved.source).toBe(DESIGN_INTENT_SOURCE.ASTRA);
    expect(resolved.text).toBe(ACCEPTED_TEXT);
  });

  it('never shows a narrative written for a different design', () => {
    const saved = buildDesignIntentRecord({
      status: DESIGN_INTENT_STATUS.ACCEPTED,
      text: ACCEPTED_TEXT,
      sourceFingerprints: FINGERPRINTS,
    });
    const resolved = resolveDesignIntent({
      deterministic: 'The report’s own intent.',
      saved,
      currentSourceFingerprints: { ...FINGERPRINTS, engineeringFingerprint: 'eng-2' },
    });
    expect(resolved.source).toBe(DESIGN_INTENT_SOURCE.DETERMINISTIC);
    expect(resolved.text).toBe('The report’s own intent.');
    expect(resolved.reason).toBe('evidence_moved:engineeringFingerprint');
  });

  it('never shows a refused or failed attempt, and never a fragment', () => {
    const rejected = buildDesignIntentRecord({ status: DESIGN_INTENT_STATUS.REJECTED, text: ACCEPTED_TEXT });
    expect(rejected.text).toBe(null);
    expect(resolveDesignIntent({ deterministic: 'Own intent.', saved: rejected }).source)
      .toBe(DESIGN_INTENT_SOURCE.DETERMINISTIC);

    const partial = { status: DESIGN_INTENT_STATUS.ACCEPTED, text: 'Our recommendation is a seven-channel cinema because' };
    expect(isCompleteNarrative(partial.text)).toBe(false);
    expect(resolveDesignIntent({ deterministic: 'Own intent.', saved: partial }).source)
      .toBe(DESIGN_INTENT_SOURCE.DETERMINISTIC);
  });

  it('keeps the report readable when there is no narrative at all', () => {
    const resolved = resolveDesignIntent({ deterministic: 'The report’s own intent.' });
    expect(resolved.source).toBe(DESIGN_INTENT_SOURCE.DETERMINISTIC);
    expect(resolved.text).toBe('The report’s own intent.');
    expect(resolved.reason).toBe('no_saved_narrative');
  });
});