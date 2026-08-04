/**
 * selectClientParameterResults
 * ----------------------------
 * Pure selector: unified read-only P1–P21 presentation values.
 *
 * Engine (analysisResult) is the source for non-bass parameters.
 * Bass presentation is the source for P14/P18/P19/P20.
 *
 * Keeps missing/unverified states explicit — never invents values.
 *
 * @param {Object} analysisResult - from useRP22AnalysisEngine
 * @param {Object} bassPresentation - from buildComplianceBassPresentation
 * @returns {Object} { room: { [paramId]: presentation }, perSeat: { [seatId]: { rp22 } } }
 */
export function selectClientParameterResults(analysisResult, bassPresentation) {
  const primary = analysisResult?.gradedParameters?.primary || {};
  const perSeat = analysisResult?.perSeatRp22 || {};
  const bassParams = bassPresentation?.parameters || {};

  const BASS_PARAM_IDS = [14, 18, 19, 20];

  const room = {};
  for (let i = 1; i <= 21; i++) {
    if (BASS_PARAM_IDS.includes(i)) {
      const key = `p${i}`;
      const bp = bassParams[key];
      room[i] = bp
        ? {
            valueText: bp.valueText ?? null,
            level: bp.level ?? null,
            status: bp.status ?? null,
            isAuthoritative: bp.isAuthoritative ?? false,
            publicationRejectionReason: bp.publicationRejectionReason ?? null,
          }
        : null;
    } else {
      room[i] = primary[i] || null;
    }
  }

  return { room, perSeat };
}