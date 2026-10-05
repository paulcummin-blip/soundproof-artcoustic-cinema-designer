/**
 * reportEvidenceAuthority.js
 * --------------------------
 * THE machine-readable evidence snapshot written alongside every Visual and
 * Technical Report, and stored inside that report's ReportSnapshot payload.
 *
 *   the human report   → for people
 *   reportEvidence     → for Proposal Centre
 *
 * A proposal never infers from prose, rebuilds a calculation or reads scattered
 * report components: it reads this. One builder, two callers — a freshly
 * generated report (captureReportProposalSource) and the one-time upgrade of an
 * existing report whose stored frozen source is still present (useReportSnapshot).
 * Both assemble from the SAME frozen authority the report itself renders from:
 * never AI prose, never rendered PDF text, never the live project after the
 * report has been generated.
 *
 * Pure: no React, no network, no recalculation, no re-grading.
 */

import { REPORT_SNAPSHOT_TYPE, reportTypeLabel } from './reportSnapshotAuthority';
import { PRODUCTS_SELECTED_ROWS } from './reportProductsSelected';
import { validateReportEvidence as validateCompleteness } from '../../../shared/reportEvidenceCompleteness.js';
import { buildReportSeating } from '../../../shared/reportEvidenceSeating.js';

export const REPORT_EVIDENCE_VERSION = 1;

/** The one sentence a designer reads while evidence is missing. */
export const REPORT_EVIDENCE_LEGACY_MESSAGE = 'Legacy report needs one-time evidence refresh';

/**
 * The parameters a proposal must be able to state for each report type. A
 * Technical Report states the RP22 engineering verdicts; a Visual Report states
 * viewing geometry and seating, so its parameters are not a blocking set.
 */
export const EVIDENCE_REQUIRED_PARAMETERS = Object.freeze({
  [REPORT_SNAPSHOT_TYPE.TECHNICAL]: Object.freeze([12, 13, 14, 18, 19, 20]),
  [REPORT_SNAPSHOT_TYPE.VISUAL]: Object.freeze([]),
});

const UNSTATED = /NOT CALCULATED|Seat results|^—$|N\/A/i;

function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, places = 1) {
  const number = asNumber(value);
  if (number === null) return null;
  const factor = 10 ** places;
  return Math.round(number * factor) / factor;
}

function cmFromM(metres) {
  const number = asNumber(metres);
  return number === null ? null : round(number * 100, 1);
}

/** The unit a stated value carries, read from the value itself. */
function inferUnit(value) {
  const text = String(value ?? '');
  if (/dBC\b/i.test(text)) return 'dBC';
  if (/\bdB\b/i.test(text)) return 'dB';
  if (/\bHz\b/i.test(text)) return 'Hz';
  if (/\bms\b/i.test(text)) return 'ms';
  return null;
}

/** Which part of the design a parameter's result belongs to. */
function parameterContext(id) {
  if (id === 12) return 'screen';
  if (id === 13) return 'OH';
  if (id === 14 || id === 16 || id === 17 || id === 18) return 'bass';
  if (id === 19) return 'RSP';
  if (id === 20) return 'seat';
  return 'room';
}

