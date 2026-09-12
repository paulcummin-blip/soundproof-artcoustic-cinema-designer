// groupedGainSearch.js
// Grouped gain (trim) search — mirrors the grouped delay search but for
// relative level adjustments between subwoofer groups.
//
// For four subs: front pair = Group A, rear pair = Group B.
// For two subs: each sub is its own group (unless symmetric same-wall pair).
// For one sub: no inter-sub gain search.
//
// One group is held fixed (0 dB relative trim). The other group is adjusted
// together in coarse (1 dB) then fine (0.5 dB) steps within safe limits.
//
// This uses the SAME raw transfer (zero-tuning per-source per-seat complex
// transfers) as the grouped delay search. Gain is applied as amplitude
// scaling 10^(gainDb/20) — mathematically equivalent to applying trim in
// the simulation.
//
// Safety limits: -10 dB to 0 dB (matching stage2TuningSearch.js LEVEL bounds).
// One group is always held at 0 dB (the reference); the other group is
// adjusted DOWN only (negative trim), never up.

import { resumWithTuning } from "../stage2/stage2TuningSearch.js";

const GEOMETRY_TOLERANCE_M = 0.01;
const GAIN_MIN_DB = -10;
const GAIN_MAX_DB = 0;
const GAIN_COARSE_STEP_DB = 1.0;
const GAIN_FINE_STEP_DB = 0.5;

const now = () => performance.now();
const compare = (a, b) => a.score - b.score || a.adjustmentDb - b.adjustmentDb || a.id.localeCompare(b.id);

/**
 * Define gain groups — same grouping logic as defineDelayGroups.
 * Reuses the same front/rear classification.
 */
export function defineGainGroups(instances, roomDims) {
  const active = (instances || []).filter((s) => s.enabled !== false);
  const skipped = (reason) => ({ status: "skipped", reason, groups: [] });
  const ambiguous = (reason) => ({ status: "ambiguous", reason, groups: [] });
  if (active.length <= 1) return skipped("One source: no inter-sub gain search.");
  const W = Number(roomDims?.widthM), L = Number(roomDims?.lengthM);
  if (!(W > 0 && L > 0) || new Set(active.map((s) => s.id)).size !== active.length ||
      active.some((s) => !s.id || !Number.isFinite(s.position?.x) || !Number.isFinite(s.position?.y)))
    return ambiguous("Missing or duplicate source identity/geometry.");
  const side = (s) => s.position.y < L / 2 - GEOMETRY_TOLERANCE_M ? "front" : s.position.y > L / 2 + GEOMETRY_TOLERANCE_M ? "rear" : null;
  for (const s of active) {
    const declared = s.legacyGroup || s.group;
    if (["front", "rear"].includes(declared) && declared !== side(s))
      return ambiguous("Group metadata conflicts with source geometry: " + s.id);
  }
  const group = (id, label, rows) => ({ id, label, sourceIds: rows.map((s) => s.id).sort() });
  if (active.length === 4) {
    const front = active.filter((s) => side(s) === "front"), rear = active.filter((s) => side(s) === "rear");
    if (front.length !== 2 || rear.length !== 2) return ambiguous("Four-source gain requires two front and two rear sources.");
    return { status: "eligible", groups: [group("A", "Front pair", front), group("B", "Rear pair", rear)] };
  }
  if (active.length === 2) {
    const [a, b] = active;
    if (side(a) && side(a) === side(b) && Math.abs(a.position.y - b.position.y) <= GEOMETRY_TOLERANCE_M &&
        Math.abs(a.position.x + b.position.x - W) <= GEOMETRY_TOLERANCE_M)
      return skipped("Symmetric same-wall pair: differential grouped gain is disabled by default.");
    const ordered = [...active].sort((a, b) => a.position.y - b.position.y || a.id.localeCompare(b.id));
    return { status: "eligible", groups: [group("A", "First source", [ordered[0]]), group("B", "Second source", [ordered[1]])] };
  }
  return ambiguous("Grouped gain search supports one, two or four active sources.");
}

/**
 * Create a grouped gain candidate: adjust one group's gain by adjustmentDb.
 */
export function createGroupedGainCandidate(grouping, baseline, direction, adjustmentDb) {
  const group = grouping.groups.find((g) => g.id === direction);
  if (adjustmentDb !== 0 && (!group || !Number.isFinite(adjustmentDb) || adjustmentDb < GAIN_MIN_DB || adjustmentDb > 0))
    throw Error("Invalid grouped gain adjustment");
  const tuning = baseline.map((t) => ({
    ...t,
    gainDb: t.gainDb + (group?.sourceIds.includes(t.sourceId) ? adjustmentDb : 0),
  }));
  const id = adjustmentDb === 0 ? "current" : "grouped-gain:" + JSON.stringify(group.sourceIds) + ":" + adjustmentDb;
  return { id, direction: adjustmentDb === 0 ? "current" : direction, adjustmentDb, tuning, isCurrent: adjustmentDb === 0 };
}

/**
 * Generate coarse gain candidates for each group direction.
 */
export function generateGroupedGainCoarseCandidates(grouping, baseline) {
  if (!Array.isArray(baseline) || !baseline.length ||
      new Set(baseline.map((t) => t?.sourceId)).size !== baseline.length ||
      baseline.some((t) => !t?.sourceId || !Number.isFinite(t.delayMs) || !Number.isFinite(t.gainDb) || ![0, 1, -1, 180].includes(t.polarity)))
    throw Error("Missing valid frozen effective source tuning");
  const rows = [createGroupedGainCandidate(grouping, baseline, "current", 0)];
  if (grouping.status !== "eligible") return rows;
  const groupedIds = grouping.groups.flatMap((g) => g.sourceIds);
  if (groupedIds.length !== baseline.length || new Set(groupedIds).size !== baseline.length ||
      groupedIds.some((id) => !baseline.some((t) => t.sourceId === id)))
    throw Error("Group membership does not match effective source identities");
  for (const group of grouping.groups)
    for (let adj = GAIN_MIN_DB; adj <= GAIN_MAX_DB; adj += GAIN_COARSE_STEP_DB)
      rows.push(createGroupedGainCandidate(grouping, baseline, group.id, adj));
  return rows;
}

