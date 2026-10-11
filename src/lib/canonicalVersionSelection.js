/**
 * canonicalVersionSelection.js
 * ----------------------------
 * ONE shared canonical version-selection rule for the whole app.
 *
 * A project should never show two records for the same version slot. A lazy
 * V1 migration that ran twice can leave a project with two Version 1 records:
 * one holding the real design, and one empty artefact. Both stay in the
 * database untouched — this module only decides which record a normal workflow
 * may list, select and judge readiness against.
 *
 * The rule, in order:
 *
 *   PRIORITY 1 — the project's own pointer.
 *     When Project.active_version_id names a record in the slot, that record is
 *     the canonical one. It is the app's single source of truth, so it wins
 *     outright.
 *
 *   PRIORITY 2 — verified evidence, never recency.
 *     Without a usable pointer, the slot is decided by what the record actually
 *     holds: an engineering publication, a saved Project Report, meaningful
 *     saved design state, or linked business records. Timestamps and array
 *     order are never consulted.
 *
 *   UNRESOLVED — flag, never guess.
 *     When two same-slot records both carry independent design data, neither is
 *     discarded: both stay visible, and the slot is flagged for administrative
 *     review. When no reliable choice exists at all, the same applies. The rule
 *     never invents a canonical record.
 *
 * Derivation only: pure functions, no reads, no writes.
 */

/**
 * The design collections that mean a version holds a real design. A migration
 * artefact carries scalar settings (a screen size, a target SPL) while holding
 * no speakers, no seats and no subwoofers — so only collections are counted.
 */
const DESIGN_COLLECTION_KEYS = [
  'selected_speakers',
  'placed_speakers',
  'speakers',
  'subwoofers',
  'subwooferInstances',
  'subwoofer_instances',
  'seating_positions',
  'seatingPositions',
  'spl_speaker_nodes',
  'room_elements',
];

/** Saved objects that only exist once a real design has been worked on. */
const DESIGN_OBJECT_KEYS = [
  'selected_speakers_by_role',
  'optimiser_plan',
  'applied_calibration',
];

/**
 * Evidence weights. Any one verified evidence type outranks every weaker one,
 * and the ordering is fixed: publication > report > design > linked records.
 */
const EVIDENCE_WEIGHT = Object.freeze({
  publication: 8,
  report: 4,
  design: 2,
  linked: 1,
});

/** Why a same-slot group could not be resolved. */
export const COLLISION_REASON = Object.freeze({
  /** Two or more records each hold independent design data. */
  INDEPENDENT_DESIGN_DATA: 'independent_design_data',
  /** No verified evidence on any record in the slot. */
  NO_RELIABLE_EVIDENCE: 'no_reliable_evidence',
});

/** Design state values may be stored parsed or as a JSON string. */
function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    return null;
  }
}

/** Whether a design_state value holds anything at all. */
function holdsAnything(value) {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed.length > 0;
  if (parsed && typeof parsed === 'object') return Object.keys(parsed).length > 0;
  return false;
}

/**
 * Whether a design_state is a real design — it holds speakers, seating or
 * subwoofers — rather than an empty migration artefact that merely carries
 * scalar defaults.
 */
export function hasMeaningfulDesignState(designState) {
  const state = parseMaybeJson(designState);
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  if (DESIGN_COLLECTION_KEYS.some((key) => holdsAnything(state[key]))) return true;
  return DESIGN_OBJECT_KEYS.some((key) => {
    const parsed = parseMaybeJson(state[key]);
    return !!parsed
      && typeof parsed === 'object'
      && !Array.isArray(parsed)
      && Object.keys(parsed).length > 0;
  });
}

/**
 * What one version record actually holds. The published engineering pointer and
 * the design state are read from the record itself; the saved Project Report and
 * any linked business records are supplied by a caller that has already read
 * them. Nothing is inferred.
 */
export function resolveVersionEvidence(record = {}, supplied = null) {
  const given = (supplied && typeof supplied === 'object') ? supplied : {};
  return {
    hasPublication: given.hasPublication !== undefined
      ? given.hasPublication === true
      : !!record?.published_fingerprint,
    hasProjectReport: given.hasProjectReport === true,
    hasMeaningfulDesign: given.hasMeaningfulDesign !== undefined
      ? given.hasMeaningfulDesign === true
      : hasMeaningfulDesignState(record?.design_state),
    hasLinkedRecords: given.hasLinkedRecords === true,
  };
}

