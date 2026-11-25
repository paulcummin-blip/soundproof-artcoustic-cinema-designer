/**
 * performanceOverviewPillarLimits.js
 * ----------------------------------
 * Read-only projection of the SAME live compliance summary the Live RP22
 * Performance Summary consumes (buildLiveComplianceSummary output) into the
 * three-pillar / two-seating-group limiting-level grid the RP22 Performance
 * Overview panel shows.
 *
 * No RP22 calculation, threshold, grading or weight is duplicated or altered.
 * Every level is the engine's own output, normalised through the existing
 * canonicalBassLevel authority. The "worst" (limiting) level is the MINIMUM
 * rank, matching buildLiveComplianceSummary's own seat-level reduction:
 *   FAIL (0) < L1 (1) < L2 (2) < L3 (3) < L4 (4)   →  lower rank = worse.
 *
 * Scope is preserved exactly:
 *   Seat-scoped  → worst level among the PRIMARY seats (Primary group) or
 *                  SECONDARY seats (Secondary group). The seats at that
 *                  limiting level are recorded for the hover detail.
 *   Room-scoped  → the single room result counts for BOTH groups (it is
 *                  room-wide; it is never an RSP-only result).
 *   RSP-scoped   → counts for the PRIMARY group ONLY. It is never attributed
 *                  to secondary seats (the explicit rule).
 *
 * Unassessed / unavailable parameters (null level, "N/A", "—") are skipped and
 * never treated as L1 or FAIL. A pillar with no validly-assessed parameter for
 * a group resolves to null (rendered as a neutral dash), never a performance
 * level.
 */
import { RP22_PRESENTATION_PARAMETERS } from "@/components/utils/rp22ParameterPresentation";
import {
  PARAM_CATEGORIES,
  getHumanTitleForParam,
} from "@/components/report/technical/technicalParameterMeta";
import {
  canonicalBassLevel as normalizeLevel,
  BASS_LEVEL_RANK as LEVEL_RANK,
  BASS_RANK_LEVEL as RANK_LEVEL,
} from "@/components/utils/rp22/bassGradingAuthority";

export const PILLAR_RANGES = Object.freeze({
  "Spatial Resolution": [1, 11],
  "Dynamic Range": [12, 16],
  "Timbre Matching": [17, 21],
});

export const PILLAR_ORDER = Object.keys(PILLAR_RANGES);

/**
 * Parameter IDs excluded from the Performance Overview's limiting calculation.
 * P15 and P21 are designer-assumed levels, not measured engineering results.
 * The overview identifies design decisions a designer can improve, so an
 * assumed value must never be the limiting level a pillar displays and must
 * never appear in the limiting-parameter hover detail. P15 and P21 remain in
 * the detailed Live RP22 Performance Summary and the ASDR calculation; only
 * this compact overview skips them.
 */
export const OVERVIEW_EXCLUDED_PARAM_IDS = Object.freeze(new Set([15, 21]));

// rank: higher = better. FAIL = 0 (worst). null = not assessed → skipped.
const levelRank = (lvl) => {
  const c = normalizeLevel(lvl);
  return c == null ? null : LEVEL_RANK[c];
};

// Worst (min-rank) assessed level among one seat group of a seat-scoped param,
// plus the seats that sit at that limiting level.
const seatGroupWorst = (seatResults, wantPrimary) => {
  const group = (seatResults || []).filter((r) =>
    wantPrimary ? r.isPrimary === true : r.isPrimary !== true);
  let worstRank = null;
  const limitingSeats = [];
  for (const r of group) {
    const rank = levelRank(r.level);
    if (rank == null) continue; // unassessed / N/A → skipped
    if (worstRank == null || rank < worstRank) {
      worstRank = rank;
      limitingSeats.length = 0;
      limitingSeats.push(r);
    } else if (rank === worstRank) {
      limitingSeats.push(r);
    }
  }
  return worstRank == null ? null : { rank: worstRank, seats: limitingSeats };
};

