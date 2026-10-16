/**
 * design-intent-acceptance.test.mjs
 * ---------------------------------
 * ASTRA DESIGN INTENT ACCEPTANCE — the confirmed Barton defect, and the gates
 * around it.
 *
 * THE DEFECT. A complete, fully grounded Design Intent was refused with
 * "validation_failed" while the validation beside it read "Passed validation",
 * 0 violations, contract 2 and a pack fingerprint. Nothing was saved.
 *
 * The cause was one read: the acceptance condition took the narrative from
 * `validation.output`, and `validateWriterOutput` does not return an `output` at
 * all — it returns the sections it READ (their word counts and citations). So the
 * text came back null for a draft that had passed every gate, and the refusal was
 * hard-coded to `validation_failed`, which is what the diagnostic then reported.
 * The first test below proves that shape against the real validator; the replay
 * then drives the captured draft through the corrected path.
 *
 * THE REPLAY. The refused draft's literal text was never stored — a refusal
 * stores nothing, by design — so the replay reconstructs the draft the record
 * describes: ONE section (the Design Intent), a complete narrative, FIVE cited
 * claim IDs, contract 2 and the pack's own fingerprint, in the wording of the
 * frozen "Original Design" case this defect came from, grounded by exactly the
 * five claims the pack mints. The acceptance read is word-count independent, so
 * the replay is decisive on the mechanism.
 *
 * No Astra call is made anywhere in this file: the provider is injected.
 */

import { describe, expect, it } from 'vitest';
import { buildProposalEvidence } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { marqueeVersion, MARQUEE_GENERATED_AT } from './fixtures/marqueeOriginalGuardFixture.mjs';
import { buildDesignIntentWriterInput } from '../base44/shared/reportDesignIntent/buildDesignIntentWriterInput.js';
import {
  DESIGN_INTENT_REFUSAL,
  designIntentTextFromOutput,
  runReportDesignIntent,
} from '../base44/shared/reportDesignIntent/reportDesignIntentRunner.js';
import { DESIGN_INTENT_SECTION } from '../base44/shared/reportDesignIntent/designIntentBrief.js';
import {
  DESIGN_INTENT_STATUS,
  readAcceptedDesignIntent,
} from '../base44/shared/reportDesignIntent/reportDesignIntentRecord.js';
import {
  parseWriterOutput,
  validateWriterOutput,
} from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { wordCount } from '../base44/shared/proposalWriter/writerVocabulary.js';
import { DESIGN_INTENT_SOURCE, resolveDesignIntent } from '../src/components/report/projectReport/designIntentAuthority.js';

/** The frozen clock the reference pack and the attempt share, so the fingerprints agree. */
const AT = MARQUEE_GENERATED_AT;

const FINGERPRINTS = {
  engineeringFingerprint: 'eng:original-design',
  calculationFingerprint: 'calc:original-design',
  seatPriorityFingerprint: 'seat:original-design',
};

const DETERMINISTIC = 'The report’s own Design Intent, as it always reads.';

const referencePack = () => buildProposalEvidence({ versions: [marqueeVersion()], generatedAt: AT });
const writerInput = () => buildDesignIntentWriterInput({ pack: referencePack() });

/** The five claim IDs this pack mints — every one of them real, none invented. */
const CITED_CLAIM_IDS = Object.freeze([
  'claim_p4_primary_performance_01',
  'claim_p6_primary_performance_01',
  'claim_p20_primary_consistency_01',
  'claim_p4_secondary_performance_01',
  'claim_p6_secondary_performance_01',
]);

/** The captured Design Intent wording of the frozen Original Design case. */
const REPLAY_TEXT = 'This cinema is arranged around a large television and a single loudspeaker system. '
  + 'The display occupies the front wall, the viewing position is set so the distance suits its scale, '
  + 'and the screen channels, the surrounds and the rear subwoofer pair work together as one system. '
  + 'The arrangement keeps dialogue, music and effects in their proper places around the listener.';

const REPLAY_WORDS = wordCount(REPLAY_TEXT);

/** The draft the provider returns: JSON text, exactly as a real provider returns it. */
function draftText({ text = REPLAY_TEXT, claimIds = CITED_CLAIM_IDS, overrides = {} } = {}) {
  const input = writerInput();
  return JSON.stringify({
    contract_version: input.contract_version,
    pack_fingerprint: input.evidence_pack.pack_fingerprint,
    sections: [{ section: DESIGN_INTENT_SECTION, text, claim_ids: [...claimIds] }],
    ...overrides,
  });
}

