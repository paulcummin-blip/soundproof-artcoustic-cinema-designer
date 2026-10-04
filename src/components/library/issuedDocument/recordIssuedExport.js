/**
 * recordIssuedExport.js
 * ---------------------
 * Stores an exported PDF as a fixed Project Library asset.
 *
 * Rules this module exists to hold:
 *   - Only an explicit export stores anything. Background generation and
 *     previewing never reach here.
 *   - The export itself is never delayed or put at risk. The composition is
 *     cloned synchronously at click time and everything else happens in the
 *     background; if storage fails the designer keeps the exported PDF and is
 *     told so.
 *   - A document that cannot be captured page-for-page is never stored. No
 *     misleading Library asset is created in its place.
 */

import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';
import { captureCompositionToPdf } from '@/components/library/compositionCapture';
import { notifyIssuedExportStored } from '@/components/library/issuedExportSignal';
import { ISSUED_DOCUMENT_COMPOSITION, issuedDocumentLabel } from './issuedDocumentTypes';

export const STORAGE_FAILURE_MESSAGE = 'PDF was exported but could not be stored in Project Library';
const STORAGE_FAILURE_DETAIL = 'Your PDF exported normally. Export again to store a copy in the Project Library.';

/**
 * Clone the print composition the export prints, synchronously, at click time —
 * before any export state clears the composition from the page.
 *
 * @returns {{nodeHtml: string, pageSelector: string, bodyClass: string}|null}
 */
export function snapshotIssuedComposition(documentType) {
  const composition = ISSUED_DOCUMENT_COMPOSITION[documentType];
  if (!composition || typeof document === 'undefined') return null;
  const node = document.querySelector(composition.nodeSelector);
  if (!node) return null;
  return {
    // A literal "</script" inside stored rich text would end the capture document early.
    nodeHtml: String(node.outerHTML || '').replace(/<\/script/gi, '<\\/script'),
    pageSelector: composition.pageSelector,
    bodyClass: composition.bodyClass,
  };
}

/**
 * The issued document is stored in the app's private files area — it is not
 * world-readable, and Open / Download sign a short-lived URL at click time.
 */
async function storePdf(file) {
  const result = await base44.integrations.Core.UploadPrivateFile({ file });
  if (!result?.file_uri) throw new Error('The exported PDF could not be written to storage.');
  return { file_uri: result.file_uri };
}

/**
 * Capture, store and record one issued document.
 * @returns {Promise<Object>} the created Library asset record
 */
export async function storeIssuedDocument({ identity, snapshot }) {
  // A caller may resolve its source identity (versions, fingerprints, source
  // state at export) asynchronously — in the background, never on the click.
  const resolved = typeof identity.resolveSource === 'function' ? (await identity.resolveSource()) || {} : {};
  const issued = { ...identity, ...resolved };

  const { blob, pageCount } = await captureCompositionToPdf(snapshot);
  const filename = issued.filename.endsWith('.pdf') ? issued.filename : `${issued.filename}.pdf`;
  const file = new File([blob], filename, { type: 'application/pdf' });
  const stored = await storePdf(file);

  return base44.entities.ProjectAssetExport.create({
    project_id: issued.projectId,
    account_id: issued.accountId || null,
    document_type: issued.documentType,
    title: issued.title || '',
    filename,
    version_id: issued.versionId || null,
    selected_version_ids: Array.isArray(issued.selectedVersionIds) ? issued.selectedVersionIds : [],
    source_record_id: issued.sourceRecordId || null,
    file_uri: stored.file_uri,
    exported_at: new Date().toISOString(),
    exported_by: issued.exportedBy || null,
    source_fingerprints: issued.sourceFingerprints || {},
    source_status_at_export: issued.sourceStatusAtExport || 'current',
    page_count: pageCount,
    superseded_by_id: null,
  });
}

/**
 * Record an issued document in the background, after the export has already
 * been triggered. Never throws: a failure is reported to the designer and no
 * Library asset is created.
 */
export function recordIssuedExportInBackground({ identity, snapshot }) {
  if (!identity?.projectId || !snapshot) return;

  void (async () => {
    try {
      const record = await storeIssuedDocument({ identity, snapshot });
      // An open Project Library reads again as soon as the row exists, so a
      // designer who exported and went straight back sees what they exported.
      notifyIssuedExportStored(record?.project_id || identity.projectId);
      toast({
        title: 'Stored in Project Library',
        description: `${issuedDocumentLabel(identity.documentType)} · ${record.filename}`,
      });
    } catch (error) {
      console.error('[ProjectLibrary] Issued document could not be stored:', error);
      toast({
        title: STORAGE_FAILURE_MESSAGE,
        description: STORAGE_FAILURE_DETAIL,
        variant: 'destructive',
      });
    }
  })();
}

export default recordIssuedExportInBackground;