// Experimental export only. Uses saved post-EQ finalist curves and the current
// production smoother. No search, simulation, tuning, EQ fitting, or optimiser.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

const ROOT = "experiments/phase2-p19-p20";
const sourceExport = JSON.parse(readFileSync(`${ROOT}/exports/sp-p18-edge-fixtures.json`, "utf8"));
const rooms = {
  "room-b": JSON.parse(readFileSync(`${ROOT}/results/room-b.json`, "utf8")),
  "room-c": JSON.parse(readFileSync(`${ROOT}/results/room-c.json`, "utf8")),
};
const encodeFloat64 = (values) => Buffer.from(new Float64Array(values).buffer).toString("base64");
const digest = (text) => createHash("sha256").update(text).digest("hex");

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const { applyBassSmoothing } = await server.ssrLoadModule("/src/components/room/bass/bassGraphSmoothing.jsx");
  const fixtures = sourceExport.fixtures.map((fixture) => {
    const room = rooms[fixture.source.roomId];
    const row = room.rows.find((candidate) => candidate.quantity === fixture.source.quantity
      && candidate.comparison === fixture.source.comparison);
    const postEq = fixture.source.isRsp
      ? row.final.postEq.rsp
      : row.final.postEq.seats.find((seat) => seat.seatId === fixture.source.seatId)?.responseData;
    if (!postEq?.length) throw new Error(`Missing saved post-EQ curve for ${fixture.fixtureId}`);
    const smoothed = applyBassSmoothing(postEq, "third");
    const arrays = {
      frequencyBase64: encodeFloat64(postEq.map((point) => point.frequency)),
      postEqRawSplBase64: encodeFloat64(postEq.map((point) => point.spl)),
      soundProofPostEqSplBase64: encodeFloat64(smoothed.map((point) => point.spl)),
      targetSplBase64: encodeFloat64(fixture.practicalCalibrationTarget.map((point) => point.spl)),
    };
    return {
      fixtureId: fixture.fixtureId,
      purpose: fixture.purpose,
      source: fixture.source,
      achievedP18Hz: fixture.achievedP18Hz,
      transitionHz: fixture.transitionHz,
      officialRole: fixture.officialRole,
      pointCount: postEq.length,
      encoding: "Float64Array little-endian base64",
      ...arrays,
      sha256: Object.fromEntries(Object.entries(arrays).map(([key, value]) => [key, digest(value)])),
      provenance: {
        resultPath: `${ROOT}/results/${fixture.source.roomId}.json`,
        productionSmootherModule: "src/components/room/bass/bassGraphSmoothing.jsx",
        savedPostEqCurve: true,
        reranSearch: false,
        reranSimulation: false,
        reranOptimiser: false,
      },
    };
  });
  const outputPath = `${ROOT}/exports/sp-p18-edge-posteq-compact.json`;
  writeFileSync(outputPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    purpose: "Official P19 lower-edge parity using saved post-EQ finalist curves",
    smoothing: "production 1/3 octave",
    fixtures,
  }));
  console.log(JSON.stringify({ outputPath, bytes: readFileSync(outputPath).length, fixtures: fixtures.length }));
} finally {
  await server.close();
}
