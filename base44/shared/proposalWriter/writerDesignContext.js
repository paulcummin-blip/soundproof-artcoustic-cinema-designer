/**
 * writerDesignContext.js (shared)
 * -------------------------------
 * THE design context the approved writer is given: the ADI project
 * interpretation Stage 1 already produced for this proposal, and the designer's
 * own editorial brief.
 *
 * WHY IT EXISTS. Stage 1 of the two-stage process reads the frozen design data
 * and states the design story: what kind of room this is, what the design is
 * trying to do, where it is strongest, what constrains it, which results are
 * reliable evidence, and the reasons behind the important decisions. Stage 2
 * writes from that story. The writer used to be given the frozen evidence pack
 * alone, so its copy reported the evidence instead of describing the cinema.
 * Restoring the intended order is what this module provides:
 *
 *   frozen Project Report evidence -> evidence pack -> the claims to write from
 *   ADI project interpretation     -> why the design is what it is
 *   designer's brief               -> what to emphasise and what to explain
 *
 * WHAT IT IS NOT. It is not a second interpretation system: the interpretation
 * is the one `buildProjectInterpretation` already produced and saved with the
 * proposal, carried here as it stands. It is not a second source of engineering
 * values: every figure, level, parameter and product the copy states still comes
 * from the frozen evidence pack's allowed claims, and the frozen evidence takes
 * priority wherever the interpretation and the evidence differ.
 *
 * A saved interpretation is used only where it can be PROVED to belong here: it
 * must be the ADI interpretation, for this project, for the versions this
 * proposal covers, written for this proposal type, and built from the same saved
 * report evidence the pack was built from. Anything that cannot be proved is
 * refused with a reason, and the writer is given the pack without it — a stale
 * or foreign interpretation is never passed off as design insight.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import {
  CORRECTION_RULE,
  checkInterpretationAgainstEvidence,
} from './writerInterpretationEvidenceCheck.js';

/** The stage marker the existing ADI interpretation carries. */
export const INTERPRETATION_STAGE = 'adi_project_interpretation';

/** Where a supplied interpretation came from, for the audit. */
export const VERIFIED_INTERPRETATION_SOURCE = 'saved-adi-project-interpretation';

/** The one rule the writer is held to over the interpretation. */
export const INTERPRETATION_RULE =
  'the interpretation explains the design and is never a source of figures: '
  + 'every figure, level, parameter and product the copy states comes from the evidence pack and its allowed claims, '
  + 'and the frozen evidence takes priority wherever the two differ';

/** The one rule the writer is held to over the designer's brief. */
export const EDITORIAL_BRIEF_RULE =
  'these are the designer\'s own instructions and are never copy: they explain what to emphasise and what needs '
  + 'explaining, they never change a figure, a level, a product or a claim, and no note, instruction, filename or '
  + 'caption from them appears in the draft';

/** The priority of the frozen evidence over any brief or interpretation. */
export const EVIDENCE_PRIORITY_RULE =
  'the frozen evidence pack is the engineering authority: where a brief or the interpretation and the evidence differ, '
  + 'the evidence governs and the other is not followed';

/** Why an interpretation was refused. Every one is a reason, never a silence. */
export const DESIGN_CONTEXT_REFUSAL = Object.freeze({
  NOT_SUPPLIED: 'no_saved_design_interpretation',
  NOT_THE_INTERPRETATION: 'not_the_adi_project_interpretation',
  FOREIGN_PROJECT: 'interpretation_cannot_be_attributed_to_this_project',
  FOREIGN_VERSION: 'interpretation_cannot_be_attributed_to_a_selected_version',
  VERSION_SET_MISMATCH: 'interpretation_covers_a_different_version_set',
  REPORT_TYPE_MISMATCH: 'interpretation_was_written_for_another_proposal_type',
  STALE_EVIDENCE: 'interpretation_predates_the_saved_report_evidence_it_would_describe',
});

function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function strings(list) {
  return (Array.isArray(list) ? list : []).map(asText).filter(Boolean);
}

/** The strongest design areas the interpretation states, and the evidence for each. */
function strongestAreas(list) {
  return (Array.isArray(list) ? list : [])
    .map((entry) => ({ area: asText(entry?.area), evidence: asText(entry?.evidence) }))
    .filter((entry) => entry.area);
}

