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
    .map((entry) => ({
      parameter_id: Number(entry.parameter_id),
      key: entry.key || `P${entry.parameter_id}`,
      title: asText(entry.title) || `P${entry.parameter_id}`,
      area: asText(entry.area) || null,
      level: asText(entry.level) || null,
      value: entry.value ?? null,
      unit: asText(entry.unit) || null,
      context: asText(entry.context) || null,
      source: asText(entry.source) || 'report_evidence',
    }));
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

/**
 * The Visual Report's frozen room, seating and viewing — the same values its
 * report renders. They are checked against the evidence's own statement of the
 * same facts, so a proposal can never be generated from two disagreeing
 * statements of one version's geometry.
 */
function visualFrozenSource(visualRow) {
  return visualRow.payload?.proposalSource || {};
}

function assertEvidenceAgreesWithFrozen({ visualEvidence, visualRow, version }) {
  const source = visualFrozenSource(visualRow);
  const statedSeats = Array.isArray(visualEvidence.seating?.per_seat) ? visualEvidence.seating.per_seat : [];
  const frozenSeats = Array.isArray(source.viewing?.per_seat) ? source.viewing.per_seat : [];
  if (frozenSeats.length > 0 && statedSeats.length !== frozenSeats.length) {
    throw new Error(
      `${version.version_name}: incomplete Visual Report evidence. Its stored evidence and its own `
      + `viewing values disagree. Regenerate the Visual Report for this version, then try again.`,
    );
  }
  const statedDims = visualEvidence.room || {};
  const frozenDims = source.room?.dimensions || {};
  const differs = ['length_m', 'width_m', 'height_m'].some((key) => (
    frozenDims[key] != null && statedDims[key] != null
    && Math.abs(Number(frozenDims[key]) - Number(statedDims[key])) > 0.02
  ));
  if (differs) {
    throw new Error(
      `${version.version_name}: incomplete Visual Report evidence. Its stored evidence and its own `
      + `room dimensions disagree. Regenerate the Visual Report for this version, then try again.`,
    );
  }
}

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
    const technicalRow = rows.find((row) => row.report_type === 'technical') || null;
    const visualRow = rows.find((row) => row.report_type === 'visual') || null;

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
    const products = productsFromEvidence(technicalEvidence);
    assertEvidenceAgreesWithFrozen({ visualEvidence, visualRow, version });
    const visualSource = visualFrozenSource(visualRow);

    // The frozen carrier. Every figure the proposal states is taken from the
    // evidence below; the version's room, seating and viewing come from the
    // Visual Report's own frozen source, which the evidence above has just been
    // checked against. No live project value is read anywhere in this module.
    const frozen = technicalRow.payload?.proposalSource || {};

    return {
      version_id: version.id,
      version_name: version.version_name,
      source: 'report-evidence',
      engineeringState: 'current',
      evidence: { technical: technicalEvidence, visual: visualEvidence, citation },
      snapshot: {
        ...frozen,
        room: visualSource.room || frozen.room,
        seats: visualSource.seats || frozen.seats,
        viewing: visualSource.viewing || frozen.viewing,
        version: { ...(frozen.version || {}), id: version.id, name: version.version_name },
        identity: {
          ...(frozen.identity || {}),
          projectId,
          versionId: version.id,
          technicalReportId: technicalRow.id,
          visualReportId: visualRow.id,
        },
        // Every figure the proposal states comes from the evidence.
        report_parameters: parametersFromEvidence(technicalEvidence),
        system: { ...(frozen.system || {}), products_selected: products },
        report_evidence: citation,
      },
    };
  }));
}

export default readProposalReportEvidence;