/**
 * versionedEngineeringAuthority.js
 * --------------------------------
 * The ONE version-scoped engineering authority reader.
 *
 * THE DURABLE AUTHORITY (what "is this calculated?" means):
 *   ProjectVersion.published_fingerprint
 *   ProjectAnalysisCache.engineering_publications["eng:v1:…"]
 *   read back through the readPublishedEngineering backend function.
 *
 * THE BROWSER HANDOFF (an optimisation only):
 *   designReviewHandoff.js — same-window map / localStorage. Fast, and fresher
 *   within the session that calculated the design, but session-scoped. It must
 *   never be the reason a consumer reports "not calculated".
 *
 * ── IDENTITY WARNING ──────────────────────────────────────────────────────
 * The frozen proposal snapshot labels the BASS fingerprint as
 * "engineeringFingerprint" (see snapshotIdentity.js). The durable publication
 * key is the FULL engineering fingerprint ("eng:v1:…"). They are DIFFERENT
 * identities under a similar name. Never compare one against the other.
 *
 * Pure logic + one network read. No React, no recalculation, no re-grading.
 */

import { base44 } from '@/api/base44Client';
import { readDesignReviewHandoff } from '@/components/state/designReviewHandoff';
import {
  stampFixedParameterAuthority,
  stampFixedParameterAuthoritySnapshot,
} from './fixedParameterAuthority';

export const ENGINEERING_AUTHORITY_STATE = Object.freeze({
  /** A durable publication exists for this version. */
  PUBLISHED_CURRENT: 'PUBLISHED_CURRENT',
  /** The version pointer references a publication that is missing/cleared. */
  PUBLISHED_STALE: 'PUBLISHED_STALE',
  /** No durable publication, but a browser handoff result exists. */
  LOCAL_ONLY: 'LOCAL_ONLY',
  /** Neither durable publication nor local result. */
  NOT_CALCULATED: 'NOT_CALCULATED',
});

const asObject = (value) =>
  (value && typeof value === 'object' && !Array.isArray(value) ? value : null);
const asArray = (value) => (Array.isArray(value) ? value : []);

/** The single published engineering summary carried by a handoff/durable snapshot. */
export function extractEngineeringSummary(snapshot) {
  return snapshot?.engineeringSummary ?? snapshot?.rating?.engineeringSummary ?? null;
}

export function isAuthorityAvailable(state) {
  return state === ENGINEERING_AUTHORITY_STATE.PUBLISHED_CURRENT
    || state === ENGINEERING_AUTHORITY_STATE.LOCAL_ONLY;
}

/**
 * Read the durable Published Engineering Authority for a version.
 * Never throws — a failed read returns null and the caller keeps the
 * browser handoff (if any) rather than reporting a false "not calculated".
 */
export async function fetchDurablePublication(projectId, versionId) {
  if (!projectId || !versionId) return null;
  try {
    const response = await base44.functions.invoke('readPublishedEngineering', {
      project_id: projectId,
      version_id: versionId,
    });
    const data = response?.data || response || null;
    if (!data) return null;
    return {
      publication: data.publication || null,
      status: data.status || 'not_calculated',
      version: data.version || null,
    };
  } catch (error) {
    console.warn('[engineeringAuthority] durable publication read failed:', error?.message || error);
    return null;
  }
}

/**
 * Rebuild the compatibility rating envelope from the published engineering
 * summary. The summary already carries the canonical Design Rating
 * (designRating.rating / scopedRatings / seatDesignRatings) — this is a
 * re-shaping of published values, never a recalculation.
 */
export function buildRatingEnvelope(engineeringSummary) {
  const designRating = engineeringSummary?.designRating;
  if (!designRating?.rating) return null;
  return {
    ...designRating.rating,
    scopedRatings: designRating.scopedRatings,
    seatDesignRatings: designRating.seatDesignRatings,
    seatDesignPerformanceIndexById: designRating.seatDesignPerformanceIndexById,
    seatLevels: designRating.seatLevels,
    seatPriorityFingerprint: engineeringSummary.seatPriorityFingerprint,
    p19SeatAuthority: engineeringSummary.p19SeatAuthority ?? null,
    engineeringSummary,
  };
}

