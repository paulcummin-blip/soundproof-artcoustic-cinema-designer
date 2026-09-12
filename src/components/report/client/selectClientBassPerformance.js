/**
 * selectClientBassPerformance
 * ----------------------------
 * Pure selector for the Visual Report bass performance section.
 *
 * Extracts P14/P18/P19/P20 from the canonical completed bass authority +
 * bass presentation. No new simulation, no interpolation, no regrading.
 *
 * P14 and P18 are room-scope (single result).
 * P19 and P20 are seat-scope (per-seat results).
 *
 * Returns null when no genuine assessed bass result exists — the Visual
 * Report omits the bass section entirely in that case (per the agreed rule:
 * do not create a detailed parameter sheet if entirely unavailable).
 *
 * @param {Object} completedBassAuthority - from useCompletedBassAuthority
 * @param {Object} bassPresentation - from buildComplianceBassPresentation
 * @param {Array} seatingPositions - for seat labels/priority
 * @returns {Object|null} bass performance summary or null
 */
export function selectClientBassPerformance(completedBassAuthority, bassPresentation, seatingPositions) {
  if (!completedBassAuthority?.contract) return null;

  const contract = completedBassAuthority.contract;
  const params = contract?.productAnalysis?.parameters || {};
  const selectedCandidate = contract?.selectedCandidate || {};
  const presentationParams = bassPresentation?.parameters || {};

  // P14 — LFE total SPL capability (room-scope)
  const p14Param = params.p14 || null;
  const p14Presentation = presentationParams.p14 || null;
  const p14 = p14Param ? {
    achievedCapabilityDb: Number.isFinite(Number(p14Param.achievedCapabilityDb))
      ? Number(p14Param.achievedCapabilityDb) : null,
    achievedLevel: p14Param.achievedLevel ?? null,
    requestedTargetDb: Number.isFinite(Number(p14Param.requestedTargetDb))
      ? Number(p14Param.requestedTargetDb) : null,
    headroomOrShortfallDb: Number.isFinite(Number(p14Param.headroomOrShortfallDb))
      ? Number(p14Param.headroomOrShortfallDb) : null,
    pass: p14Param.pass ?? null,
    targetBasis: p14Presentation?.targetBasis || null,
    publicationVerified: p14Presentation?.publicationVerified ?? false,
  } : null;

  // P18 — low-frequency extension (room-scope)
  const p18Param = params.p18 || null;
  const p18Presentation = presentationParams.p18 || null;
  const p18 = p18Param ? {
    achievedLevel: p18Param.level ?? null,
    achievedHz: Number.isFinite(Number(p18Param.value)) ? Number(p18Param.value) : null,
    designHz: Number.isFinite(Number(p18Param.designHz)) ? Number(p18Param.designHz) : null,
    targetBasis: p18Presentation?.targetBasis || null,
    publicationVerified: p18Presentation?.publicationVerified ?? false,
  } : null;

  // P19 — response below transition (SEAT-scope)
  const perSeatP19Results = Array.isArray(selectedCandidate.perSeatP19Results)
    ? selectedCandidate.perSeatP19Results : [];
  const p19Param = params.p19 || null;
  const p19Presentation = presentationParams.p19 || null;
  const p19 = p19Param ? {
    achievedLevel: p19Param.level ?? null,
    achievedVariationDb: Number.isFinite(Number(p19Param.value)) ? Number(p19Param.value) : null,
    targetBasis: p19Presentation?.targetBasis || null,
    publicationVerified: p19Presentation?.publicationVerified ?? false,
    perSeatResults: perSeatP19Results.map((s) => ({
      seatId: s.seatId,
      isPrimary: !!s.isPrimary,
      level: s.level,
      variationDbRaw: Number.isFinite(Number(s.variationDbRaw)) ? Number(s.variationDbRaw) : null,
      worstFrequencyHz: Number.isFinite(Number(s.worstFrequencyHz)) ? Number(s.worstFrequencyHz) : null,
    })),
  } : null;

  // P20 — seat-to-seat variance (SEAT-scope)
  const perSeatP20Results = Array.isArray(selectedCandidate.perSeatP20Results)
    ? selectedCandidate.perSeatP20Results
    : (bassPresentation?.perSeatP20Results || []);
  const p20Param = params.p20 || null;
  const p20Presentation = presentationParams.p20 || null;
  const p20 = p20Param ? {
    achievedLevel: p20Param.level ?? null,
    achievedVariationDb: Number.isFinite(Number(p20Param.value)) ? Number(p20Param.value) : null,
    targetBasis: p20Presentation?.targetBasis || null,
    publicationVerified: p20Presentation?.publicationVerified ?? false,
    perSeatResults: perSeatP20Results.map((s) => ({
      seatId: s.seatId,
      isPrimary: !!s.isPrimary,
      level: s.level,
      variationDbRaw: Number.isFinite(Number(s.variationDbRaw)) ? Number(s.variationDbRaw) : null,
      worstFrequencyHz: Number.isFinite(Number(s.worstFrequencyHz)) ? Number(s.worstFrequencyHz) : null,
    })),
  } : null;

  // Determine if ANY bass parameter has a genuine assessed result
  const hasAssessed = [
    p14?.achievedLevel,
    p18?.achievedLevel,
    p19?.achievedLevel,
    p20?.achievedLevel,
  ].some((l) => l != null && l !== "N/A" && l !== "—" && String(l) !== "0" && l !== "not_applicable");

  if (!hasAssessed) return null;

  // Build seat label map from seatingPositions
  const seatLabelMap = new Map();
  if (Array.isArray(seatingPositions)) {
    seatingPositions.forEach((seat, i) => {
      const id = seat?.id || `seat-${i}`;
      const label = seat?.label || `Seat ${i + 1}`;
      seatLabelMap.set(id, label);
    });
  }

  return {
    p14,
    p18,
    p19,
    p20,
    seatLabelMap,
    publicationVerified: bassPresentation?.publicationVerified === true,
  };
}