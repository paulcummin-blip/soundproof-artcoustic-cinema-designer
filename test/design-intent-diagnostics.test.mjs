/**
 * design-intent-diagnostics.test.mjs
 * ----------------------------------
 * A REFUSED Astra Design Intent attempt, made diagnosable.
 *
 * The Barton refusal returned `validation_failed` and nothing else was kept:
 * the reason, the offending sentence and the draft the writer returned were gone
 * with the response. This pins the fix, and it pins the two things that must not
 * move while it is made:
 *
 *   1. A refused attempt is preserved WHOLE — the exact validation response and
 *      the draft it refused — and reads back through the technical detail as the
 *      reason, each violation, its evidence reference and the draft itself.
 *   2. The report is untouched either way. A refused draft is still never saved
 *      and still never replaces the published Design Intent; a validated draft
 *      still saves and still restores. No engineering value, no writer rule and
 *      no validation rule is exercised differently by any of this.
 *
 * The refusal below is produced by the REAL validator over the project's own
 * saved-report fixture, so the codes, the evidence reference and the attribution
 * are the ones the writer path actually produces. The offending sentence is then
 * stated synthetically, so the display and the clipboard are exercised over the
 * attributions the validator attaches without depending on which prose rule fires.
 */

import { describe, expect, it } from 'vitest';
import { buildProposalEvidence } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { EVIDENCE_AT, option } from './fixtures/proposalEvidenceFixtures.mjs';
import { DESIGN_INTENT_SECTION } from '../base44/shared/reportDesignIntent/designIntentBrief.js';
import { runReportDesignIntent } from '../base44/shared/reportDesignIntent/reportDesignIntentRunner.js';
import {
  DESIGN_INTENT_STATUS,
  readAcceptedDesignIntent,
} from '../base44/shared/reportDesignIntent/reportDesignIntentRecord.js';
import {
  DESIGN_INTENT_SOURCE,
  resolveDesignIntent,
} from '../src/components/report/projectReport/designIntentAuthority.js';
import {
  DESIGN_INTENT_DIAGNOSTICS_TITLE,
  buildDesignIntentDiagnosticRows,
  canViewDesignIntentDiagnostics,
  designIntentDiagnosticViolations,
  designIntentDraftText,
  formatDesignIntentDiagnosticsText,
} from '../src/components/report/projectReport/designIntentDiagnostics.js';
import {
  clearDesignIntentDiagnostics,
  readDesignIntentDiagnostics,
  saveDesignIntentDiagnostics,
} from '../src/components/report/projectReport/designIntentDiagnosticStore.js';

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

/** A draft in the contract's own shape, citing the claim IDs it is grounded on. */
function draft(text, claimIds) {
  return JSON.stringify({
    contract_version: 2,
    pack_fingerprint: reportPack().pack_fingerprint,
    sections: [{ section: DESIGN_INTENT_SECTION, text, claim_ids: claimIds }],
  });
}

/** The deterministic Design Intent the report composes for itself. */
const DETERMINISTIC = 'The report’s own Design Intent, as it always reads.';