/**
 * Assemble a handoff-shaped snapshot from a durable publication.
 *
 * Sources (no recalculation):
 *   - engineering summary / rating  → the durable publication
 *   - report payload (analysisResult, priceData, seats, speakers, screen)
 *     → the publication's optional report_snapshot, else design_state
 *
 * Returning the SAME shape the browser handoff publishes means every existing
 * consumer works unchanged, whether the result came from the DB or the browser.
 */
export function buildDurableSnapshot({ projectId, versionId, publication, designState }) {
  // RP22 P8 is a fixed Sound Proof product rule. Stamping it here means a
  // publication made before the rule was wired still reports Level 4 / "No",
  // never a dash. A publication that already carries it is returned untouched.
  const engineeringSummary = stampFixedParameterAuthority(publication?.engineering_summary || null);
  if (!engineeringSummary) return null;

  const ds = asObject(designState) || {};
  const report = asObject(publication?.report_snapshot) || {};

  return {
    source: 'db-publication',
    projectId,
    versionId,
    // FULL engineering fingerprint — the publication key. NEVER compare this
    // against calculationFingerprint (which is the bass fingerprint).
    engineeringFingerprint: publication?.engineering_fingerprint || null,
    calculationFingerprint: publication?.provenance?.bass_fingerprint || null,
    publishedAt: publication?.published_at || null,
    showAsdr: report.showAsdr !== false,
    engineeringSummary,
    rating: report.rating || buildRatingEnvelope(engineeringSummary),
    p19SeatAuthority:
      report.p19SeatAuthority ?? engineeringSummary.p19SeatAuthority ?? null,
    seatDesignRatings: report.seatDesignRatings ?? null,
    // Recommendations are live-settlement only and never persisted.
    recommendations: null,
    analysisResult: report.analysisResult || null,
    seatingPositions: report.seatingPositions || asArray(ds.seating_positions),
    placedSpeakers: report.placedSpeakers || asArray(ds.selected_speakers),
    subwooferInstances: report.subwooferInstances || asArray(ds.subwooferInstances),
    dolbyLayout: report.dolbyLayout || ds.dolby_config || null,
    priceData: report.priceData || null,
  };
}

/**
 * Classify the authority state from the durable read and the local handoff.
 * `stale` / `missing` durable data must never be collapsed into
 * NOT_CALCULATED when a local result exists.
 */
export function classifyAuthorityState({ durable, localSnapshot }) {
  if (durable?.publication) return ENGINEERING_AUTHORITY_STATE.PUBLISHED_CURRENT;
  if (durable?.status === 'stale') return ENGINEERING_AUTHORITY_STATE.PUBLISHED_STALE;
  if (extractEngineeringSummary(localSnapshot)) return ENGINEERING_AUTHORITY_STATE.LOCAL_ONLY;
  return ENGINEERING_AUTHORITY_STATE.NOT_CALCULATED;
}

/**
 * Compose the authoritative snapshot.
 *
 * Payload preference: the live same-window handoff when it carries a summary
 * (it is the same producer and is fresher inside the calculating session),
 * otherwise the durable publication. Existence is decided by the durable read
 * first, so an empty browser store can never manufacture "not calculated".
 */
export function composeAuthoritySnapshot({ localSnapshot, durableSnapshot }) {
  const localHasSummary = !!extractEngineeringSummary(localSnapshot);
  // Stamped on the way out, so a browser handoff stored before the P8 rule
  // existed also reports Level 4 / "No" instead of a dash. An already-stamped
  // summary is returned by identity, so this costs nothing on a fresh result.
  if (localHasSummary) return stampFixedParameterAuthoritySnapshot(localSnapshot);
  return stampFixedParameterAuthoritySnapshot(durableSnapshot || localSnapshot || null);
}

/** Read the local handoff for a version (browser fast path). */
export function readLocalHandoff(projectId, versionId, options) {
  return readDesignReviewHandoff(projectId, versionId, options);
}