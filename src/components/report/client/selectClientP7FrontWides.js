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

export function selectClientP7FrontWides(engineeringSummary, placedSpeakers, rsp) {
  if (!engineeringSummary || !Array.isArray(placedSpeakers)) return null;

  const find = (role) => placedSpeakers.find((speaker) => getCanonicalRole(speaker?.role) === role);
  const lwPos = getSpeakerPos(find("LW"));
  const rwPos = getSpeakerPos(find("RW"));
  if (!lwPos || !rwPos) return null;

  const p7Param = engineeringSummary?.roomResultsByParameter?.[7];
  if (!p7Param || p7Param.status !== "scored") return null;

  const rspX = Number(rsp?.x);
  const rspY = Number(rsp?.y);
  return {
    level: p7Param.level || null,
    maxDeviation: Number.isFinite(Number(p7Param.value)) ? Number(p7Param.value) : null,
    perSide: p7Param.perSide || null,
    lwPos,
    rwPos,
    flPos: getSpeakerPos(find("FL")),
    frPos: getSpeakerPos(find("FR")),
    medianPoint: {
      x: (lwPos.x + rwPos.x) / 2,
      y: (lwPos.y + rwPos.y) / 2,
    },
    rsp: Number.isFinite(rspX) && Number.isFinite(rspY) ? { x: rspX, y: rspY } : null,
  };
}
