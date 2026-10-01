/**
 * selectClientAdiStrengths
 * ------------------------
 * Pure selector: the project-specific strengths the ADI Design Summary
 * reports to the client.
 *
 * A strength is only claimed where the published authority genuinely supports
 * it (the weakest assessed seat must still be L3 or better). Nothing is
 * inferred and no level is invented — the strengths come from the same
 * published parameter results the rest of the report uses, so the ADI summary
 * can never flatter the design beyond its measured performance.
 */

import { getOfficialRp22Title } from "@/components/utils/rp22OfficialTitles";

const ROOM_SCOPE_KEYS = [12, 13, 14, 18];
const SEAT_SCOPE_KEYS = ["p1", "p4", "p5", "p6", "p9", "p10", "p16", "p17", "p19", "p20"];

const LEVEL_RANK = { L4: 4, L3: 3, L2: 2, L1: 1, FAIL: 0 };

function rank(level) {
  return LEVEL_RANK[String(level || "").trim().toUpperCase()] ?? -1;
}

const SCOPE_COPY = {
  room: "Assessed at the reference seating position",
  seat: "Holds across every assessed seat",
};

export function selectClientAdiStrengths(engineeringSummary, { limit = 3 } = {}) {
  if (!engineeringSummary) return [];

  const strengthThreshold = 3; // L3 or better
  const collected = [];

  ROOM_SCOPE_KEYS.forEach((number) => {
    const result = engineeringSummary?.roomResultsByParameter?.[number];
    const level = result?.level;
    if (rank(level) < strengthThreshold) return;
    collected.push({
      key: `p${number}`,
      number,
      area: getOfficialRp22Title(number) || `Parameter ${number}`,
      level,
      scope: "room",
      detail: SCOPE_COPY.room,
    });
  });

  SEAT_SCOPE_KEYS.forEach((key) => {
    const rows = engineeringSummary?.project?.reportCounts?.seatResultsByParameter?.[key] || [];
    const levels = rows.map((row) => row?.level).filter(Boolean);
    if (levels.length === 0) return;
    // The weakest assessed seat governs — a strength must hold everywhere.
    const worst = levels.reduce((acc, level) => (rank(level) < rank(acc) ? level : acc), levels[0]);
    if (rank(worst) < strengthThreshold) return;
    const number = Number(String(key).replace("p", ""));
    collected.push({
      key,
      number,
      area: getOfficialRp22Title(number) || `Parameter ${number}`,
      level: worst,
      scope: "seat",
      detail: SCOPE_COPY.seat,
    });
  });

  return collected
    .sort((a, b) => rank(b.level) - rank(a.level) || a.number - b.number)
    .slice(0, Math.max(1, limit));
}