function buildIdentity({ reportType, captured, sourceFingerprint }) {
  const identity = captured?.identity || {};
  const project = captured?.project || {};
  const version = captured?.version || {};
  const dealer = captured?.dealer || {};
  const fingerprints = sourceFingerprint || {};
  const engineering = asText(fingerprints.engineeringFingerprint) || asText(identity.engineeringFingerprint);
  return {
    project_id: identity.projectId || null,
    version_id: identity.versionId || null,
    version_name: asText(version.name) || null,
    project_name: asText(project.project_name) || null,
    client_name: asText(project.client_name) || null,
    project_reference: asText(project.project_reference) || null,
    dealer_name: asText(project.dealer_company) || asText(dealer.company_name) || null,
    generated_at: asText(identity.generatedAt) || new Date().toISOString(),
    report_type: reportType || null,
    report_label: reportTypeLabel(reportType),
    // The design this evidence was frozen against, stated in full. A version
    // with no published engineering authority states its frozen calculation
    // fingerprint instead — the same frozen authority the report itself was
    // generated from — so a report that has a fingerprint never yields evidence
    // that carries none.
    source_fingerprint: engineering || asText(fingerprints.calculationFingerprint),
    engineering_fingerprint: engineering,
    bass_fingerprint: asText(fingerprints.calculationFingerprint) || asText(identity.engineeringFingerprint),
    seating_fingerprint: asText(fingerprints.seatPriorityFingerprint) || asText(identity.seatPriorityFingerprint),
  };
}

function buildRoom(captured) {
  const dimensions = captured?.room?.dimensions || null;
  return {
    length_m: round(dimensions?.length_m, 2),
    width_m: round(dimensions?.width_m, 2),
    height_m: round(dimensions?.height_m, 2),
    volume_m3: round(captured?.room?.volume_m3, 1),
  };
}

function buildScreen(captured, borderThicknessM) {
  const screen = captured?.room?.screen || null;
  if (!screen) {
    return {
      format: null, viewable_diagonal_in: null, viewable_width_cm: null, viewable_height_cm: null,
      overall_width_cm: null, overall_height_cm: null, screen_type: null,
    };
  }
  const viewableWidthCm = cmFromM(screen.computed_width_m);
  const viewableHeightCm = cmFromM(screen.computed_height_m);
  const borderCm = asNumber(borderThicknessM) === null ? null : asNumber(borderThicknessM) * 100;
  return {
    format: asText(screen.aspect_ratio) || null,
    viewable_diagonal_in: round(screen.diagonal_inches ?? screen.size_inches, 1),
    viewable_width_cm: viewableWidthCm,
    viewable_height_cm: viewableHeightCm,
    overall_width_cm: (viewableWidthCm === null || borderCm === null) ? viewableWidthCm : round(viewableWidthCm + 2 * borderCm, 1),
    overall_height_cm: (viewableHeightCm === null || borderCm === null) ? viewableHeightCm : round(viewableHeightCm + 2 * borderCm, 1),
    screen_type: screen.television === true ? 'Television' : 'Projection screen',
  };
}

/** One viewing row, from the version's own RP23 viewing summary. */
function viewingRow(entry, row) {
  return {
    row: asNumber(entry?.row ?? entry?.rowNumber ?? row),
    seat_id: entry?.seatId || entry?.seat_id || null,
    seat_label: asText(entry?.label) || null,
    distance_m: round(entry?.distance_m ?? entry?.distanceM, 2),
    horizontal_angle_deg: round(entry?.horizontal_angle_deg ?? entry?.horizontalAngleDeg, 1),
    vertical_angle_deg: round(entry?.vertical_angle_deg ?? entry?.verticalAngleDeg, 1),
    rp23_level: asText(entry?.level) || asText(entry?.rp23_level) || null,
  };
}

function buildSeating(captured) {
  const seats = Array.isArray(captured?.seats) ? captured.seats : [];
  const summary = captured?.report_engineering_summary || {};
  const seating = buildReportSeating({
    seats, viewing: captured?.viewing?.per_seat || [],
    screenPlaneM: captured?.room?.screen?.front_plane_m,
    seatResultsByParameter: captured?.report_seat_results || {},
    seatHudById: summary.seatHudById || {},
    p19: summary.parameterSummaries?.project?.p19 || null,
  });
  const rsp = captured?.room?.rsp || null;
  return { ...seating, rsp: rsp ? { mode: rsp.mode || null,
    x_m: round(rsp.x_m ?? rsp.manual_x_m, 2),
    y_m: round(rsp.y_m ?? rsp.manual_y_m, 2) } : null };
}

