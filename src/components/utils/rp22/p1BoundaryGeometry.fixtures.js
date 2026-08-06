/**
 * p1BoundaryGeometry.fixtures
 * ---------------------------
 * Focused assertions for the pure P1 boundary geometry helpers.
 *
 * Run with: node --experimental-vm-modules src/components/utils/rp22/p1BoundaryGeometry.fixtures.js
 * Or import and call runP1BoundaryGeometryFixtures() from a test runner.
 */
import {
  pointToSegmentDistance,
  pointInPolygon,
  clipPolygonToRect,
  pointToPolygonDistance,
  nearestBoundaryDistance,
} from "./p1BoundaryGeometry";

const TOL = 0.001;

function approxEqual(actual, expected, tol = TOL) {
  if (typeof expected === "number" && typeof actual === "number") {
    return Math.abs(actual - expected) <= tol;
  }
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function assertApprox(actual, expected, label, tol = TOL) {
  if (!approxEqual(actual, expected, tol)) {
    console.error(`FAIL: ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
    return false;
  }
  console.log(`PASS: ${label}`);
  return true;
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error(`FAIL: ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
    return false;
  }
  console.log(`PASS: ${label}`);
  return true;
}

export function runP1BoundaryGeometryFixtures() {
  let allPass = true;

  // --- 1. Horizontal segment distance (perpendicular, interior) ---
  // Segment (1,1)-(3,1), point (2, 1.5) → 0.5
  allPass &= assertApprox(pointToSegmentDistance(2, 1.5, 1, 1, 3, 1), 0.5, "horizontal segment interior distance");

  // --- 2. Vertical segment distance (perpendicular, interior) ---
  // Segment (2,1)-(2,3), point (2.5, 2) → 0.5
  allPass &= assertApprox(pointToSegmentDistance(2.5, 2, 2, 1, 2, 3), 0.5, "vertical segment interior distance");

  // --- 3. Segment-corner distance (projection falls outside segment) ---
  // Segment (1,1)-(3,1), point (4, 2) → nearest corner (3,1), distance sqrt(2)
  allPass &= assertApprox(pointToSegmentDistance(4, 2, 1, 1, 3, 1), Math.SQRT2, "segment corner distance (sqrt2)");

  // --- 4. Rotated rectangle EDGE distance ---
  // Diamond: square side 0.2 centred at (2,2), rotated 45°.
  // Corners: (2, 2.1414214), (2.1414214, 2), (2, 1.8585786), (1.8585786, 2).
  const SQ2 = Math.SQRT2;
  const halfDiag = 0.1 * SQ2; // 0.1414214
  const diamond = [
    { x: 2, y: 2 + halfDiag },
    { x: 2 + halfDiag, y: 2 },
    { x: 2, y: 2 - halfDiag },
    { x: 2 - halfDiag, y: 2 },
  ];
  // Point above the midpoint of the top-right edge, perpendicular distance 0.25.
  // Top-right edge midpoint = (2 + halfDiag/2, 2 + halfDiag/2). Outward normal (1/√2, 1/√2).
  const edgeMidX = 2 + halfDiag / 2;
  const edgeMidY = 2 + halfDiag / 2;
  const edgePoint = { x: edgeMidX + 0.25 / SQ2, y: edgeMidY + 0.25 / SQ2 };
  allPass &= assertApprox(pointToPolygonDistance(edgePoint.x, edgePoint.y, diamond), 0.25, "rotated rectangle edge distance");

  // --- 5. Rotated rectangle CORNER distance ---
  // Point directly above the top corner (2, 2 + halfDiag), at (2, 2.5).
  const cornerPoint = { x: 2, y: 2.5 };
  allPass &= assertApprox(
    pointToPolygonDistance(cornerPoint.x, cornerPoint.y, diamond),
    2.5 - (2 + halfDiag),
    "rotated rectangle corner distance"
  );

  // --- 6. Point inside polygon → 0 ---
  allPass &= assertApprox(pointToPolygonDistance(2, 2, diamond), 0, "point inside rotated polygon → 0");
  allPass &= assertEqual(pointInPolygon(2, 2, diamond), true, "pointInPolygon inside → true");
  allPass &= assertEqual(pointInPolygon(edgePoint.x, edgePoint.y, diamond), false, "pointInPolygon outside → false");

  // --- 7. Polygon partially outside room is clipped ---
  // Room 5x5. Obstacle rectangle from (-1, 2) to (0.5, 3) — extends beyond left wall.
  // Clipped to (0,2)-(0.5,2)-(0.5,3)-(0,3). Point (2, 2.5) → nearest edge x=0.5, distance 1.5.
  const clippedPoly = clipPolygonToRect(
    [{ x: -1, y: 2 }, { x: 0.5, y: 2 }, { x: 0.5, y: 3 }, { x: -1, y: 3 }],
    5,
    5
  );
  allPass &= assertEqual(clippedPoly.length, 4, "partially-outside polygon clipped to 4 vertices");
  allPass &= assertEqual(
    clippedPoly.some((p) => p.x === 0 && p.y === 2),
    true,
    "clipped polygon includes room-boundary vertex (0,2)"
  );
  allPass &= assertApprox(pointToPolygonDistance(2, 2.5, clippedPoly), 1.5, "clipped polygon distance to in-room point");

  // Polygon entirely outside the room is clipped to empty → obstacle dropped.
  const fullyOutside = clipPolygonToRect(
    [{ x: -2, y: 2 }, { x: -1, y: 2 }, { x: -1, y: 3 }, { x: -2, y: 3 }],
    5,
    5
  );
  allPass &= assertEqual(fullyOutside.length, 0, "fully-outside polygon clipped to empty");

  // --- 8. Invalid room or point returns an invalid result ---
  allPass &= assertEqual(
    nearestBoundaryDistance({ point: { x: 1, y: 1 }, room: { widthM: 0, lengthM: 5 } }).valid,
    false,
    "zero width → invalid"
  );
  allPass &= assertEqual(
    nearestBoundaryDistance({ point: { x: 1, y: 1 }, room: { widthM: 5, lengthM: -1 } }).valid,
    false,
    "negative length → invalid"
  );
  allPass &= assertEqual(
    nearestBoundaryDistance({ point: { x: NaN, y: 1 }, room: { widthM: 5, lengthM: 5 } }).valid,
    false,
    "NaN point → invalid"
  );
  allPass &= assertEqual(
    nearestBoundaryDistance({ point: { x: 1, y: 1 }, room: { widthM: "w", lengthM: 5 } }).valid,
    false,
    "non-numeric room → invalid"
  );
  allPass &= assertEqual(
    nearestBoundaryDistance({ point: null, room: { widthM: 5, lengthM: 5 } }).valid,
    false,
    "null point → invalid"
  );

  // --- 9. Wall identification (no obstacles) ---
  // Room 5x5. Point (1, 2.5) → left wall, distance 1.
  const wallLeft = nearestBoundaryDistance({ point: { x: 1, y: 2.5 }, room: { widthM: 5, lengthM: 5 } });
  allPass &= assertApprox(wallLeft.distanceM, 1, "wall-only left distance");
  allPass &= assertEqual(wallLeft.nearestKind, "wall", "wall-only left kind");
  allPass &= assertEqual(wallLeft.nearestBoundary, "left", "wall-only left boundary");

  const wallRight = nearestBoundaryDistance({ point: { x: 4, y: 2.5 }, room: { widthM: 5, lengthM: 5 } });
  allPass &= assertApprox(wallRight.distanceM, 1, "wall-only right distance");
  allPass &= assertEqual(wallRight.nearestBoundary, "right", "wall-only right boundary");

  const wallFront = nearestBoundaryDistance({ point: { x: 2.5, y: 1 }, room: { widthM: 5, lengthM: 5 } });
  allPass &= assertEqual(wallFront.nearestBoundary, "front", "wall-only front boundary");

  const wallRear = nearestBoundaryDistance({ point: { x: 2.5, y: 4 }, room: { widthM: 5, lengthM: 5 } });
  allPass &= assertEqual(wallRear.nearestBoundary, "rear", "wall-only rear boundary");

  // --- 10. CURRENT PROJECT FIXTURE ---
  // Room width 4.55, length 4.95. Audited side-speaker rectangles.
  const ROOM = { widthM: 4.55, lengthM: 4.95 };
  const SL = {
    id: "SL",
    role: "surround",
    polygon: [
      { x: 0.01, y: 3.1 },
      { x: 0.092, y: 3.1 },
      { x: 0.092, y: 3.3 },
      { x: 0.01, y: 3.3 },
    ],
  };
  const SR = {
    id: "SR",
    role: "surround",
    polygon: [
      { x: 4.458, y: 3.1 },
      { x: 4.54, y: 3.1 },
      { x: 4.54, y: 3.3 },
      { x: 4.458, y: 3.3 },
    ],
  };
  const obstacles = [SL, SR];
  const seats = [
    { x: 1.075, y: 2.8 },
    { x: 1.875, y: 2.8 },
    { x: 2.675, y: 2.8 },
    { x: 3.475, y: 2.8 },
  ];
  const expectedBaffle = [1.027759, 1.808062, 1.808062, 1.027759];
  const expectedBaffleId = ["SL", "SL", "SR", "SR"];

  seats.forEach((seat, i) => {
    const r = nearestBoundaryDistance({ point: seat, room: ROOM, obstacles });
    allPass &= assertApprox(r.distanceM, expectedBaffle[i], `current project seat ${i + 1} baffle distance (${expectedBaffleId[i]})`, TOL);
    allPass &= assertEqual(r.nearestKind, "baffle", `current project seat ${i + 1} kind`);
    allPass &= assertEqual(r.nearestId, expectedBaffleId[i], `current project seat ${i + 1} nearestId`);
    allPass &= assertEqual(r.nearestRole, "surround", `current project seat ${i + 1} nearestRole`);
    allPass &= assertEqual(r.nearestBoundary, null, `current project seat ${i + 1} nearestBoundary null for baffle`);
    allPass &= assertEqual(r.valid, true, `current project seat ${i + 1} valid`);
  });

  // --- 11. Same seats with NO obstacles → wall-only distances ---
  const expectedWall = [1.075, 1.875, 1.875, 1.075];
  const expectedWallBoundary = ["left", "left", "right", "right"];
  seats.forEach((seat, i) => {
    const r = nearestBoundaryDistance({ point: seat, room: ROOM, obstacles: [] });
    allPass &= assertApprox(r.distanceM, expectedWall[i], `current project seat ${i + 1} wall-only distance`, TOL);
    allPass &= assertEqual(r.nearestKind, "wall", `current project seat ${i + 1} wall-only kind`);
    allPass &= assertEqual(r.nearestBoundary, expectedWallBoundary[i], `current project seat ${i + 1} wall-only boundary`);
  });

  // --- 12. Rotated footprint is NOT reduced to AABB ---
  // Tall thin diamond: top (3,4), right (3.05,3), bottom (3,2), left (2.95,3).
  // Point (3.5, 3.2): the true nearest feature is the top-right EDGE (3,4)-(3.05,3),
  // not the axis-aligned bounding box. AABB distance = 0.45 (pure x-gap); the true
  // polygon edge distance is larger because the nearest edge is slanted.
  const tallDiamond = [
    { x: 3, y: 4 },
    { x: 3.05, y: 3 },
    { x: 3, y: 2 },
    { x: 2.95, y: 3 },
  ];
  const rotPoint = { x: 3.5, y: 3.2 };
  const trueRot = pointToPolygonDistance(rotPoint.x, rotPoint.y, tallDiamond);
  const expectedEdge = pointToSegmentDistance(3.5, 3.2, 3, 4, 3.05, 3);
  allPass &= assertApprox(trueRot, expectedEdge, "rotated footprint true edge distance");

  // AABB distance for the same point
  const xs = tallDiamond.map((p) => p.x);
  const ys = tallDiamond.map((p) => p.y);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ymin = Math.min(...ys), ymax = Math.max(...ys);
  const aabbDx = Math.max(xmin - rotPoint.x, 0, rotPoint.x - xmax);
  const aabbDy = Math.max(ymin - rotPoint.y, 0, rotPoint.y - ymax);
  const aabbDist = Math.sqrt(aabbDx * aabbDx + aabbDy * aabbDy);
  allPass &= assertEqual(approxEqual(trueRot, aabbDist), false, "rotated distance differs from AABB distance");
  allPass &= assertApprox(aabbDist, 0.45, "AABB distance is 0.45 (x-gap only)");

  console.log(allPass ? "\nALL P1 BOUNDARY GEOMETRY FIXTURES PASSED" : "\nSOME P1 BOUNDARY GEOMETRY FIXTURES FAILED");
  return Boolean(allPass);
}

// Fixtures are run by importing runP1BoundaryGeometryFixtures() from a test runner.