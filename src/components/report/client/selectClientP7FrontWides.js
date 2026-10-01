/**
 * Passive P7 Visual Report selector.
 *
 * P7 engineering values come only from the published summary. The ideal median
 * POSITION comes only from the app's one front-wide geometry authority — the same
 * computeFrontWideZonesStrict call the Room Designer's plan draws from and the
 * geometry P7 is graded against. The report therefore carries no report-only
 * geometry path of its own: it marks the app's points, it never projects an angle.
 */
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";
import { computeFrontWideZonesStrict } from "@/components/utils/frontWideZones";
import { getModelDimsM } from "@/components/roomdesigner/utils/getModelDimsM";

function getSpeakerPos(speaker) {
  if (!speaker) return null;
  const x = Number(speaker.position?.x ?? speaker.pos?.x ?? speaker.x);
  const y = Number(speaker.position?.y ?? speaker.pos?.y ?? speaker.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/**
 * The published ideal-median authority for one front wide: the ideal (median)
 * angle, the actual angle and the deviation between them — read verbatim, never
 * re-derived. These angles are reference copy only; the drawn position comes from
 * the app geometry below.
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

/**
 * The ideal median position per side, resolved by the app's own front-wide
 * geometry authority — the single function the Room Designer's plan draws and P7
 * grading uses. Returns null, never a guess, when an older snapshot cannot support
 * it (no room dimensions, no RSP, or the screen/surround speakers absent), so the
 * page simply draws no ideal marker rather than inventing one.
 */
function resolveIdealPoints(placedSpeakers, rsp, roomDims) {
  const zones = computeFrontWideZonesStrict({
    mlpPoint: rsp,
    dimensions: { width: Number(roomDims?.widthM), length: Number(roomDims?.lengthM) },
    placedSpeakers,
    getModelDimsM,
  });
  if (zones?.status !== "ok") return null;
  return {
    LW: { x: zones.left.xWall, y: zones.left.medianY },
    RW: { x: zones.right.xWall, y: zones.right.medianY },
  };
}

export function selectClientP7FrontWides(
  engineeringSummary,
  placedSpeakers,
  rsp,
  analysisResult = null,
  roomDims = null,
) {
  if (!engineeringSummary || !Array.isArray(placedSpeakers)) return null;

  const find = (role) => placedSpeakers.find((speaker) => getCanonicalRole(speaker?.role) === role);
  const lwPos = getSpeakerPos(find("LW"));
  const rwPos = getSpeakerPos(find("RW"));
  if (!lwPos || !rwPos) return null;

  const p7Param = engineeringSummary?.roomResultsByParameter?.[7];
  if (!p7Param || p7Param.status !== "scored") return null;

  // The published per-side angles, when the engine states them; otherwise the
  // engine's median detail travels in the report snapshot. Either way these are
  // published reference values — never measured here.
  const publishedPerSide = {
    LW: readIdealSide(p7Param.perSide?.LW),
    RW: readIdealSide(p7Param.perSide?.RW),
  };
  const hasPublishedPerSide = Boolean(publishedPerSide.LW || publishedPerSide.RW);
  const medianDetail = {
    LW: readMedianDetail(analysisResult?.p7Details?.LW),
    RW: readMedianDetail(analysisResult?.p7Details?.RW),
  };

  // The drawn ideal median position: the app's geometry, not a projection.
  const idealPoints = resolveIdealPoints(placedSpeakers, rsp, roomDims);
  const ideal = hasPublishedPerSide ? publishedPerSide : medianDetail;
  const idealSource = idealPoints
    ? "app_front_wide_zones"
    : hasPublishedPerSide
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
    idealPoints,
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