/** "Q8-5 × 3" / "SUB4-12 × 2 (front)" → the structured product it states. */
function parseProductValue(value, area) {
  const text = asText(value);
  if (!text || text === 'None specified') return null;
  const match = text.match(/^(.+?)\s*×\s*(\d+)\s*(?:\(([^)]+)\))?$/);
  if (!match) return { role: area, model: text, quantity: 1, position: null };
  return {
    role: area,
    model: asText(match[1]),
    quantity: Number(match[2]) || 1,
    position: asText(match[3]),
  };
}

function buildSystem(captured) {
  const built = captured?.system?.products_selected || {};
  const layout = captured?.system?.configuration || {};
  const channels = captured?.system?.channel_layout || {};

  const products = [];
  const byLayer = {};
  for (const { key, area } of PRODUCTS_SELECTED_ROWS) {
    const values = Array.isArray(built[key]) ? built[key] : [];
    const entries = values.map((value) => parseProductValue(value, area)).filter(Boolean);
    byLayer[key] = entries;
    products.push(...entries);
  }

  return {
    layout: asText(layout.dolby_config) || null,
    layout_text: asText(layout.text) || null,
    bed_channels: asNumber(channels.bed_channels),
    overhead_channels: asNumber(channels.overhead_channels),
    subwoofer_channels: asNumber(channels.dolby_subwoofer_channels),
    total_discrete_channels: asNumber(channels.total_discrete),
    subwoofer_count: asNumber(channels.subwoofer_count),
    placed_speaker_count: asNumber(captured?.system?.topology?.placed_speaker_count),
    products_selected: products,
    products_selected_by_layer: byLayer,
    acoustic_treatment: (byLayer.acoustic_treatment || []).map(({ model, quantity }) => ({ model, quantity })),
  };
}

function buildParameters(captured, reportType, authorityHeadlines = null) {
  const visible = Array.isArray(captured?.report_parameters) ? captured.report_parameters : [];
  const stated = Array.isArray(captured?.rp22?.parameter_headlines) ? captured.rp22.parameter_headlines : [];
  const authority = Array.isArray(authorityHeadlines) ? authorityHeadlines : stated;
  const headlineById = new Map(authority.map((row) => [Number(row?.parameter_id), row]));
  const statedById = new Map(stated.map((row) => [Number(row?.parameter_id), row]));
  const source = reportType === REPORT_SNAPSHOT_TYPE.VISUAL ? 'visual_report' : 'technical_report';

  return visible
    .filter((row) => Number.isFinite(Number(row?.parameter_id)))
    .sort((a, b) => Number(a.parameter_id) - Number(b.parameter_id))
    .map((row) => {
      const id = Number(row.parameter_id);
      const headline = headlineById.get(id) || null;
      const statedRow = statedById.get(id) || null;
      const value = row.value ?? null;
      const level = asText(row.level) || null;
      return {
        key: `P${id}`,
        parameter_id: id,
        title: asText(headline?.title) || asText(statedRow?.title) || `P${id}`,
        area: asText(headline?.category) || asText(statedRow?.category) || null,
        level,
        value,
        // The report's own statement of this parameter, exactly as it prints it.
        // A proposal reads this sentence, so its P13 can never be assembled from
        // a different value than the Technical Report shows.
        text: [level, asText(value)].filter(Boolean).join(' · ') || null,
        unit: inferUnit(value) || inferUnit(headline?.formatted_value),
        context: parameterContext(id),
        limiting_group: null,
        source,
        // What the RP22 authority itself stated for this parameter. Parity
        // compares these against the values above, so a report can never state
        // a figure its own authority did not state.
        authority_level: asText(headline?.achieved_level) || null,
        authority_value: asText(headline?.formatted_value) || null,
      };
    });
}

function buildParameterIndex(parameters) {
  const index = {};
  for (const parameter of parameters) index[parameter.key] = parameter;
  return index;
}

