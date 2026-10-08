/**
 * proposalReportEvidenceReader.js
 * ------------------------------
 * THE proposal read path. Proposal generation reads each selected version's
 * reportEvidence — the machine-readable snapshot written inside that version's
 * Visual and Technical Report snapshots — and nothing else.
 *
 *   the human report   → for people
 *   reportEvidence     → for Proposal Centre   ← read here, and only here
 *
 * It never reads the live project, never consults a browser-session handoff,
 * never rebuilds a summary from another module and never falls back to active
 * project state. If the evidence a selected version needs is not stored in its
 * own saved reports, generation is blocked and the exact version and report are
 * named.
 *
 * The blocked conditions are stated separately, because they need four
 * different actions from the designer:
 *   no saved report at all                     → missing
 *   the saved report is not current            → stale
 *   the report exists and is current, but      → legacy, needs a one-time
 *     carries no stored evidence (written        evidence refresh
 *     before the evidence capture)
 *   the evidence is stored but incomplete or   → incomplete (parity failed)
 *     its parity check failed
 */

import { validateReportEvidence } from './reportEvidenceCompleteness.js';
import { selectCanonicalReportSnapshot } from './reportSnapshotCanonical.js';

/** The parameters a proposal must be able to state from a Technical Report. */
const REQUIRED_PARAMETERS = [12, 13, 14, 18, 19, 20];

/** The evidence payload generation this reader understands. */
const REPORT_EVIDENCE_VERSION = 1;

const UNSTATED = /NOT CALCULATED|Seat results|^—$|N\/A/i;

/**
 * Mirrors PRODUCTS_SELECTED_ROWS in src/components/report/reportProductsSelected.js
 * — the frontend cannot be imported from base44/, so the layer keys and their
 * printed area names live in both places and a test asserts they agree.
 */
const PRODUCT_ROWS = Object.freeze([
  { key: 'lcr', area: 'LCR' },
  { key: 'surrounds', area: 'Surrounds / wides' },
  { key: 'overheads', area: 'Overheads' },
  { key: 'subwoofers', area: 'Subwoofers' },
  { key: 'acoustic_treatment', area: 'Acoustic treatment' },
]);

const NONE = 'None specified';

function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** The stored evidence of a saved report snapshot, or null when it carries none. */
function readEvidence(row) {
  const evidence = row?.payload?.reportEvidence;
  if (!evidence || typeof evidence !== 'object') return null;
  if (Number(evidence.evidence_version) !== REPORT_EVIDENCE_VERSION) return null;
  return evidence;
}

/**
 * The one version's evidence for one report type, or the exact reason it cannot
 * be used. Every message names the version and the report.
 */
function requireEvidence(row, version, type) {
  const name = version.version_name || version.id;

  if (!row) throw new Error(`${name}: missing ${type} Report. Generate it before creating a proposal.`);

  if (row.status !== 'current') {
    throw new Error(`${name}: stale ${type} Report. Regenerate it before creating a proposal.`);
  }

  const evidence = readEvidence(row);
  if (!evidence) {
    // The report EXISTS and is current: it is never reported as missing. Its
    // evidence is recovered only from its own stored frozen source, when the
    // report is opened once — and if it carries no frozen source either, only
    // regenerating it can produce evidence.
    const recoverable = !!row.payload?.proposalSource;
    throw new Error(
      `${name}: ${type} Report is current, but it needs a one-time evidence refresh. `
      + `${recoverable
        ? `Open the ${type} Report for this version once to recover its stored evidence, then try again.`
        : `It carries no stored frozen source, so regenerate the ${type} Report for this version, then try again.`}`,
    );
  }

  // The design the evidence was frozen from is compared with the design this
  // version holds now, by the one engineering fingerprint. The version record's
  // modified time is never consulted: opening a project, exporting a PDF or
  // storing a library asset all touch it without changing the design. When
  // either side is unreadable, no staleness is manufactured.
  const evidenceFingerprint = evidence.identity?.source_fingerprint || null;
  const savedFingerprint = row.source_fingerprints?.engineeringFingerprint || null;
  const publishedFingerprint = version.published_fingerprint || null;
  const stated = evidenceFingerprint || savedFingerprint;
  if (stated && publishedFingerprint && stated !== publishedFingerprint) {
    throw new Error(
      `${name}: stale ${type} Report. The design changed after it was generated. `
      + `Regenerate it before creating a proposal.`,
    );
  }

  const completeness = validateReportEvidence(evidence, type.toLowerCase(), {
    projectId: version.project_id || row.project_id, versionId: version.id,
    sourceFingerprint: version.published_fingerprint,
    snapshotFingerprint: row.source_fingerprints?.engineeringFingerprint,
  });
  if (!completeness.complete) throw incompleteFact({ version, type, field: completeness.missing[0] });

  if (evidence.proposal_ready !== true || Number(evidence.evidence_version) !== REPORT_EVIDENCE_VERSION) {
    const parity = row.payload?.evidence_parity || null;
    const detail = parity?.mismatch_count
      ? ` (${parity.mismatch_count} value${parity.mismatch_count === 1 ? '' : 's'} did not match)`
      : '';
    throw new Error(
      `${name}: incomplete ${type} Report evidence${detail}. `
      + `The report's visible values and its evidence snapshot must agree before a proposal can use it. `
      + `Regenerate the ${type} Report for this version, then try again.`,
    );
  }

  if (evidence.identity?.version_id && String(evidence.identity.version_id) !== String(version.id)) {
    throw new Error(
      `${name}: the stored ${type} Report evidence belongs to another version. `
      + `Regenerate the ${type} Report for this version, then try again.`,
    );
  }

  return evidence;
}