/** The interpretation's own evidence rows: plain-language label, level and text. */
function evidenceRows(list) {
  return (Array.isArray(list) ? list : [])
    .map((entry) => {
      const label = asText(entry?.label);
      const statement = asText(entry?.text);
      if (!label && !statement) return null;
      return {
        parameter_id: numberOrNull(entry?.parameter_id),
        label,
        level: asText(entry?.level),
        statement,
      };
    })
    .filter(Boolean);
}

/**
 * The interpretation as the writer reads it.
 *
 * Deliberately a curated view rather than the saved object: the internal Design
 * Index is never carried (it is an internal designer diagnostic and is never
 * client-facing), and every field is named for what it describes so the writer
 * can use the story without mistaking any of it for evidence.
 *
 * @param {Object} interpretation — the saved ADI interpretation
 * @returns {Object} the writer-facing interpretation
 */
export function interpretationView(interpretation, { pack = null } = {}) {
  const evidence = interpretation?.reliable_evidence || {};
  const byStructure = evidence.by_structure || {};
  const bass = Array.isArray(evidence.bass) ? evidence.bass : [];
  const viewing = evidence.viewing || null;
  const screen = evidence.screen || null;
  const system = evidence.system || null;

  const view = {
    source: VERIFIED_INTERPRETATION_SOURCE,
    room_type: asText(interpretation?.room_type),
    presentation: asText(interpretation?.presentation),
    intended_use: asText(interpretation?.primary_design_intent),
    defining_feature: asText(interpretation?.defining_feature),
    seating_story: asText(interpretation?.primary_seating_story),
    strongest_areas: strongestAreas(interpretation?.strongest_areas),
    constraints: strings(interpretation?.main_constraints),
    design_decisions: strings(interpretation?.important_design_decisions),
    supporting_evidence: {
      spatial_resolution: evidenceRows(byStructure['Spatial Resolution']),
      dynamic_range: evidenceRows(byStructure['Dynamic Range']),
      timbre_matching: evidenceRows(byStructure['Timbre Matching']),
      bass_output_depth_and_response: evidenceRows(bass.filter((row) => Number(row?.parameter_id) !== 20)),
      bass_consistency_across_seats: evidenceRows(bass.filter((row) => Number(row?.parameter_id) === 20)),
      viewing: viewing ? {
        summary: asText(viewing.summary),
        primary_level: asText(viewing.primary_floor),
        secondary_level: asText(viewing.secondary_level ?? viewing.secondary_floor),
      } : null,
      display: screen ? {
        size_inches: numberOrNull(screen.size_inches),
        width_m: numberOrNull(screen.width_m),
        aspect_ratio: asText(screen.aspect_ratio),
        mount_mode: asText(screen.mount_mode),
      } : null,
      system: system ? {
        format: asText(system.configuration),
        discrete_channels: numberOrNull(system.discrete_channels),
        subwoofer_count: numberOrNull(system.subwoofer_count),
        speaker_families: asText(system.families),
      } : null,
    },
    // What the interpretation deliberately does not state, with the reason. The
    // writer is told plainly that these are unsupported rather than unknown.
    unknown_or_unsupported: (Array.isArray(interpretation?.excluded_or_unreliable_evidence)
      ? interpretation.excluded_or_unreliable_evidence
      : [])
      .map((entry) => ({ label: asText(entry?.label), reason: asText(entry?.reason) }))
      .filter((entry) => entry.label),
    not_stated_rule: 'these are not stated because the evidence does not support them: never write about them',
    rule: INTERPRETATION_RULE,
  };

  // Every statement the frozen evidence does not support is removed, and the
  // removal is recorded rather than silent: the rest of the interpretation stands,
  // and the frozen evidence itself is never rewritten.
  const checked = checkInterpretationAgainstEvidence({ view, pack });
  return {
    ...checked.view,
    correction_rule: CORRECTION_RULE,
    corrections: checked.corrections,
  };
}

