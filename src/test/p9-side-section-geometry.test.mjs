/**
 * p9-side-section-geometry.test.mjs
 * ---------------------------------
 * Proves the redesigned P9 visual page is SEAT-scoped and drawn from the real
 * saved geometry:
 *
 *   1. the page is only applicable with two or more overhead rows,
 *   2. the seat scope carries every seat's own PUBLISHED result,
 *   3. each seating row's listening point is a real seat at its real ear height,
 *   4. every overhead row is drawn at its real installed position — never moved,
 *   5. each row's rays originate at that row's own listening point,
 *   6. only ADJACENT overhead rows are compared, and the limiting gap for each
 *      row is its own largest adjacent gap,
 *   7. the drawn geometry agrees with the published per-seat result,
 *   8. the two adjacent gaps are drawn as two visibly different wedges, and only
 *      the limiting gap gets the heavier outline,
 *   9. no RSP fan exists: nothing is measured or drawn from the RSP,
 *  10. nothing is invented when the geometry cannot support a drawing.
 *
 * The fixture is the real Marquee Home design: the published per-seat P9 results
 * for its two seating rows are 44.5° · L4 (4 seats) and 53.1° · L3 (5 seats), and
 * the geometry below reproduces them from the saved speaker centres and the real
 * per-seat ear heights.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  buildP9SeatScopeSection,
  p9SidePolarPoint,
  P9_SIDE_ARC_RADIUS_FRACTION,
  P9_WEDGE_FILLS,
  P9_WEDGE_FILL_OPACITY,
  P9_WEDGE_LIMITING_INK,
} from "../components/report/client/p9SideSectionGeometry.js";
import {
  buildP9SeatScope,
  isP9ReportApplicable,
} from "../components/report/client/p9SeatScopeAuthority.js";

const ROOM = { widthM: 5.18, lengthM: 7.29, heightM: 2.8 };

// Real installed overhead rows: L/R pairs at one ceiling height.
const ROWS = [
  { rowName: "front", rowIndex: 0, avgY: 3.3350529631087165, avgZ: 2.65, roles: ["TFL", "TFR"] },
  { rowName: "mid", rowIndex: 1, avgY: 4.53358458961474, avgZ: 2.65, roles: ["TML", "TMR"] },
  { rowName: "rear", rowIndex: 2, avgY: 5.732116216120764, avgZ: 2.65, roles: ["TRL", "TRR"] },
];

// Real seating: front row at 1.2 m ear height, rear row on its riser at 1.6 m.
const SEAT_ROWS = [
  {
    y: 3.780110153632747,
    z: 1.2,
    angle: 44.5,
    level: "L4",
    seats: [
      { id: "seat-r1-c1", x: 1.69, priority: "secondary" },
      { id: "seat-r1-c2", x: 2.29, priority: "primary" },
      { id: "seat-r1-c3", x: 2.8899999999999997, priority: "primary" },
      { id: "seat-r1-c4", x: 3.4899999999999998, priority: "secondary" },
    ],
  },
  {
    y: 5.580110153632747,
    z: 1.6,
    angle: 53.1,
    level: "L3",
    seats: [
      { id: "seat-r2-c1", x: 1.39, priority: "secondary" },
      { id: "seat-r2-c2", x: 1.9899999999999998, priority: "secondary" },
      { id: "seat-r2-c3", x: 2.59, priority: "primary" },
      { id: "seat-r2-c4", x: 3.1899999999999995, priority: "secondary" },
      { id: "seat-r2-c5", x: 3.79, priority: "secondary" },
    ],
  },
];

/** The published seat rows exactly as selectClientP9Overhead hands them over. */
function makeSeats() {
  return SEAT_ROWS.flatMap((row) =>
    row.seats.map((seat) => ({
      id: seat.id,
      x: seat.x,
      y: row.y,
      z: row.z,
      priority: seat.priority,
      isPrimary: seat.priority === "primary",
      p9Level: row.level,
      p9Degrees: row.angle,
      applicable: true,
    })),
  );
}

function makeRsp() {
  return { x: 2.59, y: 4.636746034861809, z: 1.2 };
}

function makeSnapshot() {
  const upperSpeakers = [];
  const representativeRows = ROWS.map((row) => {
    for (const role of row.roles) {
      upperSpeakers.push({ role, position: { x: 1.2190787269681738, y: row.avgY, z: row.avgZ } });
    }
    return {
      rowName: row.rowName,
      rowIndex: row.rowIndex,
      avgY: row.avgY,
      avgZ: row.avgZ,
      elevDeg: Math.atan2(row.avgZ - 1.2, row.avgY - 4.636746034861809) * 180 / Math.PI,
    };
  });
  return {
    rsp: makeRsp(),
    earHeightM: 1.2,
    upperSpeakers,
    representativeRows,
    level: "L3",
    value: 53.1424,
    worstGapDeg: 53.1424,
  };
}

function build() {
  const seatScope = buildP9SeatScope({ seats: makeSeats() });
  const section = buildP9SeatScopeSection({
    p9Snapshot: makeSnapshot(),
    seatScope,
    roomDims: ROOM,
  });
  return { seatScope, section };
}