/**
 * Score a grouped gain candidate by peak-to-peak SPL variation.
 */
export function scoreGroupedGainCandidate(rawTransfer, candidate) {
  const responses = resumWithTuning(rawTransfer.perSourcePerSeatComplexTransfers, candidate.tuning, rawTransfer.seatIds);
  const priorities = new Map(rawTransfer.seatPriorityMap || []), ranges = {};
  for (const [id, response] of Object.entries(responses)) {
    const values = response.splDb.filter((v, i) => response.freqsHz[i] >= 20 && response.freqsHz[i] <= 120);
    ranges[id] = values.length && values.every(Number.isFinite) ? Math.max(...values) - Math.min(...values) : Infinity;
  }
  const seats = Object.keys(ranges).filter((id) => id !== "rsp");
  const primary = seats.filter((id) => priorities.get(id) === "primary");
  const worst = (ids) => ids.length ? Math.max(...ids.map((id) => ranges[id])) : Infinity;
  const proxy = { primaryRangeDb: worst(primary.length ? primary : seats), allSeatRangeDb: worst(seats), rspRangeDb: ranges.rsp, ranges };
  return { ...candidate, proxy };
}

/**
 * Plan fine refinement around the best coarse candidates.
 */
export function planGroupedGainRefinement(coarse) {
  const retained = new Set(), intervals = new Map(), reasons = {};
  const keep = (row, reason) => { retained.add(row.id); (reasons[row.id] ||= []).push(reason); };
  for (const direction of ["A", "B"]) {
    for (const metric of ["primaryRangeDb", "allSeatRangeDb"]) {
      const rows = coarse.filter((r) => r.direction === direction && !r.isCurrent && Number.isFinite(r.proxy?.[metric]));
      const ranked = rows.map((r) => ({ ...r, score: r.proxy[metric] })).sort(compare);
      const seed = ranked[0];
      if (!seed) continue;
      keep(seed, direction + " " + metric + " minimum");
      const adjacent = coarse
        .filter((r) => !r.isCurrent && r.direction === direction && Math.abs(r.adjustmentDb - seed.adjustmentDb) === GAIN_COARSE_STEP_DB && Number.isFinite(r.proxy?.[metric]))
        .map((r) => ({ ...r, score: r.proxy[metric] })).sort(compare)[0];
      if (!adjacent) continue;
      keep(adjacent, "Adjacent to " + seed.id + " by " + metric);
      const adjustmentDb = (seed.adjustmentDb + adjacent.adjustmentDb) / 2;
      const key = direction + ":" + adjustmentDb;
      intervals.set(key, { direction, adjustmentDb, neighbours: [seed.id, adjacent.id] });
    }
  }
  return { retainedIds: [...retained], intervals: [...intervals.values()], reasons };
}

/**
 * Run the grouped gain search. Returns candidates and diagnostics.
 */
export function runGroupedGainSearch({ rawTransfer, instances, roomDims, effectiveBaseline }) {
  const start = now();
  const active = (instances || []).filter((s) => s.enabled !== false);
  const byId = new Map((effectiveBaseline || []).map((t) => [t.sourceId, t]));
  if (!rawTransfer?.perSourcePerSeatComplexTransfers?.length || active.length !== rawTransfer.sources?.length)
    throw Error("Grouped gain search requires Current's untuned source/seat transfers");
  active.forEach((s, i) => {
    const raw = rawTransfer.sources[i];
    if (Math.abs(raw.x - s.position.x) > 1e-6 || Math.abs(raw.y - s.position.y) > 1e-6 || !Number.isFinite(raw.x) || !Number.isFinite(raw.y))
      throw Error("Captured source geometry/order does not match Current: " + s.id);
  });
  const baseline = active.map((s) => byId.get(s.id));
  const grouping = defineGainGroups(active, roomDims);
  const generated = generateGroupedGainCoarseCandidates(grouping, baseline);
  const preparedAt = now();
  const coarse = generated.map((c) => scoreGroupedGainCandidate(rawTransfer, c));
  const coarseAt = now();
  const plan = planGroupedGainRefinement(coarse);
  const fine = plan.intervals.map((i) => ({
    ...scoreGroupedGainCandidate(rawTransfer, createGroupedGainCandidate(grouping, baseline, i.direction, i.adjustmentDb)),
    neighbours: i.neighbours,
  }));
  const fineAt = now();
  const candidates = [
    ...coarse.filter((c) => plan.retainedIds.includes(c.id) && !c.isCurrent),
    ...fine,
  ];
  const promoted = new Set(candidates.map((c) => c.id));
  const ledger = [...coarse, ...fine].map((c) => ({
    ...c,
    promotionReason: c.isCurrent ? "Frozen Current control" : promoted.has(c.id) ? plan.reasons[c.id]?.join("; ") || "Adjacent half-step refinement" : "Outside bounded directional intervals",
    promoted: promoted.has(c.id),
  }));
  return {
    status: grouping.status,
    grouping,
    candidates,
    ledger,
    current: coarse[0],
    coarseCount: coarse.length,
    fineCount: fine.length,
    retainedCandidateCount: candidates.length,
    timings: { prepareMs: preparedAt - start, coarseMs: coarseAt - preparedAt, fineMs: fineAt - coarseAt, totalMs: fineAt - start },
  };
}