/** The frozen report-evidence fingerprint the pack was built from, by version. */
function frozenEvidenceFingerprints(pack) {
  const rows = Array.isArray(pack?.evidence_basis?.fingerprints) ? pack.evidence_basis.fingerprints : [];
  return new Map(rows
    .map((row) => [String(row?.version_id ?? ''), row?.technical_evidence ?? null])
    .filter(([id]) => id.length > 0));
}

/** The report-evidence fingerprint recorded with the proposal, by version. */
function proposalEvidenceFingerprints(proposal) {
  const rows = Array.isArray(proposal?.metadata?.report_evidence) ? proposal.metadata.report_evidence : [];
  return new Map(rows
    .map((row) => [String(row?.version_id ?? ''), row?.evidence_fingerprint ?? null])
    .filter(([id]) => id.length > 0));
}

/**
 * Whether the saved reports have moved on since the interpretation was written.
 * Read from the proposal's own recorded evidence fingerprints against the ones
 * the pack froze. Where either side states nothing, no staleness is manufactured.
 */
function staleEvidenceReason({ proposal, versionIds, pack }) {
  const frozen = frozenEvidenceFingerprints(pack);
  const recorded = proposalEvidenceFingerprints(proposal);
  for (const id of versionIds) {
    const before = recorded.get(String(id)) || null;
    const now = frozen.get(String(id)) || null;
    if (before && now && before !== now) return DESIGN_CONTEXT_REFUSAL.STALE_EVIDENCE;
  }
  return null;
}

/** Which checks the interpretation actually passed, for the audit. */
function confirmedBy({ proposal, versionIds, pack }) {
  const frozen = frozenEvidenceFingerprints(pack);
  const recorded = proposalEvidenceFingerprints(proposal);
  const compared = versionIds.filter((id) => recorded.get(String(id)) && frozen.get(String(id)));
  return {
    project: 'matched',
    version: 'matched',
    version_set: 'matched',
    proposal_type: 'matched',
    frozen_report_evidence: compared.length > 0
      ? `matched for ${compared.length} version(s) of this proposal`
      : 'not stated beside this proposal, so not compared',
  };
}

/**
 * The saved ADI interpretation, verified, or the reason it is not used.
 *
 * @param {Object} input
 * @param {Object} [input.proposal] — the saved Proposal record
 * @param {string} [input.projectId]
 * @param {Array<string>} [input.versionIds] — the versions this proposal covers
 * @param {Object} [input.pack] — the frozen evidence pack the draft is written from
 * @param {Object} [input.savedInterpretation] — the interpretation the caller
 *   already holds (the one this same call created and saved), so a freshly
 *   created proposal does not depend on reading back the record it just wrote
 * @returns {{ available, source, refusal, rule, provenance, view }}
 */
