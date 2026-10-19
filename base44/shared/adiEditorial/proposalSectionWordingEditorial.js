/**
 * proposalSectionWordingEditorial.js (shared)
 * ------------------------------------------
 * "IMPROVE WORDING WITH ADI" for one generated narrative section of a report.
 *
 * The section's copy was written by the engineering writer from the version's own
 * frozen system authority. This is the separate editorial job: ADI reads that copy
 * and improves how it reads. The writer is not asked again, no evidence is
 * re-derived, and no engineering value is touched.
 *
 * TWO MODES, one authority:
 *
 *   WHOLE SECTION  the whole body is improved and written back, with the copy it
 *                  replaced kept behind it.
 *   SELECTION      the designer highlights a sentence or a paragraph. The
 *                  highlighted text is improved on its own, WITHOUT a write, and
 *                  the editor splices it back in; the same action is then called
 *                  again with the spliced body, which is checked mechanically to
 *                  prove that nothing outside the selection changed, and only then
 *                  is it saved. Everything outside the selection is byte-for-byte
 *                  unchanged.
 *
 * WHAT IS WRITTEN, and what it means:
 *
 *   - the body is replaced, and the section's GENERATED stamp moves with it: the
 *     wording was written for the designer by ADI, not typed by them, so the
 *     manual-edit flag is not raised;
 *   - the approval of this section's wording stops counting the moment the body or
 *     either stamp changes, so an improved section is awaiting approval again by
 *     construction rather than through a second reset path;
 *   - the copy that was replaced — its body and BOTH its timestamps — is kept in
 *     the section's own metadata, so UNDO puts back exactly what was there and,
 *     with it, the approval identity that belonged to that exact wording.
 *
 * Pure apart from the injected calls: no React, no SDK, no runtime-specific APIs.
 */

import { approvalPlainText } from '../proposalApproval/sectionApprovalAuthority.js';
import { latestValidGeneration } from '../proposalGeneration/proposalGenerationHistory.js';
import { frozenProposalMode } from '../proposalEdit/proposalEditEditorModel.js';
import { sectionApprovalFingerprint, publishedSectionFingerprint } from '../proposalApproval/sectionApprovalAuthority.js';
import { groundProductMentions } from '../proposalProductGrounding.js';
import { adiSectionContract, buildAdiEditorialPrompt } from '../adiEditorial/adiEditorialPrompt.js';
import { ADI_WORDING_OUTCOME, runAdiWordingPass } from '../adiEditorial/adiWordingPass.js';
import { checkSelectionSpliceConservation } from '../adiEditorial/adiWordingConservation.js';
import { ADI_REJECTION_STAGE, buildAdiRejectionDiagnostics } from '../adiEditorial/adiRejectionDiagnostics.js';

/** The action the caller asks for. */
export const ADI_SECTION_ACTION = Object.freeze({
  IMPROVE: 'improve',
  UNDO: 'undo',
});

/** What the caller is improving. */
export const ADI_SECTION_MODE = Object.freeze({
  SECTION: 'section',
  SELECTION: 'selection',
});

/** Why the editorial pass could not even be set up. */
export const ADI_SECTION_BLOCK = Object.freeze({
  INVALID_REQUEST: 'invalid_request',
  ACTION_UNKNOWN: 'unknown_action',
  PROPOSAL_NOT_FOUND: 'proposal_not_found',
  SECTION_NOT_FOUND: 'section_not_found',
  NO_COPY: 'section_has_no_copy',
  NOTHING_TO_UNDO: 'nothing_to_undo',
  NOTHING_SELECTED: 'nothing_selected',
  SPLICE_NOT_CONSERVED: 'selection_not_conserved',
});

function blocked(code, status, error, reason = null, diagnostics = null) {
  return { ok: false, block: { code, status, error, reason, diagnostics } };
}

/** The words a reader sees, whichever form the body is stored in. */
function readable(value) {
  return approvalPlainText(value);
}

/** A name for the record of who improved the wording. */
function byWhom(user) {
  return user?.full_name || user?.email || null;
}

/**
 * The section's metadata without its editorial marker, so an undo leaves no trace.
 * The marker is omitted as the copy is rebuilt — the same metadata the previous
 * in-place removal produced, with no key removal at all.
 */
function withoutMarker(metadata) {
  const { adi_editorial: _marker, ...rest } = (metadata && typeof metadata === 'object')
    ? metadata
    : {};
  return { ...rest, adi_editorial: null };
}