function attempts(overrides = {}) {
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

/** The diagnostic response the backend builds from a refused attempt. */
function diagnosticsFor(attempt, {
  projectId = 'proj-barton',
  versionId = 'ver-original',
  attemptedAt = '2026-01-02T00:00:01.000Z',
} = {}) {
  return {
    reason: attempt.reason,
    detail: attempt.detail || null,
    project_id: projectId,
    version_id: versionId,
    attempted_at: attemptedAt,
    validation: attempt.validation || null,
    draft: attempt.draft ?? null,
    provider: attempt.provider_identity || null,
    source_fingerprints: FINGERPRINTS,
    input_fingerprint: attempt.input_fingerprint ?? null,
  };
}

/** A refusal, with the real validator refusing a draft grounded on nothing. */
async function refusedAttempt() {
  return attempts({ invokeLLM: async () => draft(ACCEPTED_TEXT, ['claim_not_in_the_pack']) });
}

/** The same refusal, with one violation carrying an offending sentence. */
async function diagnosticsWithSentence() {
  const attempt = await refusedAttempt();
  const diagnostics = diagnosticsFor(attempt);
  return {
    ...diagnostics,
    validation: {
      ...diagnostics.validation,
      violations: [
        {
          code: 'generic_marketing_phrase',
          section: DESIGN_INTENT_SECTION,
          detail: 'sophisticated cinematic experience',
          claim_ids: ['claim_1'],
          cited_claim_ids: ['claim_1'],
          rule_id: 'generic_marketing_phrase',
          sentence: 'This room delivers a sophisticated cinematic experience for the whole family.',
          clause: 'sophisticated cinematic experience',
          matched_substring: 'sophisticated cinematic experience',
          span: { start: 24, end: 59 },
          block_id: null,
        },
      ],
    },
  };
}

describe('a refused attempt is preserved whole', () => {
  it('keeps the exact validation response and the draft it refused', async () => {
    const attempt = await refusedAttempt();

    expect(attempt.ok).toBe(false);
    expect(attempt.reason).toBe('validation_failed');
    // The exact response, not a summary of it.
    expect(attempt.validation.valid).toBe(false);
    expect(attempt.validation.violations.length).toBe(attempt.validation_errors.length);
    expect(attempt.validation.violations.length).toBeGreaterThan(0);
    expect(attempt.validation.pack_fingerprint).toBe(reportPack().pack_fingerprint);
    expect(attempt.validation.contract_version).toBe(2);
    // The draft itself, exactly as the provider returned it.
    expect(attempt.draft).toBe(draft(ACCEPTED_TEXT, ['claim_not_in_the_pack']));
    // And the identity the refusal was made against.
    expect(typeof attempt.input_fingerprint).toBe('string');
    expect(attempt.output).toBeUndefined();
  });

  it('records no text and leaves the report on its own Design Intent', async () => {
    const attempt = await refusedAttempt();

    expect(attempt.record.status).toBe(DESIGN_INTENT_STATUS.REJECTED);
    expect(attempt.record.text).toBe(null);
    expect(readAcceptedDesignIntent(attempt.record, FINGERPRINTS).displayable).toBe(false);
    expect(resolveDesignIntent({
      deterministic: DETERMINISTIC,
      saved: attempt.record,
      currentSourceFingerprints: FINGERPRINTS,
    })).toMatchObject({ source: DESIGN_INTENT_SOURCE.DETERMINISTIC, text: DETERMINISTIC });
  });

  it('still saves and restores a validated draft', async () => {
    const attempt = await attempts({
      validate: () => ({
        valid: true,
        output: { sections: [{ section: DESIGN_INTENT_SECTION, text: ACCEPTED_TEXT, claim_ids: ['claim_1'] }] },
        violations: [],
      }),
    });

    expect(attempt.ok).toBe(true);
    expect(attempt.record.status).toBe(DESIGN_INTENT_STATUS.ACCEPTED);
    expect(attempt.record.text).toBe(ACCEPTED_TEXT);
    expect(readAcceptedDesignIntent(attempt.record, FINGERPRINTS).displayable).toBe(true);
    expect(resolveDesignIntent({
      deterministic: DETERMINISTIC,
      saved: attempt.record,
      currentSourceFingerprints: FINGERPRINTS,
    })).toMatchObject({ source: DESIGN_INTENT_SOURCE.ASTRA, text: ACCEPTED_TEXT });
  });
});

describe('what the technical detail reads back', () => {
  it('states the reason, the violation, its evidence reference and the draft', async () => {
    const diagnostics = diagnosticsFor(await refusedAttempt());
    const rows = buildDesignIntentDiagnosticRows(diagnostics);
    const value = (key) => rows.find((row) => row.key === key)?.value;
    const violations = designIntentDiagnosticViolations(diagnostics);

    expect(value('reason')).toBe('validation_failed');
    expect(value('validation_outcome')).toBe('Refused by the validator');
    expect(Number(value('violations'))).toBeGreaterThan(0);
    expect(value('evidence_pack')).toBe(reportPack().pack_fingerprint);
    expect(value('writer_input')).toBe(diagnostics.input_fingerprint);
    expect(value('project')).toBe('proj-barton');
    expect(value('version')).toBe('ver-original');
    // The evidence the report stands on travels with the refusal.
    expect(value('source_engineeringFingerprint')).toBe('eng-1');
    expect(value('source_seatPriorityFingerprint')).toBe('seat-1');
    // The evidence reference the validation itself attached.
    const ungrounded = violations.find((entry) => entry.cited_claim_ids.includes('claim_not_in_the_pack'));
    expect(ungrounded).toBeTruthy();
    expect(ungrounded.code).toBeTruthy();
    // The draft, readable.
    expect(designIntentDraftText(diagnostics)).toContain(ACCEPTED_TEXT);
  });

  it('states the offending sentence when the validation attributed one', async () => {
    const diagnostics = await diagnosticsWithSentence();
    const violations = designIntentDiagnosticViolations(diagnostics);
    const entry = violations.find((row) => row.code === 'generic_marketing_phrase');

    expect(entry.sentence).toBe('This room delivers a sophisticated cinematic experience for the whole family.');
    expect(entry.clause).toBe('sophisticated cinematic experience');
    expect(entry.span).toBe('24–59');
    expect(entry.cited_claim_ids).toEqual(['claim_1']);
    expect(entry.section).toBe(DESIGN_INTENT_SECTION);
  });

  it('copies the same detail as plain text', async () => {
    const diagnostics = await diagnosticsWithSentence();
    const copied = formatDesignIntentDiagnosticsText(diagnostics);

    expect(copied).toContain(DESIGN_INTENT_DIAGNOSTICS_TITLE);
    expect(copied).toContain('validation_failed');
    expect(copied).toContain('generic_marketing_phrase');
    expect(copied).toContain('This room delivers a sophisticated cinematic experience for the whole family.');
    expect(copied).toContain('claim_1');
    expect(copied).toContain(ACCEPTED_TEXT);
    expect(copied).toMatch(/the report keeps its own Design Intent/i);
  });

  it('says so plainly when nothing was returned or nothing is held', async () => {
    const diagnostics = diagnosticsFor(await refusedAttempt(), {});
    expect(designIntentDraftText({ ...diagnostics, draft: null })).toBe(null);
    expect(formatDesignIntentDiagnosticsText({ ...diagnostics, draft: null }))
      .toContain('The draft was not returned.');
    expect(formatDesignIntentDiagnosticsText(null)).toContain('No refused attempt is held in this session.');
  });
});

describe('who may see it', () => {
  it('is the master admin alone', () => {
    expect(canViewDesignIntentDiagnostics({ role: 'admin' })).toBe(true);
    expect(canViewDesignIntentDiagnostics({ role: 'user', access_context: { capabilities: { masterAdmin: true } } })).toBe(true);
    // An ordinary dealer, with the app's own access: no technical detail.
    expect(canViewDesignIntentDiagnostics({
      role: 'user',
      access_context: {
        capabilities: { soundProof: true, priceList: true },
        membership_role: 'dealer_admin',
        access_level: 'FULL_ACCESS',
      },
    })).toBe(false);
    expect(canViewDesignIntentDiagnostics(null)).toBe(false);
    expect(canViewDesignIntentDiagnostics(undefined)).toBe(false);
  });
});

describe('the session keeps a refusal after the notice is dismissed', () => {
  it('reads the refused attempt back after the notice has gone', async () => {
    const diagnostics = diagnosticsFor(await refusedAttempt());
    saveDesignIntentDiagnostics('proj-barton', 'ver-original', diagnostics);

    // The notice is dismissed, which clears the message and nothing else.
    const held = readDesignIntentDiagnostics('proj-barton', 'ver-original');
    expect(held).toBeTruthy();
    expect(held.reason).toBe('validation_failed');
    expect(designIntentDiagnosticViolations(held).length).toBeGreaterThan(0);
    expect(held.held_at).toBeTruthy();
    clearDesignIntentDiagnostics('proj-barton', 'ver-original');
  });

  it('is scoped to the report it belongs to, and a dealer attempt erases nothing', async () => {
    const diagnostics = diagnosticsFor(await refusedAttempt());
    saveDesignIntentDiagnostics('proj-barton', 'ver-original', diagnostics);

    // Another version, and another project, hold nothing of this one.
    expect(readDesignIntentDiagnostics('proj-barton', 'ver-two')).toBe(null);
    expect(readDesignIntentDiagnostics('proj-other', 'ver-original')).toBe(null);
    // A response carrying no diagnostic — a dealer's attempt — replaces nothing.
    saveDesignIntentDiagnostics('proj-barton', 'ver-original', null);
    expect(readDesignIntentDiagnostics('proj-barton', 'ver-original')).toBeTruthy();

    clearDesignIntentDiagnostics('proj-barton', 'ver-original');
    expect(readDesignIntentDiagnostics('proj-barton', 'ver-original')).toBe(null);
  });
});