/** The evidence's own parameter rows, in the shape the report states them. */
function parametersFromEvidence(evidence) {
  const entries = Array.isArray(evidence.parameters) ? evidence.parameters : [];
  return entries
    .filter((entry) => Number.isFinite(Number(entry?.parameter_id)))
    .map((entry) => {
      const level = asText(entry.level) || null;
      const value = entry.value ?? null;
      return {
        parameter_id: Number(entry.parameter_id),
        key: entry.key || `P${entry.parameter_id}`,
        title: asText(entry.title) || `P${entry.parameter_id}`,
        area: asText(entry.area) || null,
        level,
        value,
        // The report's own sentence for this parameter, read from the evidence.
        // This is the value a proposal's P13 row prints.
        text: asText(entry.text) || [level, asText(value)].filter(Boolean).join(' · ') || null,
        unit: asText(entry.unit) || null,
        context: asText(entry.context) || null,
        source: asText(entry.source) || 'report_evidence',
      };
    });
}

/** The printed product rows, from the evidence's own per-layer statement. */
function productsFromEvidence(evidence) {
  const byLayer = evidence.system?.products_selected_by_layer || {};
  const rendered = {};
  for (const { key } of PRODUCT_ROWS) {
    const entries = Array.isArray(byLayer[key]) ? byLayer[key] : [];
    const values = entries.map((entry) => {
      const base = entry.quantity > 1 ? `${entry.model} × ${entry.quantity}` : `${entry.model}`;
      return entry.position ? `${base} (${entry.position})` : base;
    });
    rendered[key] = values.length > 0 ? values : [NONE];
  }
  return {
    ...rendered,
    rows: PRODUCT_ROWS.map(({ key, area }) => ({ key, area, value: rendered[key].join(', ') })),
  };
}

/** The five evidence IDs a proposal cites, for later tracing. */
export function buildEvidenceCitation({ technicalEvidence, visualEvidence, technicalRow, visualRow } = {}) {
  return {
    visual_report_snapshot_id: visualRow?.id || null,
    technical_report_snapshot_id: technicalRow?.id || null,
    version_id: technicalEvidence?.identity?.version_id || visualEvidence?.identity?.version_id || null,
    evidence_generated_at: technicalEvidence?.identity?.generated_at
      || visualEvidence?.identity?.generated_at
      || null,
    evidence_fingerprint: technicalEvidence?.evidence_fingerprint
      || visualEvidence?.evidence_fingerprint
      || null,
  };
}

/* ── The snapshot a proposal reads: reportEvidence, and nothing else ───────
   Every fact below comes from reportEvidence. A fact the evidence does not
   state is a block that names it — never a value taken from the report's frozen
   source, from the live project, or from another report. proposalSource is
   never read for a fact: it is only an input to the one-time legacy backfill
   that writes reportEvidence, which happens once, when the report is opened. */

function pick(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== '') ?? null;
}

