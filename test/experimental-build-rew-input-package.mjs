// Builds exact text inputs for actual REW processing from the saved Room B/C
// authoritative unsmoothed arrays. Non-production experimental artefact only.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const root = "experiments/phase2-p19-p20/results";
const outDir = "experiments/phase2-p19-p20/rew-inputs";
const B = JSON.parse(readFileSync(`${root}/room-b.json`, "utf8"));
const C = JSON.parse(readFileSync(`${root}/room-c.json`, "utf8"));
const round = (v, d = 6) => Number(Number(v).toFixed(d));
const mean = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;

function collect(data) {
  const curves = [];
  for (const row of data.rows) {
    const base = {
      roomId: data.metadata.room.id,
      roomName: data.metadata.room.name,
      quantity: row.quantity,
      comparison: row.comparison,
      placement: row.sources.map((s) => ({ x: s.x, y: s.y, z: s.z })),
      levelsDb: row.tuning.gainsDb,
      delaysMs: row.tuning.delaysMs,
    };
    curves.push({ ...base, seatId: "rsp", isRsp: true, isPrimary: true, curve: row.final.rawUnsmoothed.rsp });
    for (const seat of row.final.rawUnsmoothed.seats) curves.push({
      ...base,
      seatId: seat.seatId,
      isRsp: false,
      isPrimary: !!seat.isPrimary,
      curve: seat.responseData,
    });
  }
  return curves;
}

const all = [...collect(B), ...collect(C)];
const unique = Array.from(new Map(all.map((item) => [
  `${item.roomId}|${item.quantity}|${item.comparison}|${item.seatId}`,
  item,
])).values());

function nearestIndex(curve, frequency) {
  return curve.reduce((best, point, index) => Math.abs(point.frequency - frequency) < Math.abs(curve[best].frequency - frequency) ? index : best, 0);
}

function localFeature(curve, startHz, endHz, shoulderBins = 7) {
  let best = { score: -Infinity, frequencyHz: null, signedDb: null };
  for (let i = shoulderBins; i < curve.length - shoulderBins; i += 1) {
    const f = curve[i].frequency;
    if (f < startHz || f > endHz) continue;
    const shoulders = [curve[i - shoulderBins].spl, curve[i + shoulderBins].spl];
    const signed = curve[i].spl - mean(shoulders);
    const score = Math.abs(signed);
    if (score > best.score) best = { score, frequencyHz: f, signedDb: signed };
  }
  return best;
}

function broadDepression30To60(curve) {
  let best = { score: -Infinity, centreHz: null, depressionDb: null };
  for (const centre of [34, 38, 42, 46, 50, 54, 58]) {
    const low = centre / Math.pow(2, 1 / 8);
    const high = centre * Math.pow(2, 1 / 8);
    const inside = curve.filter((p) => p.frequency >= low && p.frequency <= high).map((p) => p.spl);
    const shoulders = curve.filter((p) => (p.frequency >= low / Math.pow(2, 1 / 5) && p.frequency < low) || (p.frequency > high && p.frequency <= high * Math.pow(2, 1 / 5))).map((p) => p.spl);
    if (inside.length < 4 || shoulders.length < 4) continue;
    const depression = mean(shoulders) - mean(inside);
    if (depression > best.score) best = { score: depression, centreHz: centre, depressionDb: depression };
  }
  return best;
}

function broadModalScore(curve) {
  const values = curve.filter((p) => p.frequency >= 20 && p.frequency <= 120).map((p) => p.spl);
  const sorted = [...values].sort((a, b) => a - b);
  const p10 = sorted[Math.floor(sorted.length * 0.1)] ?? 0;
  const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
  return p90 - p10;
}

const broadModal = unique.filter((item) => item.isRsp).map((item) => ({ item, score: broadModalScore(item.curve) })).sort((a, b) => b.score - a.score)[0];
const narrowNull = unique.map((item) => ({ item, feature: localFeature(item.curve, 20, 100, 5) })).filter((x) => x.feature.signedDb < 0).sort((a, b) => b.feature.score - a.feature.score)[0];
const broadNull = unique.map((item) => ({ item, feature: broadDepression30To60(item.curve) })).sort((a, b) => b.feature.score - a.feature.score)[0];
const upper = unique.map((item) => ({ item, feature: localFeature(item.curve, 100, 180, 7) })).sort((a, b) => b.feature.score - a.feature.score)[0];

