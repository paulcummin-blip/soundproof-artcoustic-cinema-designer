/**
 * p9-side-section-geometry.test.mjs
 * ---------------------------------
 * Proves the P9 side section is drawn from the REAL saved geometry:
 *   1. every overhead row is drawn at its real position (never moved),
 *   2. the RSP is drawn at its real room position and ear height,
 *   3. every ray originates at the RSP,
 *   4. every arc is centred on the RSP and spans only the two real rays,
 *   5. only ADJACENT rows are compared,
 *   6. the limiting (largest) adjacent gap is marked, exactly once.
 *
 * The fixture mirrors exactly how the report authority builds the P9 snapshot
 * (per-side row centres averaged into one representative row per row name,
 * elevation = atan2(dz, dy) from the RSP) — the module under test consumes that
 * snapshot verbatim.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  buildP9SideSection,
  p9SidePolarPoint,
  P9_SIDE_ARC_RADIUS_FRACTION,
} from "../components/report/client/p9SideSectionGeometry.js";

const ROOM = { widthM: 4.8, lengthM: 6.4, heightM: 2.4 };
const RSP = { x: 2.4, y: 4.0, z: 1.2 };

// Real installed overhead rows: L/R pairs at one ceiling height.
const ROW_POSITIONS = {
  front: { y: 3.0, z: 2.4 },
  mid: { y: 4.6, z: 2.4 },
  rear: { y: 5.8, z: 2.4 },
};

const ROLES = {
  front: ["TFL", "TFR"],
  mid: ["TML", "TMR"],
  rear: ["TRL", "TRR"],
};

function makeSnapshot() {
  const upperSpeakers = [];
  const representativeRows = [];
  let rowIndex = 0;
  for (const rowName of ["front", "mid", "rear"]) {
    const point = ROW_POSITIONS[rowName];
    for (const role of ROLES[rowName]) {
      upperSpeakers.push({
        role,
        position: { x: rowName === "front" ? 1.4 : 1.6, y: point.y, z: point.z },
      });
    }
    representativeRows.push({
      rowName,
      rowIndex,
      avgY: point.y,
      avgZ: point.z,
      elevDeg: (Math.atan2(point.z - RSP.z, point.y - RSP.y) * 180) / Math.PI,
    });
    rowIndex += 1;
  }
  const representativeGaps = [];
  for (let i = 1; i < representativeRows.length; i++) {
    const prev = representativeRows[i - 1];
    const next = representativeRows[i];
    representativeGaps.push({
      fromRow: prev.rowName,
      toRow: next.rowName,
      deg: Math.abs(next.elevDeg - prev.elevDeg),
      fromElevDeg: prev.elevDeg,
      toElevDeg: next.elevDeg,
    });
  }
  return {
    rsp: RSP,
    earHeightM: RSP.z,
    upperSpeakers,
    representativeRows,
    representativeGaps,
    worstGapDeg: representativeGaps[0].deg,
    level: "L3",
  };
}

test("every overhead row is drawn at its real position — nothing is moved", () => {
  const section = buildP9SideSection({ p9Snapshot: makeSnapshot(), roomDims: ROOM });
  assert.equal(section.rays.length, 3);
  for (const ray of section.rays) {
    const real = ROW_POSITIONS[ray.rowName];
    assert.equal(ray.point.y, real.y);
    assert.equal(ray.point.z, real.z);
    const expected = section.toPx(real.y, real.z);
    assert.equal(ray.px.px, expected.px);
    assert.equal(ray.px.py, expected.py);
    // The installed L/R pair shares one position in side section: one marker,
    // never two shifted apart to separate them. Both roles keep their label.
    assert.equal(ray.speakers.length, 1);
    assert.deepEqual(ray.speakers[0].roles, ROLES[ray.rowName]);
    assert.equal(ray.speakers[0].y, real.y);
    assert.equal(ray.speakers[0].z, real.z);
  }
});

test("the RSP is drawn at its real room position and ear height", () => {
  const section = buildP9SideSection({ p9Snapshot: makeSnapshot(), roomDims: ROOM });
  assert.equal(section.rsp.y, RSP.y);
  assert.equal(section.rsp.z, RSP.z);
  const expected = section.toPx(RSP.y, RSP.z);
  assert.equal(section.rsp.px.px, expected.px);
  assert.equal(section.rsp.px.py, expected.py);
});

test("every ray originates at the RSP, at the real elevation of its row", () => {
  const section = buildP9SideSection({ p9Snapshot: makeSnapshot(), roomDims: ROOM });
  for (const ray of section.rays) {
    const expectedDeg =
      (Math.atan2(ray.point.z - RSP.z, ray.point.y - RSP.y) * 180) / Math.PI;
    assert.ok(Math.abs(ray.elevDeg - expectedDeg) < 1e-9);
    // The drawn ray length is the true RSP→row distance in metres.
    assert.ok(
      Math.abs(ray.lengthM - Math.hypot(ray.point.y - RSP.y, ray.point.z - RSP.z)) < 1e-9,
    );
  }
});

test("every arc is centred on the RSP and its ends lie on the two real rays", () => {
  const section = buildP9SideSection({ p9Snapshot: makeSnapshot(), roomDims: ROOM });
  assert.equal(section.gaps.length, 2);
  for (const gap of section.gaps) {
    // Radius comes from the real rays — never a decorative constant.
    assert.ok(gap.radiusPx > 0);
    const fromRay = section.rays.find((r) => r.rowName === gap.fromRowName);
    const toRay = section.rays.find((r) => r.rowName === gap.toRowName);
    const expectedRadius =
      P9_SIDE_ARC_RADIUS_FRACTION * Math.min(fromRay.lengthM, toRay.lengthM) * section.scale;
    assert.ok(Math.abs(gap.radiusPx - expectedRadius) < 1e-9);

    // Both arc ends are exactly the arc radius from the RSP centre.
    const start = p9SidePolarPoint(section.rsp.px.px, section.rsp.px.py, gap.radiusPx, gap.fromDeg);
    const end = p9SidePolarPoint(section.rsp.px.px, section.rsp.px.py, gap.radiusPx, gap.toDeg);
    for (const pt of [start, end]) {
      const dist = Math.hypot(pt.x - section.rsp.px.px, pt.y - section.rsp.px.py);
      assert.ok(Math.abs(dist - gap.radiusPx) < 1e-6, "arc end must sit on the RSP radius");
    }
    assert.ok(gap.path.startsWith(`M ${start.x} ${start.y}`));
    assert.ok(gap.path.includes(`A ${gap.radiusPx} ${gap.radiusPx}`));

    // The arc spans exactly the two row elevations it claims to compare.
    assert.equal(gap.fromDeg, fromRay.elevDeg);
    assert.equal(gap.toDeg, toRay.elevDeg);
    assert.ok(Math.abs(gap.deg - Math.abs(toRay.elevDeg - fromRay.elevDeg)) < 1e-9);
  }
});

test("only adjacent overhead rows are compared", () => {
  const section = buildP9SideSection({ p9Snapshot: makeSnapshot(), roomDims: ROOM });
  const pairs = section.gaps.map((g) => `${g.fromRowName}→${g.toRowName}`);
  assert.deepEqual(pairs, ["front→mid", "mid→rear"]);
  // No front→rear (non-adjacent) comparison is ever drawn.
  assert.ok(!pairs.some((p) => p === "front→rear"));
});

test("the largest adjacent gap is marked, and it is the only limiting gap", () => {
  const section = buildP9SideSection({ p9Snapshot: makeSnapshot(), roomDims: ROOM });
  const maxDeg = Math.max(...section.gaps.map((g) => g.deg));
  assert.equal(section.limitingGap.deg, maxDeg);
  assert.equal(section.gaps.filter((g) => g.isLimiting).length, 1);
  assert.equal(section.limitingGap.isLimiting, true);
  assert.equal(section.limitingGap.label, "FRONT ↔ MIDDLE");
  // Published level is passed through untouched.
  assert.equal(section.level, "L3");
});

test("no drawing is invented when the geometry cannot support one", () => {
  const twoRows = makeSnapshot();
  assert.equal(
    buildP9SideSection({
      p9Snapshot: { ...twoRows, representativeRows: twoRows.representativeRows.slice(0, 1) },
      roomDims: ROOM,
    }),
    null,
  );
  assert.equal(buildP9SideSection({ p9Snapshot: { ...twoRows, rsp: null }, roomDims: ROOM }), null);
  assert.equal(buildP9SideSection({ p9Snapshot: null, roomDims: ROOM }), null);
});

// ── Real saved geometry: Marquee Home, version "Level 4 version" ──────────
// The row/gap rule used by the RP22 upper-seat metric engine reproduces this
// project's published per-seat P9 values exactly (seat row 1 = 44.521°,
// seat row 2 = 53.142°), so the RSP row geometry asserted here is the engine's
// own geometry — not a re-derived or decorative one.
const MARQUEE_ROOM = { widthM: 5.18, lengthM: 7.29, heightM: 2.8 };
const MARQUEE_RSP = { x: 0, y: 4.636746034861809, z: 1.2 };
const MARQUEE_ROWS = [
  { rowName: "front", rowIndex: 0, avgY: 3.3350529631087165, avgZ: 2.65, roles: ["TFL", "TFR"] },
  { rowName: "mid", rowIndex: 1, avgY: 4.53358458961474, avgZ: 2.65, roles: ["TML", "TMR"] },
  { rowName: "rear", rowIndex: 2, avgY: 5.732116216120764, avgZ: 2.65, roles: ["TRL", "TRR"] },
];

function makeMarqueeSnapshot() {
  const upperSpeakers = [];
  const representativeRows = MARQUEE_ROWS.map((row) => {
    for (const role of row.roles) {
      upperSpeakers.push({ role, position: { x: 1.2190787269681738, y: row.avgY, z: row.avgZ } });
    }
    return {
      rowName: row.rowName,
      rowIndex: row.rowIndex,
      avgY: row.avgY,
      avgZ: row.avgZ,
      elevDeg: (Math.atan2(row.avgZ - MARQUEE_RSP.z, row.avgY - MARQUEE_RSP.y) * 180) / Math.PI,
    };
  });
  return {
    rsp: MARQUEE_RSP,
    earHeightM: 1.2,
    upperSpeakers,
    representativeRows,
    level: "L4",
    worstGapDeg: 41.138,
  };
}

test("real saved geometry: Marquee overhead rows and their P9 angles from the RSP", () => {
  const section = buildP9SideSection({ p9Snapshot: makeMarqueeSnapshot(), roomDims: MARQUEE_ROOM });
  const byRow = Object.fromEntries(section.rays.map((r) => [r.rowName, r]));

  // The real saved speaker rows, at the coordinates the design holds.
  assert.equal(byRow.front.point.y, 3.3350529631087165);
  assert.equal(byRow.mid.point.y, 4.53358458961474);
  assert.equal(byRow.rear.point.y, 5.732116216120764);
  for (const ray of section.rays) assert.equal(ray.point.z, 2.65);

  // Elevations measured from the RSP itself.
  assert.ok(Math.abs(byRow.front.elevDeg - 131.915) < 0.01);
  assert.ok(Math.abs(byRow.mid.elevDeg - 94.069) < 0.01);
  assert.ok(Math.abs(byRow.rear.elevDeg - 52.932) < 0.01);

  // The two adjacent-row gaps that the page draws.
  const [frontMid, midRear] = section.gaps;
  assert.ok(Math.abs(frontMid.deg - 37.846) < 0.01, `front↔mid was ${frontMid.deg}`);
  assert.ok(Math.abs(midRear.deg - 41.137) < 0.01, `mid↔rear was ${midRear.deg}`);

  // The limiting gap is the engine's own RSP worst gap for this version.
  assert.equal(section.limitingGap.deg, midRear.deg);
  assert.equal(section.limitingGap.label, "MIDDLE ↔ REAR");
  assert.equal(section.limitingGap.isLimiting, true);
  assert.equal(section.gaps.filter((g) => g.isLimiting).length, 1);
  assert.ok(Math.abs(section.limitingGap.deg - 41.138) < 0.01);

  // RSP drawn at its saved position and ear height.
  assert.equal(section.rsp.y, MARQUEE_RSP.y);
  assert.equal(section.rsp.z, 1.2);
});