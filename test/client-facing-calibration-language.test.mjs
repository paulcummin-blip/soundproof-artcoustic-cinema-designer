/**
 * Client-facing calibration language — acceptance tests.
 *
 * Sound Proof is primarily a professional cinema design and sales tool. The
 * proposal presents the recommended design, its engineering assessment and its
 * expected performance: what we have designed, why we recommend it, and what the
 * client can expect. It does not make a stated capability wait for a future
 * process, and it does not repeatedly qualify an engineering statement with a
 * warning about later verification.
 *
 * What is proved here:
 *
 *   - the language the proposal is written under states the confident capability
 *     sentence, names the disclaimers it refuses, and keeps the only two cases in
 *     which calibration or commissioning may be mentioned;
 *   - it reaches BOTH proposal voice paths and the prompt the writer is really
 *     called with, and it does not reach the shared authority the System Design
 *     reports and the internal client summary read;
 *   - the wording is refused when it appears in a draft, while the confident
 *     sentence and a plain statement of calibration as a fact of the design pass;
 *   - the validator still refuses design-review language and still rejects an
 *     unsupported equipment change: nothing was loosened;
 *   - the document's own fixed copy states the prediction basis with no
 *     verification disclaimer;
 *   - the RP22 design context strengthens the explanation and introduces no
 *     disclaimer;
 *   - internal accuracy is preserved: reliable versus assumed evidence, scope of
 *     each result, and a predicted result never described as a measured one.
 *
 * Fixtures only: no proposal is generated, no model is called, nothing is written.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import {
  CALIBRATION_LANGUAGE_VERSION,
  CALIBRATION_MENTION_ALLOWED_WHEN,
  CLIENT_FACING_CALIBRATION_LANGUAGE,
} from '../base44/shared/clientFacingCalibrationLanguage.js';
import {
  SOUND_PROOF_WRITING_AUTHORITY,
  buildProposalWritingAuthority,
} from '../base44/shared/soundProofWritingAuthority.js';
import { buildProposalSalesVoice } from '../base44/shared/proposalSalesVoice.js';
import { buildWriterPrompt } from '../base44/shared/proposalWriter/writerPromptBuilder.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { WRITER_REJECTION } from '../base44/shared/proposalWriter/writerContractSchema.js';
import {
  VERIFICATION_DISCLAIMER_RULES,
  VERIFICATION_DISCLAIMER_RULE_IDS,
  verificationDisclaimer,
} from '../base44/shared/proposalWriter/writerVerificationDisclaimerRules.js';
import { VALIDATOR_SOURCE_MANIFEST } from '../base44/shared/proposalWriter/validatorSourceManifest.js';
import { RP22_EVIDENCE_SAFETY_RULES, buildRp22DesignContext } from '../base44/shared/rp22DesignContext.js';
import { METHOD_PAGE, APPENDIX_PAGE } from '../src/components/proposal/print/proposalPackAuthority.js';

const saved = JSON.parse(readFileSync(new URL('./fixtures/marqueeLiveGeneration.json', import.meta.url)));

const AUTHORITY_TEXT = CLIENT_FACING_CALIBRATION_LANGUAGE.join('\n');
const HEADER = '=== CLIENT-FACING CALIBRATION LANGUAGE ===';
const EXAMPLE = 'The specified loudspeaker system provides the predicted output capability required for demanding film soundtracks.';

/** The writer's own validation path, on the saved live Marquee generation. */
function run(text, areas = ['speakers', 'lcr', 'surrounds', 'overheads', 'p12', 'p13', 'p14']) {
  const output = structuredClone(saved.output);
  const section = output.sections.find((entry) => entry.section === 'what_changes');
  section.text = text;
  section.claim_ids = saved.input.allowed_claims
    .filter((claim) => areas.includes(claim.area) && ['material_gain', 'factual_change'].includes(claim.kind))
    .map((claim) => claim.claim_id);
  return validateWriterOutput({ input: saved.input, output });
}
const codes = (result) => result.violations.map((entry) => entry.code);

