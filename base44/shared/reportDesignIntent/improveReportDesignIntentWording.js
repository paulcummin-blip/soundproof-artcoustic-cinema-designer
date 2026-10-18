/**
 * improveReportDesignIntentWording.js (shared)
 * -------------------------------------------
 * "IMPROVE WORDING WITH ADI" for the Project Report's Design Intent.
 *
 * The Design Intent is written by the engineering writer and saved beside the
 * report it was written for. This is the separate editorial job: ADI reads that
 * accepted narrative and improves how it reads, and the engineering writer is not
 * asked again.
 *
 * WHAT IT READS, and where from — nothing is assembled here that already exists:
 *
 *   - the saved narrative, from the report snapshot the report itself reads;
 *   - the frozen pack and the SCOPED writer input, from buildReportDesignIntentAttempt
 *     in prepare-only mode, so the improved wording is revalidated against exactly
 *     the agreement the narrative was written under.
 *
 * WHAT IT MAY CHANGE: the words, and nothing else. The improved record carries the
 * SAME evidence identity, geometry and image fingerprints as the narrative it
 * replaces, so a narrative that was current stays current and one that had already
 * gone stale stays stale. Nothing here is regenerated on opening a report.
 *
 * UNDO IS DURABLE. The record that was replaced is kept whole — its own text, its
 * own timestamps and its own fingerprints — so undoing restores exactly what was
 * there rather than a re-derivation of it.
 *
 * Pure apart from the injected calls: no React, no SDK, no runtime-specific APIs.
 */

import { buildReportDesignIntentAttempt } from './buildReportDesignIntentAttempt.js';
import {
  DESIGN_INTENT_STATUS,
  buildDesignIntentRecord,
} from './reportDesignIntentRecord.js';
import {
  DESIGN_INTENT_SECTION,
  designIntentSection,
} from './designIntentBrief.js';
import { validateWriterOutput } from '../proposalWriter/writerOutputValidator.js';
import { buildAdiEditorialPrompt } from '../adiEditorial/adiEditorialPrompt.js';
import { ADI_WORDING_OUTCOME, runAdiWordingPass } from '../adiEditorial/adiWordingPass.js';

/** The one action a caller asks for. */
export const ADI_INTENT_ACTION = Object.freeze({
  IMPROVE: 'improve',
  UNDO: 'undo',
});

/** Why the editorial pass could not be set up at all. */
export const ADI_INTENT_BLOCK = Object.freeze({
  INVALID_REQUEST: 'invalid_request',
  ACTION_UNKNOWN: 'unknown_action',
  NO_NARRATIVE: 'design_intent_missing',
  NOTHING_TO_UNDO: 'nothing_to_undo',
});

function blocked(code, status, error, reason = null) {
  return { ok: false, block: { code, status, error, reason } };
}

/** A name for the record of who improved the wording. */
function byWhom(user) {
  return user?.full_name || user?.email || null;
}

/** The narrative's own words, where there is one to improve. */
function acceptedText(saved) {
  if (!saved || typeof saved !== 'object') return null;
  if (saved.status !== DESIGN_INTENT_STATUS.ACCEPTED) return null;
  const text = typeof saved.text === 'string' ? saved.text.trim() : '';
  return text.length > 0 ? text : null;
}

/**
 * THE REVALIDATION: the writer's own output validator, run again on the improved
 * wording, against the same scoped input the narrative was written under.
 *
 * The claim IDs supplied are the pack's own allowed set, and that is deliberate.
 * This is an EDITORIAL pass: the grounding of the copy being rewritten is not
 * re-derived here, it is carried by the conservation gate, which refuses any
 * figure, level, scope, product, limitation or claim the original wording did not
 * already carry. What this validator adds is every rule the rewrite could still
 * break on its own — a figure the pack does not state, a blocked area, a scope the
 * evidence does not support, a capability claim with nothing behind it, design-stage
 * commentary, the section's word limit and the prose rules.
 */
function designIntentWordingValidator({ input, validate }) {
  const claimIds = (Array.isArray(input?.allowed_claims) ? input.allowed_claims : [])
    .map((claim) => claim?.claim_id)
    .filter(Boolean);

  return async (proposed) => {
    const result = validate({
      input,
      output: {
        contract_version: input?.contract_version ?? null,
        pack_fingerprint: input?.evidence_pack?.pack_fingerprint ?? null,
        sections: [{
          section: DESIGN_INTENT_SECTION,
          text: proposed,
          claim_ids: claimIds,
        }],
      },
    });
    return { ok: result?.valid === true, violations: result?.violations || [] };
  };
}

/** The identity the improved record is saved against: the SAME one, never a new one. */
function carriedIdentity(saved) {
  return {
    sourceFingerprints: saved?.evidence_fingerprints || null,
    evidencePackFingerprint: saved?.evidence_pack_fingerprint ?? null,
    inputFingerprint: saved?.input_fingerprint ?? null,
    geometryFingerprint: saved?.geometry_fingerprint ?? null,
    visualFingerprint: saved?.visual_fingerprint ?? null,
    visualContext: saved?.visual_context ?? null,
  };
}

/** What the client shows and what it can do next. */
function result({ applied, outcome = null, saved = null, previous = null, text = null, provider = null }) {
  return {
    ok: true,
    applied: Boolean(applied),
    outcome,
    kept_original: outcome !== null && outcome !== ADI_WORDING_OUTCOME.IMPROVED,
    text: text ?? (applied ? acceptedText(saved) : null),
    previous_text: previous,
    can_undo: Boolean(saved?.editorial?.improved_at),
    provider,
  };
}

