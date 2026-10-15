/**
 * bassFreshnessAuthority
 * ----------------------
 * The ONE authority that decides whether a saved engineering publication's
 * bass authority still describes the design as it stands.
 *
 * Why this exists
 * ---------------
 * Report freshness was judged by raw string equality between the published bass
 * fingerprint and the transient fingerprint the bass analysis owner stamps on
 * the completed-bass authority. That stamped value is a *result* key: it is
 * rewritten while the design is being re-evaluated (`markBassAuthorityUpdating`
 * / `markBassAuthorityStale`), so any optimisation activity — a diagnostic run,
 * a new candidate selection, a rejected attempt — could make the two strings
 * differ while the authoritative design and its published result were unchanged.
 * The Project Report then reported:
 *
 *   "The saved engineering publication is stale.
 *    The bass fingerprint no longer matches the current version."
 *
 * The rule implemented here (the bass fingerprint product rule):
 *
 *   The published bass authority still describes the version when EITHER
 *     · the published fingerprint equals the current authoritative design
 *       fingerprint, OR
 *     · the store still holds the PUBLISHED contract as the authoritative bass
 *       authority for this version — the saved-bass reconciliation re-derived
 *       the design identity from the fully hydrated design and accepted that
 *       exact contract for it.
 *
 *   Only PHYSICAL DESIGN, CALCULATION AUTHORITY and APPLIED CALIBRATION state may
 *   break that agreement. Optimiser run metadata, candidates (applied or not),
 *   rankings, "tested" flags, diagnostics, preview state and presentation state
 *   never can.
 *
 * This module calculates nothing, grades nothing and recomputes no fingerprint.
 */

import { BASS_AUTHORITY_STATUS } from './completedBassResultPersistence';

/** How a bass-identity field is allowed to affect report freshness. */
export const BASS_FRESHNESS_CLASS = Object.freeze({
  PHYSICAL_DESIGN: 'PHYSICAL DESIGN',
  CALCULATION_AUTHORITY: 'CALCULATION AUTHORITY',
  APPLIED_CALIBRATION: 'APPLIED CALIBRATION',
  OPTIMISER_DIAGNOSTIC: 'OPTIMISER DIAGNOSTIC',
  UNAPPLIED_CANDIDATE: 'UNAPPLIED CANDIDATE',
  RUN_METADATA: 'RUN METADATA',
  TIMESTAMP_IDENTITY: 'TIMESTAMP / IDENTITY',
  PRESENTATION_ONLY: 'PRESENTATION ONLY',
  OTHER: 'OTHER',
});

/** Classes that may legitimately stale a report on their own. */
const STALING_CLASSES = new Set([
  BASS_FRESHNESS_CLASS.PHYSICAL_DESIGN,
  BASS_FRESHNESS_CLASS.CALCULATION_AUTHORITY,
  BASS_FRESHNESS_CLASS.APPLIED_CALIBRATION,
]);

/**
 * Field-by-field classification of everything that can appear on either side of
 * the bass identity comparison. Keys are the canonical field names used by the
 * fingerprint input digest; unknown keys read as OTHER (never staling).
 */