function incompleteFact({ version, type, field }) {
  const name = version.version_name || version.id;
  return new Error(
    `${name}: incomplete ${type} Report evidence — ${field} is missing. `
    + `Regenerate the ${type} Report for this version, then try again.`,
  );
}

function requireFact(value, { version, type, field }) {
  if (value === null || value === undefined || value === '') throw incompleteFact({ version, type, field });
  return value;
}

/** The room, screen and seating the Visual Report states, as a proposal reads them. */
function geometryFromEvidence(visualEvidence, technicalEvidence, version) {
  const room = visualEvidence.room || technicalEvidence.room || {};
  const screen = visualEvidence.screen || technicalEvidence.screen || {};
  const seating = visualEvidence.seating || technicalEvidence.seating || {};

  for (const key of ['length_m', 'width_m', 'height_m']) {
    requireFact(room[key], { version, type: 'Visual', field: `room.${key}` });
  }
  requireFact(screen.format, { version, type: 'Visual', field: 'screen.format' });
  requireFact(
    pick(screen.viewable_diagonal_in, screen.viewable_width_cm),
    { version, type: 'Visual', field: 'screen.size' },
  );

  const stated = Array.isArray(seating.per_seat) ? seating.per_seat : [];
  if (stated.length === 0) throw incompleteFact({ version, type: 'Visual', field: 'seating.per_seat' });

  const perSeat = stated.map((entry, index) => {
    const row = requireFact(entry?.row, { version, type: 'Visual', field: `seating.per_seat[${index}].row` });
    return {
      seatId: pick(entry?.seat_id, `row-${row}-${index + 1}`),
      label: asText(entry?.seat_label) || null,
      row,
      distance_m: requireFact(entry?.distance_m, { version, type: 'Visual', field: `seating.per_seat[${index}].distance_m` }),
      horizontal_angle_deg: requireFact(entry?.horizontal_angle_deg, { version, type: 'Visual', field: `seating.per_seat[${index}].horizontal_angle_deg` }),
      vertical_angle_deg: entry?.vertical_angle_deg ?? null,
      level: asText(entry?.rp23_level) || null,
    };
  });

  const seats = [];
  for (const seat of perSeat) {
    if (!seats.some((existing) => existing.id === seat.seatId)) seats.push({ id: seat.seatId, row: seat.row });
  }
  return { room, screen, seating, perSeat, seats };
}

/** The system, RP22 and bass facts the Technical Report states. */
function engineeringFromEvidence(technicalEvidence) {
  const system = technicalEvidence.system || {};
  const facts = technicalEvidence.report_facts || {};
  const bass = technicalEvidence.bass || {};
  const parameters = parametersFromEvidence(technicalEvidence);
  return {
    system,
    facts,
    bass,
    parameters,
    products: productsFromEvidence(technicalEvidence),
    // The report's own parameter rows, in the shape the RP22 evidence rules read.
    headlines: parameters.map((entry) => ({
      parameter_id: entry.parameter_id,
      title: entry.title,
      category: entry.area,
      level: entry.level,
      value: entry.value,
      text: entry.text,
      achieved_level: entry.level,
      formatted_value: entry.value,
    })),
  };
}

/**
 * P19 is RSP-only: the reference-position result is the whole of it. An older
 * saved report may carry a legacy per-seat P19 block in its stored evidence, so
 * only the RSP result is kept here and the per-seat rows are dropped — no
 * per-seat P19 evidence can reach a proposal pack or a comparison.
 */
export function rspOnlyP19(p19) {
  if (!p19 || typeof p19 !== 'object') return p19 ?? null;
  return { rsp: p19.rsp ?? null };
}

/**
 * The whole report-evidence snapshot: assembled from the two saved reports'
 * evidence alone, in the shape every proposal consumer already reads.
 */
