// Grouped physical phase-control search.
//
// The actuator is the unity-magnitude first-order all-pass model defined in
// subwooferPhaseControl.js. phaseControlDeg is the requested lag at 80 Hz.
// One stable source group remains the reference while the other is searched
// in 5-degree steps from 0 through 175 degrees. Searching both directions
// represents positive and negative relative phase without using a non-causal
// constant phase rotation.

import { resumWithTuning } from "../stage2/stage2TuningSearch.js";
import { defineDelayGroups } from "./groupedDelaySearch.js";
import {
  PHASE_CONTROL_MAX_DEG,
  PHASE_CONTROL_REFERENCE_HZ,
  PHASE_CONTROL_STEP_DEG,
  normalisePhaseControlDeg,
} from "../../../../bass/core/subwooferPhaseControl.js";

const now = () => performance.now();
const compare = (a, b) =>
  a.score - b.score
  || a.phaseAtReferenceDeg - b.phaseAtReferenceDeg
  || a.id.localeCompare(b.id);

function phaseOf(tuning) {
  return normalisePhaseControlDeg(tuning?.phaseControlDeg ?? tuning?.phaseAdjust);
}

function tuningMatches(a, b) {
  return a.length === b.length && a.every((row, index) => {
    const other = b[index] || {};
    return row.sourceId === other.sourceId
      && Math.abs((Number(row.delayMs) || 0) - (Number(other.delayMs) || 0)) < 1e-9
      && Math.abs((Number(row.gainDb) || 0) - (Number(other.gainDb) || 0)) < 1e-9
      && Number(row.polarity) === Number(other.polarity)
      && Math.abs(phaseOf(row) - phaseOf(other)) < 1e-9;
  });
}

export function definePhaseGroups(instances, roomDims) {
  const grouping = defineDelayGroups(instances, roomDims);
  if (grouping.status === "skipped" && grouping.groups.length === 0) {
    return { ...grouping, reason: grouping.reason.replace(/delay|timing/gi, "phase") };
  }
  return grouping;
}

export function createGroupedPhaseCandidate(
  grouping,
  baseline,
  direction,
  phaseAtReferenceDeg,
) {
  const group = grouping.groups.find((entry) => entry.id === direction);
  const requested = Number(phaseAtReferenceDeg);
  if (
    direction !== "current"
    && (!group || !Number.isFinite(requested)
      || requested < 0 || requested > PHASE_CONTROL_MAX_DEG
      || Math.abs(requested / PHASE_CONTROL_STEP_DEG - Math.round(requested / PHASE_CONTROL_STEP_DEG)) > 1e-9)
  ) {
    throw new Error("Invalid grouped all-pass phase setting");
  }
  const phase = direction === "current" ? null : normalisePhaseControlDeg(requested);
  const tuning = baseline.map((entry) => ({
    ...entry,
    phaseControlDeg: group?.sourceIds.includes(entry.sourceId) ? phase : phaseOf(entry),
  }));
  const id = direction === "current"
    ? "current"
    : "grouped-phase:" + JSON.stringify(group.sourceIds) + ":" + phase;
  return {
    id,
    direction,
    phaseAtReferenceDeg: direction === "current" ? null : phase,
    phaseReferenceHz: PHASE_CONTROL_REFERENCE_HZ,
    phaseModel: "first-order-all-pass",
    tuning,
    isCurrent: direction === "current",
  };
}

export function generateGroupedPhaseCandidates(grouping, baseline) {
  if (
    !Array.isArray(baseline)
    || !baseline.length
    || new Set(baseline.map((entry) => entry?.sourceId)).size !== baseline.length
    || baseline.some((entry) =>
      !entry?.sourceId
      || !Number.isFinite(entry.delayMs)
      || entry.delayMs < 0
      || !Number.isFinite(entry.gainDb)
      || ![0, 1, -1, 180].includes(entry.polarity)
      || !Number.isFinite(phaseOf(entry)))
  ) {
    throw new Error("Missing valid frozen effective source tuning");
  }

  const current = createGroupedPhaseCandidate(grouping, baseline, "current", 0);
  const rows = [current];
  if (grouping.status !== "eligible") return rows;

  const groupedIds = grouping.groups.flatMap((group) => group.sourceIds);
  if (
    groupedIds.length !== baseline.length
    || new Set(groupedIds).size !== baseline.length
    || groupedIds.some((id) => !baseline.some((entry) => entry.sourceId === id))
  ) {
    throw new Error("Group membership does not match effective source identities");
  }

  for (const group of grouping.groups) {
    for (
      let phase = 0;
      phase <= PHASE_CONTROL_MAX_DEG;
      phase += PHASE_CONTROL_STEP_DEG
    ) {
      const candidate = createGroupedPhaseCandidate(grouping, baseline, group.id, phase);
      if (!tuningMatches(candidate.tuning, baseline)) rows.push(candidate);
    }
  }
  return rows;
}

