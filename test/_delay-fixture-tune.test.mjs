// TEMPORARY fixture tuning experiment — deleted after the fixture is chosen.
import test from "node:test";
import { defineDelayGroups, runGroupedDelaySearch } from "../src/components/room/bass/improveBassV2/groupedDelaySearch.js";
import { resumWithTuning } from "../src/components/room/bass/stage2/stage2TuningSearch.js";
import { selectCanonicalObjectives } from "../src/components/room/bass/improveBassV2/canonicalObjectiveSelection.js";
import { gradeP19, gradeP20 } from "../src/components/utils/rp22/bassGradingAuthority.js";

const C = 343;
const round2 = (v) => Math.round(Number(v) * 100) / 100;
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const spread = (a) => Math.max(...a) - Math.min(...a);
const SUB_Z = 0.4, LIS_Z = 1.2;
const FREQS = Array.from({ length: 101 }, (_, i) => 20 + i);

function modesFor(room, weight, q = 5) {
  const out = [];
  for (let nx = 0; nx <= 2; nx++) for (let ny = 1; ny <= 3; ny++) {
    if (nx === 0 && ny === 0) continue;
    const fn = (C / 2) * Math.sqrt((nx / room.widthM) ** 2 + (ny / room.lengthM) ** 2);
    if (fn > 220) continue;
    out.push({ fn, weight: weight / Math.sqrt(fn), q, sx: (x) => Math.cos((nx * Math.PI * x) / room.widthM), sy: (y) => Math.cos((ny * Math.PI * y) / room.lengthM) });
  }
  return out;
}
const d3 = (s, seat) => Math.hypot(s.position.x - seat.x, s.position.y - seat.y, SUB_Z - LIS_Z);

function pointsFor(source, seat, modes, room) {
  void room;
  const d = d3(source, seat);
  return FREQS.map((f) => {
    const w = 2 * Math.PI * f;
    let re = Math.cos((-w * d) / C) / d, im = Math.sin((-w * d) / C) / d;
    for (const m of modes) {
      const coupling = m.sx(source.position.x) * m.sx(seat.x) * m.sy(source.position.y) * m.sy(seat.y);
      const detune = (f * f - m.fn * m.fn) / Math.max((f * m.fn) / m.q, 1e-9);
      const den = 1 + detune * detune;
      re += (m.weight * coupling) / den;
      im -= (m.weight * coupling * detune) / den;
    }
    return { frequency: f, re, im };
  });
}

function evaluate(raw, seats, tuning) {
  const responses = resumWithTuning(raw.perSourcePerSeatComplexTransfers, tuning, seats.map((s) => s.id));
  const curves = new Map();
  for (const seat of seats) {
    const r = responses[seat.id];
    if (!r) return null;
    curves.set(seat.id, r.freqsHz.map((hz, i) => ({ hz, db: r.splDb[i] })).filter((p) => p.hz >= 20 && p.hz <= 120 && Number.isFinite(p.db)));
  }
  const rsp = curves.get("rsp");
  const rspMean = mean(rsp.map((p) => p.db));
  const p19 = spread(rsp.map((p) => p.db));
  let p20 = 0;
  for (const seat of seats) {
    if (seat.id === "rsp") continue;
    const curve = curves.get(seat.id);
    const seatMean = mean(curve.map((p) => p.db));
    let worst = 0;
    curve.forEach((p, i) => { worst = Math.max(worst, Math.abs((p.db - seatMean) - (rsp[i].db - rspMean))); });
    p20 = Math.max(p20, worst);
  }
  return { p19: round2(p19), p19Level: gradeP19(p19), p20: round2(p20), p20Level: gradeP20(p20) };
}

