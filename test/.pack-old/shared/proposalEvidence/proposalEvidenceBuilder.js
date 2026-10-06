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
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { optionLabel } from '../comparisonEvidence.js';
import {
  PROPOSAL_EVIDENCE_SCHEMA_VERSION,
  PROPOSAL_EVIDENCE_AREAS,
} from './evidencePackSchema.js';
import { buildOptionFacts } from './proposalEvidenceFacts.js';
import { classifyAreas } from './proposalEvidenceClassification.js';
import {
  buildAllowedClaims,
  buildBlockedClaims,
  buildDecisionFraming,
  buildMaterialityNotes,
} from './proposalEvidenceClaims.js';

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
 * @returns {Object} the frozen pack
 */
export function buildProposalEvidence({ versions = [], generatedAt = null } = {}) {
  const list = (Array.isArray(versions) ? versions : []).filter(Boolean);
  if (list.length === 0) {
    throw new Error('No version report evidence was supplied. Select at least one version with a current Visual and Technical Report.');
  }

  const options = list.map((entry, index) => buildOptionFacts(entry, optionLabel(index)));
  const compared = options.length >= 2;

  const classification = compared ? classifyAreas(options.map((option) => option.areas)) : [];
  const allowedClaims = compared ? buildAllowedClaims(classification, options) : [];
  const decisionFraming = compared
    ? buildDecisionFraming(classification, options)
    : { allowed: false, reason: 'single_option', text: null, evidence: {} };
  const blockedClaims = buildBlockedClaims(classification, options, decisionFraming);

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
      facts: option.facts,
    })),
    classification,
    materiality_notes: buildMaterialityNotes(allowedClaims),
    allowed_claims: allowedClaims,
    blocked_claims: blockedClaims,
    decision_framing: decisionFraming,
    // The audit spine of the pack: which saved reports it was built from, and
    // the fingerprints they were generated against.
    evidence_basis: {
      sources: ['saved-report-evidence'],
      report_snapshot_ids: options.map((option) => ({
        version_id: option.version_id,
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

  return { ...pack, pack_fingerprint: proposalEvidenceFingerprint(pack) };
}

export default buildProposalEvidence;