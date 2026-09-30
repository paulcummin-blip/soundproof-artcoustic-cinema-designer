// adi-abfuser-recommendation.test.mjs
// Focused validation for the ADI strategic Abfuser recommendation.
//
// Verifies:
//   1. Swanwick 6 × 4 × 2.4 m  → 6 Abfusers (2 left + 2 right + 2 rear), 4.62 m²
//   2. Small one-row room      → 4 to 6 panels
//   3. Medium two-row room     → 6 to 8 panels
//   4. Large room              → 8 to 12 panels
//   5. Very large room         → hard cap of 12 + "full acoustic treatment
//                                design required", excess never priced
//   6. Legacy automatic value  → migrated to legacyAutoQuantity, not selected
//   7. Designer manual value   → preserved
//   8. Recommended vs selected → separate authorities, pricing follows selected
//   9. Product model           → real panel size and absorption data

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateAbfuserRecommendation,
  describeAbfuserInclusion,
  describeAbfuserRecommendation,
  ABFUSER_MAX_AUTO_QTY,
  ABFUSER_STATUS,
} from "@/components/utils/adiAbfuserRecommendation";
import { resolveAbfuserQuantityFromProject } from "@/components/utils/abfuserQuantityMigration";
import { ABFUSER_PRODUCT } from "@/components/utils/adiAbfuserProduct";

// ── Helpers ──────────────────────────────────────────────────────────────

const seatRow = (rowNumber, y, xs) =>
  xs.map((x, i) => ({ id: `R${rowNumber}S${i + 1}`, x, y, rowNumber }));

const frontStage = (centreX) => [
  { id: "FL", role: "FL", x: centreX - 1.3, y: 0.4 },
  { id: "FC", role: "FC", x: centreX, y: 0.4 },
  { id: "FR", role: "FR", x: centreX + 1.3, y: 0.4 },
];

const recommend = ({ widthM, lengthM, heightM, seating, selectedQuantity = 0, legacyAutoQuantity = 0, quantitySource = "none" }) =>
  calculateAbfuserRecommendation({
    room: { widthM, lengthM, heightM },
    speakers: frontStage(widthM / 2),
    seating,
    acousticTreatmentSettings: { enabled: true, selectedQuantity, legacyAutoQuantity, quantitySource },
  });

// ── TEST 1 — Swanwick 6 × 4 × 2.4 m ──────────────────────────────────────

describe("TEST 1 — Swanwick 6 × 4 × 2.4 m", () => {
  const swanwick = () =>
    recommend({
      widthM: 4,
      lengthM: 6,
      heightM: 2.4,
      seating: seatRow(1, 3.6, [1.4, 2.0, 2.6]),
    });

  it("recommends 6 Abfusers, not a 20+ surface-area figure", () => {
    const result = swanwick();
    assert.equal(result.recommendedQuantity, 6);
    assert.ok(result.recommendedQuantity <= ABFUSER_MAX_AUTO_QTY);
    assert.equal(result.status, ABFUSER_STATUS.OK);
    assert.equal(result.authority, "ADI_STRATEGIC_REFLECTION_CONTROL");
  });

  it("allocates 2 left first reflection, 2 right first reflection, 2 rear wall", () => {
    const result = swanwick();
    assert.deepEqual(result.quantityByZone, {
      left: 2,
      right: 2,
      rear: 2,
      ceilingAdvisory: 0,
      counted: 6,
    });
    assert.equal(result.zones.length, 3);
    assert.deepEqual(
      result.zones.map((z) => z.id),
      ["side-left", "side-right", "rear-wall"]
    );
  });

  it("reports 4.62 m² of treatment area", () => {
    assert.equal(swanwick().totalRecommendedAreaM2, 4.62);
  });

  it("selects nothing until the designer accepts the recommendation", () => {
    const result = swanwick();
    assert.equal(result.selectedQuantity, 0);
    assert.equal(result.quantitySource, "none");
    assert.equal(
      describeAbfuserInclusion(result).message,
      "Not currently included in pricing."
    );
  });

  it("uses the expected recommendation wording", () => {
    const sentence = describeAbfuserRecommendation(swanwick());
    assert.match(sentence, /ADI recommends 6 Abfusers to control the primary side-wall reflections and rear-wall reflection energy/);
    assert.match(sentence, /not a full acoustic design/);
  });

  it("positions markers on the recommended zones", () => {
    const result = swanwick();
    for (const zone of result.zones) {
      assert.ok(Number.isFinite(zone.rect.x) && Number.isFinite(zone.rect.y));
      assert.ok(zone.rect.width > 0 && zone.rect.height > 0);
      assert.ok(zone.panels >= 1);
    }
  });
});

// ── TEST 2 — Small one-row room ──────────────────────────────────────────

describe("TEST 2 — small one-row room", () => {
  it("recommends 4 to 6 panels", () => {
    const result = recommend({
      widthM: 4.0,
      lengthM: 4.5,
      heightM: 2.4,
      seating: seatRow(1, 3.2, [1.4, 2.0, 2.6]),
    });
    assert.equal(result.band, "small");
    assert.ok(result.recommendedQuantity >= 4 && result.recommendedQuantity <= 6, `got ${result.recommendedQuantity}`);
    assert.equal(result.selectedQuantity, 0);
  });
});

// ── TEST 3 — Medium two-row room ─────────────────────────────────────────

