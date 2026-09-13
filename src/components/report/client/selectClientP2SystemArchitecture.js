/**
 * selectClientP2SystemArchitecture
 * ---------------------------------
 * Pure selector for the P2 System Architecture Visual Report page.
 *
 * Counts the actual placed speakers by category (bed, overhead, subwoofer)
 * and reads the canonical P2 level from analysisResult.gradedParameters.primary[2].
 *
 * No local re-grading — the P2 level comes directly from the canonical authority.
 * Subwoofer count is shown for visual completeness but never affects P2.
 *
 * Upgrade path is computed from the RP22 P2 channel-count thresholds:
 *   5–10  → L1
 *   11–14 → L2
 *   15+   → L4  (L3 shares the same 15 threshold; no separate L3 range)
 */

import { getCanonicalRole } from "@/components/utils/surroundRoleMap";

// Overhead role prefixes (Dolby Atmos canonical + up-firing)
const OVERHEAD_PREFIXES = ["T", "U"];

function isOverheadRole(canonRole) {
  return OVERHEAD_PREFIXES.some((p) => canonRole.startsWith(p));
}

function isSubwooferRole(canonRole) {
  const r = canonRole.toUpperCase();
  return r === "SUB" || r === "SUB1" || r === "SUB2" || r === "SUB3" || r === "SUB4" || r.startsWith("SUB");
}

// P2 channel-count thresholds (from canonicalP2Authority)
const P2_THRESHOLDS = [
  { level: "L4", minChannels: 15 },
  { level: "L2", minChannels: 11 },
  { level: "L1", minChannels: 5 },
];

/**
 * @param {Object} analysisResult - from useRP22AnalysisEngine
 * @param {Array} placedSpeakers - actual placed speaker array
 * @returns {Object|null} P2 system architecture data or null
 */
export function selectClientP2SystemArchitecture(analysisResult, placedSpeakers) {
  if (!analysisResult) return null;

  const p2Param = analysisResult?.gradedParameters?.primary?.[2];
  if (!p2Param) return null;

  const level = p2Param.level || null;
  const discreteCount = Number.isFinite(p2Param.value) ? p2Param.value : null;
  const configuration = p2Param.configuration || null;

  // Count actual placed speakers by category
  const speakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  let bedCount = 0;
  let overheadCount = 0;
  let subCount = 0;

  for (const s of speakers) {
    const canon = getCanonicalRole(s?.role);
    if (isSubwooferRole(canon)) {
      subCount++;
    } else if (isOverheadRole(canon)) {
      overheadCount++;
    } else {
      bedCount++;
    }
  }

  // Upgrade path — based on discrete main channel count
  let upgradePath = null;
  if (level === "L4") {
    upgradePath = null; // already at top
  } else if (discreteCount != null) {
    // Find the next threshold above current count
    const sorted = [...P2_THRESHOLDS].sort((a, b) => a.minChannels - b.minChannels);
    const currentLevelIndex = sorted.findIndex((t) => t.level === level);
    if (currentLevelIndex >= 0 && currentLevelIndex < sorted.length - 1) {
      const nextThreshold = sorted[currentLevelIndex + 1];
      const channelsNeeded = nextThreshold.minChannels - discreteCount;
      if (channelsNeeded > 0) {
        upgradePath = {
          targetLevel: nextThreshold.level,
          channelsNeeded,
        };
      }
    }
  }

  return {
    level,
    discreteCount,
    configuration,
    bedCount,
    overheadCount,
    subCount,
    upgradePath,
  };
}