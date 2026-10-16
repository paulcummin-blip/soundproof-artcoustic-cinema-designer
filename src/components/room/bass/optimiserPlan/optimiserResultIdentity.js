// optimiserResultIdentity.js
// ---------------------------------------------------------------------------
// THE ONE FULL RESULT IDENTITY GUARD for optimiser evidence.
//
// A Bass Optimiser result is not one value: it is a plan, a winning candidate,
// a combined calibration result, per-lever candidate records and the decision
// that was taken on them. Those pieces are saved at different moments, and a
// later run does NOT delete the earlier run's pieces. That is exactly how a
// stale candidate from Run 2 could be rendered beside Run 3's winner.
//
// This module answers ONE question — does this evidence object belong to the
// ACTIVE TERMINAL RESULT? — against all five identity fields the user required:
//
//   projectId · versionId · runId · designFingerprint · resultFingerprint
//
//   CURRENT     the evidence matches every identity field it declares, or it
//               declares none (nothing to contradict). It may be presented as
//               current-result evidence.
//   HISTORICAL  the evidence declares at least one identity field that differs
//               from the active terminal result. It may exist ONLY as
//               historical / developer-diagnostic evidence, and NO current card,
//               modal, Technical details or Other Options may consume it.
//
// A field that is absent on either side is not compared — an older record that
// never carried a fingerprint is not turned into a mismatch by this guard. A
// field that IS declared on both sides and differs is decisive.
//
// It also answers the second half of the same rule: is this candidate the
// terminal WINNER? Two evidence blocks may be perfectly current and still
// describe two different candidates, so "there must be ONE current winner" is
// enforced by candidate identity too.
//
// PURE: it reads fields off objects it is handed. It computes no fingerprint,
// changes no optimiser maths, no search range, no candidate count, no P19/P20
// definition, no RP22 grade and no apply logic.
// ---------------------------------------------------------------------------

/** Every field a current-result evidence object must match. */
export const OPTIMISER_IDENTITY_FIELDS = Object.freeze([
  "projectId",
  "versionId",
  "runId",
  "designFingerprint",
  "resultFingerprint",
]);

/** Whether a piece of evidence may be read as current, or only as history. */
export const EVIDENCE_SCOPE = Object.freeze({
  CURRENT: "current",
  HISTORICAL: "historical",
});

/** The one label a non-winning candidate block may be stated with. */
export const HISTORICAL_EVIDENCE_LABEL = "Historical — earlier run";

const text = (value) => {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
};

/**
 * The identity an evidence object declares, read from the object itself or from
 * a nested `identity` block. A field the object does not carry stays null.
 */
export function readEvidenceIdentity(source) {
  if (!source || typeof source !== "object") return null;
  const nested = source.identity && typeof source.identity === "object" ? source.identity : {};
  return {
    projectId: text(source.projectId ?? nested.projectId),
    versionId: text(source.versionId ?? nested.versionId),
    runId: text(source.runId ?? nested.runId ?? source.run?.runId),
    designFingerprint: text(source.designFingerprint ?? nested.designFingerprint),
    resultFingerprint: text(source.resultFingerprint ?? nested.resultFingerprint),
  };
}

/**
 * The identity of the ACTIVE TERMINAL RESULT — the saved record the panel is
 * describing. Every other evidence object is judged against this.
 */
export function readActiveResultIdentity(planView) {
  if (!planView || typeof planView !== "object") return null;
  return {
    projectId: text(planView.projectId),
    versionId: text(planView.versionId),
    runId: text(planView.run?.runId ?? planView.runId),
    designFingerprint: text(planView.designFingerprint),
    resultFingerprint: text(planView.resultFingerprint),
  };
}

/**
 * Compare one declared identity against the active one.
 *
 * @returns {{declaredFields:Array, comparedFields:Array, mismatchedFields:Array,
 *            matches:boolean, verifiable:boolean}}
 */
export function compareOptimiserIdentity({ evidence = null, active = null } = {}) {
  const declaredFields = OPTIMISER_IDENTITY_FIELDS.filter((field) => evidence?.[field] != null);
  const comparedFields = declaredFields.filter((field) => active?.[field] != null);
  const mismatchedFields = comparedFields.filter(
    (field) => String(evidence[field]) !== String(active[field]),
  );
  return {
    declaredFields,
    comparedFields,
    mismatchedFields,
    matches: mismatchedFields.length === 0,
    verifiable: comparedFields.length > 0,
  };
}

/**
 * Scope one evidence object against the active terminal result.
 *
 * @returns {{identity:object|null, scope:string, isCurrent:boolean,
 *            mismatchedFields:Array, comparedFields:Array}}
 */
export function scopeOptimiserEvidence({ evidence = null, active = null } = {}) {
  const identity = readEvidenceIdentity(evidence);
  const comparison = compareOptimiserIdentity({ evidence: identity, active });
  return {
    identity,
    ...comparison,
    scope: comparison.matches ? EVIDENCE_SCOPE.CURRENT : EVIDENCE_SCOPE.HISTORICAL,
    isCurrent: comparison.matches,
  };
}

/**
 * Is this candidate the terminal winner?
 *
 * @returns {boolean|null} null when either side is absent — unverifiable, so no
 *   claim is made about it.
 */
export function isWinningCandidate({ candidateId = null, winnerId = null } = {}) {
  if (candidateId == null || candidateId === "" || winnerId == null || winnerId === "") return null;
  return String(candidateId) === String(winnerId);
}

/**
 * THE ONE DECISION a surface needs about a candidate/evidence block: may it be
 * shown as part of the current result, and is it the winner?
 *
 * @returns {{scope:string, label:string|null, isCurrent:boolean, isWinner:boolean|null,
 *            mismatchedFields:Array}}
 */
export function scopeCandidateEvidence({ evidence = null, active = null, winnerId = null } = {}) {
  const scoped = scopeOptimiserEvidence({ evidence, active });
  const winner = isWinningCandidate({
    candidateId: evidence?.candidateId ?? evidence?.bestCandidate?.candidateId ?? null,
    winnerId,
  });
  return {
    ...scoped,
    isWinner: winner,
    label: scoped.isCurrent ? null : HISTORICAL_EVIDENCE_LABEL,
  };
}

export default scopeOptimiserEvidence;