/**
 * One editorial action on a saved Design Intent.
 *
 * @param {Object} input
 * @param {Object} input.entities — the user-scoped entity client (reads, and the save)
 * @param {Object} input.authorityEntities — the engineering-authority entity client
 * @param {Function} input.invokeLLM — the server-side provider call
 * @param {string} input.projectId
 * @param {string} input.versionId
 * @param {string} [input.action] — improve (default) or undo
 * @param {Object} [input.user]
 * @param {string} [input.now]
 * @param {string} [input.accountIdFallback]
 * @param {boolean} [input.isMasterAdmin]
 * @param {Function} [input.validate] — injected for tests; the writer's validator otherwise
 * @returns {Promise<Object>} the outcome, or `{ ok: false, block }`
 */
export async function improveReportDesignIntentWording({
  entities,
  authorityEntities,
  invokeLLM,
  projectId = null,
  versionId = null,
  action = ADI_INTENT_ACTION.IMPROVE,
  user = null,
  now = null,
  accountIdFallback = null,
  isMasterAdmin = false,
  validate = null,
} = {}) {
  if (!projectId || !versionId) {
    return blocked(ADI_INTENT_BLOCK.INVALID_REQUEST, 400, 'project_id and version_id are required.');
  }
  if (action !== ADI_INTENT_ACTION.IMPROVE && action !== ADI_INTENT_ACTION.UNDO) {
    return blocked(ADI_INTENT_BLOCK.ACTION_UNKNOWN, 400, 'That editorial action is not available.');
  }

  // ── THE ONE EVIDENCE PATH, read in prepare-only mode ──
  // The project, the version, the switch, the frozen report evidence and the scoped
  // writer input, exactly as the writer's own attempt reads them — and no provider
  // call and no write.
  const prepared = await buildReportDesignIntentAttempt({
    entities,
    authorityEntities,
    invokeLLM,
    projectId,
    versionId,
    user,
    accountIdFallback,
    isMasterAdmin,
    now,
    prepareOnly: true,
  });
  if (!prepared.ok) return { ok: false, block: prepared.block };

  const { snapshot, flag, project, version } = prepared;
  const payload = snapshot.payload && typeof snapshot.payload === 'object' ? snapshot.payload : {};
  const saved = payload.design_intent || null;
  const replaced = payload.design_intent_previous || null;

  // ── UNDO: the copy that was replaced, put back exactly as it was ──
  if (action === ADI_INTENT_ACTION.UNDO) {
    if (!replaced) {
      return blocked(
        ADI_INTENT_BLOCK.NOTHING_TO_UNDO,
        409,
        'There is no earlier wording to restore for this report.',
      );
    }
    const next = { ...payload, design_intent: replaced };
    delete next.design_intent_previous;
    await entities.ReportSnapshot.update(snapshot.id, { payload: next });
    return result({ applied: true, outcome: ADI_WORDING_OUTCOME.UNCHANGED, saved: replaced, previous: null });
  }

  // ── IMPROVE ──
  const original = acceptedText(saved);
  if (!original) {
    return blocked(
      ADI_INTENT_BLOCK.NO_NARRATIVE,
      409,
      'This report has no accepted Design Intent to improve yet.',
    );
  }

  const section = designIntentSection(prepared.writerInput?.section_requirements) || {};
  const prompt = buildAdiEditorialPrompt({
    sectionLabel: section.title || 'Design Intent',
    mode: 'section',
    currentText: original,
    evidenceIdentity: {
      source: 'published report evidence',
      evidence_pack_fingerprint: saved?.evidence_pack_fingerprint ?? null,
      report_or_report_type: 'Project Report',
    },
    documentIdentity: {
      project: project?.name || null,
      client: project?.client_name || null,
      version: version?.version_name || null,
    },
  });

  const pass = await runAdiWordingPass({
    flag,
    invokeLLM,
    prompt,
    original,
    mode: 'section',
    validate: designIntentWordingValidator({
      input: prepared.writerInput,
      validate: typeof validate === 'function' ? validate : validateWriterOutput,
    }),
  });

  if (pass.outcome !== ADI_WORDING_OUTCOME.IMPROVED) {
    return result({ applied: false, outcome: pass.outcome, saved, provider: pass.provider });
  }

  // ── THE ONE WRITE: the improved wording, saved as an editorial revision of the
  // same narrative, with the copy it replaced kept whole behind it ──
  const improved = buildDesignIntentRecord({
    status: DESIGN_INTENT_STATUS.ACCEPTED,
    text: pass.text,
    ...carriedIdentity(saved),
    providerIdentity: {
      provider: saved?.provider ?? null,
      model: pass.provider?.model ?? null,
      promptVersion: saved?.prompt_version ?? null,
      contractVersion: saved?.contract_version ?? null,
      validatorFingerprint: saved?.validator_fingerprint ?? null,
      durationMs: pass.provider?.duration_ms ?? null,
    },
    // The narrative's own generation identity is kept, and the editorial act is
    // recorded beside it: the words were written when they were written, and they
    // were improved when they were improved.
    generatedAt: saved?.generated_at ?? null,
    generatedBy: saved?.generated_by ?? null,
    editorial: {
      improvedAt: now,
      improvedBy: byWhom(user),
      source: saved?.text ?? null,
    },
  });

  await entities.ReportSnapshot.update(snapshot.id, {
    payload: { ...payload, design_intent: improved, design_intent_previous: saved },
  });

  return result({
    applied: true,
    outcome: ADI_WORDING_OUTCOME.IMPROVED,
    saved: improved,
    previous: saved?.text ?? null,
    // Only the words change: every figure, level, product and result the report
    // reads stays exactly where it was.
    provider: pass.provider,
  });
}

export default improveReportDesignIntentWording;