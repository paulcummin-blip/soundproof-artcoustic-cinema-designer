/**
 * selectClientDesignHighlights
 * ----------------------------
 * Pure selector: client-facing design highlights.
 *
 * Uses only authorities already exposed by useClientReportAuthority
 * and the existing Stage B selectors. No new simulation, no regrading,
 * no score creation.
 *
 * Every highlight sits under the same RP22 category as its supporting
 * parameter(s):
 *   - Spatial Resolution: P1–P11
 *   - Dynamic Range: P12–P15
 *   - Timbre Matching: P16–P21
 *
 * Omit any highlight that is L1, Fail, N/A, missing, incomplete or unverified.
 * Do not combine parameters from different RP22 categories into one test.
 *
 * @param {Object}  params.analysisResult    - from useRP22AnalysisEngine
 * @param {Object}  params.bassPresentation   - from buildComplianceBassPresentation
 * @param {Object|null} params.p5Snapshot      - RSP-based P5 snapshot
 * @param {Object|null} params.p9Snapshot      - canonical P9 snapshot
 * @param {Array}   params.placedSpeakers     - raw placed speakers (overhead check)
 * @returns {Array} highlights
 */
export function selectClientDesignHighlights({
  analysisResult,
  bassPresentation,
  p5Snapshot,
  p9Snapshot,
  placedSpeakers,
}) {
  const highlights = [];

  // ── Helper: level is L2–L4 ──────────────────────────────────────────────
  const isPassLevel = (level) => {
    if (level === null || level === undefined) return false;
    const str = String(level).trim().toUpperCase();
    if (str === "FAIL" || str === "N/A" || str === "—" || str === "-") return false;
    const n = typeof level === "number"
      ? level
      : parseInt(str.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) && n >= 2 && n <= 4;
  };

  // ── Helper: result exists, level L2–L4, no explicit negative status ──────
  // Returns false when result is missing, level is missing/N/A/Fail/L1, or
  // an existing status/verification field explicitly identifies the result
  // as unverified, stale, incomplete, missing, error or failed.
  // An absent status field alone is NOT failure.
  const isVerifiedPassingResult = (result) => {
    if (!result || typeof result !== "object") return false;
    if (!isPassLevel(result.level)) return false;

    // Boolean verification flags — explicit false on a positive flag = fail
    if (result.verified === false) return false;
    if (result.isVerified === false) return false;

    // Boolean negative flags — explicit true = fail
    if (result.stale === true) return false;
    if (result.isStale === true) return false;
    if (result.incomplete === true) return false;
    if (result.missing === true) return false;
    if (result.error === true) return false;
    if (result.failed === true) return false;

    // String status/verification fields — check for negative indicator words
    const negativeWords = ["unverified", "stale", "incomplete", "missing", "error", "failed", "no_data"];
    const stringFields = ["status", "verification", "verificationStatus"];
    for (const field of stringFields) {
      const val = result[field];
      if (val === undefined || val === null) continue;
      const str = String(val).trim().toLowerCase();
      if (negativeWords.some((w) => str.includes(w))) return false;
    }

    return true;
  };

  const primary = analysisResult?.gradedParameters?.primary || {};

  // ── SPATIAL RESOLUTION (P1–P11) ──

  // 1. Clear, focused dialogue — P3 & canonical mlp P4 & P12
  // P4 is seat-scoped: use perSeatRp22.mlp.rp22[4] (canonical MLP authority),
  // NOT primary[4] or a locked/nearest seat.
  const mlpP4 = analysisResult?.perSeatRp22?.mlp?.rp22?.[4] ?? null;

  if (isVerifiedPassingResult(primary[3]) && isVerifiedPassingResult(mlpP4) && isVerifiedPassingResult(primary[12])) {
    highlights.push({
      id: "clear-dialogue",
      category: "Spatial Resolution",
      icon: "MessageCircle",
      title: "Clear, focused dialogue",
      paramRef: "RP22 Parameters 3 & 4",
      copy: "Screen speakers are positioned and balanced to support clear, focused dialogue.",
    });
  }

  // 2. Smooth surround movement — P5
  if (p5Snapshot && isPassLevel(p5Snapshot.level)) {
    highlights.push({
      id: "smooth-surround",
      category: "Spatial Resolution",
      icon: "Headphones",
      title: "Smooth surround movement",
      paramRef: "RP22 Parameter 5",
      copy: "Surround speakers are arranged to create smooth movement around the listening area.",
    });
  }

  // 3. Immersive overhead sound — P9 (when real overheads exist)
  const hasOverheads = Array.isArray(placedSpeakers) && placedSpeakers.some((s) => {
    const role = String(s?.role || "").toUpperCase();
    return role.startsWith("T") || role.startsWith("U");
  });
  const p9Applicable = p9Snapshot?.applicable === true;

  if (hasOverheads && p9Applicable && isPassLevel(p9Snapshot?.level)) {
    highlights.push({
      id: "immersive-overhead",
      category: "Spatial Resolution",
      icon: "ChevronUp",
      title: "Immersive overhead sound",
      paramRef: "RP22 Parameter 9",
      copy: "The overhead layer adds height and smooth movement above the listening area.",
    });
  }

  // ── DYNAMIC RANGE (P12–P15) ──

  // 4. Clean cinema peaks — P12 & P13 only (canonical authority, no invented headroom)
  if (isPassLevel(primary[12]?.level) && isPassLevel(primary[13]?.level)) {
    highlights.push({
      id: "clean-cinema-peaks",
      category: "Dynamic Range",
      icon: "Zap",
      title: "Clean cinema peaks",
      paramRef: "RP22 Parameters 12 & 13",
      copy: "The system is designed to reproduce dynamic cinema peaks cleanly at the target listening level.",
    });
  }

  // ── TIMBRE MATCHING (P16–P21) ──

  // 5. Consistent bass — P20 (only when publication-verified)
  const bassVerified = bassPresentation?.publicationVerified === true;
  const p20 = bassPresentation?.parameters?.p20;

  if (bassVerified && isPassLevel(p20?.level)) {
    highlights.push({
      id: "consistent-bass",
      category: "Timbre Matching",
      icon: "Waves",
      title: "Consistent bass",
      paramRef: "RP22 Parameter 20",
      copy: "Bass performance is predicted to remain consistent across the seating area.",
    });
  }

  return highlights;
}