/**
 * Is this copy fit to be saved: every product it names is one this version
 * specifies. The refusal carries the product it names and the copy it was read
 * from, so it can be read afterwards. The code is the refusal; the rest is detail.
 */
function groundingViolationEntry(text, grounding) {
  if (!grounding) return null;
  const checked = groundProductMentions(text, grounding);
  if (checked?.grounded === true) return null;
  const first = (checked?.unresolved || [])[0] || null;
  return {
    code: 'ungrounded_product',
    rule: 'ungrounded_product',
    category: 'product grounding',
    originalValue: null,
    proposedValue: first?.name || null,
    originalExcerpt: null,
    proposedExcerpt: first?.segment || null,
    explanation: 'The rewritten copy names equipment this design version does not specify.',
  };
}

/** One uniform result, whatever the pass ended in. */
function result({ applied, action, outcome = null, mode, improvedText = null, previousText = null, text = null, canUndo = false, reason = null, diagnostics = null, attempts = 0, corrected = false, attempt_audit = [] }) {
  return {
    ok: true,
    applied: Boolean(applied),
    action,
    mode,
    outcome,
    kept_original: outcome !== null && outcome !== ADI_WORDING_OUTCOME.IMPROVED,
    // The wording to apply: the improved copy for a whole-section edit, and the
    // improved highlighted text for the half of a selection edit that has not been
    // saved yet. The editor reads exactly one field either way.
    improved_text: improvedText ?? text,
    previous_text: previousText,
    text,
    can_undo: Boolean(canUndo),
    reason,
    // The refusal read back in full, for the response alone: the copy as it stood,
    // the copy that was refused, the stage that refused it and every violation. It
    // is never written to the record — a refusal is a zero-write outcome.
    diagnostics,
    attempts,
    corrected,
    attempt_audit,
  };
}

/**
 * One editorial action on one section.
 *
 * @param {Object} input
 * @param {Object} input.entities — the user-scoped entity client
 * @param {Function} input.invokeLLM — the server-side provider call
 * @param {string} input.proposalId
 * @param {string} input.sectionId
 * @param {string} [input.action] — improve (default) or undo
 * @param {string} [input.mode] — section (default) or selection
 * @param {string} [input.selectionText] — exactly what the designer highlighted
 * @param {string} [input.improvedSelection] — what ADI returned for it, on the half
 *   of a selection edit that saves
 * @param {string} [input.bodyHtml] — the body after the editor spliced the improved
 *   selection in. Present only on the saving half of a selection edit.
 * @param {Object} [input.grounding] — the version's product grounding, from
 *   buildProductGrounding: the improved copy may name only the products this design
 *   version specifies.
 * @param {Object} [input.user]
 * @param {string} [input.now]
 * @param {Function|null} [input.persistRevision] — production proposal revision handoff
 * @returns {Promise<Object>} the outcome, or `{ ok: false, block }`
 */