/** The evidence score of one version record. */
export function versionEvidenceScore(evidence = {}) {
  let score = 0;
  if (evidence.hasPublication) score += EVIDENCE_WEIGHT.publication;
  if (evidence.hasProjectReport) score += EVIDENCE_WEIGHT.report;
  if (evidence.hasMeaningfulDesign) score += EVIDENCE_WEIGHT.design;
  if (evidence.hasLinkedRecords) score += EVIDENCE_WEIGHT.linked;
  return score;
}

/** Read one project's supplied evidence from a Map, a plain object or nothing. */
function suppliedEvidenceFor(evidenceByVersionId, versionId) {
  if (!evidenceByVersionId || !versionId) return null;
  if (typeof evidenceByVersionId.get === 'function') {
    return evidenceByVersionId.get(versionId) || null;
  }
  return evidenceByVersionId[versionId] || null;
}

/**
 * THE canonical selection rule.
 *
 * @param {Object} params
 * @param {Array<Object>} params.versions               any ProjectVersion records
 * @param {string|null} [params.activeVersionId]        one project's active-version pointer
 * @param {Map|Object|null} [params.activeVersionIdByProject]  one pointer per project
 * @param {Map|Object|null} [params.evidenceByVersionId] saved-report / linked-record
 *        evidence a caller has already read, keyed by version id
 * @returns {{versions: Array, duplicates: Array, collisions: Array, byId: Map}}
 *   versions    — the canonical records to list, select and judge readiness on
 *   duplicates  — preserved records excluded from normal workflows
 *   collisions  — same-slot groups that could not be resolved, for review
 *   byId        — every record, so any exact id still resolves
 */
export function selectCanonicalVersions({
  versions = [],
  activeVersionId = null,
  activeVersionIdByProject = null,
  evidenceByVersionId = null,
} = {}) {
  const records = (Array.isArray(versions) ? versions : []).filter((record) => record && record.id);

  const pointerFor = (projectId) => {
    if (activeVersionIdByProject) {
      if (typeof activeVersionIdByProject.get === 'function') {
        return activeVersionIdByProject.get(projectId) || null;
      }
      return activeVersionIdByProject[projectId] || null;
    }
    return activeVersionId || null;
  };

  // Group by project and version slot — the only grouping that may collapse.
  const groups = new Map();
  for (const record of records) {
    const projectId = record.project_id || '';
    const slot = Number(record.version_number);
    const key = `${projectId}::${Number.isFinite(slot) ? slot : 'none'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  const selected = [];
  const duplicates = [];
  const collisions = [];

  for (const members of groups.values()) {
    if (members.length === 1) {
      selected.push(members[0]);
      continue;
    }

    // PRIORITY 1 — the project's own pointer.
    const pointed = pointerFor(members[0].project_id);
    const pointedMember = pointed ? members.find((member) => member.id === pointed) : null;
    if (pointedMember) {
      selected.push(pointedMember);
      duplicates.push(...members.filter((member) => member.id !== pointedMember.id));
      continue;
    }

    // PRIORITY 2 — verified evidence. No timestamp, no iteration order.
    const scored = members.map((record) => {
      const evidence = resolveVersionEvidence(
        record,
        suppliedEvidenceFor(evidenceByVersionId, record.id),
      );
      return { record, evidence, score: versionEvidenceScore(evidence) };
    });
    const topScore = Math.max(...scored.map((entry) => entry.score));
    const leaders = scored.filter((entry) => entry.score === topScore);

    if (leaders.length === 1) {
      selected.push(leaders[0].record);
      duplicates.push(...members.filter((member) => member.id !== leaders[0].record.id));
      continue;
    }

    // UNRESOLVED — keep every member of the slot and flag it. Nothing is
    // silently discarded and no canonical record is invented.
    selected.push(...members);
    collisions.push({
      projectId: members[0].project_id || null,
      versionNumber: Number(members[0].version_number),
      versionIds: members.map((member) => member.id),
      versionNames: members.map((member) => member.version_name || null),
      reason: topScore > 0
        ? COLLISION_REASON.INDEPENDENT_DESIGN_DATA
        : COLLISION_REASON.NO_RELIABLE_EVIDENCE,
    });
  }

  // Reading order is the slot order; within a slot the records keep their input
  // order, so a flagged pair is never reordered between reads.
  selected.sort((a, b) => (Number(a.version_number) || 0) - (Number(b.version_number) || 0));

  return {
    versions: selected,
    duplicates,
    collisions,
    byId: new Map(records.map((record) => [record.id, record])),
  };
}

/** The collisions that belong to one project. */
export function collisionsForProject(collisions = [], projectId = null) {
  if (!projectId) return [];
  return (Array.isArray(collisions) ? collisions : [])
    .filter((collision) => String(collision.projectId || '') === String(projectId));
}

export default selectCanonicalVersions;