export const BASS_FRESHNESS_FIELD_CLASS = Object.freeze({
  // ── Physical design ─────────────────────────────────────────────────────
  roomDims: BASS_FRESHNESS_CLASS.PHYSICAL_DESIGN,
  rspPosition: BASS_FRESHNESS_CLASS.PHYSICAL_DESIGN,
  seatingPositions: BASS_FRESHNESS_CLASS.PHYSICAL_DESIGN,
  sources: BASS_FRESHNESS_CLASS.PHYSICAL_DESIGN,
  subs: BASS_FRESHNESS_CLASS.PHYSICAL_DESIGN,
  seats: BASS_FRESHNESS_CLASS.PHYSICAL_DESIGN,
  subwooferInstances: BASS_FRESHNESS_CLASS.PHYSICAL_DESIGN,
  usableLfHz: BASS_FRESHNESS_CLASS.CALCULATION_AUTHORITY,
  // ── Calculation authority ───────────────────────────────────────────────
  selectedP14TargetDb: BASS_FRESHNESS_CLASS.CALCULATION_AUTHORITY,
  p14TargetBasis: BASS_FRESHNESS_CLASS.CALCULATION_AUTHORITY,
  p14TargetLevel: BASS_FRESHNESS_CLASS.CALCULATION_AUTHORITY,
  p14Identity: BASS_FRESHNESS_CLASS.CALCULATION_AUTHORITY,
  p18TargetBasis: BASS_FRESHNESS_CLASS.CALCULATION_AUTHORITY,
  selectedP14RequiredExtensionHz: BASS_FRESHNESS_CLASS.CALCULATION_AUTHORITY,
  selectedP18RequiredExtensionHz: BASS_FRESHNESS_CLASS.CALCULATION_AUTHORITY,
  optimisationTransitionHz: BASS_FRESHNESS_CLASS.CALCULATION_AUTHORITY,
  assessmentStartHz: BASS_FRESHNESS_CLASS.CALCULATION_AUTHORITY,
  assessmentEndHz: BASS_FRESHNESS_CLASS.CALCULATION_AUTHORITY,
  houseCurveFingerprint: BASS_FRESHNESS_CLASS.CALCULATION_AUTHORITY,
  evaluatedProfiles: BASS_FRESHNESS_CLASS.CALCULATION_AUTHORITY,
  productDataVersion: BASS_FRESHNESS_CLASS.CALCULATION_AUTHORITY,
  splConfig: BASS_FRESHNESS_CLASS.CALCULATION_AUTHORITY,
  // ── Applied calibration (an applied tuning is design state) ──────────────
  appliedCalibration: BASS_FRESHNESS_CLASS.APPLIED_CALIBRATION,
  gainDb: BASS_FRESHNESS_CLASS.APPLIED_CALIBRATION,
  delayMs: BASS_FRESHNESS_CLASS.APPLIED_CALIBRATION,
  polarity: BASS_FRESHNESS_CLASS.APPLIED_CALIBRATION,
  phaseControlDeg: BASS_FRESHNESS_CLASS.APPLIED_CALIBRATION,
  // ── Optimiser diagnostics: never staling ────────────────────────────────
  optimiserRunId: BASS_FRESHNESS_CLASS.RUN_METADATA,
  optimiserRunTimestamp: BASS_FRESHNESS_CLASS.TIMESTAMP_IDENTITY,
  optimiserVersionSignature: BASS_FRESHNESS_CLASS.RUN_METADATA,
  candidateRankings: BASS_FRESHNESS_CLASS.OPTIMISER_DIAGNOSTIC,
  testedFlags: BASS_FRESHNESS_CLASS.OPTIMISER_DIAGNOSTIC,
  diagnostics: BASS_FRESHNESS_CLASS.OPTIMISER_DIAGNOSTIC,
  progress: BASS_FRESHNESS_CLASS.OPTIMISER_DIAGNOSTIC,
  rejectionReason: BASS_FRESHNESS_CLASS.OPTIMISER_DIAGNOSTIC,
  // ── Unapplied candidates: never staling ─────────────────────────────────
  activeFitProfile: BASS_FRESHNESS_CLASS.UNAPPLIED_CANDIDATE,
  targetAnchorDb: BASS_FRESHNESS_CLASS.UNAPPLIED_CANDIDATE,
  requestedOutputDb: BASS_FRESHNESS_CLASS.UNAPPLIED_CANDIDATE,
  selectedCandidateId: BASS_FRESHNESS_CLASS.UNAPPLIED_CANDIDATE,
  filterBankSignature: BASS_FRESHNESS_CLASS.UNAPPLIED_CANDIDATE,
  correctionCurveSignature: BASS_FRESHNESS_CLASS.UNAPPLIED_CANDIDATE,
  // ── Presentation / identity, never staling ──────────────────────────────
  publishedAt: BASS_FRESHNESS_CLASS.TIMESTAMP_IDENTITY,
  generatedAt: BASS_FRESHNESS_CLASS.TIMESTAMP_IDENTITY,
  versionId: BASS_FRESHNESS_CLASS.TIMESTAMP_IDENTITY,
  showAsdr: BASS_FRESHNESS_CLASS.PRESENTATION_ONLY,
  graphSeries: BASS_FRESHNESS_CLASS.PRESENTATION_ONLY,
  smoothing: BASS_FRESHNESS_CLASS.PRESENTATION_ONLY,
  priorityMode: BASS_FRESHNESS_CLASS.PRESENTATION_ONLY,
});

