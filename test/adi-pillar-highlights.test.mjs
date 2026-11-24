// adi-pillar-highlights.test.mjs
// Validates the redesigned ADI Design Highlights builder consolidates
// performance into the three RP22 pillars, selects parameters adaptively by
// ASDR weight, shows every assessed seat for seat-scoped parameters, excludes
// assumed parameters, and carries the compact RP22 Performance Overview.
//
// Run: node --import ./test/_mount-loader.mjs test/adi-pillar-highlights.test.mjs

import assert from "node:assert/strict";
import { buildAdiPillarHighlights, ADI_PILLARS } from "../src/components/report/projectReport/adiPillarHighlights.js";

// ── Fixture helpers ───────────────────────────────────────────────────────
// A scored parameter authority entry. scope 'seat' carries a seats map; the
// governed floor is the weakest assessed seat.
function authorityEntry({ key, level, scope, weight, seats = null, state = 'scored' }) {
  return { key, state, level, scope, weight, effectiveWeight: weight, seats };
}

function seatMap(seats) {
  const map = {};
  for (const s of seats) {
    map[s.id] = { state: 'scored', level: s.level, valueFormatted: s.value || null, isPrimary: s.isPrimary === true, row: s.row };
  }
  return map;
}

// ── Test 1: three pillars in canonical order ───────────────────────────────
{
  const summary = {
    parameterAuthority: {
      p2: authorityEntry({ key: 'p2', level: 'L4', scope: 'room', weight: 8 }),
      p5: authorityEntry({ key: 'p5', level: 'L3', scope: 'seat', weight: 6, seats: seatMap([
        { id: 's1', row: 1, level: 'L3', isPrimary: true },
        { id: 's2', row: 1, level: 'L2', isPrimary: false },
      ]) }),
      p12: authorityEntry({ key: 'p12', level: 'L4', scope: 'room', weight: 8 }),
      p17: authorityEntry({ key: 'p17', level: 'L3', scope: 'seat', weight: 5, seats: seatMap([
        { id: 's1', row: 1, level: 'L3', isPrimary: true },
      ]) }),
      p18: authorityEntry({ key: 'p18', level: 'L3', scope: 'room', weight: 12 }),
    },
    roomResultsByParameter: {
      2: { level: 'L4', formatted: '9 channels' },
      12: { level: 'L4', formatted: '105 dBC' },
      18: { level: 'L3', formatted: '20 Hz' },
    },
    project: {
      reportCounts: {
        seatResultsByParameter: {
          p5: [
            { seatId: 's1', row: 1, level: 'L3', status: 'scored', isPrimary: true, valueFormatted: '110°' },
            { seatId: 's2', row: 1, level: 'L2', status: 'scored', isPrimary: false, valueFormatted: '122°' },
          ],
          p17: [
            { seatId: 's1', row: 1, level: 'L3', status: 'scored', isPrimary: true },
          ],
        },
      },
    },
  };

  const { pillars, overview } = buildAdiPillarHighlights({ engineeringSummary: summary });

  assert.equal(pillars.length, 3, 'exactly three pillars');
  assert.deepEqual(pillars.map((p) => p.title), ['Spatial Resolution', 'Dynamic Range', 'Timbre Matching']);
  assert.deepEqual(ADI_PILLARS.map((p) => p.id), ['spatial-resolution', 'dynamic-range', 'timbre-matching']);

  // Spatial Resolution carries P2 (weight 8) and P5 (weight 6); P2 ranks first.
  const spatial = pillars[0];
  assert.equal(spatial.hasEvidence, true);
  const spatialIds = spatial.parameters.map((p) => p.label);
  assert.ok(spatialIds.includes('P2'), 'P2 present in Spatial Resolution');
  assert.ok(spatialIds.includes('P5'), 'P5 present in Spatial Resolution');
  assert.equal(spatialIds[0], 'P2', 'higher-weight P2 leads');

  // P5 is seat-scoped and shows BOTH assessed seats (all results).
  const p5 = spatial.parameters.find((p) => p.label === 'P5');
  assert.equal(p5.scope, 'Seat');
  assert.ok(p5.seats && p5.seats.length > 0, 'P5 carries seat rows');
  const allP5Seats = p5.seats.flatMap((r) => r.seats);
  assert.equal(allP5Seats.length, 2, 'P5 shows both assessed seats');
  assert.ok(allP5Seats.some((s) => s.level === 'L2'), 'the L2 (limiting) seat is shown');
  assert.ok(allP5Seats.some((s) => s.level === 'L3'), 'the L3 seat is shown');

  // Dynamic Range carries P12.
  const dynamic = pillars[1];
  const dynamicIds = dynamic.parameters.map((p) => p.label);
  assert.ok(dynamicIds.includes('P12'), 'P12 present in Dynamic Range');

  // Timbre Matching carries P17 and P18.
  const timbre = pillars[2];
  const timbreIds = timbre.parameters.map((p) => p.label);
  assert.ok(timbreIds.includes('P17'), 'P17 present in Timbre Matching');
  assert.ok(timbreIds.includes('P18'), 'P18 present in Timbre Matching');

  // Overview table is built and carries levels for each pillar.
  assert.ok(overview, 'overview is built');
  assert.ok(overview['Spatial Resolution'], 'overview has Spatial Resolution');
  assert.ok(overview['Dynamic Range'], 'overview has Dynamic Range');
  assert.ok(overview['Timbre Matching'], 'overview has Timbre Matching');
  // P2 is room-scoped L4, but P5's primary seat is L3 — the pillar's primary
  // level is the worst across primary-seat results, so L3.
  assert.equal(overview['Spatial Resolution'].primary.level, 'L3');
  // P5's secondary seat is L2, so the secondary group is limited to L2.
  assert.equal(overview['Spatial Resolution'].secondary.level, 'L2');

  console.log('✓ Test 1 passed: three pillars, seat results, overview');
}