export async function improveProposalSectionWording({
  entities,
  invokeLLM,
  proposalId = null,
  sectionId = null,
  action = ADI_SECTION_ACTION.IMPROVE,
  mode = ADI_SECTION_MODE.SECTION,
  selectionText = '',
  improvedSelection = null,
  bodyHtml = null,
  grounding = null,
  user = null,
  now = null,
  persistRevision = null,
} = {}) {
  if (!proposalId || !sectionId) {
    return blocked(ADI_SECTION_BLOCK.INVALID_REQUEST, 400, 'proposal_id and section_id are required.');
  }
  if (action !== ADI_SECTION_ACTION.IMPROVE && action !== ADI_SECTION_ACTION.UNDO) {
    return blocked(ADI_SECTION_BLOCK.ACTION_UNKNOWN, 400, 'That editorial action is not available.');
  }

  const proposals = await entities.Proposal.filter({ id: proposalId }).catch(() => []);
  const proposal = proposals?.[0] || null;
  if (!proposal?.id) return blocked(ADI_SECTION_BLOCK.PROPOSAL_NOT_FOUND, 404, 'That report was not found.');

  const sections = await entities.ProposalSection.filter({ id: sectionId }).catch(() => []);
  const section = sections?.[0] || null;
  if (!section?.id || String(section.proposal_id || '') !== String(proposalId)) {
    return blocked(ADI_SECTION_BLOCK.SECTION_NOT_FOUND, 404, 'That section is not part of this report.');
  }

  const marker = section.metadata?.adi_editorial || null;

  // ── UNDO: the exact copy that was replaced, put back exactly as it was ──
  // The body and BOTH timestamps are restored, so the section's approval
  // fingerprint describes the wording that was approved again and the approval
  // that belonged to it counts once more.
  if (action === ADI_SECTION_ACTION.UNDO) {
    if (!marker || typeof marker.previous_body !== 'string') {
      return blocked(ADI_SECTION_BLOCK.NOTHING_TO_UNDO, 409, 'There is no earlier wording to restore for this section.');
    }
    const replacedText = readable(section.body);
    const restorePatch = {
      body: marker.previous_body,
      last_user_edited_at: marker.previous_last_user_edited_at ?? null,
      last_gpt_generated_at: marker.previous_last_gpt_generated_at ?? null,
      metadata: {
        ...withoutMarker(section.metadata),
        // Approval is restored only for the exact content previously approved.
        approval: marker.previous_approval || section.metadata?.approval || null,
      },
    };
    const persistedRestore = await persistSectionChange({
      entities,
      persistRevision,
      proposalId,
      sectionId,
      section,
      body: marker.previous_body,
      patch: restorePatch,
      now,
      user,
      source: 'adi_undo',
    });
    if (persistedRestore.accepted !== true) {
      return rejectedByRevision({
        action: 'undo',
        mode: marker.mode || ADI_SECTION_MODE.SECTION,
        originalText: replacedText,
        proposedText: readable(marker.previous_body),
        persisted: persistedRestore,
        canUndo: true,
      });
    }
    // Read the stored record, not an optimistic update response.
    const restored = (await entities.ProposalSection.filter({ id: sectionId }))[0] || null;
    const approval = restorePatch.metadata.approval;
    const expectedApprovalFingerprint = sectionApprovalFingerprint({
      publishedBody: marker.previous_body, storedBody: marker.previous_body,
      lastUserEditedAt: restorePatch.last_user_edited_at,
      lastGptGeneratedAt: restorePatch.last_gpt_generated_at,
    });
    const mismatches = [];
    if (restored?.body !== marker.previous_body) mismatches.push('body');
    for (const key of ['last_user_edited_at', 'last_gpt_generated_at']) {
      if ((restored?.[key] ?? null) !== restorePatch[key]) mismatches.push(key);
    }
    if (restored?.metadata?.adi_editorial) mismatches.push('adi_editorial');
    if (publishedSectionFingerprint(restored?.body) !== marker.source_fingerprint) mismatches.push('source_fingerprint');
    if (approval?.fingerprint === expectedApprovalFingerprint
      && JSON.stringify(restored?.metadata?.approval) !== JSON.stringify(approval)) mismatches.push('approval');
    if (mismatches.length) return blocked(
      'undo_verification_failed', 409,
      'The earlier wording could not be fully restored. Please reload and try again.',
      null,
      { rejectionStage: 'undo_persistence', violations: mismatches.map((field) => ({
        rule: 'undo_field_not_restored', category: 'persistence', explanation: field,
      })) },
    );
    return result({
      applied: true,
      action: 'undo',
      mode: marker.mode || ADI_SECTION_MODE.SECTION,
      outcome: ADI_WORDING_OUTCOME.UNCHANGED,
      previousText: replacedText,
      text: readable(marker.previous_body),
      canUndo: false,
    });
  }

  // ── IMPROVE ──
  const originalBody = typeof section.body === 'string' ? section.body : '';
  const original = readable(originalBody);
  if (original.length === 0) {
    return blocked(ADI_SECTION_BLOCK.NO_COPY, 409, 'This section has no copy to improve yet.');
  }

  const selection = String(selectionText || '');
  const saving = mode === ADI_SECTION_MODE.SELECTION && typeof bodyHtml === 'string';

  // ── A SELECTION EDIT SAVES ONLY WHAT IT CAN PROVE ──
  // The improved highlighted text is put back by the editor, and the copy it was
  // spliced into is read back here: the stored body with exactly that one
  // replacement has to read as the body on screen. Anything else is refused before
  // it comes near the record, and the stored body is left untouched.
  if (saving) {
    if (readable(selection).length === 0 || readable(improvedSelection).length === 0) {
      return blocked(ADI_SECTION_BLOCK.NOTHING_SELECTED, 400, 'The highlighted text was not supplied.');
    }
    const conserved = checkSelectionSpliceConservation({
      originalBody,
      improvedBody: bodyHtml,
      selectionText: selection,
      improvedSelection,
    });
    if (!conserved.ok) {
      return blocked(
        ADI_SECTION_BLOCK.SPLICE_NOT_CONSERVED,
        409,
        'The copy outside the highlighted text changed, so nothing was saved.',
        conserved.violations?.[0]?.detail || null,
        buildAdiRejectionDiagnostics({
          originalText: original,
          proposedText: bodyHtml,
          stage: ADI_REJECTION_STAGE.SELECTION_CONSERVATION,
          violations: conserved.violations,
        }),
      );
    }
    const ungrounded = groundingViolationEntry(bodyHtml, grounding);
    if (ungrounded) {
      return result({
        applied: false,
        action,
        mode,
        outcome: ADI_WORDING_OUTCOME.REJECTED,
        reason: ungrounded.code,
        diagnostics: buildAdiRejectionDiagnostics({
          originalText: original,
          proposedText: bodyHtml,
          stage: ADI_REJECTION_STAGE.PRODUCT_GROUNDING,
          violations: [ungrounded],
        }),
      });
    }
    const write = await save({
      entities, persistRevision, proposalId, sectionId, section, body: bodyHtml, now, user, mode,
      previousBody: originalBody, previousText: original, improvedText: readable(bodyHtml),
    });
    return result({ ...write, action, mode });
  }

  if (mode === ADI_SECTION_MODE.SELECTION && readable(selection).length === 0) {
    return blocked(ADI_SECTION_BLOCK.NOTHING_SELECTED, 400, 'Highlight the text to improve first.');
  }

  const generations = entities.ProposalGeneration?.filter
    ? await entities.ProposalGeneration.filter({ proposal_id: proposalId })
    : [];
  const generation = latestValidGeneration(generations, { proposalId });
  const sectionContract = adiSectionContract({
    sectionType: section.section_type,
    sectionLabel: section.title || section.section_type,
    mode: generation ? frozenProposalMode(generation) : 'single',
    original: mode === ADI_SECTION_MODE.SELECTION ? selection : originalBody,
  });
  const prompt = buildAdiEditorialPrompt({
    sectionContract,
    sectionLabel: section.title || 'this section',
    mode,
    currentText: mode === ADI_SECTION_MODE.SELECTION ? original : originalBody,
    selectionText: selection,
    evidenceIdentity: {
      source: 'the version\u2019s frozen system authority',
      report_or_report_type: proposal.proposal_type || null,
    },
    documentIdentity: {
      document: proposal.title || null,
    },
  });

  const pass = await runAdiWordingPass({
    // NOT flag-gated: this is an editorial action on copy the designer already has,
    // exactly as the section regeneration actions beside it are.
    flag: null,
    invokeLLM,
    prompt,
    sectionContract,
    original: mode === ADI_SECTION_MODE.SELECTION ? selection : originalBody,
    mode,
    validate: async (proposed) => {
      const entry = groundingViolationEntry(proposed, grounding);
      if (entry) return { ok: false, violations: [entry] };
      if (mode === ADI_SECTION_MODE.SECTION && typeof persistRevision === 'function') {
        const checked = await persistRevision({
          entities, proposalId, section, body: proposed, user, now, validateOnly: true,
        });
        return { ok: checked.accepted === true, violations: checked.violations || [] };
      }
      return { ok: true, violations: [] };
    },
    // Which stage a refusal by that validator is read under, for the diagnostic
    // alone. It names the validator; it never decides anything.
    validateStage: grounding
      ? ADI_REJECTION_STAGE.PRODUCT_GROUNDING
      : ADI_REJECTION_STAGE.ORIGINAL_SURFACE_VALIDATOR,
  });

  const telemetry = {
    attempts: pass.attempts || 0,
    corrected: pass.corrected === true,
    attempt_audit: pass.attempt_audit || [],
  };
  if (pass.outcome !== ADI_WORDING_OUTCOME.IMPROVED) {
    return result({
      applied: false,
      action,
      mode,
      ...telemetry,
      outcome: pass.outcome,
      previousText: mode === ADI_SECTION_MODE.SECTION ? original : null,
      canUndo: Boolean(marker),
      reason: pass.violations?.[0]?.code || null,
      // Which stage refused it, the copy that was refused and every violation: the
      // refusal's own record, carried in the response and written nowhere.
      diagnostics: pass.diagnostics || null,
    });
  }

  // ── A HIGHLIGHTED REWRITE IS NOT SAVED UNTIL THE EDITOR HAS PUT IT BACK ──
  if (mode === ADI_SECTION_MODE.SELECTION) {
    return result({
      applied: false,
      action: 'propose',
      mode,
      outcome: pass.outcome,
      improvedText: pass.text,
      canUndo: Boolean(marker),
    });
  }

  // ── THE ONE WRITE ──
  const write = await save({
    entities, persistRevision, proposalId, sectionId, section, body: pass.text, now, user, mode,
    previousBody: originalBody, previousText: original, improvedText: readable(pass.text),
  });
  return result({ ...write, action, mode, ...telemetry });
}