function buildSnapshot({ version, projectId, technicalEvidence, visualEvidence, technicalRow, visualRow, citation }) {
  const geometry = geometryFromEvidence(visualEvidence, technicalEvidence, version);
  const engineering = engineeringFromEvidence(technicalEvidence);
  const visualFacts = visualEvidence.report_facts || {};
  const roomFacts = visualFacts.room || engineering.facts.room || {};
  const screenFacts = visualFacts.screen || engineering.facts.screen || {};
  const seatingFacts = visualFacts.seating || engineering.facts.seating || {};
  const viewFacts = visualFacts.viewing || engineering.facts.viewing || {};
  const systemFacts = engineering.facts.system || visualFacts.system || {};
  const rp22Facts = engineering.facts.rp22 || visualFacts.rp22 || {};
  const bassFacts = engineering.facts.bass || visualFacts.bass || {};
  const identity = technicalEvidence.identity || visualEvidence.identity || {};
  const channelLayout = systemFacts.channel_layout || {};
  const configurationText = systemFacts.configuration?.configuration_text
    || channelLayout.configuration_text || null;
  const rowCount = new Set(geometry.seats.map((seat) => seat.row)).size;

  return {
    available: true,
    identity: {
      projectId,
      versionId: version.id,
      project_name: identity.project_name || null,
      client_name: identity.client_name || null,
      project_reference: identity.project_reference || null,
      dealer_name: identity.dealer_name || null,
      engineeringFingerprint: identity.source_fingerprint || null,
      // The seat-priority set the report's scoped results were computed from, so
      // a scoped claim can name the scope authority it rests on.
      seatingFingerprint: identity.seating_fingerprint || null,
      generatedAt: identity.generated_at || null,
      technicalReportId: technicalRow?.id || null,
      visualReportId: visualRow?.id || null,
      technicalEvidenceFingerprint: technicalEvidence.evidence_fingerprint || null,
      visualEvidenceFingerprint: visualEvidence.evidence_fingerprint || null,
    },
    project: {
      name: identity.project_name || null,
      client_name: identity.client_name || null,
      project_reference: identity.project_reference || null,
    },
    dealer: { company_name: identity.dealer_name || null },
    version: { id: version.id, name: version.version_name },
    room: {
      dimensions: {
        length_m: geometry.room.length_m,
        width_m: geometry.room.width_m,
        height_m: geometry.room.height_m,
      },
      volume_m3: geometry.room.volume_m3 ?? null,
      dimensions_text: asText(roomFacts.dimensions_text) || null,
      classification: roomFacts.classification ?? null,
      interpretation: asText(roomFacts.interpretation) || null,
      screen: {
        size_inches: geometry.screen.viewable_diagonal_in ?? null,
        aspect_ratio: geometry.screen.format || null,
        manual_dimensions: screenFacts.manual_dimensions === true,
        manual_width_m: screenFacts.manual_width_m ?? null,
        manual_height_m: screenFacts.manual_height_m ?? null,
        interpretation: asText(screenFacts.interpretation) || null,
        viewable_width_cm: geometry.screen.viewable_width_cm ?? null,
        viewable_height_cm: geometry.screen.viewable_height_cm ?? null,
        screen_type: geometry.screen.screen_type || null,
      },
      seating: {
        interpretation: asText(seatingFacts.interpretation) || null,
        seat_count: geometry.seats.length,
        row_count: rowCount,
      },
      rsp: geometry.seating.rsp || null,
      acoustic_treatment: roomFacts.acoustic_treatment ?? null,
    },
    seats: geometry.seats,
    viewing: {
      available: viewFacts.available !== false && geometry.perSeat.length > 0,
      summary: asText(viewFacts.summary) || null,
      primary_floor: asText(viewFacts.primary_floor) || null,
      per_seat: geometry.perSeat,
    },
    system: {
      configuration: {
        dolby_config: engineering.system.layout || systemFacts.configuration?.dolby_config || null,
        text: engineering.system.layout_text || systemFacts.configuration?.text || null,
        configuration_text: configurationText,
      },
      channel_layout: {
        bed_channels: engineering.system.bed_channels ?? null,
        overhead_channels: engineering.system.overhead_channels ?? null,
        dolby_subwoofer_channels: engineering.system.subwoofer_channels ?? null,
        total_discrete: engineering.system.total_discrete_channels ?? null,
        subwoofer_count: engineering.system.subwoofer_count ?? null,
        configuration_text: configurationText,
      },
      products_selected: engineering.products,
      products_selected_by_layer: engineering.system.products_selected_by_layer || {},
      product_roles: Array.isArray(systemFacts.product_roles) ? systemFacts.product_roles : [],
      subwoofer_strategy: systemFacts.subwoofer_strategy || null,
      amplification: systemFacts.amplification || null,
      acoustic_treatment: engineering.system.acoustic_treatment || [],
    },
    rp22: {
      parameter_headlines: engineering.headlines,
      categories: rp22Facts.categories || null,
      strengths: rp22Facts.strengths || [],
      weaknesses: rp22Facts.weaknesses || [],
      assumed: rp22Facts.assumed || {},
      assessment_basis: rp22Facts.assessment_basis || null,
    },
    report_parameters: engineering.parameters,
    // The scoped seat-group results the Technical Report states, or the Visual
    // Report's copy of them, exactly as that report's evidence states them. Null
    // where that evidence carries none, in which case no scoped claim exists.
    seat_scopes: technicalEvidence.seat_scopes || visualEvidence.seat_scopes || null,
    bass: {
      available: engineering.bass.current === true,
      p14: engineering.bass.p14 ?? null,
      p18: engineering.bass.p18 ?? null,
      p19: rspOnlyP19(engineering.bass.p19),
      p20: engineering.bass.p20 ?? null,
      subwoofer_strategy_summary: asText(bassFacts.subwoofer_strategy_summary) || null,
    },
    report_evidence: citation,
  };
}

