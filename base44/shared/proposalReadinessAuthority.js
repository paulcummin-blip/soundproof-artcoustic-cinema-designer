/**
 * Per-version proposal readiness. Current engineering authority requires a
 * durable full publication resolved through this version's published pointer.
 * Completed bass/calibration entries identify bass only; they never substitute
 * for full engineering authority. Browser handoffs and historical report pages
 * are not evidence recovery sources. Client/server vocabulary is kept in sync.
 */

/** The readiness state of one cell, one version or the whole gate. */
export const READINESS_STATE = Object.freeze({
  CURRENT: 'current',
  STALE: 'stale',
  /**
   * The saved report EXISTS and is stored current, but it predates the proposal
   * evidence capture: it carries no stored reportEvidence, which a proposal
   * reads. The report is not missing and must never be described as missing —
   * only its proposal evidence needs a one-time refresh.
   */
  LEGACY: 'legacy',
  MISSING: 'missing',
  INCOMPLETE: 'incomplete',
  UNAVAILABLE: 'unavailable',
  CHECKING: 'checking',
});

/** Display text per state. */
export const READINESS_STATUS_TEXT = Object.freeze({
  [READINESS_STATE.CURRENT]: 'Current',
  [READINESS_STATE.STALE]: 'Stale',
  [READINESS_STATE.LEGACY]: 'Needs one-time evidence refresh',
  [READINESS_STATE.MISSING]: 'Missing',
  [READINESS_STATE.INCOMPLETE]: 'Incomplete',
  [READINESS_STATE.UNAVAILABLE]: 'Unavailable',
  [READINESS_STATE.CHECKING]: 'Checking…',
});

/** The three columns of the readiness table. */
export const READINESS_SOURCE = Object.freeze({
  VISUAL: 'visual',
  TECHNICAL: 'technical',
  ENGINEERING: 'engineering',
});

/** Column headings, in table order. */
export const READINESS_COLUMNS = Object.freeze([
  { key: READINESS_SOURCE.VISUAL, label: 'Visual Report' },
  { key: READINESS_SOURCE.TECHNICAL, label: 'Technical Report' },
  { key: READINESS_SOURCE.ENGINEERING, label: 'Engineering Authority' },
]);

/**
 * The verb that introduces a state's clause. It is stated ONCE per state, so a
 * sentence with two things wrong reads as prose instead of repeating itself:
 *   "Level 1 version is missing Visual and Technical Reports and the calculated
 *    engineering result."
 *   "Level 4 version has a stale Visual Report and a stale Technical Report."
 * Mirrored verbatim in
 * src/components/proposal/sourceAuthority/proposalReadinessAuthority.js.
 */
export const READINESS_VERB = Object.freeze({
  [READINESS_STATE.MISSING]: 'is missing',
  [READINESS_STATE.STALE]: 'has',
  [READINESS_STATE.LEGACY]: 'has',
  [READINESS_STATE.INCOMPLETE]: 'has',
  [READINESS_STATE.UNAVAILABLE]: 'has',
});

/**
 * The label both reports are stated under when BOTH are missing — the only case
 * stated as a single item: "Level 1 version is missing Visual and Technical
 * Reports."
 */
export const READINESS_COMBINED_REPORT_LABEL = 'Visual and Technical Reports';

/** Panel heading for the readiness table. */
export const PROPOSAL_READINESS_TITLE = 'Version readiness';

/** Shown once every selected version reads Current. */
export const PROPOSAL_READINESS_READY_COPY =
  'Every selected version has its current reports and engineering results. '
  + 'The proposal will be generated from these versions.';

/** The one-line rule, for documentation and tests. */
export const PROPOSAL_READINESS_RULE =
  'Every selected version must have current reports and engineering results = the proposal can be generated.';

/** The published-engineering result states, as read from the version pointer. */
export const PUBLICATION_STATUS = Object.freeze({
  PUBLISHED: 'published',
  NOT_CALCULATED: 'not_calculated',
  STALE: 'stale',
  READ_FAILED: 'read_failed',
});

/** The saved-report payload generation. A payload from another one is not usable. */
export const REPORT_SNAPSHOT_SCHEMA_VERSION = 1;