function runVariant({ label, room, rearX, weight, seatRows, q = 5 }) {
  const front = { id: "sub-front", legacyGroup: "front", enabled: true, position: { x: 2.5, y: 0.4 } };
  const rear = { id: "sub-rear", legacyGroup: "rear", enabled: true, position: { x: rearX, y: room.lengthM - 0.4 } };
  const instances = [front, rear];
  const seats = [
    { id: "rsp", x: 2.5, y: seatRows[0], priority: "primary" },
    { id: "row1-left", x: 1.6, y: seatRows[0], priority: "secondary" },
    { id: "row1-right", x: 3.4, y: seatRows[0], priority: "secondary" },
    { id: "row2-left", x: 1.6, y: seatRows[1], priority: "secondary" },
    { id: "row2-right", x: 3.4, y: seatRows[1], priority: "secondary" },
  ];
  const modes = modesFor(room, weight, q);
  const raw = {
    sources: instances.map((i) => ({ x: i.position.x, y: i.position.y })),
    seatIds: seats.map((s) => s.id),
    seatPriorityMap: seats.map((s) => [s.id, s.priority]),
    perSourcePerSeatComplexTransfers: instances.flatMap((src) => seats.map((seat) => ({ seatId: seat.id, points: pointsFor(src, seat, modes, room) }))),
  };
  const arrival = instances.map((i) => (d3(i, seats[0]) / C) * 1000);
  const latest = Math.max(...arrival);
  const baseline = instances.map((i, idx) => ({ sourceId: i.id, delayMs: round2(latest - arrival[idx]), gainDb: 0, polarity: 1 }));
  const groups = defineDelayGroups(instances, room);
  const search = runGroupedDelaySearch({ rawTransfer: raw, instances, roomDims: room, effectiveBaseline: baseline });
  const baseEval = evaluate(raw, seats, baseline);
  const rows = search.ledger.filter((r) => !r.rejection && !r.isCurrent);
  const evals = rows.map((row) => ({ row, e: evaluate(raw, seats, row.tuning) })).filter((x) => x.e);
  const canonical = evals.map(({ row, e }) => ({ candidateId: row.id, candidateKind: "calibration", achievedP19VariationDb: e.p19, achievedP19Level: e.p19Level, achievedP20VariationDb: e.p20, achievedP20Level: e.p20Level, appliedTuning: row.tuning }));
  const objectives = selectCanonicalObjectives({ candidates: canonical, baseline: { candidateId: "current", candidateKind: "current", achievedP19VariationDb: baseEval.p19, achievedP19Level: baseEval.p19Level, achievedP20VariationDb: baseEval.p20, achievedP20Level: baseEval.p20Level } });
  const bestP20 = objectives.bestCanonicalP20, bestP19 = objectives.bestCanonicalP19;
  console.log(`[variant] ${JSON.stringify({
    label,
    baseline: baseEval,
    impP19: round2(baseEval.p19 - Math.min(...canonical.map((c) => c.achievedP19VariationDb))),
    impP20: round2(baseEval.p20 - Math.min(...canonical.map((c) => c.achievedP20VariationDb))),
    bestP19: { id: bestP19?.candidateId, p19: bestP19?.achievedP19VariationDb, p20: bestP19?.achievedP20VariationDb },
    bestP20: { id: bestP20?.candidateId, p19: bestP20?.achievedP19VariationDb, p20: bestP20?.achievedP20VariationDb },
    balanced: objectives.values.balanced,
    groups: groups.status,
  })}`);
}

test("fixture tuning variants", () => {
  const variants = [];
  for (const lengthM of [5.6, 6.2]) {
    for (const rearX of [1.5, 2.5]) {
      for (const weight of [1.0, 1.4]) {
        for (const q of [5, 10]) {
          const room = { widthM: 5.0, lengthM, heightM: 2.5 };
          const row1 = Math.round(lengthM * 0.55 * 10) / 10;
          variants.push({
            label: `L${lengthM}-X${rearX}-W${weight}-Q${q}`,
            room, rearX, weight, q,
            seatRows: [row1, Math.round((row1 + 1.4) * 10) / 10],
          });
        }
      }
    }
  }
  for (const variant of variants) runVariant(variant);
  assertTrue();
});

function assertTrue() { /* experiment only */ }