/**
 * speakerDesignChecklistReadiness.js
 * ----------------------------------
 * THE equipment checklist of one design version, as the proposal states it.
 *
 * The Current Speaker Design IS the checklist: the positions this version
 * specifies, the model at each, and how many of each. It is written to Project
 * Library by the Project Report export, which stores the schedule beside the
 * report against the same project and the same version. This row therefore reads
 * the records that already exist — it creates no second store, and the only way
 * to create or update a checklist is the Project Report workflow that already
 * writes it.
 *
 * The row STATES the checklist and never gates a proposal: generation stays
 * decided by the Project Report alone. A checklist that is missing or out of date
 * is reported with its reason and the ONE action that produces it — the same
 * Project Report route, which stores the report and the schedule together.
 *
 * Pure: it reads the records it is given and states what they say. It calculates,
 * grades and exports nothing.
 */

import {
  ISSUED_DOCUMENT_TYPE,
  issuedDocumentLabel,
} from '@/components/library/issuedDocument/issuedDocumentTypes';
import {
  READINESS_STATE,
  READINESS_STATUS_TEXT,
  buildProjectReportAction,
} from './proposalReadinessAuthority';

/** The document type a stored checklist is listed under in Project Library. */
export const SPEAKER_DESIGN_DOCUMENT_TYPE = ISSUED_DOCUMENT_TYPE.SPEAKER_DESIGN;

/** The row's own name — the same name Project Library lists the document under. */
export const SPEAKER_DESIGN_LABEL = issuedDocumentLabel(ISSUED_DOCUMENT_TYPE.SPEAKER_DESIGN);

/** What the checklist is, said once, for a row that is missing or out of date. */
export const SPEAKER_DESIGN_CHECKLIST_COPY =
  'The Speaker Design is this version\u2019s equipment checklist: the positions it specifies, the model at each, and how many.';

export const SPEAKER_DESIGN_MISSING_COPY =
  `No Speaker Design PDF is stored for this version. ${SPEAKER_DESIGN_CHECKLIST_COPY}`;

export const SPEAKER_DESIGN_STALE_COPY =
  `The stored Speaker Design PDF was created before the design changed. ${SPEAKER_DESIGN_CHECKLIST_COPY}`;

/**
 * The row's own status words: an absent checklist is Missing and one the design
 * has moved past is Stale, so the designer is told which of the two it is.
 */
const SPEAKER_DESIGN_STATUS_TEXT = Object.freeze({
  [READINESS_STATE.CURRENT]: 'Current',
  [READINESS_STATE.STALE]: 'Stale',
  [READINESS_STATE.MISSING]: 'Missing',
  [READINESS_STATE.CHECKING]: READINESS_STATUS_TEXT[READINESS_STATE.CHECKING],
});

/** A fingerprint that is present and usable, else null. */
const asFingerprint = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/** The exported-at time of a stored document, for choosing the newest. */
const exportedAtMs = (record) => {
  const ms = new Date(record?.exported_at || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

/**
 * The version's CURRENT stored checklist: the newest Speaker Design PDF issued
 * for that version. Every earlier one is superseded by a newer export, which is
 * how Project Library reads them too.
 */
export function selectStoredSpeakerDesign(records = [], versionId = null) {
  const list = (Array.isArray(records) ? records : [])
    .filter((record) => String(record?.document_type || '') === SPEAKER_DESIGN_DOCUMENT_TYPE)
    .filter((record) => !versionId || String(record?.version_id || '') === String(versionId));
  if (list.length === 0) return null;
  return list.reduce((newest, record) => (exportedAtMs(record) > exportedAtMs(newest) ? record : newest));
}

/**
 * One version's checklist cell.
 *
 * Current — a stored Speaker Design PDF exists for this version and nothing shows
 *           the design has moved past it.
 * Stale   — one exists, but the engineering publication it was issued against is
 *           no longer this version's. A fingerprint stated on only one side is
 *           never compared, so an unreadable fingerprint cannot manufacture
 *           staleness.
 * Missing — nothing is stored for this version.
 *
 * @returns {{ state, status, current, checking, generatedAt, reason, action }}
 */
export function resolveSpeakerDesignCell({
  stored = null,
  currentEngineeringFingerprint = null,
  checking = false,
} = {}) {
  if (checking) {
    return {
      state: READINESS_STATE.CHECKING,
      status: SPEAKER_DESIGN_STATUS_TEXT[READINESS_STATE.CHECKING],
      current: false,
      checking: true,
      generatedAt: null,
      reason: null,
    };
  }

  if (!stored) {
    return {
      state: READINESS_STATE.MISSING,
      status: SPEAKER_DESIGN_STATUS_TEXT[READINESS_STATE.MISSING],
      current: false,
      checking: false,
      generatedAt: null,
      reason: SPEAKER_DESIGN_MISSING_COPY,
    };
  }

  const storedFingerprint = asFingerprint(stored.source_fingerprints?.engineeringFingerprint);
  const currentFingerprint = asFingerprint(currentEngineeringFingerprint);
  if (storedFingerprint && currentFingerprint && storedFingerprint !== currentFingerprint) {
    return {
      state: READINESS_STATE.STALE,
      status: SPEAKER_DESIGN_STATUS_TEXT[READINESS_STATE.STALE],
      current: false,
      checking: false,
      generatedAt: stored.exported_at || null,
      reason: SPEAKER_DESIGN_STALE_COPY,
    };
  }

  return {
    state: READINESS_STATE.CURRENT,
    status: SPEAKER_DESIGN_STATUS_TEXT[READINESS_STATE.CURRENT],
    current: true,
    checking: false,
    generatedAt: stored.exported_at || null,
    reason: null,
  };
}

/**
 * The ONE action a checklist row offers: the Project Report workflow, which
 * writes the Speaker Design with the report. No second button and no second
 * workflow exists — an updated report is requested for a checklist the design has
 * moved past, and a new one where nothing is stored.
 */
export function buildSpeakerDesignAction({ state = null, projectId = null, versionId = null } = {}) {
  if (!state || state === READINESS_STATE.CURRENT || state === READINESS_STATE.CHECKING) return null;
  return buildProjectReportAction({ state, projectId, versionId });
}

export default resolveSpeakerDesignCell;