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
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/professional recommendation/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/why it suits this room/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/picture, the seating and the loudspeaker arrangement/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/translate the established engineering principles/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/recorded designer intent/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/never paraphrase the designer/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/complete cinema experience/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/natural British English/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/RP22 parameters/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/never name a treatment product/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/never invent a physical loudspeaker position/i);
  });

  it('scopes the real writer input to the one Design Intent section', () => {
    const pack = reportPack();
    const input = buildDesignIntentWriterInput({ pack });

    expect(input.section_requirements).toHaveLength(1);
    expect(input.section_requirements[0].section).toBe(DESIGN_INTENT_SECTION);
    expect(input.section_requirements[0].word_limit).toBe(DESIGN_INTENT_WORD_LIMIT);
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