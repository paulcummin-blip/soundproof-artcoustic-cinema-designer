/**
 * proposalEvidenceFixtures.mjs (test fixture)
 * -------------------------------------------
 * The saved-report evidence the proposalEvidence pack tests read, in the shape
 * `readProposalReportEvidence` returns it: one `snapshot` per selected version,
 * plus that version's own saved reports' `reportEvidence` (which is where the
 * version name comes from).
 *
 * Two comparisons are defined here:
 *
 *   - `twoOptions()`   — the reference pair: the same room, screen, seating and
 *                        system layout, different subwoofers, a material
 *                        dynamic-range gain, and the same bass result in both;
 *   - `marqueeOptions()` — the real Marquee-shaped pair: a Level 1 design and a
 *                        Level 4 design, ±15.6 dB and ±13.2 dB at RP22 Level 1
 *                        for seat-to-seat bass consistency, and a subwoofer
 *                        strategy line that claims that consistency is maximum.
 *
 * Both are frozen evidence. Nothing here is calculated.
 */

export const EVIDENCE_AT = '2026-10-06T09:00:00.000Z';

/** The name each saved report states for a version, keyed by fixture id. */
export const SAVED_VERSION_NAMES = Object.freeze({ a: 'Level 1', b: 'Level 4' });

/** A live-project name that must never reach a pack. */
export const LIVE_VERSION_NAME_DECOY = 'LIVE-RENAMED-VERSION';

const NONE = 'None specified';

/**
 * One version's report evidence, as the reader assembles it from that version's
 * own saved Visual and Technical Reports.
 */
export function snapshot({
  id = 'a',
  levels = { 12: 'L4', 13: 'L4', 14: 'L4', 18: 'L4', 19: 'L4', 20: 'L4' },
  values = { 12: '112 dBC', 13: '108 dBC', 14: '115 dB', 18: '22 Hz', 19: '+/-2 dB', 20: '+/-3 dB' },
  layout = '9.1.6',
  screen = '120" (16:9)',
  seating = 'Two rows of three',
  subwoofers = 'SUB4-12 x 2',
  subwooferSummary = null,
  fingerprint = 'eng:v1:design',
  roomDims = { length_m: 6, width_m: 4.5, height_m: 2.4 },
  roomText = '6.0 x 4.5 x 2.4 m',
  reports = {},
} = {}) {
  const parameters = Object.entries(levels).map(([parameter_id, level]) => {
    const value = values[parameter_id] ?? null;
    const label = `P${parameter_id}`;
    return {
      parameter_id: Number(parameter_id), key: label, title: label, area: 'RP22',
      level, value, text: `${level} · ${value}`, unit: null, context: null, source: 'technical_report',
    };
  });
  return {
    available: true,
    identity: {
      projectId: 'project', versionId: id,
      project_name: 'Kinema House', client_name: 'Mr and Mrs Client', project_reference: 'AC-2026-014',
      dealer_name: 'Sound Proof', engineeringFingerprint: fingerprint,
      generatedAt: '2026-10-06T08:00:00Z',
      technicalReportId: reports.technical || `${id}-technical`,
      visualReportId: reports.visual || `${id}-visual`,
      technicalEvidenceFingerprint: `re-${id}-technical`,
      visualEvidenceFingerprint: `re-${id}-visual`,
    },
    // The live version record the reader also returns. It is a decoy here: a
    // pack must never name a version from it.
    version: { id, name: SAVED_VERSION_NAMES[id] || `Version ${id}` },
    room: {
      dimensions: roomDims
        ? { length_m: roomDims.length_m, width_m: roomDims.width_m, height_m: roomDims.height_m }
        : { length_m: null, width_m: null, height_m: null },
      volume_m3: roomDims ? 64.8 : null,
      dimensions_text: roomText,
      interpretation: 'A dedicated room',
      screen: {
        size_inches: screen === '120" (16:9)' ? 120 : 150,
        aspect_ratio: '16:9', screen_type: 'Projection screen',
        viewable_width_cm: 265.5, viewable_height_cm: 149.4,
        manual_dimensions: false, manual_width_m: null, manual_height_m: null,
        interpretation: `Screen: ${screen}`,
      },
      seating: { interpretation: seating, seat_count: 6, row_count: 2 },
    },
    seats: [{ id: 'r1c1', row: 1 }],
    viewing: {
      available: true, summary: 'Comfortable from every row', primary_floor: 'Level 4',
      per_seat: [{ seatId: 'r1c1', label: 'Row 1 seat 1', row: 1, distance_m: 3.2, horizontal_angle_deg: 0, vertical_angle_deg: 0, level: 'Level 4' }],
    },
    system: {
      configuration: { dolby_config: layout, text: `Dolby Atmos ${layout}` },
      channel_layout: { bed_channels: 9, overhead_channels: 6, dolby_subwoofer_channels: 1, total_discrete: 15, subwoofer_count: 2 },
      products_selected: {
        lcr: ['Q8-5 x 3'], surrounds: ['Q8-3 x 6'], overheads: ['Q8-2 x 6'], subwoofers: [subwoofers], acoustic_treatment: [NONE],
        rows: [
          { key: 'lcr', area: 'LCR', value: 'Q8-5 x 3' },
          { key: 'surrounds', area: 'Surrounds / wides', value: 'Q8-3 x 6' },
          { key: 'overheads', area: 'Overheads', value: 'Q8-2 x 6' },
          { key: 'subwoofers', area: 'Subwoofers', value: subwoofers },
          { key: 'acoustic_treatment', area: 'Acoustic treatment', value: NONE },
        ],
      },
      products_selected_by_layer: {},
      product_roles: [{ role: 'lcr', role_description: 'LCR', model_label: 'Q8-5' }],
      subwoofer_strategy: subwooferSummary ? { strategy_text: subwooferSummary } : null,
      amplification: { specified: true, power_w: 500 },
      acoustic_treatment: [],
    },
    rp22: { parameter_headlines: parameters, weaknesses: [], strengths: [] },
    report_parameters: parameters,
    bass: {
      available: true, p14: null, p18: null, p19: null, p20: null,
      subwoofer_strategy_summary: subwooferSummary,
    },
    report_evidence: { visual_report_snapshot_id: `${id}-visual`, technical_report_snapshot_id: `${id}-technical` },
  };
}