/** One attempt through the real path, with the provider and the validator injected. */
async function attempt({ output = draftText(), validate, invokeLLM } = {}) {
  return runReportDesignIntent({
    flag: { enabled: true, model: null },
    versionIds: ['a'],
    readEvidence: async () => [marqueeVersion()],
    invokeLLM: invokeLLM || (async () => output),
    sourceFingerprints: FINGERPRINTS,
    user: { email: 'admin@example.com' },
    now: AT,
    ...(validate ? { validate } : {}),
  });
}

describe('the handoff that refused a passing draft', () => {
  it('returns a valid result that carries no accepted output, which is what was misread', () => {
    const validation = validateWriterOutput({ input: writerInput(), output: draftText() });

    // Every gate the validator holds passed: contract, schema, grounding, prose.
    expect(validation.valid).toBe(true);
    expect(validation.violations).toEqual([]);
    expect(validation.contract_version).toBe(2);
    expect(validation.pack_fingerprint).toBe(referencePack().pack_fingerprint);
    expect(validation.sections).toEqual([
      {
        section: DESIGN_INTENT_SECTION,
        words: REPLAY_WORDS,
        word_limit: 200,
        claim_ids: [...CITED_CLAIM_IDS],
      },
    ]);
    // The result reports what it READ. It hands no prose back — so a narrative read
    // from `validation.output` was always null, for every passing draft.
    expect(validation.output).toBeUndefined();
    // The draft is where the prose is, parsed exactly as the validator parses it.
    expect(designIntentTextFromOutput(parseWriterOutput(draftText()).output)).toBe(REPLAY_TEXT);
  });

  it('replays the captured draft: it passes every gate, and the corrected path now accepts it', async () => {
    expect(CITED_CLAIM_IDS).toHaveLength(5);
    expect(REPLAY_WORDS).toBe(60);
    expect(REPLAY_TEXT.endsWith('.')).toBe(true);

    const replayed = await attempt();

    expect(replayed.ok).toBe(true);
    expect(replayed.reason).toBe(null);
    expect(replayed.code).toBe(null);
    expect(replayed.record.status).toBe(DESIGN_INTENT_STATUS.ACCEPTED);
    expect(replayed.record.text).toBe(REPLAY_TEXT);
    expect(replayed.validation_errors).toEqual([]);
    // The attempt is identified exactly: contract 2 and the pack it was written from.
    expect(replayed.contract_version).toBe(2);
    expect(replayed.evidence_pack_fingerprint).toBe(referencePack().pack_fingerprint);
  });
});