const roomBReferenceRow = B.rows.find((row) => row.quantity === 4 && row.comparison === "practical + optimised level/delay");
const rspCurve = roomBReferenceRow.final.rawUnsmoothed.rsp;
const secondary = roomBReferenceRow.final.rawUnsmoothed.seats
  .filter((seat) => !seat.isPrimary)
  .map((seat) => {
    let worst = 0;
    let worstFrequencyHz = null;
    seat.responseData.forEach((point, index) => {
      if (point.frequency < 20 || point.frequency > B.metadata.transitionHz) return;
      const diff = Math.abs(point.spl - rspCurve[index].spl);
      if (diff > worst) { worst = diff; worstFrequencyHz = point.frequency; }
    });
    return { seat, worst, worstFrequencyHz };
  })
  .sort((a, b) => b.worst - a.worst)[0];

const commonRoomB = {
  roomId: B.metadata.room.id,
  roomName: B.metadata.room.name,
  quantity: roomBReferenceRow.quantity,
  comparison: roomBReferenceRow.comparison,
  placement: roomBReferenceRow.sources.map((s) => ({ x: s.x, y: s.y, z: s.z })),
  levelsDb: roomBReferenceRow.tuning.gainsDb,
  delaysMs: roomBReferenceRow.tuning.delaysMs,
};

const selections = [
  { fixtureId: "curve-1-broad-modal", purpose: "Broad modal response", source: broadModal.item, selectionMetric: { p10ToP90Db: broadModal.score } },
  { fixtureId: "curve-2-narrow-deep-null", purpose: "Narrow deep null", source: narrowNull.item, selectionMetric: narrowNull.feature },
  { fixtureId: "curve-3-broad-30-60-null", purpose: "Broad 30-60 Hz null", source: broadNull.item, selectionMetric: broadNull.feature },
  { fixtureId: "curve-4a-room-b-rsp", purpose: "Multi-seat pair: Room B RSP", source: { ...commonRoomB, seatId: "rsp", isRsp: true, isPrimary: true, curve: rspCurve }, selectionMetric: { pairedFixture: "curve-4b-room-b-secondary" } },
  { fixtureId: "curve-4b-room-b-secondary", purpose: "Multi-seat pair: problematic Room B secondary seat", source: { ...commonRoomB, seatId: secondary.seat.seatId, isRsp: false, isPrimary: false, curve: secondary.seat.responseData }, selectionMetric: { rawWorstDifferenceDb: secondary.worst, rawWorstFrequencyHz: secondary.worstFrequencyHz, pairedFixture: "curve-4a-room-b-rsp" } },
  { fixtureId: "curve-5-upper-band-feature", purpose: "100-180 Hz feature", source: upper.item, selectionMetric: upper.feature },
];

mkdirSync(outDir, { recursive: true });
for (const selection of selections) {
  const s = selection.source;
  const header = [
    `* Sound Proof experimental REW golden input`,
    `* Fixture ID: ${selection.fixtureId}`,
    `* Purpose: ${selection.purpose}`,
    `* Source: ${s.roomName}; ${s.quantity} x SUB2-12; ${s.comparison}; seat ${s.seatId}`,
    `* Placement xyz m: ${JSON.stringify(s.placement)}`,
    `* Relative levels dB: ${JSON.stringify(s.levelsDb)}; delays ms: ${JSON.stringify(s.delaysMs)}`,
    `* Exact source grid: production authoritative unsmoothed 96 PPO, 15-200 Hz (final endpoint retained exactly)`,
    `* Freq(Hz) SPL(dB)`,
  ];
  const rows = s.curve.map((p) => `${Number(p.frequency).toPrecision(15)} ${Number(p.spl).toPrecision(15)}`);
  writeFileSync(`${outDir}/${selection.fixtureId}.txt`, [...header, ...rows].join("\n"));
}

const manifest = {
  packageVersion: "sound-proof-rew-golden-inputs-v1",
  generatedAt: new Date().toISOString(),
  authority: "Exact unsmoothed production authoritative arrays; no resampling before REW text import",
  inputFrequencyGrid: { nominalPointsPerOctave: 96, startHz: 15, endHz: 200, pointCount: selections[0].source.curve.length, finalEndpointRetained: true },
  rewProcedure: [
    "File > Import > Import Frequency Response; select each .txt input.",
    "Do not alter the imported data or frequency axis.",
    "Request 1/3 octave smoothing in actual REW.",
    "Export or API-read the smoothed magnitude at 96 PPO over the overlapping 15-200 Hz range.",
    "Name each result <fixtureId>.rew-third-octave.txt and record the REW version/date.",
  ],
  fixtures: selections.map(({ fixtureId, purpose, source, selectionMetric }) => ({
    fixtureId,
    purpose,
    filename: `${fixtureId}.txt`,
    source: { roomId: source.roomId, roomName: source.roomName, quantity: source.quantity, comparison: source.comparison, seatId: source.seatId, isRsp: source.isRsp, isPrimary: source.isPrimary, placement: source.placement, levelsDb: source.levelsDb, delaysMs: source.delaysMs },
    selectionMetric,
    pointCount: source.curve.length,
  })),
};
writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
