/**
 * Passive P7 Visual Report selector.
 *
 * P7 engineering values come only from the published summary. Speaker
 * positions are descriptive drawing geometry.
 */
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";

function getSpeakerPos(speaker) {
  if (!speaker) return null;
  const x = Number(speaker.position?.x ?? speaker.pos?.x ?? speaker.x);
  const y = Number(speaker.position?.y ?? speaker.pos?.y ?? speaker.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/**
 * The published ideal-median authority for one front wide. The engine publishes,
 * per side, the ideal (median) angle, the actual angle and the deviation between
 * them — read verbatim, never re-derived. The angles stay in the engine's own
 * azimuth frame; the report converts them for drawing and copy.
 */
function readIdealSide(side) {
  if (!side) return null;
  const targetAngle = Number(side.targetAngle);
  const actualAngle = Number(side.actualAngle);
  if (!Number.isFinite(targetAngle) || !Number.isFinite(actualAngle)) return null;
  const deviation = Number(side.deviation);
  return {
    targetAngle,
    actualAngle,
    deviation: Number.isFinite(deviation) ? deviation : null,
  };
}

/**
 * The engine's published median detail for one front wide (analysisResult.p7Details):
 * the ideal median angle and the actual angle. The per-side deviation is
 * deliberately dropped — the page states the deviation from the published P7
 * result, so a second per-side figure could contradict it.
 */
function readMedianDetail(detail) {
  if (!detail) return null;
  const targetAngle = Number(detail.targetAngle);
  const actualAngle = Number(detail.actualAngle);
  if (!Number.isFinite(targetAngle) || !Number.isFinite(actualAngle)) return null;
  return { targetAngle, actualAngle };
}

export function selectClientP7FrontWides(engineeringSummary, placedSpeakers, rsp, analysisResult = null) {
  if (!engineeringSummary || !Array.isArray(placedSpeakers)) return null;

  const find = (role) => placedSpeakers.find((speaker) => getCanonicalRole(speaker?.role) === role);
  const lwPos = getSpeakerPos(find("LW"));
  const rwPos = getSpeakerPos(find("RW"));
  if (!lwPos || !rwPos) return null;

  const p7Param = engineeringSummary?.roomResultsByParameter?.[7];
  if (!p7Param || p7Param.status !== "scored") return null;

  // The ideal median position per side — where each front wide aims to be.
  //
  // Read from the published P7 result's own per-side angles when the engine
  // publishes them. When it does not, the engine's median detail travels in the
  // report snapshot (analysisResult.p7Details): the median between each screen
  // speaker and its adjacent surround, which is the ideal position this page
  // describes. Both are published authority — the report reads an angle, it never
  // measures one.
  const publishedPerSide = {
    LW: readIdealSide(p7Param.perSide?.LW),
    RW: readIdealSide(p7Param.perSide?.RW),
  };
  const hasPublishedPerSide = Boolean(publishedPerSide.LW || publishedPerSide.RW);
  const medianDetail = {
    LW: readMedianDetail(analysisResult?.p7Details?.LW),
    RW: readMedianDetail(analysisResult?.p7Details?.RW),
  };
  const ideal = hasPublishedPerSide ? publishedPerSide : medianDetail;
  const idealSource = hasPublishedPerSide
    ? "p7_result"
    : medianDetail.LW || medianDetail.RW
    ? "engine_median"
    : null;

  const rspX = Number(rsp?.x);
  const rspY = Number(rsp?.y);
  return {
    level: p7Param.level || null,
    maxDeviation: Number.isFinite(Number(p7Param.value)) ? Number(p7Param.value) : null,
    perSide: p7Param.perSide || null,
    ideal,
    idealSource,
    lwPos,
    rwPos,
    flPos: getSpeakerPos(find("FL")),
    frPos: getSpeakerPos(find("FR")),
    slPos: getSpeakerPos(find("SL")),
    srPos: getSpeakerPos(find("SR")),
    medianPoint: {
      x: (lwPos.x + rwPos.x) / 2,
      y: (lwPos.y + rwPos.y) / 2,
    },
    rsp: Number.isFinite(rspX) && Number.isFinite(rspY) ? { x: rspX, y: rspY } : null,
  };
}