describe("TEST 3 — medium two-row room", () => {
  it("recommends 6 to 8 panels with per-zone positions", () => {
    const result = recommend({
      widthM: 4.5,
      lengthM: 6.0,
      heightM: 2.6,
      seating: [...seatRow(1, 3.2, [1.3, 1.9, 2.5, 3.1]), ...seatRow(2, 4.6, [1.3, 1.9, 2.5, 3.1])],
    });
    assert.equal(result.band, "medium");
    assert.ok(result.recommendedQuantity >= 6 && result.recommendedQuantity <= 8, `got ${result.recommendedQuantity}`);
    assert.equal(result.quantityByZone.counted, result.recommendedQuantity);
  });
});

// ── TEST 4 — Large room ──────────────────────────────────────────────────

describe("TEST 4 — large room", () => {
  it("recommends 8 to 12 panels", () => {
    const result = recommend({
      widthM: 8,
      lengthM: 6,
      heightM: 3.0,
      seating: [
        ...seatRow(1, 4.0, [2.2, 3.2, 4.2, 5.2]),
        ...seatRow(2, 5.4, [2.2, 3.2, 4.2, 5.2]),
        ...seatRow(3, 6.8, [2.2, 3.2, 4.2, 5.2]),
      ],
    });
    assert.equal(result.band, "large");
    assert.ok(result.recommendedQuantity >= 8 && result.recommendedQuantity <= ABFUSER_MAX_AUTO_QTY, `got ${result.recommendedQuantity}`);
  });

  it("caps an oversized requirement at 12 and requires a full design", () => {
    const result = recommend({
      widthM: 10,
      lengthM: 8,
      heightM: 3.2,
      seating: [
        ...seatRow(1, 4.0, [2.0, 3.4, 4.8, 6.2, 7.6]),
        ...seatRow(2, 5.4, [2.0, 3.4, 4.8, 6.2, 7.6]),
        ...seatRow(3, 6.8, [2.0, 3.4, 4.8, 6.2, 7.6]),
      ],
    });
    assert.equal(result.recommendedQuantity, ABFUSER_MAX_AUTO_QTY);
    assert.equal(result.status, ABFUSER_STATUS.FULL_DESIGN_REQUIRED);
    assert.ok(result.excessQuantity > 0, "excess above the cap is reported, not priced");
    assert.equal(result.quantityByZone.counted, ABFUSER_MAX_AUTO_QTY);
  });
});

// ── TEST 5 — Selected versus recommended ─────────────────────────────────

describe("TEST 5 — recommended and selected quantities are separate", () => {
  const swanwick = () =>
    recommend({
      widthM: 4,
      lengthM: 6,
      heightM: 2.4,
      seating: seatRow(1, 3.6, [1.4, 2.0, 2.6]),
    });

  it("does not treat a legacy automatic value as a designer selection", () => {
    const migrated = resolveAbfuserQuantityFromProject({
      selected_abfuser_qty: 23,
      abfuser_qty_source: "recommended",
    });
    assert.equal(migrated.selectedQuantity, 0);
    assert.equal(migrated.legacyAutoQuantity, 23);
    assert.equal(migrated.quantitySource, "none");

    const result = recommend({
      widthM: 4,
      lengthM: 6,
      heightM: 2.4,
      seating: seatRow(1, 3.6, [1.4, 2.0, 2.6]),
      selectedQuantity: migrated.selectedQuantity,
      legacyAutoQuantity: migrated.legacyAutoQuantity,
      quantitySource: migrated.quantitySource,
    });
    assert.equal(result.recommendedQuantity, 6);
    assert.equal(result.selectedQuantity, 0);
    assert.equal(result.legacyAutoQuantity, 23);
  });

  it("preserves a genuine designer selection", () => {
    const migrated = resolveAbfuserQuantityFromProject({
      selected_abfuser_qty: 8,
      abfuser_qty_source: "user",
    });
    assert.equal(migrated.selectedQuantity, 8);
    assert.equal(migrated.quantitySource, "user");
    assert.equal(migrated.legacyAutoQuantity, 0);
  });

  it("reports inclusion states for the client report", () => {
    const base = { recommendedQuantity: 6 };
    assert.equal(describeAbfuserInclusion({ ...base, selectedQuantity: 0 }).state, "NOT_INCLUDED");
    assert.equal(describeAbfuserInclusion({ ...base, selectedQuantity: 6 }).message, "Included in proposal.");
    assert.equal(describeAbfuserInclusion({ ...base, selectedQuantity: 9 }).state, "ABOVE_RECOMMENDATION");
    assert.equal(swanwick().selectedQuantity, 0);
  });
});

// ── TEST 6 — Product model ───────────────────────────────────────────────

describe("TEST 6 — Abfuser product model", () => {
  it("uses the real panel size and absorption data", () => {
    assert.equal(ABFUSER_PRODUCT.widthMm, 700);
    assert.equal(ABFUSER_PRODUCT.heightMm, 1100);
    assert.equal(ABFUSER_PRODUCT.areaM2, 0.77);
    assert.equal(ABFUSER_PRODUCT.absorption[500], 0.85);
    assert.equal(ABFUSER_PRODUCT.absorption[1000], 0.95);
    assert.equal(ABFUSER_PRODUCT.absorption[6000], 0.90);
  });

  it("never recommends Abfusers as bass treatment", () => {
    const result = recommend({
      widthM: 4,
      lengthM: 6,
      heightM: 2.4,
      seating: seatRow(1, 3.6, [1.4, 2.0, 2.6]),
    });
    assert.equal(result.estimatedEffect.bassTreatment, false);
    assert.match(result.estimatedEffect.bassNote, /not a substitute for dedicated bass control/);
    assert.equal(result.estimatedEffect.absorptionByBand[500], 6 * 0.77 * 0.85);
  });
});