test("P9 is only applicable with two or more overhead rows", () => {
  const snapshot = makeSnapshot();
  assert.equal(isP9ReportApplicable(snapshot), true);
  assert.equal(
    isP9ReportApplicable({ ...snapshot, representativeRows: snapshot.representativeRows.slice(0, 1) }),
    false,
  );
  assert.equal(isP9ReportApplicable({ ...snapshot, representativeRows: [] }), false);
  assert.equal(isP9ReportApplicable(null), false);
});

test("the seat scope carries every seat's own published result, by physical row", () => {
  const { seatScope } = build();
  assert.equal(seatScope.rows.length, 2);

  const [front, rear] = seatScope.rows;
  assert.equal(front.label, "Front row");
  assert.equal(front.seatCount, 4);
  assert.equal(front.angle, 44.5);
  assert.equal(front.level, "L4");
  assert.deepEqual(front.seats.map((seat) => seat.angle), [44.5, 44.5, 44.5, 44.5]);
  assert.deepEqual(front.seats.map((seat) => seat.level), ["L4", "L4", "L4", "L4"]);

  assert.equal(rear.label, "Rear row");
  assert.equal(rear.seatCount, 5);
  assert.equal(rear.angle, 53.1);
  assert.equal(rear.level, "L3");
  assert.deepEqual(rear.seats.map((seat) => seat.angle), [53.1, 53.1, 53.1, 53.1, 53.1]);

  // Seat identities and priorities survive untouched (Primary heavier outline).
  assert.equal(front.seats[0].label, "Row 1 - Seat 1");
  assert.equal(front.seats[0].priority, "secondary");
  assert.equal(front.seats[1].priority, "primary");
  assert.equal(rear.seats[2].label, "Row 2 - Seat 3");
  assert.equal(rear.seats[2].priority, "primary");

  // The project's limiting seat is the rear-row seat with the largest angle.
  assert.equal(seatScope.projectResult.angle, 53.1);
  assert.equal(seatScope.projectResult.level, "L3");
  assert.equal(seatScope.projectResult.seatLabel, "Row 2 - Seat 1");
  assert.equal(seatScope.projectResult.rowLabel, "Rear row");
});

test("each seating row's listening point is a real seat at its real ear height", () => {
  const { section } = build();
  assert.equal(section.views.length, 2);

  const [frontView, rearView] = section.views;
  // Front row: its limiting seat's own depth and 1.2 m ear height.
  assert.equal(frontView.listening.y, SEAT_ROWS[0].y);
  assert.equal(frontView.listening.z, SEAT_ROWS[0].z);
  assert.deepEqual(frontView.px, section.toPx(SEAT_ROWS[0].y, SEAT_ROWS[0].z));
  // Rear row: its own riser ear height, never flattened to the front row's.
  assert.equal(rearView.listening.y, SEAT_ROWS[1].y);
  assert.equal(rearView.listening.z, SEAT_ROWS[1].z);
  assert.deepEqual(rearView.px, section.toPx(SEAT_ROWS[1].y, SEAT_ROWS[1].z));

  // It is a seat, not the reference seating position.
  const rspPx = section.toPx(makeRsp().y, makeRsp().z);
  for (const view of section.views) {
    assert.notDeepEqual(view.px, rspPx);
  }
});

test("every overhead row is drawn at its real installed position — nothing is moved", () => {
  const { section } = build();
  assert.equal(section.rows.length, 3);
  for (const row of section.rows) {
    const real = ROWS.find((entry) => entry.rowName === row.rowName);
    assert.equal(row.point.y, real.avgY);
    assert.equal(row.point.z, real.avgZ);
    assert.deepEqual(row.px, section.toPx(real.avgY, real.avgZ));
    // The installed L/R pair shares one position in side section: one marker,
    // never two shifted apart to separate them.
    assert.equal(row.speakers.length, 1);
    assert.deepEqual(row.speakers[0].roles, real.roles);
  }
});

test("each row's rays originate at that row's own listening point", () => {
  const { section } = build();
  for (const view of section.views) {
    assert.equal(view.rays.length, section.rows.length);
    for (const ray of view.rays) {
      const row = section.rows.find((entry) => entry.rowName === ray.rowName);
      const expectedDeg =
        (Math.atan2(row.point.z - view.listening.z, row.point.y - view.listening.y) * 180) / Math.PI;
      assert.ok(Math.abs(ray.elevDeg - expectedDeg) < 1e-9);
      assert.ok(
        Math.abs(ray.lengthM - Math.hypot(row.point.y - view.listening.y, row.point.z - view.listening.z)) < 1e-9,
      );
    }
  }
});