// Push a limiter for a group, resetting the accumulator when a new worse rank
// is found. Mirrors buildLiveComplianceSummary's min-rank reduction.
const accumulate = (rank, limiter, worstRef, limitersRef) => {
  if (worstRef.value == null || rank < worstRef.value) {
    worstRef.value = rank;
    limitersRef.length = 0;
  }
  if (rank === worstRef.value) limitersRef.push(limiter);
};

export function buildPillarOverview(liveSummary) {
  const out = {};
  for (const pillar of PILLAR_ORDER) {
    const [lo, hi] = PILLAR_RANGES[pillar];
    const primaryWorst = { value: null };
    const secondaryWorst = { value: null };
    const primaryLimiters = [];
    const secondaryLimiters = [];

    for (const p of RP22_PRESENTATION_PARAMETERS) {
      if (p.id < lo || p.id > hi) continue;
      // Confirm the catalog pillar matches the range (defensive; the range is
      // the authority for the overview grouping).
      if (PARAM_CATEGORIES[p.id] !== pillar) continue;
      // Assumed parameters (P15, P21) are excluded from this overview's
      // limiting calculation and hover detail. They are not measured design
      // results a designer can improve, so they must never limit a pillar here.
      if (OVERVIEW_EXCLUDED_PARAM_IDS.has(p.id)) continue;
      const key = `p${p.id}`;
      const title = getHumanTitleForParam(p.id);

      if (p.scope === "Seat") {
        const seatResults =
          liveSummary?.reportCounts?.seatResultsByParameter?.[key] || [];
        const prim = seatGroupWorst(seatResults, true);
        const sec = seatGroupWorst(seatResults, false);
        if (prim) {
          accumulate(prim.rank, {
            paramId: p.id,
            title,
            scope: "Seat",
            seats: prim.seats.map((s) => ({ row: s.row, column: s.column })),
          }, primaryWorst, primaryLimiters);
        }
        if (sec) {
          accumulate(sec.rank, {
            paramId: p.id,
            title,
            scope: "Seat",
            seats: sec.seats.map((s) => ({ row: s.row, column: s.column })),
          }, secondaryWorst, secondaryLimiters);
        }
      } else if (p.scope === "Room") {
        // Room-wide: counts for BOTH groups. Never an RSP-only result.
        const roomResult = liveSummary?.roomResultsByParameter?.[p.id];
        const rank = levelRank(roomResult?.level);
        if (rank != null) {
          const limiter = { paramId: p.id, title, scope: "Room", seats: [] };
          accumulate(rank, limiter, primaryWorst, primaryLimiters);
          accumulate(rank, limiter, secondaryWorst, secondaryLimiters);
        }
      } else if (p.scope === "RSP") {
        // RSP-only: PRIMARY group only. Never attributed to secondary seats.
        const roomResult = liveSummary?.roomResultsByParameter?.[p.id];
        const rank = levelRank(roomResult?.level);
        if (rank != null) {
          accumulate(rank, {
            paramId: p.id,
            title,
            scope: "RSP",
            seats: [],
          }, primaryWorst, primaryLimiters);
        }
      }
    }

    out[pillar] = {
      primary: {
        level: primaryWorst.value == null ? null : RANK_LEVEL[primaryWorst.value],
        limiters: primaryLimiters,
      },
      secondary: {
        level: secondaryWorst.value == null ? null : RANK_LEVEL[secondaryWorst.value],
        limiters: secondaryLimiters,
      },
    };
  }
  return out;
}

// Format the hover detail line for a single limiting parameter.
// Presentation only: the parameter number and its exact headline, matching the
// Live RP22 Performance Summary. Seat numbers, row references and room-wide
// labels are intentionally omitted. Each parameter appears once per pillar.
export function formatLimiterDetail(limiter) {
  return `P${limiter.paramId}. ${limiter.title}`;
}