/** The reportEvidence payload generation a proposal may read. */
export const REPORT_EVIDENCE_VERSION = 1;

/**
 * Where a version's calculated engineering result was found, so the evidence
 * behind a Current engineering cell is always stated:
 *   completed_calculation_authority — the version's own current fingerprint has
 *     a completed result in its analysis cache.
 *   report_source_authority — the fingerprint the saved Technical Report was
 *     generated from is still held by the analysis cache.
 */
export const CALCULATION_AUTHORITY_SOURCE = Object.freeze({
  COMPLETED_AUTHORITY: 'completed_calculation_authority',
  REPORT_SOURCE: 'report_source_authority',
});

/** A fingerprint that is present and usable, else null. */
function asFingerprint(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** The fingerprints both sides compare, in report order. */
export const SNAPSHOT_FINGERPRINT_KEYS = Object.freeze([
  'engineeringFingerprint',
  'calculationFingerprint',
  'seatPriorityFingerprint',
]);

/**
 * Blocking labels per source and state. The engineering column states what the
 * version is actually missing rather than a generic "engineering authority",
 * and each report is named as a report ("the Visual Report").
 */
export function blockerLabel({ source, state }) {
  if (source === READINESS_SOURCE.VISUAL) return 'Visual Report';
  if (source === READINESS_SOURCE.TECHNICAL) return 'Technical Report';
  if (state === READINESS_STATE.STALE) return 'bass authority';
  if (state === READINESS_STATE.INCOMPLETE) return 'engineering results';
  if (state === READINESS_STATE.MISSING) return 'calculated engineering result';
  return 'engineering results';
}

/**
 * The version name the designer saved — `Level 4 version`, `Original Design` —
 * stated exactly, with NO slot suffix. A version called "Level 1 version" is
 * never written as "Level 1 version · V2". A version with no usable name falls
 * back to the slot, then to "Version".
 */
export function versionDisplayName(version = {}) {
  const name = typeof version?.version_name === 'string' ? version.version_name.trim() : '';
  const number = Number(version?.version_number);
  const hasNumber = Number.isFinite(number) && number > 0;
  if (name) return name;
  return hasNumber ? `Version ${number}` : 'Version';
}

/** One report cell's state, from the saved report and its fingerprint comparison. */
export function resolveReportCellState({ hasSaved = false, snapshotStatus = null, checking = false, legacy = false, incomplete = false } = {}) {
  if (checking) return READINESS_STATE.CHECKING;
  if (!hasSaved) return READINESS_STATE.MISSING;
  if (snapshotStatus === 'stale') return READINESS_STATE.STALE;
  // The report exists and is current, but the evidence it carries may not be
  // read: its parity check failed, so it is Incomplete rather than Missing.
  if (incomplete) return READINESS_STATE.INCOMPLETE;
  // The report exists and is current; it simply predates the proposal evidence
  // capture, so it needs refreshing rather than being called Missing.
  if (legacy) return READINESS_STATE.LEGACY;
  if (snapshotStatus === 'current') return READINESS_STATE.CURRENT;
  // A saved report that cannot be restored is not a usable source.
  return READINESS_STATE.MISSING;
}

/** A cell: its state, its display text and when it was generated. */
export function buildReadinessCell({ state, generatedAt = null, reason = null }) {
  return {
    state,
    status: READINESS_STATUS_TEXT[state] || READINESS_STATUS_TEXT[READINESS_STATE.MISSING],
    current: state === READINESS_STATE.CURRENT,
    checking: state === READINESS_STATE.CHECKING,
    generatedAt: state === READINESS_STATE.CURRENT ? generatedAt || null : null,
    reason,
  };
}

/** Normalise a partial fingerprint set into the canonical three-key shape. */
export function buildSourceFingerprints(input = {}) {
  const source = (input && typeof input === 'object') ? input : {};
  const asText = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };
  return {
    engineeringFingerprint: asText(source.engineeringFingerprint),
    calculationFingerprint: asText(source.calculationFingerprint),
    seatPriorityFingerprint: asText(source.seatPriorityFingerprint),
  };
}

