/**
 * reportDesignIntentRunner.js (shared)
 * ------------------------------------
 * ONE controlled Astra attempt at a Project Report's Design Intent.
 *
 * The order is the contract and it is short, because nothing here is a new
 * pipeline: the flag, the frozen report evidence, the existing evidence pack, the
 * existing writer input — scoped to the one section — the existing provider, the
 * existing validator, and one record of what happened.
 *
 * The operation is OPTIONAL and FAILURE-ISOLATED. Every way it can fail — the
 * writer switched off, evidence that cannot be read, a provider timeout, an empty
 * answer, or a draft the validator refuses — comes back as `{ ok: false, reason }`
 * with no text accepted and nothing written. It never throws, and it never
 * touches the report: the Project Report generates, renders and prints exactly as
 * it always has, with its own deterministic Design Intent, whether this runs, is
 * refused, or fails.
 *
 * The engineering interpretation is REUSED, not reinvented: when the caller holds
 * the frozen engineering snapshot, the shared ADI interpretation Stage 1 is built
 * from it and carried to the writer; without it the writer is given the frozen
 * pack and the designer's own recorded intent, which is the pack-alone behaviour
 * the existing design context already defines.
 *
 * Everything external is injected — the evidence read, the provider call, the
 * validator, the clock, the user — so the whole path is exercised in tests without
 * a live project and without a real provider.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { buildProposalEvidence } from '../proposalEvidence/proposalEvidenceBuilder.js';
import { buildProjectInterpretation } from '../adiProjectInterpretation.js';
import {
  INTERPRETATION_RULE,
  VERIFIED_INTERPRETATION_SOURCE,
  buildEditorialBrief,
  interpretationView,
} from '../proposalWriter/writerDesignContext.js';
import { assertWriterInputCarriesNoLiveState } from '../proposalWriter/writerPromptBuilder.js';
import { callWriterProvider } from '../proposalWriter/writerProvider.js';
import { validateWriterOutput } from '../proposalWriter/writerOutputValidator.js';
import { validatorProvenance } from '../proposalWriter/validatorProvenance.js';
import { DESIGN_INTENT_SECTION } from './designIntentBrief.js';
import { buildDesignIntentWriterInput } from './buildDesignIntentWriterInput.js';
import {
  DESIGN_INTENT_STATUS,
  buildDesignIntentRecord,
} from './reportDesignIntentRecord.js';

/** Why a Design Intent attempt produced no narrative. */
export const DESIGN_INTENT_REFUSAL = Object.freeze({
  FLAG_OFF: 'writer_flag_off',
  NO_EVIDENCE: 'report_evidence_unavailable',
  PROVIDER_FAILED: 'provider_failed',
  VALIDATION_FAILED: 'validation_failed',
});

/** A refused attempt: no text, no write. */
function refusal(code, detail) {
  return {
    ok: false,
    code,
    reason: code,
    detail: detail || null,
    text: null,
    record: buildDesignIntentRecord({
      status: code === DESIGN_INTENT_REFUSAL.PROVIDER_FAILED
        ? DESIGN_INTENT_STATUS.FAILED
        : DESIGN_INTENT_STATUS.REJECTED,
      rejection: { code, detail: detail || null },
    }),
  };
}

/**
 * The design context the writer is given: the reused ADI interpretation where the
 * frozen engineering snapshot is held, and the designer's own recorded intent as
 * instructions. Neither is a source of figures, and neither is ever copy.
 */
function buildIntentDesignContext({ engineeringSnapshot, project, versions, clientBrief, designerNotes }) {
  let interpretation = null;
  if (engineeringSnapshot && typeof engineeringSnapshot === 'object') {
    const built = buildProjectInterpretation({
      snapshot: engineeringSnapshot,
      project: project || null,
      clientBrief: clientBrief || project?.notes || '',
      reportType: 'single',
      versions,
      reportLabel: 'Project Report',
    });
    if (built && typeof built === 'object') interpretation = built;
  }

  return {
    design_interpretation: interpretation
      ? {
        rule: INTERPRETATION_RULE,
        available: true,
        source: VERIFIED_INTERPRETATION_SOURCE,
        view: interpretationView(interpretation),
      }
      : null,
    editorial_brief: buildEditorialBrief({ dealerNotes: designerNotes || project?.notes || null }),
  };
}

/** The accepted section text, or null when the draft carries none. */
export function designIntentTextFromOutput(output) {
  const sections = Array.isArray(output?.sections) ? output.sections : [];
  const entry = sections.find((row) => row?.section === DESIGN_INTENT_SECTION) || null;
  const text = typeof entry?.text === 'string' ? entry.text.trim() : '';
  return text.length > 0 ? text : null;
}

/**
 * Run one attempt.
 *
 * @param {Object} input
 * @param {Object} input.flag — resolveGptWriterFlag output
 * @param {Function} input.readEvidence — async ({ versionIds }) => the frozen report evidence
 * @param {Array<string>} input.versionIds — the version this report documents
 * @param {Function} input.invokeLLM — the server-side provider call
 * @param {Object} [input.project] — the saved project, for its recorded notes
 * @param {Object} [input.engineeringSnapshot] — the frozen engineering snapshot
 * @param {Object} [input.sourceFingerprints] — the evidence the report stands on
 * @param {Object} [input.user]
 * @param {string} [input.now]
 * @param {Function} [input.validate] — injected for tests; the shared validator otherwise
 * @returns {Promise<Object>} the accepted narrative and its record, or a refusal
 */