// ── Test 2: assumed parameters (P8, P15, P21) are excluded ─────────────────
{
  const summary = {
    parameterAuthority: {
      p8: authorityEntry({ key: 'p8', level: 'L4', scope: 'room', weight: 2 }),
      p15: authorityEntry({ key: 'p15', level: 'L3', scope: 'room', weight: 3 }),
      p21: authorityEntry({ key: 'p21', level: 'L4', scope: 'room', weight: 3 }),
      p2: authorityEntry({ key: 'p2', level: 'L3', scope: 'room', weight: 8 }),
    },
    roomResultsByParameter: { 2: { level: 'L3' } },
    project: { reportCounts: { seatResultsByParameter: {} } },
  };

  const { pillars } = buildAdiPillarHighlights({ engineeringSummary: summary });
  const allLabels = pillars.flatMap((p) => p.parameters.map((pr) => pr.label));
  assert.ok(!allLabels.includes('P8'), 'P8 (assumed) excluded');
  assert.ok(!allLabels.includes('P15'), 'P15 (assumed) excluded');
  assert.ok(!allLabels.includes('P21'), 'P21 (assumed) excluded');
  assert.ok(allLabels.includes('P2'), 'P2 still present');

  console.log('✓ Test 2 passed: assumed parameters excluded');
}

// ── Test 3: L1 / FAIL never raised as positive highlights ──────────────────
{
  const summary = {
    parameterAuthority: {
      p2: authorityEntry({ key: 'p2', level: 'FAIL', scope: 'room', weight: 8 }),
      p5: authorityEntry({ key: 'p5', level: 'L1', scope: 'seat', weight: 6, seats: seatMap([
        { id: 's1', row: 1, level: 'L1', isPrimary: true },
      ]) }),
    },
    roomResultsByParameter: { 2: { level: 'FAIL' } },
    project: {
      reportCounts: {
        seatResultsByParameter: {
          p5: [{ seatId: 's1', row: 1, level: 'L1', status: 'scored', isPrimary: true }],
        },
      },
    },
  };

  const { pillars } = buildAdiPillarHighlights({ engineeringSummary: summary });
  const spatial = pillars[0];
  // No L2+ evidence → pillar shows no parameters (hasEvidence false).
  assert.equal(spatial.hasEvidence, false, 'pillar with only L1/FAIL shows no positive highlights');
  assert.equal(spatial.parameters.length, 0);

  console.log('✓ Test 3 passed: L1/FAIL never raised as positive highlights');
}

// ── Test 4: L2 fills when a pillar has fewer than three L3+ results ─────────
{
  const summary = {
    parameterAuthority: {
      p2: authorityEntry({ key: 'p2', level: 'L2', scope: 'room', weight: 8 }),
      p5: authorityEntry({ key: 'p5', level: 'L2', scope: 'seat', weight: 6, seats: seatMap([
        { id: 's1', row: 1, level: 'L2', isPrimary: true },
      ]) }),
    },
    roomResultsByParameter: { 2: { level: 'L2' } },
    project: {
      reportCounts: {
        seatResultsByParameter: {
          p5: [{ seatId: 's1', row: 1, level: 'L2', status: 'scored', isPrimary: true }],
        },
      },
    },
  };

  const { pillars } = buildAdiPillarHighlights({ engineeringSummary: summary });
  const spatial = pillars[0];
  assert.equal(spatial.hasEvidence, true, 'L2 results fill the pillar');
  assert.ok(spatial.parameters.length >= 1, 'at least one L2 parameter raised');

  console.log('✓ Test 4 passed: L2 fills when fewer than three L3+ results');
}

// ── Test 5: P19 is RSP-scoped and shows a single reference-seat result ──────
{
  const summary = {
    parameterAuthority: {
      p19: authorityEntry({ key: 'p19', level: 'L3', scope: 'rsp', weight: 9 }),
    },
    roomResultsByParameter: { 19: { level: 'L3', formatted: '±2 dB' } },
    project: { reportCounts: { seatResultsByParameter: {} } },
  };

  const { pillars } = buildAdiPillarHighlights({ engineeringSummary: summary });
  const timbre = pillars[2];
  const p19 = timbre.parameters.find((p) => p.label === 'P19');
  assert.ok(p19, 'P19 present in Timbre Matching');
  assert.equal(p19.scope, 'RSP');
  assert.ok(p19.room, 'P19 carries its room/RSP result');
  assert.equal(p19.room.level, 'L3');
  assert.equal(p19.seats, null, 'P19 has no seat grid');

  console.log('✓ Test 5 passed: P19 RSP-scoped single result');
}

console.log('\nAll ADI pillar highlights tests passed.');