// The evidence-to-frozen cross-check that used to live here is gone with the
// frozen-source reads it depended on: reportEvidence is now the sole statement
// of every report fact, so a disagreement between it and the frozen source is
// resolved in favour of the evidence rather than blocking on the older copy.

/**
 * Every selected version's report evidence.
 *
 * @returns {Promise<Array<{version_id, version_name, source, engineeringState,
 *   evidence, snapshot}>>}
 */
export async function readProposalReportEvidence(entities, projectId, versions) {
  return Promise.all(versions.map(async (version) => {
    if (!version?.id) throw new Error('A selected version could not be read. Reopen the project and try again.');

    const reports = await entities.ReportSnapshot.filter(
      { project_id: projectId, version_id: version.id },
      { sort: '-generated_at', limit: 50 },
    );
    const rows = Array.isArray(reports) ? reports : (reports?.items || []);
    // The CANONICAL saved report per type, resolved against the authority this
    // version holds now — the same one rule the report pages and the readiness
    // table apply. A newer duplicate that is stale or incomplete never displaces
    // the valid Current report a proposal must read.
    const currentFingerprint = version.published_fingerprint || null;
    const technicalRow = selectCanonicalReportSnapshot(rows, { reportType: 'technical', currentFingerprint });
    const visualRow = selectCanonicalReportSnapshot(rows, { reportType: 'visual', currentFingerprint });

    // Evidence only: each report's own machine-readable snapshot, or a block
    // that names this version and this report.
    const technicalEvidence = requireEvidence(technicalRow, version, 'Technical');
    const visualEvidence = requireEvidence(visualRow, version, 'Visual');

    for (const id of REQUIRED_PARAMETERS) {
      const entry = technicalEvidence.parameter_index?.[`P${id}`];
      if (!entry || !/^L[1-4]$/.test(String(entry.level)) || entry.value == null || UNSTATED.test(String(entry.value))) {
        throw new Error(`${version.version_name}: missing Technical Report parameter P${id} in its evidence. Regenerate the report.`);
      }
    }
    if (!Array.isArray(technicalEvidence.system?.products_selected) || technicalEvidence.system.products_selected.length === 0) {
      throw new Error(`${version.version_name}: missing Technical Report Products Selected in its evidence. Regenerate the report.`);
    }
    if (!Array.isArray(visualEvidence.seating?.per_seat) || visualEvidence.seating.per_seat.length === 0) {
      throw new Error(`${version.version_name}: missing Visual Report RP23 values in its evidence. Regenerate the report.`);
    }

    const citation = buildEvidenceCitation({ technicalEvidence, visualEvidence, technicalRow, visualRow });

    // The one snapshot a proposal reads. Every fact in it is taken from the two
    // reports' own reportEvidence above — no frozen-source field and no live
    // project field is read anywhere on this path.
    return {
      version_id: version.id,
      version_name: version.version_name,
      source: 'report-evidence',
      engineeringState: 'current',
      evidence: { technical: technicalEvidence, visual: visualEvidence, citation },
      snapshot: buildSnapshot({
        version, projectId, technicalEvidence, visualEvidence, technicalRow, visualRow, citation,
      }),
    };
  }));
}

export default readProposalReportEvidence;