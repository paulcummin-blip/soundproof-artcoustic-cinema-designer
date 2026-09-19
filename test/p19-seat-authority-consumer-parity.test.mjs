import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { summariseAuthoritativeP19Seats } from "../src/components/room/bass/p19SeatAuthority.js";

const seat = (id, row, column, priority) => ({ id, label: id, row, column, priority });
const result = (seatId, level, variationDbRaw) => ({ seatId, level, variationDbRaw });

function publish(seats, results) {
  return summariseAuthoritativeP19Seats({
    authoritativeSeatResults: results,
    primarySeatIds: seats.filter((s) => s.priority === "primary").map((s) => s.id),
    secondarySeatIds: seats.filter((s) => s.priority === "secondary").map((s) => s.id),
    seatingPositions: seats,
  });
}

test("Luxavo P19 publication preserves exact engine grades and priorities", () => {
  const seats = [
    seat("seat-r1-c1", 1, 1, "primary"),
    seat("seat-r1-c2", 1, 2, "primary"),
    seat("seat-r2-c1", 2, 1, "secondary"),
    seat("seat-r2-c2", 2, 2, "secondary"),
    seat("seat-r2-c3", 2, 3, "secondary"),
  ];
  const results = [
    result("seat-r1-c1", "L3", 99),
    result("seat-r1-c2", "L3", 2.7),
    result("seat-r2-c1", "FAIL", 1),
    result("seat-r2-c2", "FAIL", 5.4),
    result("seat-r2-c3", "FAIL", 6.1),
  ];
  const authority = publish(seats, results);

  assert.deepEqual(authority.primary.seatIds, ["seat-r1-c1", "seat-r1-c2"]);
  assert.deepEqual(authority.secondary.seatIds, ["seat-r2-c1", "seat-r2-c2", "seat-r2-c3"]);
  assert.deepEqual(authority.primary.grades, ["L3", "L3"]);
  assert.deepEqual(authority.secondary.grades, ["FAIL", "FAIL", "FAIL"]);
  assert.equal(authority.primary.floor, "L3");
  assert.equal(authority.secondary.floor, "FAIL");
  assert.equal(authority.project.floor, "FAIL");
  assert.equal(authority.bySeatId["seat-r1-c1"].grade, "L3", "raw 99 must not be re-graded");
  assert.equal(authority.bySeatId["seat-r2-c1"].grade, "FAIL", "raw 1 must not be re-graded");
  assert.equal(authority.rows.length, 2);
  assert.ok(Object.isFrozen(authority));
  assert.ok(Object.isFrozen(authority.project));
});

test("same result array and seat snapshot returns the exact same publication object", () => {
  const seats = [seat("p1", 1, 1, "primary"), seat("s1", 2, 1, "secondary")];
  const results = [result("p1", "L4", 1), result("s1", "L2", 4)];
  assert.strictEqual(publish(seats, results), publish(seats.map((s) => ({ ...s })), results));
});

test("row and priority regressions use one grouping authority", () => {
  const scenarios = [
    {
      name: "one row no secondary",
      seats: [seat("p1", 1, 1, "primary"), seat("p2", 1, 2, "primary")],
      results: [result("p1", "L4", 1), result("p2", "L3", 2.5)],
      rows: 1, primary: ["L4", "L3"], secondary: [], projectFloor: "L3",
    },
    {
      name: "two rows mixed pass fail",
      seats: [seat("p1", 1, 1, "primary"), seat("s1", 2, 1, "secondary")],
      results: [result("p1", "L2", 3.5), result("s1", "FAIL", 5.5)],
      rows: 2, primary: ["L2"], secondary: ["FAIL"], projectFloor: "FAIL",
    },
    {
      name: "three rows multiple primary rows",
      seats: [seat("p1", 1, 1, "primary"), seat("p2", 2, 1, "primary"), seat("s1", 3, 1, "secondary")],
      results: [result("p1", "L4", 1), result("p2", "L1", 4.5), result("s1", "L3", 2.5)],
      rows: 3, primary: ["L4", "L1"], secondary: ["L3"], projectFloor: "L1",
    },
  ];
  for (const scenario of scenarios) {
    const authority = publish(scenario.seats, scenario.results);
    assert.equal(authority.rows.length, scenario.rows, scenario.name);
    assert.deepEqual(authority.primary.grades, scenario.primary, scenario.name);
    assert.deepEqual(authority.secondary.grades, scenario.secondary, scenario.name);
    assert.equal(authority.project.floor, scenario.projectFloor, scenario.name);
  }
});

test("production consumers read published P19 authority and do not rebuild it", async () => {
  const paths = [
    "../src/components/rp22/RP22CompliancePanel.jsx",
    "../src/components/report/technical/useParameterGridAuthority.jsx",
    "../src/components/report/client/selectClientBassPerformance.js",
    "../src/pages/ComplianceReportPrint.jsx",
    "../src/pages/RP22Report.jsx",
    "../src/pages/RP22ClientReport.jsx",
    "../src/components/room/bass/bassResultsPresentation.js",
  ];
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /p19SeatAuthority/, path);
    assert.doesNotMatch(source, /summariseAuthoritativeP19Seats/, path);
    assert.doesNotMatch(source, /buildP19SeatRows\(/, path);
  }
});

test("Design Rating consumes authoritativeLevel and contains no P19 raw-value scorer", async () => {
  const source = await readFile(
    new URL("../src/components/report/technical/artcousticSystemDesignRating.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /key === "p19"[\s\S]*authoritativeLevel/);
  assert.doesNotMatch(source, /function scoreP19/);
  assert.doesNotMatch(source, /case "p19": scored/);
});