/** The class a field belongs to. Unknown fields are OTHER — never staling. */
export function classifyBassFreshnessField(field) {
  return BASS_FRESHNESS_FIELD_CLASS[field] || BASS_FRESHNESS_CLASS.OTHER;
}

/** Whether a field may stale a report on its own. */
export function bassFieldStalesReport(field) {
  return STALING_CLASSES.has(classifyBassFreshnessField(field));
}

/**
 * Partition reported fingerprint differences into the fields that may legitimately
 * stale a report and the fields that may not.
 *
 * @param {Array|object} differences - raw differences (field names, or objects
 *   carrying a `field`/`key` name)
 * @returns {{staling: Array, ignorable: Array, fields: Array}}
 */
export function describeBassFreshnessDelta(differences) {
  const list = Array.isArray(differences)
    ? differences
    : (differences && typeof differences === 'object'
      ? Object.entries(differences).map(([field, value]) => ({ field, value }))
      : []);

  const staling = [];
  const ignorable = [];
  const fields = [];

  list.forEach((entry) => {
    const field = typeof entry === 'string' ? entry : (entry?.field || entry?.key || null);
    if (!field) return;
    const item = {
      field,
      classification: classifyBassFreshnessField(field),
      published: typeof entry === 'object' ? entry?.published ?? null : null,
      current: typeof entry === 'object' ? entry?.current ?? null : null,
    };
    fields.push(item);
    if (bassFieldStalesReport(field)) staling.push(item);
    else ignorable.push(item);
  });

  return { staling, ignorable, fields };
}

/**
 * Decide whether the saved publication's bass authority still describes the
 * version as it stands.
 *
 * @param {object} input
 * @param {string|null} input.publishedFingerprint      publication.provenance.bass_fingerprint
 * @param {string|null} input.authorityCurrentFingerprint completed bass authority current fingerprint
 * @param {string|null} input.authorityStatus           completed bass authority status
 * @param {string|null} input.publishedContractFingerprint contract.job.resultFingerprint
 * @returns {{matches:boolean, basis:string|null, differs:Array}}
 */
export function resolvePublishedBassFreshness({
  publishedFingerprint = null,
  authorityCurrentFingerprint = null,
  authorityStatus = null,
  publishedContractFingerprint = null,
} = {}) {
  // Nothing published: there is no bass authority to contradict.
  if (!publishedFingerprint) {
    return { matches: true, basis: 'no_published_bass_authority', differs: [] };
  }

  // The published fingerprint is still the version's authoritative design
  // fingerprint.
  if (authorityCurrentFingerprint && authorityCurrentFingerprint === publishedFingerprint) {
    return { matches: true, basis: 'authoritative_design_fingerprint', differs: [] };
  }

  // The store still holds the PUBLISHED contract as the authoritative bass
  // authority for this version: the saved-bass reconciliation rebuilt the design
  // identity from the fully hydrated design and accepted that exact contract for
  // it, so the published result is the result for the design as it stands. A
  // transient result key stamped while an optimiser run is evaluated is not a
  // design change.
  if (authorityStatus === BASS_AUTHORITY_STATUS.AUTHORITATIVE
    && publishedContractFingerprint === publishedFingerprint) {
    return { matches: true, basis: 'published_contract_authoritative_for_design', differs: [] };
  }

  // The design itself moved on (or a different result was published): the report
  // no longer describes the version as it stands.
  const differs = [];
  if (authorityCurrentFingerprint && authorityCurrentFingerprint !== publishedFingerprint) {
    differs.push({
      field: 'authorityCurrentFingerprint',
      classification: BASS_FRESHNESS_CLASS.CALCULATION_AUTHORITY,
      published: publishedFingerprint,
      current: authorityCurrentFingerprint,
    });
  }
  return { matches: false, basis: 'design_changed_after_publication', differs };
}

/**
 * The plain-English stale reason, naming the differing fields when they are known.
 * Falls back to the concise canonical sentence when no field-level delta exists.
 */
export function buildBassStaleReason(differences = []) {
  const { staling } = describeBassFreshnessDelta(differences);
  if (staling.length === 0) {
    return 'The saved engineering publication is stale. The bass fingerprint no longer matches the current version.';
  }
  const named = staling.map((item) => `${item.field} (${item.classification})`).join(', ');
  return `The saved engineering publication is stale. The bass identity changed for: ${named}.`;
}