/**
 * clientReportSelectorsAssertions
 * ------------------------------
 * Development-only deterministic assertions for the client report selectors.
 * Runs only in Vite dev mode.
 *
 * Covers:
 *   1. Missing authority
 *   2. Discrete seat mapping
 *   3. Bass authority split
 *   4. Pillar completeness
 *   5. P5/P9 canonical display precedence (structural verification)
 */
import { selectClientSeatCoverage } from "./selectClientSeatCoverage";
import { selectClientDynamics } from "./selectClientDynamics";
import { selectClientBass } from "./selectClientBass";
import { selectClientParameterResults } from "./selectClientParameterResults";
import { assertPillarGroupingComplete } from "./rp22PillarGrouping";

const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;

export function runClientReportSelectorAssertions() {
  if (!isDev) return { ran: false, results: [] };

  const results = [];
  const check = (name, passed, detail) =>
    results.push({ name, passed: !!passed, detail: detail || null });

  // 1. Missing authority
  const emptySeats = selectClientSeatCoverage(null, []);
  check("1a. Missing authority returns empty array", Array.isArray(emptySeats) && emptySeats.length === 0);

  const emptyDynamics = selectClientDynamics(null, null);
  check("1b. Missing dynamics returns null P12/P13/P14", emptyDynamics.p12 === null && emptyDynamics.p13 === null && emptyDynamics.p14 === null);

  const emptyBass = selectClientBass(null, null);
  check("1c. Missing bass returns null", emptyBass === null);

  const emptyParams = selectClientParameterResults(null, null);
  check("1d. Missing params returns 21 room slots", Object.keys(emptyParams.room).length === 21);

  // 2. Discrete seat mapping
  const mockAnalysis = {
    perSeatRp22: {
      "seat-1": {
        rp22: {
          4: { valueDb: 2.5, level: 3, formatted: "2 dB" },
          6: { valueDb: 4.1, level: 2, formatted: "4 dB" },
          10: { value: 3.2, level: 3, formatted: "±3.2 dB" },
        },
      },
    },
    gradedParameters: { primary: { 12: { value: 105, level: "L2", formatted: "105 dB" } } },
  };
  const seats = [{ id: "seat-1", x: 1, y: 2, z: 1.2, isPrimary: true }];
  const coverage = selectClientSeatCoverage(mockAnalysis, seats);
  check(
    "2. Seat coverage maps P4/P6/P10 from perSeatRp22",
    coverage.length === 1 && coverage[0].p4.level === 3 && coverage[0].p6.level === 2 && coverage[0].p10.level === 3
  );

  // 3. Bass authority split
  const mockBassPresentation = {
    parameters: {
      p14: {
        valueText: "105 dB",
        level: "L2",
        isAuthoritative: true,
        achievedCapabilityDb: 105,
        requestedTargetDb: 102,
        headroomOrShortfallDb: 3,
      },
    },
  };
  const dynamics = selectClientDynamics(mockAnalysis, mockBassPresentation);
  check(
    "3. P14 from bass presentation, P12 from engine",
    dynamics.p14.achievedCapabilityDb === 105 && dynamics.p14.headroomOrShortfallDb === 3 && dynamics.p12.value === 105
  );

  // 4. Pillar completeness
  const pillarResult = assertPillarGroupingComplete();
  check("4. Pillar grouping complete (P1–P21 each once)", pillarResult.ok, pillarResult.errors.join("; "));

  // 5. P5/P9 canonical display precedence — structural verification
  const mockWithP5 = {
    perSeatRp22: {
      "seat-1": { rp22: { 5: { value: 55.0, level: 4, formatted: "55°" }, 9: { value: 45.0, level: 4, formatted: "45°" } } },
    },
    gradedParameters: { primary: {} },
  };
  const params = selectClientParameterResults(mockWithP5, {});
  check(
    "5. P5/P9 available in perSeat (canonical source for display)",
    params.perSeat["seat-1"]?.rp22?.[5]?.value === 55.0 && params.perSeat["seat-1"]?.rp22?.[9]?.value === 45.0
  );

  return { ran: true, results };
}