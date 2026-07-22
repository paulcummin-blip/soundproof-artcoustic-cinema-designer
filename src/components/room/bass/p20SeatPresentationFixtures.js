import { buildP20BeforeAfter, buildP20SeatRows, formatAuthoritativeP20Result, p20SummaryFromResults } from "./p20SeatPresentation.js";

const seats = [
  { id: "s1", row: 1, column: 1 }, { id: "s2", row: 1, column: 2 },
  { id: "s3", row: 1, column: 3 }, { id: "s4", row: 1, column: 4 },
];
const result = (seatId, level, variationDbRaw) => ({ seatId, level, variationDbRaw, displayVariationDb: `±${Math.floor(variationDbRaw)} dB`, worstFrequencyHz: 63, comparisonPointCount: 41 });
const baseline = [result("s1", 4, 1.2), result("s2", 3, 2.6), result("s3", 2, 3.7), result("s4", 4, 1.8)];

export function runP20SeatPresentationFixtures() {
  const checks = [];
  const check = (name, passed) => checks.push({ name, passed: !!passed });
  const oneRow = buildP20SeatRows(seats, baseline);
  check("1. Four seats render in one row", oneRow.length === 1 && oneRow[0].seats.length === 4);
  const twoRows = buildP20SeatRows([...seats.slice(0, 2), { ...seats[2], row: 2, column: 1 }, { ...seats[3], row: 2, column: 2 }], baseline);
  check("2. P20 pills preserve exact physical row and column placement", twoRows.length === 2 && twoRows.every((row) => row.seats.length === 2) && twoRows.flatMap((row) => row.seats.map((seat) => `${seat.row}:${seat.column}:${seat.seatId}`)).join("|") === "1:1:s1|1:2:s2|2:1:s3|2:2:s4");
  check("3. Every tile uses its own authoritative level", oneRow[0].seats.map((seat) => seat.level).join(",") === "L4,L3,L2,L4");
  const changed = baseline.map((item) => item.seatId === "s2" ? { ...item, level: 1, variationDbRaw: 4.4, displayVariationDb: "±4 dB" } : item);
  const comparison = buildP20BeforeAfter(seats, baseline, changed);
  check("4. One changed result changes only one tile", comparison.seatsAffected === 1 && comparison.changedSeatIds[0] === "s2");
  const worst = p20SummaryFromResults(baseline);
  check("5. Worst summary uses lowest level then highest variation", worst.seatId === "s3" && worst.level === "L2" && worst.displayVariationDb === "±3 dB");
  const missing = buildP20SeatRows(seats, baseline.filter((item) => item.seatId !== "s4"));
  check("6. Missing seat data displays dash", missing[0].seats[3].level === "—");
  const excluded = buildP20SeatRows([...seats, { id: "rsp", row: 1, column: 5 }, { id: "mlp", row: 1, column: 6 }, { id: "synthetic", row: 1, column: 7, __isSyntheticRsp: true }], [...baseline, result("rsp", 4, 1), result("mlp", 4, 1), result("synthetic", 4, 1)]);
  check("7. RSP MLP and synthetic RSP are excluded", excluded.flatMap((row) => row.seats).length === 4);
  check("8. Before and after preserve identical positions", comparison.beforeRows.map((row) => row.seats.map((seat) => `${seat.row}:${seat.column}:${seat.seatId}`)).join("|") === comparison.afterRows.map((row) => row.seats.map((seat) => `${seat.row}:${seat.column}:${seat.seatId}`)).join("|"));
  const candidate = { perSeatP20Results: changed };
  const authoritative = buildP20SeatRows(seats, candidate.perSeatP20Results);
  check("9. Presentation reads selected candidate perSeatP20Results", authoritative[0].seats[1].level === "L1" && authoritative[0].seats[1].source === changed[1]);
  check("10. Canonical P20 formatter preserves numeric zero", formatAuthoritativeP20Result({ variationDbRaw: 0.2 }) === "±0 dB");
  check("11. Canonical P20 formatter floors 4.9 and preserves 5.0", formatAuthoritativeP20Result({ variationDbRaw: 4.9 }) === "±4 dB" && formatAuthoritativeP20Result({ variationDbRaw: 5.0 }) === "±5 dB");
  check("12. Numeric and formatted P20 levels never double-prefix", buildP20SeatRows(seats.slice(0, 2), [result("s1", 4, 1.2), result("s2", "L4", 1.2)])[0].seats.every((seat) => seat.level === "L4"));
  return { checks, passed: checks.filter((item) => item.passed).length, total: checks.length, allPassed: checks.every((item) => item.passed) };
}