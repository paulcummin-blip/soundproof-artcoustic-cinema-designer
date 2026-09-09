// src/components/rp22/complianceSummaryAggregator.js
// Pure aggregation authority for the Compliance Summary headline totals.
//
// The summary summarises PARAMETERS (not individual seats). Every active RP22
// parameter contributes exactly one canonical parameter status to the headline
// buckets — including seat-scoped parameters that have a canonical aggregate
// level (e.g. P19/P20 from the completed bass authority).
//
// Seat-scoped parameters with no calculated canonical aggregate contribute to
// NOT VERIFIED / unavailable — they are never silently excluded merely because
// they are seat-scoped, nor counted once per seat.
//
// This module is pure (no React) so it can be unit-tested directly.

const LEVEL_ORD = { L4: 4, L3: 3, L2: 2, L1: 1, FAIL: 0 };

export const levelKey = (lvl) => {
  const s = String(lvl).toUpperCase();
  if (s === "L4" || lvl === 4) return "L4";
  if (s === "L3" || lvl === 3) return "L3";
  if (s === "L2" || lvl === 2) return "L2";
  if (s === "L1" || lvl === 1) return "L1";
  if (s === "FAIL" || lvl === 0) return "FAIL";
  return "NV";
};

/**
 * Aggregate canonical parameter statuses into headline compliance totals.
 *
 * @param {Array<{lvl:*, isSeatScope:boolean, status:{label:string}>}>} rowsData
 * @returns {{counts:Object, lowestLabel:string, active:number, unavailable:number, calculatedSeatParams:number, seatParamCount:number}}
 */
export function aggregateComplianceSummary(rowsData) {
  const counts = { L4: 0, L3: 0, L2: 0, L1: 0, fail: 0, notVerified: 0 };
  let lowestOrd = null;
  let active = 0;
  let unavailable = 0;
  let calculatedSeatParams = 0;
  let seatParamCount = 0;

  for (const { lvl, isSeatScope, status } of rowsData) {
    const k = levelKey(lvl);

    // Informational seat-scoped diagnostics — preserved as additional context
    // but do NOT replace inclusion in the headline compliance totals.
    if (isSeatScope) {
      seatParamCount++;
      if (status && status.label === "Calculated") calculatedSeatParams++;
    }

    // Every active parameter contributes one canonical parameter status to the
    // headline buckets. Seat-scoped parameters use their existing canonical
    // aggregate level (already supplied by getLevelForParam). A seat-scoped
    // parameter with no calculated canonical aggregate (levelKey === "NV")
    // contributes to NOT VERIFIED / unavailable — never silently excluded.
    if (k === "L4") { counts.L4++; active++; }
    else if (k === "L3") { counts.L3++; active++; }
    else if (k === "L2") { counts.L2++; active++; }
    else if (k === "L1") { counts.L1++; active++; }
    else if (k === "FAIL") { counts.fail++; active++; }
    else { counts.notVerified++; unavailable++; }

    if (k in LEVEL_ORD) {
      const ord = LEVEL_ORD[k];
      if (lowestOrd === null || ord < lowestOrd) lowestOrd = ord;
    }
  }

  const lowestLabel =
    lowestOrd === 4 ? "L4" :
    lowestOrd === 3 ? "L3" :
    lowestOrd === 2 ? "L2" :
    lowestOrd === 1 ? "L1" :
    lowestOrd === 0 ? "Below L1" : "—";

  return { counts, lowestLabel, active, unavailable, calculatedSeatParams, seatParamCount };
}