describe('A. The language the proposal is written under', () => {
  it('states the three questions and the confident capability sentence', () => {
    expect(AUTHORITY_TEXT).toMatch(/what we have designed, why we recommend it, and what the client can expect/);
    expect(AUTHORITY_TEXT).toContain(EXAMPLE);
    expect(AUTHORITY_TEXT).toMatch(/in the same sentence as the capability itself/);
  });

  it('names the disclaimers it refuses', () => {
    for (const phrase of [
      'subject to confirmation during calibration',
      'to be confirmed once the system is installed',
      'pending in-room measurement',
      'final performance will be verified on site',
      'actual results may differ from the model',
    ]) expect(AUTHORITY_TEXT, phrase).toContain(phrase);
    expect(AUTHORITY_TEXT).toMatch(/NEVER APPEND A VERIFICATION DISCLAIMER TO A CAPABILITY/);
  });

  it('keeps the only two cases in which calibration may be mentioned', () => {
    expect(CALIBRATION_MENTION_ALLOWED_WHEN.length).toBe(2);
    expect(CALIBRATION_MENTION_ALLOWED_WHEN[0]).toContain('brief raises it');
    expect(CALIBRATION_MENTION_ALLOWED_WHEN[1]).toContain('practical design recommendation');
    expect(AUTHORITY_TEXT).toMatch(/CALIBRATION AND COMMISSIONING: ONLY WHEN THE CLIENT ASKED, OR AS A PRACTICAL RECOMMENDATION/);
  });

  it('preserves internal accuracy', () => {
    expect(AUTHORITY_TEXT).toMatch(/Never describe a predicted result as a measured result/);
    expect(AUTHORITY_TEXT).toMatch(/reliable and assumed evidence stay apart/);
    expect(AUTHORITY_TEXT).toMatch(/THE ENGINEERING IS UNCHANGED BY THIS/);
    expect(CALIBRATION_LANGUAGE_VERSION).toBe(1);
  });

  it('carries no em dash or en dash', () => {
    expect(/[\u2014\u2013]/.test(AUTHORITY_TEXT)).toBe(false);
  });
});

describe('B. It reaches both proposal voice paths, and only those', () => {
  it('is carried by the proposal writing authority, line for line', () => {
    const authority = buildProposalWritingAuthority();
    for (const line of CLIENT_FACING_CALIBRATION_LANGUAGE.filter((entry) => entry.trim().length > 0)) {
      expect(authority, line.slice(0, 60)).toContain(line);
    }
  });

  it('is carried by the proposal sales voice', () => {
    const voice = buildProposalSalesVoice('dynamic_range', 'comparison');
    expect(voice).toContain(HEADER);
    expect(voice).toContain(EXAMPLE);
    expect(voice).toContain('NEVER APPEND A VERIFICATION DISCLAIMER TO A CAPABILITY.');
  });

  it('leaves the shared authority the reports and the client summary read untouched', () => {
    expect(SOUND_PROOF_WRITING_AUTHORITY).not.toContain(HEADER);
    expect(SOUND_PROOF_WRITING_AUTHORITY).not.toContain('NEVER APPEND A VERIFICATION DISCLAIMER');
  });

  it('reaches the prompt the writer is really called with', () => {
    const prompt = buildWriterPrompt({ input: saved.input });
    expect(prompt).toContain(HEADER);
    expect(prompt).toContain('NEVER APPEND A VERIFICATION DISCLAIMER TO A CAPABILITY.');
    expect(prompt).toContain('This proposal is not a design review.');
  });
});

