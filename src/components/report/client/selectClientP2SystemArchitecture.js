/**
 * Passive P2 Visual Report selector.
 *
 * P2 level, value and configuration come only from the published engineering
 * summary. Speaker counts and positions below are descriptive drawing data.
 */
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";

const OVERHEAD_PREFIXES = ["T", "U"];

function isOverheadRole(canonRole) {
  return OVERHEAD_PREFIXES.some((prefix) => canonRole.startsWith(prefix));
}

function isSubwooferRole(canonRole) {
  return canonRole.toUpperCase().startsWith("SUB");
}

export function selectClientP2SystemArchitecture(engineeringSummary, placedSpeakers, subwooferInstances) {
  const p2Param = engineeringSummary?.roomResultsByParameter?.[2];
  if (!p2Param || p2Param.status !== "scored") return null;

  const speakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  let bedCount = 0;
  let overheadCount = 0;
  for (const speaker of speakers) {
    const role = getCanonicalRole(speaker?.role);
    if (isSubwooferRole(role)) continue;
    if (isOverheadRole(role)) overheadCount += 1;
    else bedCount += 1;
  }

  const enabledSubs = (Array.isArray(subwooferInstances) ? subwooferInstances : [])
    .filter((sub) => sub?.enabled !== false && sub?.position);
  const subwoofers = enabledSubs.map((sub) => ({
    id: sub.id || `sub-${sub.position.x?.toFixed(2)}-${sub.position.y?.toFixed(2)}`,
    x: Number(sub.position.x),
    y: Number(sub.position.y),
  }));

  return {
    level: p2Param.level || null,
    discreteCount: Number.isFinite(Number(p2Param.value)) ? Number(p2Param.value) : null,
    configuration: p2Param.configuration || null,
    bedCount,
    overheadCount,
    subCount: enabledSubs.length,
    subwoofers,
    upgradePath: p2Param.upgradePath || null,
  };
}