/**
 * Compare the fingerprints a saved report was generated from against the ones
 * read now. A fingerprint stated on only one side is never compared, so an
 * unreadable fingerprint never manufactures staleness.
 */
export function compareSourceFingerprints(saved, current) {
  const savedFp = buildSourceFingerprints(saved);
  const currentFp = buildSourceFingerprints(current);
  const changed = [];
  const compared = [];

  for (const key of SNAPSHOT_FINGERPRINT_KEYS) {
    const before = savedFp[key];
    const now = currentFp[key];
    if (!before || !now) continue;
    compared.push(key);
    if (before !== now) changed.push(key);
  }

  return { changed, compared };
}

/**
 * Whether a saved report can be restored: it must carry a payload and be written
 * under the current payload generation.
 */
export function isSavedReportRestorable(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  if (Number(snapshot.report_schema_version) !== REPORT_SNAPSHOT_SCHEMA_VERSION) return false;
  const payload = snapshot.payload;
  return !!payload && typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload).length > 0;
}

/**
 * The proposal evidence a saved report carries, and whether a proposal may read
 * it:
 *   'none'        no evidence stored at all, and not a usable one: a report
 *                 written before the evidence capture. It is a LEGACY snapshot,
 *                 never a missing one.
 *   'incomplete'  evidence stored, but its parity check failed or it is missing
 *                 required facts, so it may not be read until the report is
 *                 regenerated.
 *   'ready'       evidence stored and verified against the report itself.
 */
export function resolveEvidenceState(saved) {
  const evidence = saved?.payload?.reportEvidence;
  if (!evidence || typeof evidence !== 'object') return 'none';
  if (Number(evidence.evidence_version) !== REPORT_EVIDENCE_VERSION) return 'none';
  return evidence.proposal_ready === true ? 'ready' : 'incomplete';
}

/**
 * Whether a saved report carries proposal evidence a proposal may read. A report
 * written before that capture existed has pages and fingerprints but no evidence
 * — it is a legacy snapshot, not a missing one.
 */
export function hasProposalEvidence(saved) {
  return resolveEvidenceState(saved) === 'ready';
}

/** One saved report → its readiness cell. */
export function resolveSavedReportCell({ saved = null, currentFingerprints = null, evidenceState = null } = {}) {
  // No matching saved report for this project version and report type: Missing.
  if (!isSavedReportRestorable(saved)) {
    return buildReadinessCell({ state: READINESS_STATE.MISSING });
  }
  const { changed } = compareSourceFingerprints(saved.source_fingerprints, currentFingerprints);
  // The fingerprints the saved report was generated from no longer match: Stale.
  if (changed.length > 0) {
    return buildReadinessCell({ state: READINESS_STATE.STALE, generatedAt: saved.generated_at || null });
  }
  // The evidence is stored, but it does not agree with what the report shows —
  // or it is missing required facts. It may not be read until the report is
  // regenerated, and the report is never called Missing.
  if ((evidenceState || resolveEvidenceState(saved)) === 'incomplete') {
    return buildReadinessCell({
      state: READINESS_STATE.INCOMPLETE,
      generatedAt: saved.generated_at || null,
      reason: 'This report’s evidence does not match what the report shows. Regenerate it.',
    });
  }
  // The report exists and is current, but its evidence was never captured: it
  // needs refreshing, and it is never Missing.
  if (!hasProposalEvidence(saved)) {
    return buildReadinessCell({ state: READINESS_STATE.LEGACY, generatedAt: saved.generated_at || null });
  }
  return buildReadinessCell({ state: READINESS_STATE.CURRENT, generatedAt: saved.generated_at || null });
}

/** The fingerprints describing the project AS IT STANDS NOW, from the publication. */
export function buildCurrentSourceFingerprints({
  engineeringFingerprint = null,
  calculationFingerprint = null,
  seatPriorityFingerprint = null,
} = {}) {
  return buildSourceFingerprints({
    engineeringFingerprint,
    calculationFingerprint,
    seatPriorityFingerprint,
  });
}

