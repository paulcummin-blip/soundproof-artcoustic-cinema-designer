/**
 * design-intent-extraction-format.test.mjs
 * ----------------------------------------
 * ONE CANONICAL DRAFT — the provider-format defect and its full matrix.
 *
 * THE DEFECT. The validator accepts either representation of a returned draft —
 * JSON text (fenced or not), or an already-parsed object. The acceptance path did
 * not: it read `validation.output`, which the shared validator never returns, and
 * fell back to `parseWriterOutput(provider.output)`, which only accepts a string.
 * A draft returned as a parsed object therefore passed every gate and then failed
 * text extraction, and the attempt was refused as `accepted_text_missing`.
 *
 * THE CORRECTION UNDER TEST. The provider's output is normalised ONCE by
 * `canonicalDesignIntentDraft` — an object as it stands, text through the
 * validator's own parser — and that one draft is what the validator checks and
 * what the accepted text is read from. Nothing about the contract, the grounding
 * checks, the word limits or the evidence is relaxed here: the cases below prove
 * that an unsupported claim, a missing section, unparseable output, a wrong
 * contract and a fingerprint mismatch are all still refused, and that a refusal
 * that is not the validator's is still named for what it is.
 *
 * The provider is injected throughout: no Astra call is made in this file.
 */

import { describe, expect, it } from 'vitest';
import { buildProposalEvidence } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { marqueeVersion, MARQUEE_GENERATED_AT } from './fixtures/marqueeOriginalGuardFixture.mjs';
import { buildDesignIntentWriterInput } from '../base44/shared/reportDesignIntent/buildDesignIntentWriterInput.js';
import {
  DESIGN_INTENT_REFUSAL,
  canonicalDesignIntentDraft,
  runReportDesignIntent,
} from '../base44/shared/reportDesignIntent/reportDesignIntentRunner.js';
import { DESIGN_INTENT_SECTION } from '../base44/shared/reportDesignIntent/designIntentBrief.js';
import {
  DESIGN_INTENT_STATUS,
  readAcceptedDesignIntent,
} from '../base44/shared/reportDesignIntent/reportDesignIntentRecord.js';
import { DESIGN_INTENT_SOURCE, resolveDesignIntent } from '../src/components/report/projectReport/designIntentAuthority.js';

/** The frozen clock the pack and the attempt share, so the fingerprints agree. */
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

/** A claim this pack does not allow: the grounding refusal. */
const UNSUPPORTED_CLAIM_ID = 'claim_p12_primary_performance_01';

/** The captured Original Design wording, grounded by the five claims above. */
const TEXT = 'This cinema is arranged around a large television and a single loudspeaker system. '
  + 'The display occupies the front wall, the viewing position is set so the distance suits its scale, '
  + 'and the screen channels, the surrounds and the rear subwoofer pair work together as one system. '
  + 'The arrangement keeps dialogue, music and effects in their proper places around the listener.';

/** The draft as an OBJECT — the representation that used to defeat the extractor. */
function draftObject({ text = TEXT, claimIds = CITED_CLAIM_IDS, overrides = {} } = {}) {
  const input = writerInput();
  return {
    contract_version: input.contract_version,
    pack_fingerprint: input.evidence_pack.pack_fingerprint,
    sections: [{ section: DESIGN_INTENT_SECTION, text, claim_ids: [...claimIds] }],
    ...overrides,
  };
}

/** The same draft as JSON TEXT, exactly as a real provider returns it. */
function draftText(options) {
  return JSON.stringify(draftObject(options));
}

/** One attempt through the real path, with the provider injected. */
async function attempt({ output, invokeLLM } = {}) {
  return runReportDesignIntent({
    flag: { enabled: true, model: null },
    versionIds: ['a'],
    readEvidence: async () => [marqueeVersion()],
    invokeLLM: invokeLLM || (async () => output),
    sourceFingerprints: FINGERPRINTS,
    user: { email: 'admin@example.com' },
    now: AT,
  });
}