/**
 * One selected version, as the report-evidence reader returns it: a live read
 * (`version_name`, `snapshot.version`) and the saved report evidence
 * (`evidence.*.identity.version_name`).
 *
 * @param {string} id — 'a' or 'b'
 * @param {Object} [overrides]
 * @param {string} [overrides.savedName] — the name the saved reports state
 * @param {string} [overrides.savedVisualName] — the Visual Report's own name
 * @param {string} [overrides.liveName] — the live ProjectVersion name (a decoy)
 * @param {string} [overrides.liveSnapshotName] — the live name on the snapshot
 */
export function option(id, overrides = {}) {
  const saved = SAVED_VERSION_NAMES[id] || `Version ${id}`;
  const {
    savedName = saved,
    savedVisualName = savedName,
    liveName = saved,
    liveSnapshotName = saved,
    ...snapshotOverrides
  } = overrides;
  const assembled = snapshot({ id, ...snapshotOverrides });
  assembled.version = { id, name: liveSnapshotName };
  return {
    version_id: id,
    version_name: liveName,
    source: 'report-evidence',
    evidence: {
      technical: { identity: { version_name: savedName } },
      visual: { identity: { version_name: savedVisualName } },
    },
    snapshot: assembled,
  };
}

/* The two options of the reference comparison: a Level 2 design and a Level 4
   design, the same room, screen, seating and system layout, different
   subwoofers, and the same bass consistency result (`+/-5 dB`) in both. */
export const LEVELS_ONE = { 12: 'L2', 13: 'L2', 14: 'L2', 18: 'L3', 19: 'L3', 20: 'L1' };
export const VALUES_ONE = { 12: '100 dBC', 13: '96 dBC', 14: '104 dB', 18: '25 Hz', 19: '+/-3 dB', 20: '+/-5 dB' };
export const LEVELS_FOUR = { 12: 'L4', 13: 'L4', 14: 'L4', 18: 'L4', 19: 'L4', 20: 'L1' };
export const VALUES_FOUR = { 12: '114 dBC', 13: '110 dBC', 14: '118 dB', 18: '20 Hz', 19: '+/-2 dB', 20: '+/-5 dB' };

export function twoOptions() {
  return [
    option('a', { levels: LEVELS_ONE, values: VALUES_ONE, subwoofers: 'SUB3-12 x 2' }),
    option('b', { levels: LEVELS_FOUR, values: VALUES_FOUR, subwoofers: 'SUB4-12 x 2' }),
  ];
}

/* The Marquee pair, with the results that audit recorded: both designs sit at
   RP22 Level 1 for seat-to-seat bass consistency (±15.6 dB and ±13.2 dB), the
   Level 4 design carries the material dynamic-range gain and the larger
   subwoofer package, and its subwoofer strategy line claims a maximum
   seat-to-seat bass consistency that P20 does not support. */
export const MARQUEE_LEVELS_ONE = { 12: 'L2', 13: 'L2', 14: 'L2', 18: 'L3', 19: 'L3', 20: 'L1' };
export const MARQUEE_VALUES_ONE = { 12: '100 dBC', 13: '96 dBC', 14: '104 dB', 18: '25 Hz', 19: '+/-3 dB', 20: '+/-15.6 dB' };
export const MARQUEE_LEVELS_FOUR = { 12: 'L4', 13: 'L4', 14: 'L4', 18: 'L4', 19: 'L4', 20: 'L1' };
export const MARQUEE_VALUES_FOUR = { 12: '116 dBC', 13: '112 dBC', 14: '120 dB', 18: '20 Hz', 19: '+/-2 dB', 20: '+/-13.2 dB' };
export const MARQUEE_SUBWOOFER_SUMMARY = '4 × SUB4-12 · maximum seat-to-seat bass consistency.';

export function marqueeOptions() {
  return [
    option('a', {
      savedName: 'Level 1',
      levels: MARQUEE_LEVELS_ONE,
      values: MARQUEE_VALUES_ONE,
      subwoofers: 'SUB3-12 x 2',
    }),
    option('b', {
      savedName: 'Level 4',
      levels: MARQUEE_LEVELS_FOUR,
      values: MARQUEE_VALUES_FOUR,
      subwoofers: 'SUB4-12 x 4',
      subwooferSummary: MARQUEE_SUBWOOFER_SUMMARY,
    }),
  ];
}