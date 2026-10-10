/**
 * proposalEvidenceBuilder.js (shared)
 * -----------------------------------
 * THE builder of the frozen proposal evidence pack.
 *
 * Input:  the saved-report evidence of each selected version, exactly as
 *         `readProposalReportEvidence` returns it (that reader reads each
 *         version's own Visual and Technical Report snapshots and nothing else).
 * Output: one frozen pack carrying the facts, the deterministic classification of
 *         every major design area, the materiality note behind each difference,
 *         the claims a writer may make, the claims it may not, and the decision
 *         framing the evidence supports.
 *
 * What this builder deliberately does NOT do:
 *   - it does not read the live project, a session handoff or browser storage;
 *   - it does not call an LLM, and no part of this pack is written by one;
 *   - it does not calculate, estimate or infer any engineering result.
 * Every fact it carries is copied from the report evidence it was given, and
 * every claim it allows was classified from that evidence first. A writer's job
 * is to turn this pack into prose, and to claim nothing else.
 *
 * Four safety rules are enforced here and nowhere else:
 *
 *   1. every client-facing version name comes from the saved report evidence
 *      (proposalEvidenceIdentity), and a version whose evidence states no name
 *      blocks the pack rather than being named from live state;
 *   2. the room is classified explicitly — same, different or not comparable —
 *      from the room facts the reports state (proposalEvidenceClassification);
 *   3. the decision framing is allowed only where the whole shared design is
 *      confirmed and P20 does not contradict it (proposalEvidenceDesignClaims);
 *   4. no prohibited seat-to-seat bass consistency wording survives anywhere in
 *      the pack, and the pack is not returned until that is proven
 *      (proposalEvidenceWording).
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { optionLabel } from '../comparisonEvidence.js';
import {
  BLOCK_REASON,
  PROPOSAL_EVIDENCE_SCHEMA_VERSION,
  PROPOSAL_EVIDENCE_AREAS,
} from './evidencePackSchema.js';
import {
  ASSUMED_PARAMETER_LABEL,
  EXCLUDED_CLIENT_PARAMETER_CODES,
  buildExcludedParameterPolicy,
  buildRequestedAssumptionRule,
} from '../clientFacingParameterAuthority.js';
import { buildOptionFacts } from './proposalEvidenceFacts.js';
import { classifyAreas } from './proposalEvidenceClassification.js';
import {
  buildAllowedClaims,
  buildBlockedClaims,
  buildMaterialityNotes,
} from './proposalEvidenceClaims.js';
import {
  buildBassClaims,
  buildDecisionFraming,
  buildDesignClaims,
  emptyBassClaims,
} from './proposalEvidenceDesignClaims.js';
import { buildScopedSeatClaims } from './proposalEvidenceSeatScopes.js';
import { assertBassWordingSafe } from './proposalEvidenceWording.js';

/** Deterministic key order, so the same content always serialises identically. */
function canonicalise(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalise(value[key])}`).join(',')}}`;
}

/** A stable 32-bit fingerprint of a string. */
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * The pack's content fingerprint. It covers the evidence and the reading of it,
 * never the time the pack was minted, so the same evidence always produces the
 * same fingerprint and any change to the evidence changes it.
 */
export function proposalEvidenceFingerprint(pack) {
  if (!pack || typeof pack !== 'object') return null;
  const { generated_at: _generatedAt, pack_fingerprint: _fingerprint, ...content } = pack;
  return fnv1a(canonicalise(content));
}

/**
 * Build the frozen proposal evidence pack.
 *
 * @param {Object} input
 * @param {Array<Object>} input.versions — readProposalReportEvidence output, in
 *   report order (Option A first)
 * @param {string} [input.generatedAt] — the timestamp to record (an ISO string)
 * @param {Object} [input.requestContext] — the designer's explicit requests
 *   ({ clientBrief, narrativeBrief, dealerNotes }) or an already resolved
 *   exclusion policy. It is the ONLY thing that can admit an assumed parameter
 *   (P8, P15, P21), and only as a labelled assumption.
 * @returns {Object} the frozen pack
 */