describe('the canonical draft', () => {
  it('normalises both provider representations to one draft, and refuses neither', () => {
    // An object stands as it is — the same object, not a copy of it.
    const parsed = draftObject();
    expect(canonicalDesignIntentDraft(parsed)).toBe(parsed);

    // Text is parsed once, with the validator’s own parser, fences and all.
    expect(canonicalDesignIntentDraft(draftText())).toEqual(parsed);
    expect(canonicalDesignIntentDraft(`\`\`\`json\n${draftText()}\n\`\`\``)).toEqual(parsed);

    // Anything that is not a usable draft normalises to nothing.
    expect(canonicalDesignIntentDraft('not a draft at all')).toBe(null);
    expect(canonicalDesignIntentDraft('')).toBe(null);
    expect(canonicalDesignIntentDraft(null)).toBe(null);
    expect(canonicalDesignIntentDraft([draftObject()])).toBe(null);
  });
});

describe('A–J: the acceptance matrix', () => {
  it('A. a valid draft returned as JSON text is ACCEPTED', async () => {
    const accepted = await attempt({ output: draftText() });

    expect(accepted.ok).toBe(true);
    expect(accepted.code).toBe(null);
    expect(accepted.record.status).toBe(DESIGN_INTENT_STATUS.ACCEPTED);
    expect(accepted.text).toBe(TEXT);
    expect(accepted.record.text).toBe(TEXT);
    expect(accepted.validation_errors).toEqual([]);
  });

  it('B. a valid draft returned as a parsed object is ACCEPTED', async () => {
    const accepted = await attempt({ output: draftObject() });

    expect(accepted.ok).toBe(true);
    expect(accepted.reason).toBe(null);
    expect(accepted.record.status).toBe(DESIGN_INTENT_STATUS.ACCEPTED);
    expect(accepted.text).toBe(TEXT);
    expect(accepted.record.text).toBe(TEXT);
    expect(accepted.validation_errors).toEqual([]);
    // Not a new acceptance path: the same evidence and contract identity.
    expect(accepted.contract_version).toBe(2);
    expect(accepted.evidence_pack_fingerprint).toBe(referencePack().pack_fingerprint);
  });

  it('C. the same draft in either format produces identical accepted text', async () => {
    const asText = await attempt({ output: draftText() });
    const asObject = await attempt({ output: draftObject() });

    expect(asObject.text).toBe(asText.text);
    expect(asObject.record.text).toBe(asText.record.text);
    expect(asObject.record.status).toBe(asText.record.status);
    expect(asObject.record.evidence_pack_fingerprint).toBe(asText.record.evidence_pack_fingerprint);
    expect(asObject.record.input_fingerprint).toBe(asText.record.input_fingerprint);
    expect(asObject.record.evidence_fingerprints).toEqual(asText.record.evidence_fingerprints);
  });

  it('D. an unsupported claim is REJECTED, in either format', async () => {
    const claimIds = [...CITED_CLAIM_IDS.slice(0, 4), UNSUPPORTED_CLAIM_ID];

    for (const output of [draftText({ claimIds }), draftObject({ claimIds })]) {
      const refused = await attempt({ output });

      expect(refused.ok).toBe(false);
      expect(refused.reason).toBe(DESIGN_INTENT_REFUSAL.VALIDATION_FAILED);
      expect(refused.validation.valid).toBe(false);
      expect(refused.validation_errors.map((entry) => entry.code)).toContain('unsupported_claim');
      expect(refused.record.text).toBe(null);
    }
  });

  it('E. a draft without the Design Intent section is REJECTED, and never read as missing text', async () => {
    const refused = await attempt({ output: { ...draftObject(), sections: [] } });

    expect(refused.ok).toBe(false);
    // The validator refused it, so the gate named is the validator’s, not acceptance.
    expect(refused.reason).toBe(DESIGN_INTENT_REFUSAL.VALIDATION_FAILED);
    expect(refused.validation.valid).toBe(false);
    expect(refused.validation_errors.map((entry) => entry.detail))
      .toContain(`missing_section:${DESIGN_INTENT_SECTION}`);
    expect(refused.record.text).toBe(null);
  });

  it('F. output that is not a draft at all is REJECTED', async () => {
    // Prose, broken JSON and a JSON array all reach the validator and are refused
    // there. (Nothing at all — an empty answer — is the provider gate, case J.)
    for (const output of ['The design intent is written below.', '```json\n{ broken', '[{"section":"decision_summary"}]']) {
      const refused = await attempt({ output });

      expect(refused.ok).toBe(false);
      expect(refused.reason).toBe(DESIGN_INTENT_REFUSAL.VALIDATION_FAILED);
      expect(refused.validation.valid).toBe(false);
      expect(refused.validation_errors.length).toBeGreaterThan(0);
      expect(refused.record.text).toBe(null);
    }
  });

  it('G. a wrong contract version is REJECTED, in either format', async () => {
    for (const output of [draftText({ overrides: { contract_version: 1 } }), draftObject({ overrides: { contract_version: 1 } })]) {
      const refused = await attempt({ output });

      expect(refused.ok).toBe(false);
      expect(refused.reason).toBe(DESIGN_INTENT_REFUSAL.VALIDATION_FAILED);
      expect(refused.validation_errors.map((entry) => entry.detail)).toContain('contract_version_mismatch:1');
      expect(refused.record.text).toBe(null);
    }
  });

  it('H. a fingerprint mismatch is REJECTED, in either format', async () => {
    for (const output of [draftText({ overrides: { pack_fingerprint: 'f21824c6' } }), draftObject({ overrides: { pack_fingerprint: 'f21824c6' } })]) {
      const refused = await attempt({ output });

      expect(refused.ok).toBe(false);
      expect(refused.validation_errors.map((entry) => entry.detail)).toContain('pack_fingerprint_mismatch');
      expect(refused.record.text).toBe(null);
    }
  });

  it('I. an accepted narrative saves and restores against its own evidence', async () => {
    const accepted = await attempt({ output: draftObject() });

    expect(readAcceptedDesignIntent(accepted.record, FINGERPRINTS)).toMatchObject({
      displayable: true,
      reason: null,
      text: TEXT,
    });
    expect(resolveDesignIntent({
      deterministic: DETERMINISTIC,
      saved: accepted.record,
      currentSourceFingerprints: FINGERPRINTS,
    })).toMatchObject({ source: DESIGN_INTENT_SOURCE.ASTRA, text: TEXT });

    // And it still stops counting the moment the design moves on.
    expect(resolveDesignIntent({
      deterministic: DETERMINISTIC,
      saved: accepted.record,
      currentSourceFingerprints: { ...FINGERPRINTS, engineeringFingerprint: 'eng:moved-on' },
    })).toMatchObject({ source: DESIGN_INTENT_SOURCE.DETERMINISTIC, text: DETERMINISTIC });
  });

  it('J. a provider failure keeps the report’s own Design Intent', async () => {
    const failed = await attempt({
      invokeLLM: async () => { throw new Error('The provider timed out.'); },
    });

    expect(failed.ok).toBe(false);
    expect(failed.reason).toBe(DESIGN_INTENT_REFUSAL.PROVIDER_FAILED);
    expect(failed.record.status).toBe(DESIGN_INTENT_STATUS.FAILED);
    expect(failed.record.text).toBe(null);
    expect(resolveDesignIntent({
      deterministic: DETERMINISTIC,
      saved: failed.record,
      currentSourceFingerprints: FINGERPRINTS,
    })).toMatchObject({ source: DESIGN_INTENT_SOURCE.DETERMINISTIC, text: DETERMINISTIC });
  });
});