/**
 * speakerDesignIssuedDocument.js
 * ------------------------------
 * The Current Speaker Design, stored as an ISSUED document in Project Library.
 *
 * A Project Report export carries this schedule with it. When the report is
 * exported, the version's Current Speaker Design is created from the SAME version
 * authority — the frozen design state the report was built from — and stored as
 * its own document type ("Speaker Design") against the same project and the same
 * version, so the designer never has to remember a second PDF button.
 *
 * The schedule is the ONE the Current Speaker Design panel exports: Position,
 * Model and Qty, with the dual-centre wording folded into the Model cell and no
 * Notes column. The same node builder, the same print styles and the same shared
 * filename authority are used, so the panel's download and the Library copy are
 * the same document.
 *
 * Rules this module exists to hold:
 *   - It writes ONE issued document record and its stored PDF file, and nothing
 *     else: no report record, no report snapshot, no report evidence, and no
 *     change to the design, the system layout or any count.
 *   - It is never allowed to cost the report its own Library copy. It runs
 *     separately, after the report's own storage has been started.
 *   - A failure names itself — "Project Report saved, but Speaker Design PDF
 *     could not be created." — and offers the same retry the export path does.
 *
 * Read-only and pure with respect to the design: nothing here calculates,
 * grades, re-counts or re-orders anything.
 */

import {
  buildSpeakerDesignFilename,
  buildSpeakerDesignNode,
  speakerDesignExportDate,
} from '@/components/roomdesigner/speakerDesignPdf';
import {
  ISSUED_DOCUMENT_TYPE,
  issuedDocumentLabel,
} from '@/components/library/issuedDocument/issuedDocumentTypes';
import {
  recordIssuedExportInBackground,
  snapshotIssuedComposition,
} from '@/components/library/issuedDocument/recordIssuedExport';

/**
 * Shown when the report's Library copy landed but the schedule's did not. It
 * states both outcomes, so the designer knows the report itself is safe.
 */
export const SPEAKER_DESIGN_STORAGE_FAILURE_TITLE =
  'Project Report saved, but Speaker Design PDF could not be created.';

/**
 * The schedule as a detached print node, exactly as the panel prints it. Null
 * when the version holds no speaker design to state — nothing is stored then, and
 * nothing is claimed to exist.
 */
export function buildSpeakerDesignIssuedNode({
  groups = [],
  layout = null,
  projectName = null,
  clientName = null,
  versionName = null,
} = {}) {
  if (!Array.isArray(groups) || groups.length === 0) return null;
  return buildSpeakerDesignNode({
    groups,
    layout,
    projectName,
    clientName,
    versionName,
    dateLabel: speakerDesignExportDate(),
  });
}

/**
 * Create and store the version's Current Speaker Design PDF in the background.
 *
 * Takes the version identity from the report's own issued document, so the
 * schedule can only ever belong to the version the Project Report was made from.
 * Never throws: a failure is reported to the designer with the reason, and a
 * retry re-runs this same call against the same version.
 *
 * @param {Object} parameters
 * @param {Array}    parameters.groups  the schedule rows, from the design's own authority
 * @param {string}   [parameters.layout] the version's system layout
 * @param {string}   [parameters.projectName]
 * @param {string}   [parameters.dealerName]
 * @param {string}   [parameters.clientName]
 * @param {string}   [parameters.projectReference]
 * @param {string}   [parameters.versionName]
 * @param {string}   [parameters.projectId]
 * @param {string}   [parameters.accountId]
 * @param {Function} [parameters.resolveSource] resolves the version id and fingerprints
 * @param {string}   [parameters.exportedBy]
 * @returns {boolean} true when the storage attempt was started
 */
export function storeSpeakerDesignInBackground(parameters = {}) {
  const {
    groups = [],
    layout = null,
    projectName = null,
    dealerName = null,
    clientName = null,
    projectReference = null,
    versionName = null,
    versionNumber = null,
    projectId = null,
    accountId = null,
    resolveSource = null,
    exportedBy = null,
  } = parameters;

  if (!projectId) return false;

  const filename = buildSpeakerDesignFilename({
    projectName,
    dealerName,
    clientName,
    projectReference,
    versionName,
    versionNumber,
  });
  const node = buildSpeakerDesignIssuedNode({ groups, layout, projectName, clientName, versionName });

  return recordIssuedExportInBackground({
    identity: {
      projectId,
      accountId,
      documentType: ISSUED_DOCUMENT_TYPE.SPEAKER_DESIGN,
      title: issuedDocumentLabel(ISSUED_DOCUMENT_TYPE.SPEAKER_DESIGN),
      filename,
      resolveSource,
      exportedBy,
      storageFailureTitle: SPEAKER_DESIGN_STORAGE_FAILURE_TITLE,
      // Nothing held to store (the schedule could not be built) exports it again
      // from the same version — the button offering that says so.
      retryExport: () => storeSpeakerDesignInBackground(parameters),
    },
    // The node is this schedule's own print composition, handed to the capture
    // explicitly; it is not a mounted page of the app. An empty node means the
    // composition could not be built, which the storage path reports.
    snapshot: node
      ? snapshotIssuedComposition(ISSUED_DOCUMENT_TYPE.SPEAKER_DESIGN, node)
      : { nodeHtml: '' },
  });
}

export default storeSpeakerDesignInBackground;