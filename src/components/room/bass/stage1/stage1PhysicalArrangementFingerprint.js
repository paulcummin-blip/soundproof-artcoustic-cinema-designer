// stage1PhysicalArrangementFingerprint.js
// Permutation-invariant physical-arrangement fingerprint and deduplication
// for Stage 1 placement finalists.
//
// DIFFERENT search-family names can resolve to exactly the same physical
// subwoofer arrangement (e.g. C_FRONT_PAIR at q=0.25 and FRONT_THIRD_PAIR at a
// matching q both place two sources at (0.25,0) and (0.75,0)). The candidate
// id encodes the family name, so the existing id-based dedup leaves both in
// the pool, and the family-diversity finalist pass then wastes a finalist
// slot on a physical duplicate.
//
// This module collapses candidates that occupy the SAME physical arrangement
// — the same subwoofer quantity and the same multiset of source cabinet
// centres — keeping the highest-ranked representative under the existing
// corrected, transitive ranking. Permutations of identical subwoofers are
// treated as the same arrangement; genuinely different source arrangements
// (different coordinates, or — when present — different orientation, height
// or model) stay distinct.
//
// It changes NO acoustic physics, NO Stage 1 scoring weights, NO Stage 2
// calculations, NO electronic alignment and NO RP22 grading. It only removes
// physical duplicates from the finalist candidate pool, BEFORE the shortlist
// limit is applied, so a duplicate family can no longer exclude a distinct
// candidate.

// Coordinate precision matches the candidate generator's roundNorm (3 dp).
// The coarse step is 0.05 and the fine step is 0.01, so two genuinely
// different positions always differ by >= 0.001 — this precision never
// merges distinct arrangements.
const COORD_PRECISION = 3;
const roundCoord = (v) => Number(Number(v || 0).toFixed(COORD_PRECISION));

/**
 * Signature for one physical source. Only the fields that change the
 * physical installation belong here: the cabinet-centre coordinates, and —
 * when a source carries them — orientation, height and model. Stage 1
 * sources are product-independent point sources (just xNorm/yNorm), so the
 * optional fields are absent and the signature is the coordinate pair alone.
 *
 * @param {object} source — candidate source ({ xNorm, yNorm, ... })
 * @returns {string} stable per-source signature
 */
function sourceSignature(source) {
  const x = roundCoord(source?.xNorm);
  const y = roundCoord(source?.yNorm);
  // Optional physical fields. Absent in Stage 1; present only when a future
  // stage attaches orientation/height/model to a candidate source. Each is
  // normalised so an absent field and an explicit default do not diverge.
  const orientation = source?.orientation != null ? String(source.orientation) : "";
  const height = Number.isFinite(Number(source?.heightM))
    ? Number(Number(source.heightM).toFixed(COORD_PRECISION))
    : "";
  const model = source?.model != null ? String(source.model) : "";
  return `${x},${y},${orientation},${height},${model}`;
}

/**
 * Build a permutation-invariant physical-arrangement fingerprint for one
 * candidate. Two candidates share a fingerprint iff they place the same
 * number of subwoofers at the same set of physical cabinet centres with the
 * same per-source orientation/height/model — i.e. the same physical
 * arrangement, regardless of which search family produced them or which
 * order their sources are listed in.
 *
 * @param {object} candidate — evaluated Stage 1 candidate ({ sources, ... })
 * @returns {string} stable fingerprint
 */
export function buildPhysicalArrangementFingerprint(candidate) {
  const sources = Array.isArray(candidate?.sources) ? candidate.sources : [];
  // Sort per-source signatures lexicographically so source order (permutation)
  // does not change the fingerprint. Identical sources sort together;
  // distinct sources remain distinguishable.
  const sorted = sources.map(sourceSignature).sort();
  return `${sources.length}|${sorted.join(";")}`;
}

/**
 * Deduplicate a RANKED list of candidates by physical arrangement, keeping
 * the highest-ranked (first in the already-sorted input) representative of
 * each equivalent arrangement. The input order is the ranking order produced
 * by the corrected transitive comparator, so the retained representative is
 * always the best-ranked physical arrangement.
 *
 * Deduplication happens BEFORE the finalist shortlist limit is applied, so
 * a physical duplicate can no longer consume a finalist slot that a
 * genuinely distinct candidate should have taken. Determinism is preserved:
 * the input is ranked by a total order, so shuffling or reversing the
 * candidate generation never changes which representative is kept or the
 * order of the deduplicated output.
 *
 * @param {Array} ranked — candidates already sorted by compareScreeningResults
 * @returns {Array} physically distinct candidates, in ranking order
 */
export function dedupeByPhysicalArrangement(ranked) {
  const seen = new Map();
  const out = [];
  for (const candidate of ranked) {
    const fp = buildPhysicalArrangementFingerprint(candidate);
    if (seen.has(fp)) continue;
    seen.set(fp, candidate);
    out.push(candidate);
  }
  return out;
}