/**
 * The version's completed calculation authority, read from its
 * ProjectAnalysisCache record — the calculated engineering result a Technical
 * Report is generated from. Pure: it reads the record it is GIVEN and nothing
 * else, so the same record yields the same answer on both sides of the boundary.
 *
 * The version's own current fingerprint is preferred. When that fingerprint
 * carries no completed result, the fingerprint the saved Technical Report was
 * generated from is accepted if the cache still holds it — the report's own
 * source authority, which is what "the engineering result is not missing" means.
 *
 * @returns {{fingerprint, source, completedAt}|null}
 */
export function resolveCalculationAuthority({ cacheRecord = null, savedTechnicalReport = null } = {}) {
  const record = (cacheRecord && typeof cacheRecord === 'object' && !Array.isArray(cacheRecord))
    ? cacheRecord
    : null;
  if (!record) return null;

  const snapshots = (record.completed_by_fingerprint
    && typeof record.completed_by_fingerprint === 'object'
    && !Array.isArray(record.completed_by_fingerprint))
    ? record.completed_by_fingerprint
    : {};

  const foundFor = (fingerprint) => {
    const key = asFingerprint(fingerprint);
    if (!key) return null;
    const entry = snapshots[key];
    return (entry && typeof entry === 'object') ? { fingerprint: key, entry } : null;
  };

  // The result's own completion time, when the record states one.
  const completedAtOf = (entry) => {
    const ms = Number(entry?.job?.completedAtMs);
    if (!Number.isFinite(ms) || ms <= 0) return null;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  };

  const authority = (found, source) => (found
    ? { fingerprint: found.fingerprint, source, completedAt: completedAtOf(found.entry) }
    : null);

  const current = authority(foundFor(record.current_fingerprint), CALCULATION_AUTHORITY_SOURCE.COMPLETED_AUTHORITY);
  if (current) return current;

  const stated = buildSourceFingerprints(savedTechnicalReport?.source_fingerprints).calculationFingerprint;
  return authority(foundFor(stated), CALCULATION_AUTHORITY_SOURCE.REPORT_SOURCE);
}

/**
 * One version's engineering cell — judged by durable evidence alone.
 * A browser-session handoff is never consulted here: the server cannot see one,
 * so neither may the table.
 *
 * A published publication and a completed calculation authority are the SAME
 * calculated engineering result stated two ways, so either one reads Current.
 * Only when neither exists can the cell be Missing or Stale.
 */
export function resolveEngineeringCell({
  publication = null,
  publicationStatus = PUBLICATION_STATUS.NOT_CALCULATED,
  calculationAuthority = null,
} = {}) {
  if (publication && publicationStatus === PUBLICATION_STATUS.PUBLISHED) {
    return buildReadinessCell({
      state: READINESS_STATE.CURRENT,
      generatedAt: publication.published_at || null,
    });
  }
  // A completed bass/calibration cache is not a full durable engineering publication.
  if (publicationStatus === PUBLICATION_STATUS.READ_FAILED) {
    return buildReadinessCell({ state: READINESS_STATE.UNAVAILABLE, reason: 'The saved engineering result could not be read.' });
  }
  if (publicationStatus === PUBLICATION_STATUS.STALE) {
    return buildReadinessCell({
      state: READINESS_STATE.STALE,
      reason: 'The saved engineering result no longer matches this version. Recalculate it in Room Designer.',
    });
  }
  return buildReadinessCell({
    state: READINESS_STATE.MISSING,
    reason: 'Engineering assessment not saved. Assessment values may be displayed, but are not published. Verify bass and publish this version in Room Designer.',
  });
}

/** The object phrase a state's verb is said of. */
export function statePhrase(state, label) {
  if (label === READINESS_COMBINED_REPORT_LABEL) return label;
  if (state === READINESS_STATE.MISSING) return `the ${label}`;
  if (state === READINESS_STATE.STALE) return `a stale ${label}`;
  if (state === READINESS_STATE.LEGACY) return `a current ${label}, but it needs a one-time evidence refresh`;
  if (state === READINESS_STATE.INCOMPLETE) return `incomplete ${label}`;
  return `unreadable ${label}`;
}

/** One source's blocking clause, e.g. "is missing the Visual Report". */
export function buildClause(state, label) {
  return `${READINESS_VERB[state] || READINESS_VERB[READINESS_STATE.MISSING]} ${statePhrase(state, label)}`;
}