describe('A–H: every gate still holds', () => {
  it('A. a valid, fully grounded draft is ACCEPTED and SAVED', async () => {
    const saved = await attempt();

    expect(saved.ok).toBe(true);
    expect(saved.record.status).toBe(DESIGN_INTENT_STATUS.ACCEPTED);
    expect(saved.record.text).toBe(REPLAY_TEXT);
    // Saved against the evidence it was written from, and displayable for it.
    expect(readAcceptedDesignIntent(saved.record, FINGERPRINTS)).toMatchObject({
      displayable: true,
      reason: null,
      text: REPLAY_TEXT,
    });
  });

  it('B. an unsupported engineering claim is REJECTED', async () => {
    const refused = await attempt({
      output: draftText({
        claimIds: [...CITED_CLAIM_IDS.slice(0, 4), 'claim_p12_primary_performance_01'],
      }),
    });

    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe(DESIGN_INTENT_REFUSAL.VALIDATION_FAILED);
    expect(refused.validation.valid).toBe(false);
    expect(refused.validation_errors.map((entry) => entry.code)).toContain('unsupported_claim');
    expect(refused.validation_errors.find((entry) => entry.code === 'unsupported_claim').detail)
      .toBe('claim_p12_primary_performance_01');
    expect(refused.record.status).toBe(DESIGN_INTENT_STATUS.REJECTED);
    expect(refused.record.text).toBe(null);
  });

  it('C. an invalid contract is REJECTED', async () => {
    const refused = await attempt({ output: draftText({ overrides: { contract_version: 1 } }) });

    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe(DESIGN_INTENT_REFUSAL.VALIDATION_FAILED);
    expect(refused.validation.valid).toBe(false);
    expect(refused.validation_errors.map((entry) => entry.detail)).toContain('contract_version_mismatch:1');
    expect(refused.record.text).toBe(null);
  });

  it('D. a missing validation result is REJECTED, never accepted by default', async () => {
    // The validator returns nothing at all.
    const absent = await attempt({ validate: () => undefined });
    expect(absent.ok).toBe(false);
    expect(absent.record.status).toBe(DESIGN_INTENT_STATUS.REJECTED);
    expect(absent.record.text).toBe(null);

    // And a result that omits the success flag is not read as success either.
    const unflagged = await attempt({ validate: () => ({ violations: [] }) });
    expect(unflagged.ok).toBe(false);
    expect(unflagged.validation?.valid).not.toBe(true);
    expect(unflagged.record.text).toBe(null);
  });

  it('E. a genuine fingerprint mismatch is REJECTED', async () => {
    const refused = await attempt({ output: draftText({ overrides: { pack_fingerprint: 'f21824c6' } }) });

    expect(refused.ok).toBe(false);
    expect(refused.validation.valid).toBe(false);
    expect(refused.validation_errors.map((entry) => entry.detail)).toContain('pack_fingerprint_mismatch');
    expect(refused.record.text).toBe(null);
  });

  it('F. a provider failure FALLS BACK to the report’s own Design Intent', async () => {
    const failed = await attempt({
      invokeLLM: async () => { throw new Error('The provider timed out.'); },
    });

    expect(failed.ok).toBe(false);
    expect(failed.reason).toBe(DESIGN_INTENT_REFUSAL.PROVIDER_FAILED);
    expect(failed.record.status).toBe(DESIGN_INTENT_STATUS.FAILED);
    expect(failed.record.text).toBe(null);
    expect(readAcceptedDesignIntent(failed.record, FINGERPRINTS).displayable).toBe(false);
    expect(resolveDesignIntent({
      deterministic: DETERMINISTIC,
      saved: failed.record,
      currentSourceFingerprints: FINGERPRINTS,
    })).toMatchObject({ source: DESIGN_INTENT_SOURCE.DETERMINISTIC, text: DETERMINISTIC });
  });

  it('G. a failed validation FALLS BACK to the report’s own Design Intent', async () => {
    const refused = await attempt({
      output: draftText({ claimIds: [...CITED_CLAIM_IDS.slice(0, 4), 'claim_p12_primary_performance_01'] }),
    });

    expect(refused.ok).toBe(false);
    expect(readAcceptedDesignIntent(refused.record, FINGERPRINTS)).toMatchObject({
      displayable: false,
      text: null,
    });
    expect(resolveDesignIntent({
      deterministic: DETERMINISTIC,
      saved: refused.record,
      currentSourceFingerprints: FINGERPRINTS,
    })).toMatchObject({ source: DESIGN_INTENT_SOURCE.DETERMINISTIC, text: DETERMINISTIC });
  });

  it('H. a successful validation is SAVED AND RESTORED, and stops counting when the evidence moves', async () => {
    const saved = await attempt();

    const displayed = resolveDesignIntent({
      deterministic: DETERMINISTIC,
      saved: saved.record,
      currentSourceFingerprints: FINGERPRINTS,
    });
    expect(displayed).toMatchObject({ source: DESIGN_INTENT_SOURCE.ASTRA, text: REPLAY_TEXT });

    // The restore is only ever for the evidence it was written against.
    expect(readAcceptedDesignIntent(saved.record, {
      ...FINGERPRINTS,
      engineeringFingerprint: 'eng:moved-on',
    })).toMatchObject({ displayable: false, reason: 'evidence_moved:engineeringFingerprint' });
    expect(resolveDesignIntent({
      deterministic: DETERMINISTIC,
      saved: saved.record,
      currentSourceFingerprints: { ...FINGERPRINTS, engineeringFingerprint: 'eng:moved-on' },
    })).toMatchObject({ source: DESIGN_INTENT_SOURCE.DETERMINISTIC });
  });

  it('a passing validation is never filed as a validation failure', async () => {
    // The validator passes the draft, but no section text can be read from it: the
    // exact contradiction the Barton diagnostic reported.
    const unreadable = await attempt({
      output: JSON.stringify({
        contract_version: 2,
        pack_fingerprint: referencePack().pack_fingerprint,
        sections: [],
      }),
      validate: () => ({ valid: true, violations: [], sections: [] }),
    });

    expect(unreadable.ok).toBe(false);
    // The gate is named for what it is, and the validation beside it is left alone.
    expect(unreadable.reason).toBe(DESIGN_INTENT_REFUSAL.ACCEPTED_TEXT_MISSING);
    expect(unreadable.validation.valid).toBe(true);
    expect(unreadable.validation_errors).toEqual([]);
    expect(unreadable.detail).toMatch(/passed this draft with no violations/i);
    expect(unreadable.record.status).toBe(DESIGN_INTENT_STATUS.REJECTED);
    expect(unreadable.record.text).toBe(null);
    expect(unreadable.record.rejection).toEqual({
      code: DESIGN_INTENT_REFUSAL.ACCEPTED_TEXT_MISSING,
      detail: unreadable.detail,
    });
  });
});