export function buildProposalEvidence({ versions = [], generatedAt = null, requestContext = null } = {}) {
  const list = (Array.isArray(versions) ? versions : []).filter(Boolean);
  if (list.length === 0) {
    throw new Error('No version report evidence was supplied. Select at least one version with a current Project Report.');
  }

  // The ONE assumed-parameter admission rule for this proposal. With no request
  // context every assumed parameter stays excluded, exactly as before.
  const policy = typeof requestContext?.allows === 'function'
    ? requestContext
    : buildExcludedParameterPolicy(requestContext || {});

  const options = list.map((entry, index) => buildOptionFacts(entry, optionLabel(index), { policy }));
  const compared = options.length >= 2;

  const classification = compared ? classifyAreas(options.map((option) => option.areas)) : [];
  const decisionFraming = compared
    ? buildDecisionFraming(classification, options)
    : { allowed: false, reason: 'single_option', text: null, evidence: {} };

  // The area claims first, then the whole-design claims, which rest on them: a
  // credibility claim on the shared format, a recommendation on the framing.
  const allowedClaims = compared
    ? [
      ...buildAllowedClaims(classification, options),
      // The scoped seat-group claims: a result the saved evidence states for the
      // primary or the secondary seats, at a level that carries a positive
      // adjective. Minted per option, and only where that option's evidence
      // states the scope's own level and the scope holds at least two seats.
      ...options.flatMap((option, index) => buildScopedSeatClaims(option, index)),
      ...buildDesignClaims(classification, options, decisionFraming),
    ]
    : [];

  const bassClaims = compared
    ? buildBassClaims(classification, options, allowedClaims)
    : emptyBassClaims();
  const blockedClaims = buildBlockedClaims(classification, options, decisionFraming, bassClaims);

  // The assumed-parameter rule, minted once: an assumed or administrative check
  // is never a performance result, a differentiator or a headline claim.
  const assumedBlocks = [{
    block_id: 'block_global_no_assumed_parameter_differentiator_01',
    scope: 'global',
    area: null,
    reason: BLOCK_REASON.NO_ASSUMED_PARAMETER_DIFFERENTIATOR,
    prohibited: policy.requested.length === 0
      ? 'Never reference an assumed or administrative parameter (P8 upfiring/elevation speakers, P15 background noise floor, P21 early reflections): none was requested for this proposal.'
      : `Never present ${policy.requested.join(', ')} as a performance result, a differentiator or a headline claim: ${policy.requested.length > 1 ? 'they are' : 'it is'} an ${ASSUMED_PARAMETER_LABEL} only.`,
    detail: policy.requested.length > 0 ? `requested:${policy.requested.join(',')}` : null,
  }];

  // The bass consistency rule is minted once, in the packed rule list; the bass
  // contract points at that same block instead of minting a second id for it.
  const bass = {
    ...bassClaims,
    blocked: (bassClaims.blocked || []).map((entry) => ({
      ...entry,
      block_id: blockedClaims.find((block) => block.area === 'p20' && block.reason === entry.reason)?.block_id
        || entry.block_id,
    })),
    removed_wording: options.flatMap((option) => (option.wording_removed || [])
      .map((entry) => ({ version_id: option.version_id, ...entry }))),
  };

  const pack = {
    schema_version: PROPOSAL_EVIDENCE_SCHEMA_VERSION,
    generated_at: generatedAt || new Date().toISOString(),
    mode: compared ? 'comparison' : 'single',
    areas: PROPOSAL_EVIDENCE_AREAS.map((area) => ({
      area: area.key,
      label: area.label,
      kind: area.kind,
      structure: area.structure,
    })),
    options: options.map((option) => ({
      version_id: option.version_id,
      version_name: option.version_name,
      label: option.label,
      version_name_source: option.version_name_source,
      facts: option.facts,
    })),
    classification,
    materiality_notes: buildMaterialityNotes(allowedClaims, { p20Note: bass.note }),
    allowed_claims: allowedClaims,
    blocked_claims: policy.requested.length > 0 ? [...blockedClaims, ...assumedBlocks] : blockedClaims,
    // The assumed-parameter rule this pack was built under: which of P8, P15 and
    // P21 the designer explicitly asked for, and how they may be used. Every
    // proposal-facing boundary reads this rather than deciding for itself. It is
    // carried only when something WAS requested, so a pack built with no request
    // is byte-identical to the pack that excludes the three by default.
    ...(policy.requested.length > 0 ? {
      assumed_parameter_policy: {
        assumed: [...EXCLUDED_CLIENT_PARAMETER_CODES],
        excluded: policy.excluded.map((entry) => entry.code),
        requested: [...policy.requested],
        label: ASSUMED_PARAMETER_LABEL,
        rule: buildRequestedAssumptionRule(policy.requested),
      },
    } : {}),
    bass_claims: bass,
    decision_framing: decisionFraming,
    // The audit spine of the pack: which saved reports it was built from, where
    // each client-facing version name came from, and the fingerprints those
    // reports were generated against. Every name is the saved evidence's own.
    evidence_basis: {
      sources: ['saved-report-evidence'],
      version_names: options.map((option) => ({
        version_id: option.version_id,
        ...(option.version_name_source || {}),
      })),
      report_snapshot_ids: options.map((option) => ({
        version_id: option.version_id,
        project_report_snapshot_id: option.facts?.report_snapshot_ids?.project ?? null,
        visual_report_snapshot_id: option.facts?.report_snapshot_ids?.visual ?? null,
        technical_report_snapshot_id: option.facts?.report_snapshot_ids?.technical ?? null,
      })),
      fingerprints: options.map((option) => ({
        version_id: option.version_id,
        engineering: option.facts?.fingerprints?.engineering ?? null,
        visual_evidence: option.facts?.fingerprints?.visual_evidence ?? null,
        technical_evidence: option.facts?.fingerprints?.technical_evidence ?? null,
      })),
    },
  };

  // The pack's final gate. Every report-sourced string has already been cleaned,
  // and this proves the pack as a whole carries no prohibited bass claim — its
  // own rule text included — before it can reach a writer.
  return assertBassWordingSafe({ ...pack, pack_fingerprint: proposalEvidenceFingerprint(pack) });
}

export default buildProposalEvidence;