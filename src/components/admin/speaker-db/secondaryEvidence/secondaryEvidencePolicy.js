// secondaryEvidencePolicy.js
// ---------------------------------------------------------------------------
// The single policy for admin-approved SECONDARY evidence: an original
// manufacturer document that is no longer hosted on the manufacturer's own
// domain, and that the admin has explicitly accepted.
//
// The official-domain rule is untouched — this is an exception an admin makes on
// purpose, it is recorded against the specification, and it can never present
// itself as published measured manufacturer evidence:
//
//   secondary, third-party host  → capped at C, basis "Secondary evidence"
//   official CDN or official archive → no cap (the host does belong to the
//                                      manufacturer), recorded as official
// ---------------------------------------------------------------------------

import {
  TRUSTED_BADGE_LABEL,
  TRUSTED_EVIDENCE_LABEL,
  TRUSTED_HOST_WARNING,
  TRUSTED_SECONDARY_BASIS,
  TRUSTED_SECONDARY_ROW_NOTE,
  TRUSTED_SECONDARY_STATEMENT,
  trustedSecondarySource,
} from "@/components/utils/spl/trustedSecondarySources.js";

export const SECONDARY_SOURCE_TYPE = 'Secondary Evidence';

// --- Trusted secondary tier -------------------------------------------------
// Habitech, CAVD, Pulse Cinemas and AWE Europe are named trusted distributors.
// Their documents are secondary evidence like any other: usable for a P12/P13
// estimate, always labelled, and capped at C — never presented as A.
export { TRUSTED_BADGE_LABEL, TRUSTED_EVIDENCE_LABEL, TRUSTED_SECONDARY_ROW_NOTE, TRUSTED_SECONDARY_STATEMENT };

export const SECONDARY_ROW_NOTE = 'Secondary evidence used';

/** The trusted distributor behind an accepted evidence record, or null. */
export function trustedSourceFor(evidence) {
  if (!evidence) return null;
  return trustedSecondarySource(evidence.host) || trustedSecondarySource(evidence.url);
}

export function isTrustedEvidence(evidence) {
  return trustedSourceFor(evidence) !== null;
}

/** The full label the evidence carries wherever it is shown. */
export function evidenceLabel(evidence) {
  return isTrustedEvidence(evidence) ? TRUSTED_EVIDENCE_LABEL : SECONDARY_BADGE_LABEL;
}

/** The compact badge wording. */
export function evidenceBadgeLabel(evidence) {
  return isTrustedEvidence(evidence) ? TRUSTED_BADGE_LABEL : SECONDARY_BADGE_LABEL;
}

/** The sentence shown in the hover panel, matching the source's trust tier. */
export function evidenceStatement(evidence) {
  return isTrustedEvidence(evidence) ? TRUSTED_SECONDARY_STATEMENT : SECONDARY_STATEMENT;
}

/** The line a specification row carries: "Trusted secondary evidence used". */
export function evidenceRowNote(evidence) {
  return isTrustedEvidence(evidence) ? TRUSTED_SECONDARY_ROW_NOTE : SECONDARY_ROW_NOTE;
}

/** The warning shown under an inspected URL. */
export function hostWarning(evidence) {
  return isTrustedEvidence(evidence) ? TRUSTED_HOST_WARNING : SECONDARY_HOST_WARNING;
}

export const SECONDARY_HOST_WARNING = 'This is not hosted on the official manufacturer domain.';

export const SECONDARY_CONFIDENCE_CAP = 'C';

export const SECONDARY_BASIS = {
  ESTIMATE: 'ADI estimate from secondary manufacturer document',
  CALCULATED: 'Calculated from secondary published data',
};

export const SECONDARY_STATEMENT =
  'Specification data is taken from an admin-approved secondary copy of a manufacturer product sheet. '
  + 'This is useful for comparison, but is not equivalent to a live official manufacturer source.';

export const SECONDARY_BADGE_LABEL = 'Secondary evidence';

/** The document type wording returned by the reader, for display. */
export function documentTypeLabel(documentType) {
  return {
    manufacturer_product_sheet: 'Manufacturer product sheet',
    manufacturer_manual: 'Manufacturer manual',
    manufacturer_brochure: 'Manufacturer brochure',
    dealer_page: 'Dealer page',
    distributor_page: 'Distributor page',
    unknown: 'Unknown document',
  }[documentType] || 'Unknown document';
}

/** A recorded secondary source is capped unless it sits on the manufacturer's own host. */
export function isSecondaryCapped(evidence) {
  if (!evidence) return false;
  return evidence.is_official !== true;
}

/**
 * The basis phrase stored with the accepted evidence: a capability calculated
 * from values the secondary document publishes, or an ADI estimate where the
 * document states values but no capability figure.
 */
export function secondaryBasisLabel({ hasPublishedMaxSpl, evidence }) {
  if (evidence?.basis) return evidence.basis;
  if (isTrustedEvidence(evidence)) {
    return hasPublishedMaxSpl ? TRUSTED_SECONDARY_BASIS.CALCULATED : TRUSTED_SECONDARY_BASIS.ESTIMATE;
  }
  return hasPublishedMaxSpl ? SECONDARY_BASIS.CALCULATED : SECONDARY_BASIS.ESTIMATE;
}

/** Why the confidence is held where it is — shown in the hover panel and stored. */
export function confidenceCapReason(evidence) {
  if (!evidence) return '';
  if (evidence.is_official === true) {
    return `Hosted on ${evidence.host || 'the manufacturer domain'} — an official host, so no confidence cap applies.`;
  }
  const trusted = trustedSourceFor(evidence);
  if (trusted) {
    return `Trusted secondary distributor source (${trusted.name}, ${trusted.host}) — not the manufacturer's own domain, so the confidence is capped at ${SECONDARY_CONFIDENCE_CAP}.`;
  }
  return `Admin-approved secondary copy hosted on ${evidence.host || 'a third-party host'}, not the manufacturer's own domain — capped at ${SECONDARY_CONFIDENCE_CAP}.`;
}

/** Confidence after the cap: A and B become C; C stays C; insufficient stays insufficient. */
export function capSecondaryConfidence(confidence, evidence) {
  if (!isSecondaryCapped(evidence)) return confidence;
  if (confidence === 'A' || confidence === 'B') return SECONDARY_CONFIDENCE_CAP;
  return confidence;
}