function rejectedByRevision({
  action,
  mode,
  originalText,
  proposedText,
  persisted,
  canUndo,
}) {
  const violations = Array.isArray(persisted?.violations) ? persisted.violations : [];
  return {
    applied: false,
    action,
    mode,
    outcome: ADI_WORDING_OUTCOME.REJECTED,
    improvedText: null,
    previousText: originalText,
    canUndo,
    reason: violations[0]?.code || 'writer_validation_failed',
    diagnostics: buildAdiRejectionDiagnostics({
      originalText,
      proposedText,
      stage: ADI_REJECTION_STAGE.ORIGINAL_SURFACE_VALIDATOR,
      violations,
    }),
  };
}

async function persistSectionChange({
  entities,
  persistRevision,
  proposalId,
  sectionId,
  section,
  body,
  patch,
  now,
  user,
  source,
}) {
  if (typeof persistRevision === 'function') {
    return persistRevision({
      entities,
      proposalId,
      sectionId,
      section,
      body,
      sectionPatch: patch,
      now,
      user,
      source,
    });
  }
  return {
    accepted: true,
    violations: [],
    section: await entities.ProposalSection.update(sectionId, patch),
  };
}

/**
 * The single write: the improved body, the moved generated stamp, and the copy
 * that was replaced held in the section's own metadata.
 */
