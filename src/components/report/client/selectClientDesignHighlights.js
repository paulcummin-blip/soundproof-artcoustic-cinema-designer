/**
 * selectClientDesignHighlights
 * ----------------------------
 * Pure selector: client-facing design highlights.
 *
 * Uses only authorities already exposed by useClientReportAuthority
 * and the existing Stage B selectors. No new simulation, no regrading,
 * no score creation.
 *
 * Omit any highlight that is L1, Fail, N/A, missing, incomplete or unverified.
 *
 * @param {Object}  params.analysisResult    - from useRP22AnalysisEngine
 * @param {Object}  params.bassPresentation   - from buildComplianceBassPresentation
 * @param {Object|null} params.p5Snapshot      - RSP-based P5 snapshot
 * @param {Object|null} params.p9Snapshot      - canonical P9 snapshot
 * @param {Array}   params.placedSpeakers     - raw placed speakers (overhead check)
 * @param {Object|null} params.authoritativeSeat - P9 locked seat (per-seat P4 fallback)
 * @returns {Array} highlights (max 5)
 */
export function selectClientDesignHighlights({
  analysisResult,
  bassPresentation,
  p5Snapshot,
  p9Snapshot,
  placedSpeakers,
  authoritativeSeat,
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

  // ── 1. Clear dialogue — P3, canonical RSP P4, P12 at L2–L4 ──────────────
  const primary = analysisResult?.gradedParameters?.primary || {};
  const p4Room = primary[4];
  const p4PerSeat = authoritativeSeat
    ? analysisResult?.perSeatRp22?.[authoritativeSeat.id]?.rp22?.[4]
    : null;
  const p4Level = p4Room?.level ?? p4PerSeat?.level;

  if (isPassLevel(primary[3]?.level) && isPassLevel(p4Level) && isPassLevel(primary[12]?.level)) {
    highlights.push({
      id: "clear-dialogue",
      icon: "MessageCircle",
      title: "Clear dialogue",
      copy: "Screen speakers are positioned and balanced to support clear, focused dialogue.",
    });
  }

  // ── 2. Smooth surround movement — final canonical P5 at L2–L4 ───────────
  if (p5Snapshot && isPassLevel(p5Snapshot.level)) {
    highlights.push({
      id: "smooth-surround",
      icon: "Headphones",
      title: "Smooth surround movement",
      copy: "Surround speakers are arranged to create smooth movement around the listening area.",
    });
  }

  // ── 3. Immersive overhead sound — real overheads + P9 (when applicable) ─
  const hasOverheads = Array.isArray(placedSpeakers) && placedSpeakers.some((s) => {
    const role = String(s?.role || "").toUpperCase();
    return role.startsWith("T") || role.startsWith("U");
  });
  const p9Applicable = p9Snapshot?.applicable === true;
  const p9Passing = p9Applicable && isPassLevel(p9Snapshot.level);

  if (hasOverheads && (!p9Applicable || p9Passing)) {
    highlights.push({
      id: "immersive-overhead",
      icon: "ChevronUp",
      title: "Immersive overhead sound",
      copy: "The overhead layer adds height and smooth movement above the listening area.",
    });
  }

  // ── 4. Consistent bass — verified published bass + P20 at L2–L4 ─────────
  const bassVerified = bassPresentation?.publicationVerified === true;
  const p20 = bassPresentation?.parameters?.p20;

  if (bassVerified && isPassLevel(p20?.level)) {
    highlights.push({
      id: "consistent-bass",
      icon: "Waves",
      title: "Consistent bass",
      copy: "Bass performance is predicted to remain consistent across the seating area.",
    });
  }

  return highlights.slice(0, 5);
}