export async function runReportDesignIntent({
  flag = null,
  readEvidence = null,
  versionIds = [],
  invokeLLM = null,
  project = null,
  engineeringSnapshot = null,
  sourceFingerprints = null,
  clientBrief = null,
  designerNotes = null,
  user = null,
  now = null,
  validate = validateWriterOutput,
} = {}) {
  // 1. The writer's own switch, checked before anything is read or sent.
  if (flag?.enabled !== true) {
    return refusal(
      DESIGN_INTENT_REFUSAL.FLAG_OFF,
      'The Astra writer is not enabled for this login. No evidence was read and no provider call was made.',
    );
  }

  const versions = Array.isArray(versionIds) ? versionIds.filter(Boolean) : [];
  if (versions.length === 0 || typeof readEvidence !== 'function') {
    return refusal(DESIGN_INTENT_REFUSAL.NO_EVIDENCE, 'No saved report was supplied to write from.');
  }

  // 2. The frozen report evidence, through the existing read path.
  let evidence = null;
  try {
    evidence = await readEvidence({ versionIds: versions });
  } catch (error) {
    return refusal(DESIGN_INTENT_REFUSAL.NO_EVIDENCE, error?.message || 'The saved report evidence could not be read.');
  }

  // 3. The frozen pack and the scoped writer input.
  let pack = null;
  let writerInput = null;
  try {
    pack = buildProposalEvidence({ versions: evidence, generatedAt: now });
    writerInput = buildDesignIntentWriterInput({
      pack,
      designContext: buildIntentDesignContext({
        engineeringSnapshot,
        project,
        versions,
        clientBrief,
        designerNotes,
      }),
    });
    assertWriterInputCarriesNoLiveState(writerInput);
  } catch (error) {
    return refusal(DESIGN_INTENT_REFUSAL.NO_EVIDENCE, error?.message || 'The frozen evidence pack could not be built.');
  }

  // 4. The provider call. A timeout, a refusal or an empty answer is a result.
  const provider = await callWriterProvider({ invokeLLM, input: writerInput, model: flag?.model ?? null });
  if (provider.provider_error || !provider.received) {
    return {
      ...refusal(DESIGN_INTENT_REFUSAL.PROVIDER_FAILED, provider.provider_error || 'The provider returned no output.'),
      record: buildDesignIntentRecord({
        status: DESIGN_INTENT_STATUS.FAILED,
        sourceFingerprints,
        evidencePackFingerprint: pack.pack_fingerprint ?? null,
        inputFingerprint: writerInput.input_fingerprint ?? null,
        providerIdentity: {
          provider: provider.provider ?? null,
          model: provider.model ?? null,
          promptVersion: writerInput.prompt_version ?? null,
          contractVersion: writerInput.contract_version ?? null,
          durationMs: provider.duration_ms ?? null,
        },
        generatedAt: now,
        generatedBy: user?.full_name || user?.email || null,
        rejection: { code: DESIGN_INTENT_REFUSAL.PROVIDER_FAILED, detail: provider.provider_error || null },
      }),
    };
  }

  // 5. The existing validator, against the exact input the writer was given.
  const validation = validate({ input: writerInput, output: provider.output });
  const text = validation?.valid === true ? designIntentTextFromOutput(validation.output) : null;
  const provenance = validatorProvenance();

  const providerIdentity = {
    provider: provider.provider ?? null,
    model: provider.model ?? null,
    promptVersion: writerInput.prompt_version ?? null,
    contractVersion: writerInput.contract_version ?? null,
    validatorFingerprint: provenance?.validator_rules_fingerprint ?? null,
    durationMs: provider.duration_ms ?? null,
  };

  if (!text) {
    const first = Array.isArray(validation?.violations) ? validation.violations[0] : null;
    return {
      ...refusal(
        DESIGN_INTENT_REFUSAL.VALIDATION_FAILED,
        first ? `${first.rejection || first.code || 'rejected'}${first.detail ? `: ${first.detail}` : ''}` : 'The draft was not validated.',
      ),
      validation_errors: validation?.violations || [],
      record: buildDesignIntentRecord({
        status: DESIGN_INTENT_STATUS.REJECTED,
        sourceFingerprints,
        evidencePackFingerprint: pack.pack_fingerprint ?? null,
        inputFingerprint: writerInput.input_fingerprint ?? null,
        providerIdentity,
        generatedAt: now,
        generatedBy: user?.full_name || user?.email || null,
        rejection: { code: DESIGN_INTENT_REFUSAL.VALIDATION_FAILED, detail: first?.detail ?? null },
      }),
    };
  }

  const record = buildDesignIntentRecord({
    status: DESIGN_INTENT_STATUS.ACCEPTED,
    text,
    sourceFingerprints,
    evidencePackFingerprint: pack.pack_fingerprint ?? null,
    inputFingerprint: writerInput.input_fingerprint ?? null,
    providerIdentity,
    generatedAt: now,
    generatedBy: user?.full_name || user?.email || null,
  });

  return {
    ok: true,
    code: null,
    reason: null,
    detail: null,
    text,
    record,
    validation_errors: validation?.violations || [],
    evidence_pack_fingerprint: pack.pack_fingerprint ?? null,
    input_fingerprint: writerInput.input_fingerprint ?? null,
    prompt_version: writerInput.prompt_version ?? null,
    contract_version: writerInput.contract_version ?? null,
    provider: provider.provider ?? null,
    model: provider.model ?? null,
    duration_ms: provider.duration_ms ?? null,
  };
}

export default runReportDesignIntent;