describe('C. The wording is refused when it appears, and confident copy passes', () => {
  it('refuses a capability made conditional on calibration', () => {
    const result = run('The screen channels provide the predicted output capability, subject to confirmation during calibration.');
    expect(codes(result)).toContain(WRITER_REJECTION.VERIFICATION_DISCLAIMER);
    const violation = result.violations.find((entry) => entry.code === WRITER_REJECTION.VERIFICATION_DISCLAIMER);
    expect(violation.detail).toMatch(/^verification_disclaimer:/);
  });

  it('refuses a confirmation promised after installation', () => {
    const result = run('The front-stage headroom is predicted, and final performance will be confirmed by in-room calibration.');
    expect(codes(result)).toContain(WRITER_REJECTION.VERIFICATION_DISCLAIMER);
  });

  it('refuses the prediction-versus-measurement gap', () => {
    for (const text of [
      'Bass consistency across the primary seats is predicted; actual results may differ from the model.',
      'The bass response is predicted, and the difference between the prediction and the measurement is expected.',
      'The consistency result cannot be confirmed until the room is measured.',
    ]) expect(codes(run(text)), text).toContain(WRITER_REJECTION.VERIFICATION_DISCLAIMER);
  });

  it('allows the confident capability sentence', () => {
    expect(codes(run(EXAMPLE))).not.toContain(WRITER_REJECTION.VERIFICATION_DISCLAIMER);
    expect(verificationDisclaimer(EXAMPLE)).toBe(null);
  });

  it('allows calibration stated once as a fact of the design', () => {
    const text = 'Commissioning and calibration are carried out as part of the installation programme, and the reference position is set at the start of that process.';
    expect(codes(run(text))).not.toContain(WRITER_REJECTION.VERIFICATION_DISCLAIMER);
    expect(verificationDisclaimer(text)).toBe(null);
  });

  it('leaves every existing rule in place', () => {
    // An unsupported equipment change is still rejected...
    expect(run('The screen is wider.').valid).toBe(false);
    // ...and design-review language is still rejected.
    expect(codes(run('The bass response needs attention.'))).toContain(WRITER_REJECTION.DESIGN_STAGE_COMMENTARY);
    // The new rule reports one reason per clause, like every other rule.
    for (const entry of VERIFICATION_DISCLAIMER_RULES) expect(VERIFICATION_DISCLAIMER_RULE_IDS).toContain(entry.rule);
  });
});

describe('D. The document itself no longer carries a disclaimer', () => {
  const fixed = [...METHOD_PAGE.notes, ...APPENDIX_PAGE.notes.flatMap((note) => [note.title, note.text])].join(' ');

  it('states the prediction basis', () => {
    expect(fixed).toMatch(/predicted from the room model and the published product data/);
  });

  it('appends no verification disclaimer anywhere in the fixed copy', () => {
    expect(/calibration|commissioning/i.test(fixed)).toBe(false);
    expect(fixed).not.toMatch(/final performance is confirmed/i);
  });
});

describe('E. RP22 design context strengthens the explanation and disclaims nothing', () => {
  it('carries the language rule', () => {
    const rules = RP22_EVIDENCE_SAFETY_RULES.join(' ');
    expect(rules).toMatch(/never introduces a verification disclaimer/);
    expect(rules).toMatch(/only where the client's brief raises it/);
    expect(buildRp22DesignContext({}).evidence_safety.join(' ')).toMatch(/never introduces a verification disclaimer/);
  });
});

describe('F. The rules are traceable', () => {
  it('is hashed as validator source, byte for byte', () => {
    for (const path of [
      'base44/shared/clientFacingCalibrationLanguage.js',
      'base44/shared/proposalWriter/writerVerificationDisclaimerRules.js',
    ]) {
      const hash = VALIDATOR_SOURCE_MANIFEST[path];
      expect(hash, path).toMatch(/^[0-9a-f]{64}$/);
      const source = readFileSync(new URL(`../${path}`, import.meta.url));
      expect(createHash('sha256').update(source).digest('hex'), path).toBe(hash);
    }
  });
});