export function resolveDesignInterpretation({
  proposal = null,
  projectId = null,
  versionIds = [],
  pack = null,
  savedInterpretation = null,
} = {}) {
  const refused = (refusal) => ({
    rule: INTERPRETATION_RULE,
    available: false,
    source: null,
    refusal,
    provenance: null,
    view: null,
  });

  const candidate = savedInterpretation || proposal?.metadata?.project_interpretation || null;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return refused(DESIGN_CONTEXT_REFUSAL.NOT_SUPPLIED);
  }
  if (candidate.stage !== INTERPRETATION_STAGE) return refused(DESIGN_CONTEXT_REFUSAL.NOT_THE_INTERPRETATION);

  const identity = candidate.identity || {};
  const interpretationProject = asText(identity.project_id);
  const proposalProject = asText(projectId) || asText(proposal?.project_id);
  // The project and the version it was written for must both be stated: an
  // interpretation that cannot be attributed to this project and this version is
  // not used at all.
  if (!interpretationProject || !proposalProject || interpretationProject !== proposalProject) {
    return refused(DESIGN_CONTEXT_REFUSAL.FOREIGN_PROJECT);
  }

  const selected = (Array.isArray(versionIds) ? versionIds : []).map((id) => String(id)).filter(Boolean);
  const interpretationVersion = asText(identity.version_id);
  if (selected.length === 0 || !interpretationVersion || !selected.includes(interpretationVersion)) {
    return refused(DESIGN_CONTEXT_REFUSAL.FOREIGN_VERSION);
  }

  // A comparison reads its primary version's interpretation; the versions that
  // interpretation was written for must cover every version this proposal covers.
  const covered = (Array.isArray(identity.versions) ? identity.versions : [])
    .map((entry) => asText(entry?.id))
    .filter(Boolean);
  if (covered.length > 0 && !selected.every((id) => covered.includes(id))) {
    return refused(DESIGN_CONTEXT_REFUSAL.VERSION_SET_MISMATCH);
  }

  // The interpretation describes one kind of proposal. A comparison draft may not
  // be written from a single-option reading of the same evidence, or the reverse.
  const mode = pack?.mode ?? null;
  const reportType = asText(candidate.report_type);
  if (mode === 'comparison' && reportType !== 'comparison') return refused(DESIGN_CONTEXT_REFUSAL.REPORT_TYPE_MISMATCH);
  if (mode === 'single' && reportType === 'comparison') return refused(DESIGN_CONTEXT_REFUSAL.REPORT_TYPE_MISMATCH);

  const stale = staleEvidenceReason({ proposal, versionIds: selected, pack });
  if (stale) return refused(stale);

  return {
    rule: INTERPRETATION_RULE,
    available: true,
    source: VERIFIED_INTERPRETATION_SOURCE,
    refusal: null,
    provenance: {
      stage: candidate.stage,
      version: asText(candidate.version),
      report_type: reportType,
      report_label: asText(candidate.report_label),
      generated_at: asText(candidate.generated_at),
      project_id: interpretationProject,
      version_ids: covered.length > 0 ? covered : [interpretationVersion],
      confirmed_by: confirmedBy({ proposal, versionIds: selected, pack }),
    },
    view: interpretationView(candidate, { pack }),
  };
}

/**
 * The designer's own brief, as the writer input carries it. The client brief and
 * the narrative brief are read from the proposal; the approved designer notes are
 * supplied by the caller, which reads them from the proposal's own sections.
 * Every entry is an instruction, and none of it is ever printed.
 */
export function buildEditorialBrief({ proposal = null, dealerNotes = null } = {}) {
  const clientBrief = asText(proposal?.client_brief);
  const narrativeBrief = asText(proposal?.narrative_brief);
  const notes = asText(dealerNotes) || asText(proposal?.metadata?.dealer_notes);
  return {
    rule: EDITORIAL_BRIEF_RULE,
    priority: EVIDENCE_PRIORITY_RULE,
    supplied: Boolean(clientBrief || narrativeBrief || notes),
    client_brief: clientBrief,
    narrative_brief: narrativeBrief,
    designer_notes: notes,
  };
}

/** The design context when none is supplied: the pack alone, exactly as before. */
export function emptyDesignContext() {
  return {
    design_interpretation: {
      rule: INTERPRETATION_RULE,
      available: false,
      source: null,
      refusal: DESIGN_CONTEXT_REFUSAL.NOT_SUPPLIED,
      provenance: null,
      correction_rule: CORRECTION_RULE,
      corrections: [],
      view: null,
    },
    editorial_brief: buildEditorialBrief({}),
  };
}

/** The context as the writer input carries it: both blocks, always present. */
export function normaliseDesignContext(value) {
  const empty = emptyDesignContext();
  const interpretation = value?.design_interpretation;
  return {
    design_interpretation: interpretation?.view
      ? { ...empty.design_interpretation, ...interpretation }
      : { ...empty.design_interpretation, ...(interpretation || {}), view: null, available: false },
    editorial_brief: value?.editorial_brief?.supplied === true
      ? { ...empty.editorial_brief, ...value.editorial_brief }
      : empty.editorial_brief,
  };
}

/**
 * THE one composition of the design context, used by the live generation path
 * and by the read-only preview, so the two can never describe a different brief
 * or a differently verified interpretation.
 */
export function buildWriterDesignContext({
  proposal = null,
  projectId = null,
  versionIds = [],
  pack = null,
  savedInterpretation = null,
  dealerNotes = null,
} = {}) {
  return {
    design_interpretation: resolveDesignInterpretation({
      proposal, projectId, versionIds, pack, savedInterpretation,
    }),
    editorial_brief: buildEditorialBrief({ proposal, dealerNotes }),
  };
}

export default buildWriterDesignContext;