/**
 * The blockers of one version, each carrying its own sentence clause.
 * @returns {Array<{source, state, label, clause, sentence}>}
 */
export function buildVersionBlockers({ versionName, visual, technical, engineering }) {
  const blockers = [];
  const push = (source, cell) => {
    if (!cell || cell.current || cell.checking) return;
    const label = blockerLabel({ source, state: cell.state });
    const clause = buildClause(cell.state, label);
    blockers.push({ source, state: cell.state, label, clause, sentence: `${versionName} ${clause}` });
  };

  push(READINESS_SOURCE.VISUAL, visual);
  push(READINESS_SOURCE.TECHNICAL, technical);
  push(READINESS_SOURCE.ENGINEERING, engineering);
  return blockers;
}

/**
 * The version's blocking sentence. The two reports are stated as one clause when
 * BOTH are missing — "Level 1 version is missing Visual and Technical Reports." —
 * and named one at a time otherwise, so the sentence always names the source
 * that is actually missing.
 */
export function buildBlockingSentence({ versionName, visual, technical, engineering }) {
  const isBlocked = (cell) => !!cell && !cell.current && !cell.checking;
  const sentences = [];

  // A legacy report EXISTS and is current, so it is never stated as missing:
  // each one is named in full, on its own, exactly as the designer must read it.
  for (const { cell, label } of [
    { cell: visual, label: 'Visual Report' },
    { cell: technical, label: 'Technical Report' },
  ]) {
    if (isBlocked(cell) && cell.state === READINESS_STATE.LEGACY) {
      sentences.push(`${versionName} has a current ${label}, but it needs a one-time evidence refresh`);
    }
  }

  // Every other blocked source is grouped by state, so several in the same state
  // still read as one sentence. A legacy report is never in these groups.
  const items = [];
  const visualGrouped = isBlocked(visual) && visual.state !== READINESS_STATE.LEGACY;
  const technicalGrouped = isBlocked(technical) && technical.state !== READINESS_STATE.LEGACY;
  const bothReportsMissing = visualGrouped && technicalGrouped
    && visual.state === READINESS_STATE.MISSING && technical.state === READINESS_STATE.MISSING;
  if (bothReportsMissing) {
    items.push({ state: READINESS_STATE.MISSING, label: READINESS_COMBINED_REPORT_LABEL });
  } else {
    if (visualGrouped) items.push({ state: visual.state, label: blockerLabel({ source: READINESS_SOURCE.VISUAL, state: visual.state }) });
    if (technicalGrouped) items.push({ state: technical.state, label: blockerLabel({ source: READINESS_SOURCE.TECHNICAL, state: technical.state }) });
  }
  if (isBlocked(engineering)) items.push({ state: engineering.state, label: blockerLabel({ source: READINESS_SOURCE.ENGINEERING, state: engineering.state }) });

  if (items.length > 0) {
    // Consecutive items in the same state share one verb, so the sentence never
    // repeats itself. Items in different states are stated one at a time.
    const groups = [];
    for (const item of items) {
      const last = groups[groups.length - 1];
      if (last && last.state === item.state) last.items.push(item);
      else groups.push({ state: item.state, items: [item] });
    }

    const phrases = groups.map((group) => {
      const [leading, ...rest] = group.items;
      const head = buildClause(group.state, leading.label);
      if (rest.length === 0) return head;
      return `${head} and ${rest.map((item) => statePhrase(group.state, item.label)).join(' and ')}`;
    });

    sentences.push(`${versionName} ${phrases.join(' and ')}`);
  }

  return sentences.length > 0 ? sentences.join('. ') : null;
}

/**
 * One version's readiness row.
 *
 * @returns {Object} row — version_id, the saved version name, the three source
 *   statuses, the per-source cells, the blocking reasons and the sentence.
 */