test("only adjacent overhead rows are compared, and each row's limiting gap is its own largest", () => {
  const { section } = build();
  for (const view of section.views) {
    const pairs = view.wedges.map((wedge) => `${wedge.fromRowName}→${wedge.toRowName}`);
    assert.deepEqual(pairs, ["front→mid", "mid→rear"]);
    assert.ok(!pairs.includes("front→rear"));

    const maxDeg = Math.max(...view.wedges.map((wedge) => wedge.deg));
    assert.equal(view.limitingWedge.deg, maxDeg);
    assert.equal(view.wedges.filter((wedge) => wedge.isLimiting).length, 1);
    assert.equal(view.limitingWedge.isLimiting, true);
  }

  const [frontView, rearView] = section.views;
  // The front row's limiting gap is the front↔middle pair...
  assert.equal(frontView.limitingWedge.label, "FRONT ↔ MIDDLE");
  // ...and the rear row's is the middle↔rear pair: that is why the rows differ.
  assert.equal(rearView.limitingWedge.label, "MIDDLE ↔ REAR");
});

test("the drawn geometry agrees with the published per-seat result", () => {
  const { seatScope, section } = build();
  const [frontView, rearView] = section.views;

  for (const [view, seatRow] of [[frontView, seatScope.rows[0]], [rearView, seatScope.rows[1]]]) {
    // The published row result, and the geometry drawn from that row's own point.
    assert.ok(Math.abs(view.angle - seatRow.angle) < 1e-9);
    assert.ok(
      Math.abs(view.limitingWedge.deg - seatRow.angle) <= 0.05,
      `${seatRow.label}: drawn ${view.limitingWedge.deg} vs published ${seatRow.angle}`,
    );
  }

  // Marquee's published authority, unchanged: 44.5° · L4 and 53.1° · L3.
  assert.ok(Math.abs(frontView.limitingWedge.deg - 44.5) <= 0.05);
  assert.ok(Math.abs(rearView.limitingWedge.deg - 53.1) <= 0.05);
  assert.ok(frontView.wedges[1].deg < frontView.limitingWedge.deg);
  assert.ok(rearView.wedges[0].deg < rearView.limitingWedge.deg);
});

test("the two adjacent gaps are drawn as two different, low-opacity wedges", () => {
  const { section } = build();
  assert.equal(P9_WEDGE_FILLS.length, 2);
  assert.notEqual(P9_WEDGE_FILLS[0], P9_WEDGE_FILLS[1]);
  assert.ok(P9_WEDGE_FILL_OPACITY >= 0.12 && P9_WEDGE_FILL_OPACITY <= 0.18);
  assert.equal(P9_WEDGE_LIMITING_INK, "#4A230F");

  for (const view of section.views) {
    assert.deepEqual(view.wedges.map((wedge) => wedge.fill), P9_WEDGE_FILLS);
  }
});

test("every wedge stays inside the two real rays it compares", () => {
  const { section } = build();
  for (const view of section.views) {
    for (const wedge of view.wedges) {
      const fromRay = view.rays.find((ray) => ray.rowName === wedge.fromRowName);
      const toRay = view.rays.find((ray) => ray.rowName === wedge.toRowName);
      const expectedRadius =
        P9_SIDE_ARC_RADIUS_FRACTION * Math.min(fromRay.lengthM, toRay.lengthM) * section.scale;
      assert.ok(Math.abs(wedge.radiusPx - expectedRadius) < 1e-9);

      // The wedge starts at the listening point and its arc ends lie on the rays.
      assert.ok(wedge.sectorPath.startsWith(`M ${view.px.px} ${view.px.py} L`));
      assert.equal(wedge.fromDeg, fromRay.elevDeg);
      assert.equal(wedge.toDeg, toRay.elevDeg);
      assert.ok(Math.abs(wedge.deg - Math.abs(toRay.elevDeg - fromRay.elevDeg)) < 1e-9);

      for (const deg of [wedge.fromDeg, wedge.toDeg]) {
        const pt = p9SidePolarPoint(view.px.px, view.px.py, wedge.radiusPx, deg);
        const dist = Math.hypot(pt.x - view.px.px, pt.y - view.px.py);
        assert.ok(Math.abs(dist - wedge.radiusPx) < 1e-6);
      }
      assert.ok(wedge.arcPath.includes(`A ${wedge.radiusPx} ${wedge.radiusPx}`));
    }
  }
});

test("no RSP fan: nothing in the section is measured or drawn from the RSP", () => {
  const { section } = build();
  assert.equal(section.rsp, undefined);
  for (const view of section.views) {
    for (const ray of view.rays) {
      const rspPx = section.toPx(makeRsp().y, makeRsp().z);
      assert.ok(ray.px.px !== undefined);
      assert.notDeepEqual(view.px, rspPx);
    }
  }
});

test("no drawing is invented when the geometry cannot support one", () => {
  const snapshot = makeSnapshot();
  const seatScope = buildP9SeatScope({ seats: makeSeats() });

  // A single overhead row cannot be compared with anything.
  assert.equal(
    buildP9SeatScopeSection({
      p9Snapshot: { ...snapshot, representativeRows: snapshot.representativeRows.slice(0, 1) },
      seatScope,
      roomDims: ROOM,
    }),
    null,
  );
  // No seating row carrying a published result: nothing to draw from.
  assert.equal(
    buildP9SeatScopeSection({ p9Snapshot: snapshot, seatScope: { rows: [] }, roomDims: ROOM }),
    null,
  );
  assert.equal(buildP9SeatScopeSection({ p9Snapshot: null, seatScope, roomDims: ROOM }), null);
});