export function scoreGroupedPhaseCandidate(rawTransfer, candidate) {
  const responses = resumWithTuning(
    rawTransfer.perSourcePerSeatComplexTransfers,
    candidate.tuning,
    rawTransfer.seatIds,
  );
  const priorities = new Map(rawTransfer.seatPriorityMap || []);
  const ranges = {};
  for (const [seatId, response] of Object.entries(responses)) {
    const values = response.splDb.filter(
      (value, index) =>
        response.freqsHz[index] >= 20
        && response.freqsHz[index] <= 120
        && Number.isFinite(value),
    );
    ranges[seatId] = values.length
      ? Math.max(...values) - Math.min(...values)
      : Number.POSITIVE_INFINITY;
  }
  const seats = Object.keys(ranges).filter((seatId) => seatId !== "rsp");
  const primary = seats.filter((seatId) => priorities.get(seatId) === "primary");
  const worst = (ids) => ids.length
    ? Math.max(...ids.map((seatId) => ranges[seatId]))
    : Number.POSITIVE_INFINITY;
  const proxy = {
    primaryRangeDb: worst(primary.length ? primary : seats),
    allSeatRangeDb: worst(seats),
    rspRangeDb: ranges.rsp,
    ranges,
  };
  const valid = seats.length > 0
    && Number.isFinite(proxy.primaryRangeDb)
    && Number.isFinite(proxy.allSeatRangeDb);
  return {
    ...candidate,
    proxy: valid ? proxy : null,
    rejection: valid ? null : "Invalid or empty recombined response",
  };
}

export function planGroupedPhaseConfirmation(scored) {
  const retained = new Set();
  const reasons = {};
  const keep = (row, reason) => {
    if (!row || row.isCurrent || row.rejection) return;
    retained.add(row.id);
    (reasons[row.id] ||= []).push(reason);
  };

  for (const direction of ["A", "B"]) {
    for (const metric of ["primaryRangeDb", "allSeatRangeDb"]) {
      const rows = scored
        .filter((row) =>
          row.direction === direction
          && !row.rejection
          && Number.isFinite(row.proxy?.[metric]))
        .map((row) => ({ ...row, score: row.proxy[metric] }))
        .sort(compare);
      const seed = rows[0];
      if (!seed) continue;
      keep(seed, direction + " " + metric + " minimum");
      for (const neighbour of scored) {
        if (
          neighbour.direction === direction
          && Math.abs(neighbour.phaseAtReferenceDeg - seed.phaseAtReferenceDeg)
            === PHASE_CONTROL_STEP_DEG
        ) {
          keep(neighbour, "Adjacent 5-degree setting to " + seed.id);
        }
      }
    }
  }
  return { retainedIds: [...retained], reasons };
}

export function runGroupedPhaseSearch({
  rawTransfer,
  instances,
  roomDims,
  effectiveBaseline,
}) {
  const start = now();
  const active = (instances || []).filter((source) => source.enabled !== false);
  const byId = new Map((effectiveBaseline || []).map((entry) => [entry.sourceId, entry]));
  if (
    !rawTransfer?.perSourcePerSeatComplexTransfers?.length
    || active.length !== rawTransfer.sources?.length
  ) {
    throw new Error("Grouped phase search requires Current's untuned source/seat transfers");
  }
  active.forEach((source, index) => {
    const raw = rawTransfer.sources[index];
    if (
      Math.abs(raw.x - source.position.x) > 1e-6
      || Math.abs(raw.y - source.position.y) > 1e-6
      || !Number.isFinite(raw.x)
      || !Number.isFinite(raw.y)
    ) {
      throw new Error("Captured source geometry/order does not match Current: " + source.id);
    }
  });

  const baseline = active.map((source) => byId.get(source.id));
  const grouping = definePhaseGroups(active, roomDims);
  const generated = generateGroupedPhaseCandidates(grouping, baseline);
  const preparedAt = now();
  const scored = generated.map((candidate) =>
    scoreGroupedPhaseCandidate(rawTransfer, candidate));
  const scoredAt = now();
  const plan = planGroupedPhaseConfirmation(scored);
  const candidates = scored.filter((candidate) =>
    plan.retainedIds.includes(candidate.id) && !candidate.rejection);
  const promoted = new Set(candidates.map((candidate) => candidate.id));
  const ledger = scored.map((candidate) => ({
    ...candidate,
    promoted: promoted.has(candidate.id),
    promotionReason: candidate.rejection
      || (candidate.isCurrent
        ? "Frozen Current control"
        : promoted.has(candidate.id)
          ? plan.reasons[candidate.id]?.join("; ") || "Bounded 5-degree neighbour"
          : "Outside bounded directional primary/all-seat minima"),
  }));

  return {
    status: grouping.status,
    grouping,
    candidates,
    ledger,
    current: scored[0],
    optionCount: scored.length,
    retainedCandidateCount: candidates.length,
    phaseReferenceHz: PHASE_CONTROL_REFERENCE_HZ,
    phaseModel: "first-order-all-pass",
    timings: {
      prepareMs: preparedAt - start,
      scoreMs: scoredAt - preparedAt,
      totalMs: scoredAt - start,
    },
  };
}