async function save({
  entities,
  persistRevision,
  proposalId,
  sectionId,
  section,
  body,
  now,
  user,
  mode,
  previousBody,
  previousText,
  improvedText,
}) {
  const sourceFingerprint = publishedSectionFingerprint(previousText);
  const improvedFingerprint = publishedSectionFingerprint(improvedText);
  const marker = {
    previous_body: previousBody,
    previous_approval: section.metadata?.approval || null,
    previous_last_user_edited_at: section.last_user_edited_at ?? null,
    previous_last_gpt_generated_at: section.last_gpt_generated_at ?? null,
    improved_at: now,
    improved_by: byWhom(user),
    mode,
    source_fingerprint: sourceFingerprint,
    improved_fingerprint: improvedFingerprint,
    // Kept for the existing revision-identity readers.
    source_revision: sourceFingerprint,
    improved_revision: improvedFingerprint,
  };
  const patch = {
    body,
    // A GENERATION, NOT A HAND EDIT: the wording was written for the designer by
    // ADI, which is what returns the section to Needs review — the same stamp a
    // regeneration moves.
    last_gpt_generated_at: now,
    metadata: {
      ...(section.metadata && typeof section.metadata === 'object' ? section.metadata : {}),
      adi_editorial: marker,
    },
  };
  const persistedRevision = await persistSectionChange({
    entities,
    persistRevision,
    proposalId,
    sectionId,
    section,
    body,
    patch,
    now,
    user,
    source: 'adi',
  });
  if (persistedRevision.accepted !== true) {
    return rejectedByRevision({
      action: ADI_SECTION_ACTION.IMPROVE,
      mode,
      originalText: previousText,
      proposedText: improvedText,
      persisted: persistedRevision,
      canUndo: Boolean(section.metadata?.adi_editorial),
    });
  }
  const updated = persistedRevision.section;

  // One authoritative revision handoff is the persistence boundary. Never report an accepted edit when
  // the returned stored record contains the body but not the complete Undo marker.
  const persisted = updated?.metadata?.adi_editorial || null;
  if (updated?.body !== body
    || persisted?.previous_body !== previousBody
    || persisted?.source_fingerprint !== sourceFingerprint
    || persisted?.improved_fingerprint !== improvedFingerprint
    || persisted?.improved_by !== marker.improved_by
    || persisted?.improved_at !== now) {
    throw new Error('The improved wording and its Undo record were not saved together.');
  }

  return {
    applied: true,
    outcome: ADI_WORDING_OUTCOME.IMPROVED,
    improvedText,
    previousText,
    canUndo: true,
  };
}

export default improveProposalSectionWording;