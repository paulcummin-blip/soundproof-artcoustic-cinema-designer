import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const inputPath = "experiments/phase2-p19-p20/exports/sp-p18-edge-fixtures.json";
const outputPath = "experiments/phase2-p19-p20/exports/sp-p18-edge-fixtures-compact.json";
const source = JSON.parse(readFileSync(inputPath, "utf8"));

const encodeFloat64 = (values) => Buffer.from(new Float64Array(values).buffer).toString("base64");
const digest = (text) => createHash("sha256").update(text).digest("hex");

const fixtures = source.fixtures.map((fixture) => {
  const frequencyBase64 = encodeFloat64(fixture.soundProofSmoothed.map((point) => point.frequency));
  const soundProofSplBase64 = encodeFloat64(fixture.soundProofSmoothed.map((point) => point.spl));
  const targetSplBase64 = encodeFloat64(fixture.practicalCalibrationTarget.map((point) => point.spl));
  return {
    fixtureId: fixture.fixtureId,
    purpose: fixture.purpose,
    source: fixture.source,
    achievedP18Hz: fixture.achievedP18Hz,
    transitionHz: fixture.transitionHz,
    officialRole: fixture.officialRole,
    pointCount: fixture.soundProofSmoothed.length,
    encoding: "Float64Array little-endian base64",
    frequencyBase64,
    soundProofSplBase64,
    targetSplBase64,
    sha256: {
      frequencyBase64: digest(frequencyBase64),
      soundProofSplBase64: digest(soundProofSplBase64),
      targetSplBase64: digest(targetSplBase64),
    },
    provenance: fixture.provenance,
  };
});

writeFileSync(outputPath, JSON.stringify({ generatedAt: source.generatedAt, smoothing: source.smoothing, fixtures }));
console.log(JSON.stringify({ outputPath, bytes: readFileSync(outputPath).length, fixtures: fixtures.length }));