function buildBass(captured) {
  const bass = captured?.bass || null;
  return {
    current: bass?.available === true,
    p14: bass?.p14 ?? null,
    p18: bass?.p18 ?? null,
    p19: bass?.p19 ?? null,
    p20: bass?.p20 ?? null,
    rsp_curve_ref: null,
    primary_seat_curve_refs: [],
  };
}

/** Canonical JSON with sorted keys, so the fingerprint is order-independent. */
function canonicalise(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalise(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** A stable content fingerprint: the same facts always give the same value. */
export function evidenceFingerprint(evidence) {
  if (!evidence || typeof evidence !== 'object') return null;
  const { identity = {}, room, screen, seating, system, parameters, bass } = evidence;
  const frozen = {
    identity: {
      project_id: identity.project_id,
      version_id: identity.version_id,
      report_type: identity.report_type,
      source_fingerprint: identity.source_fingerprint,
      bass_fingerprint: identity.bass_fingerprint,
      seating_fingerprint: identity.seating_fingerprint,
    },
    room, screen, seating, system, parameters, bass,
  };
  const text = canonicalise(frozen);
  // FNV-1a, 32-bit, hex — small, dependency-free and stable across runtimes.
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `re1-${hash.toString(16).padStart(8, '0')}-${text.length.toString(16)}`;
}

/** A deep copy, so stored evidence never shares a reference with the capture. */
function copy(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

/** The ranked parameters, reduced to the facts a proposal states about them. */
function rankedParameters(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((entry) => ({
      parameter_id: asNumber(entry?.parameter_id),
      achieved_level: asText(entry?.achieved_level) || asText(entry?.level) || null,
    }))
    .filter((entry) => entry.parameter_id !== null);
}

/**
 * The report facts a proposal states beyond the room, screen, seating, product,
 * parameter and bass blocks above: the screen and seating interpretations, the
 * product roles, the subwoofer arrangement, the amplification, the design
 * structure floors and the viewing headline.
 *
 * Every one is copied from the SAME frozen capture the human report itself
 * renders from — never from the live project, never from prose, never inferred.
 * A fact the capture does not state stays null, and a proposal blocks rather
 * than reaching for another source.
 */
function buildReportFacts(captured = {}) {
  const room = captured?.room || {};
  const screen = room.screen || null;
  const system = captured?.system || {};
  const configuration = system.configuration || {};
  const channelLayout = system.channel_layout || {};
  const subwooferStrategy = system.subwoofer_strategy || null;
  const amplification = system.amplification || null;
  const viewing = captured?.viewing || null;
  const rp22 = captured?.rp22 || {};
  const categories = rp22?.categories || null;
  const floors = (source) => (Array.isArray(source) ? source : [])
    .filter((entry) => entry?.label && entry?.floor)
    .map((entry) => ({ label: entry.label, floor: entry.floor }));

  return {
    room: {
      dimensions_text: asText(room.dimensions_text) || null,
      classification: copy(room.classification),
      interpretation: asText(room.interpretation) || null,
      acoustic_treatment: copy(room.acoustic_treatment),
    },
    screen: screen ? {
      interpretation: asText(screen.interpretation) || null,
      manual_dimensions: screen.manual_dimensions === true,
      manual_width_m: asNumber(screen.manual_width_m),
      manual_height_m: asNumber(screen.manual_height_m),
    } : null,
    seating: { interpretation: asText(room.seating?.interpretation) || null },
    system: {
      configuration: {
        dolby_config: asText(configuration.dolby_config) || null,
        text: asText(configuration.text) || null,
        configuration_text: asText(configuration.configuration_text)
          || asText(channelLayout.configuration_text) || null,
      },
      channel_layout: copy(channelLayout),
      product_roles: (Array.isArray(system.product_roles) ? system.product_roles : []).map((role) => ({
        role: role?.role || null,
        role_description: role?.role_description || null,
        model_label: role?.model_label || null,
        model_key: role?.model_key || null,
      })),
      subwoofer_strategy: subwooferStrategy ? {
        count: asNumber(subwooferStrategy.count),
        models: (Array.isArray(subwooferStrategy.models) ? subwooferStrategy.models : []).filter(Boolean),
        strategy_text: asText(subwooferStrategy.strategy_text) || null,
      } : null,
      amplification: amplification ? {
        specified: amplification.specified === true,
        power_w: asNumber(amplification.power_w),
        text: asText(amplification.text) || null,
      } : null,
    },
    viewing: viewing ? {
      available: viewing.available === true,
      summary: asText(viewing.summary) || null,
      primary_floor: asText(viewing.primary_floor) || null,
    } : null,
    rp22: {
      categories: categories ? {
        primary: {
          available: categories.primary?.available === true,
          categories: floors(categories.primary?.categories),
        },
        all_seat: {
          available: categories.all_seat?.available === true,
          categories: floors(categories.all_seat?.categories),
        },
      } : null,
      strengths: rankedParameters(rp22.strengths),
      weaknesses: rankedParameters(rp22.weaknesses),
      assumed: copy(rp22.assumed) || {},
      assessment_basis: copy(rp22.assessment_basis),
    },
    bass: {
      subwoofer_strategy_summary: asText(captured?.bass?.subwoofer_strategy_summary) || null,
    },
  };
}

/**
 * Assemble the evidence snapshot from the same frozen capture the human report
 * is saved with. `captured` is the report's own frozen proposal source.
 */
export function buildReportEvidence({ reportType, captured, sourceFingerprint = null, authorityHeadlines = null, borderThicknessM = null }) {
  if (!captured) return null;
  const identity = buildIdentity({ reportType, captured, sourceFingerprint });
  const parameters = buildParameters(captured, reportType, authorityHeadlines);
  const evidence = {
    evidence_version: REPORT_EVIDENCE_VERSION,
    report_type: reportType || null,
    identity,
    room: buildRoom(captured),
    screen: buildScreen(captured, borderThicknessM),
    seating: buildSeating(captured),
    system: buildSystem(captured),
    parameters,
    parameter_index: buildParameterIndex(parameters),
    bass: buildBass(captured),
    // The remaining report facts a proposal states, from the same frozen capture.
    report_facts: buildReportFacts(captured),
    // Flipped false by the parity check when the report's visible rows and the
    // evidence disagree, so a proposal can never read evidence the report
    // itself does not state.
    proposal_ready: true,
    evidence_fingerprint: null,
  };
  evidence.evidence_fingerprint = evidenceFingerprint(evidence);
  return evidence;
}

/** What is missing from an evidence payload before a proposal may use it. */
export function validateReportEvidence(evidence, reportType = null, options = {}) {
  return validateCompleteness(evidence, reportType, options);
}

/** The stored evidence of a saved report, or null when it carries none. */
export function readStoredEvidence(snapshot) {
  const evidence = snapshot?.payload?.reportEvidence;
  if (!evidence || typeof evidence !== 'object') return null;
  if (Number(evidence.evidence_version) !== REPORT_EVIDENCE_VERSION) return null;
  return evidence;
}

/**
 * The evidence IDs a proposal section cites internally, so a proposal that
 * later disagrees with a report can be traced back to the evidence it read.
 */
export function buildEvidenceCitation({ evidence, visualReportId = null, technicalReportId = null } = {}) {
  if (!evidence) return null;
  return {
    visual_report_snapshot_id: visualReportId || null,
    technical_report_snapshot_id: technicalReportId || null,
    version_id: evidence.identity?.version_id || null,
    evidence_generated_at: evidence.identity?.generated_at || null,
    evidence_fingerprint: evidence.evidence_fingerprint || evidenceFingerprint(evidence),
  };
}

export default buildReportEvidence;