export function resolveVersionReadinessRow({ versionId, versionName, versionNumber = null, cells = {} }) {
  const visual = cells.visual || buildReadinessCell({ state: READINESS_STATE.MISSING });
  const technical = cells.technical || buildReadinessCell({ state: READINESS_STATE.MISSING });
  const engineering = cells.engineering || buildReadinessCell({ state: READINESS_STATE.MISSING });
  const blockers = buildVersionBlockers({ versionName, visual, technical, engineering });
  const checking = visual.checking || technical.checking || engineering.checking;

  return {
    versionId,
    versionName,
    versionNumber,
    visual,
    technical,
    engineering,
    cells: { visual, technical, engineering },
    visual_report_status: visual.status,
    technical_report_status: technical.status,
    engineering_result_status: engineering.status,
    blockers,
    blockingSentence: buildBlockingSentence({ versionName, visual, technical, engineering }),
    ready: !checking && blockers.length === 0,
    checking,
  };
}

/**
 * The ONE per-version readiness rule, from the version's stored sources.
 * Both the server gate and the Step 5 table call this.
 *
 * @param {Object} params
 * @param {Object|null} params.version            the ProjectVersion record
 * @param {Object} params.savedReports           { visual, technical } saved reports
 * @param {Object|null} params.publication        the published engineering publication
 * @param {string} params.publicationStatus      PUBLICATION_STATUS
 * @param {Object|null} params.currentFingerprints
 * @param {Object|null} params.calculationAuthority  the version's completed
 *        calculation authority, as returned by resolveCalculationAuthority
 * @returns {Object} readiness row
 */
export function resolveVersionReadiness({
  version = null,
  savedReports = {},
  publication = null,
  publicationStatus = PUBLICATION_STATUS.NOT_CALCULATED,
  currentFingerprints = null,
  calculationAuthority = null,
} = {}) {
  return resolveVersionReadinessRow({
    versionId: version?.id || null,
    versionName: versionDisplayName(version || {}),
    versionNumber: version?.version_number ?? null,
    cells: {
      visual: resolveSavedReportCell({ saved: savedReports?.visual || null, currentFingerprints }),
      technical: resolveSavedReportCell({ saved: savedReports?.technical || null, currentFingerprints }),
      engineering: resolveEngineeringCell({ publication, publicationStatus, calculationAuthority }),
    },
  });
}

/** The named sentence for the whole gate: one sentence per blocked version. */
export function buildReadinessMessage(rows = []) {
  const sentences = (Array.isArray(rows) ? rows : [])
    .map((row) => row?.blockingSentence)
    .filter(Boolean);
  return sentences.length > 0 ? `${sentences.join('. ')}.` : null;
}

/**
 * Resolve the whole gate from the per-version rows.
 *
 * @param {Object} params
 * @param {Array} params.rows
 * @param {boolean} [params.loading]     the readiness read is in flight
 * @param {number} [params.minVersions]  versions required by the report type
 * @param {number|null} [params.maxVersions]
 * @returns {{available, checking, ready, rows, blockers, message, detail, versionCountValid}}
 */
export function resolveProposalReadinessGate({
  rows = [],
  loading = false,
  minVersions = 1,
  maxVersions = null,
} = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const checking = !!loading || list.some((row) => row.checking);
  const versionCountValid = list.length >= (minVersions || 1)
    && (maxVersions == null || list.length <= maxVersions);
  const blocked = list.filter((row) => !row.ready);
  const ready = !checking && versionCountValid && blocked.length === 0;
  const message = ready || checking ? null : buildReadinessMessage(blocked);

  return {
    available: list.length > 0,
    checking,
    ready,
    rows: list,
    versionCountValid,
    blockedVersions: blocked.map((row) => ({
      version_id: row.versionId,
      version_name: row.versionName,
      blockers: row.blockers.map((blocker) => ({
        source: blocker.source,
        state: blocker.state,
        label: blocker.label,
      })),
      reason: row.blockingSentence,
    })),
    blockers: blocked.flatMap((row) => row.blockers),
    // While the read is in flight nothing is missing: the table says Checking and
    // no blocking sentence is shown, because none is known yet.
    message: ready || checking ? null : message,
    detail: ready
      ? PROPOSAL_READINESS_READY_COPY
      : checking
        ? 'Checking each selected version’s reports and engineering results…'
        : 'Generate the named source, or open the named legacy report once to refresh its evidence, then return to this step.',
  };
}

export default resolveProposalReadinessGate;