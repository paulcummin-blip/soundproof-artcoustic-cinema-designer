/**
 * deleteProjectAsset
 * -------------------
 * Deletes one stored asset record by its unique id.
 *
 * Safety:
 *   - Deletes ONLY the record identified by record.id. Never by filename.
 *   - Other revisions, versions and project-wide assets are untouched.
 *   - Ownership and permissions are enforced by the entity's RLS rules
 *     (account_id match or admin) at the server. This helper performs no
 *     broad query and no overwrite.
 *   - The underlying stored file is not removed from private storage by this
 *     call; the record is the access authority, so removing it withdraws
 *     access. Each export stores its own file_uri, so a record is never
 *     deleted while another record still points at the same file.
 *   - No project geometry, RP22 calculation or report evidence is altered.
 *   - Historical generation and audit records (ProposalGeneration etc.) are
 *     never touched by this helper.
 *
 * After a successful delete, the shared issued-export signal is fired so every
 * subscriber (Project Assets list, coordinated workflow status, Download All)
 * re-reads and reflects the documents that genuinely remain.
 */
import { base44 } from '@/api/base44Client';
import { notifyIssuedExportStored } from '@/components/library/issuedExportSignal';

/**
 * Delete one stored asset.
 *
 * @param {Object} record - the asset record to delete
 * @param {'export'|'image'} kind - 'export' for ProjectAssetExport, 'image' for ProposalAsset
 * @returns {Promise<{ id: string, projectId: string }>}
 * @throws when the record cannot be identified or the server refuses the delete
 */
export async function deleteProjectAsset(record, kind) {
  const id = record?.id;
  const projectId = record?.project_id;
  if (!id) throw new Error('This asset could not be identified for deletion.');
  if (!projectId) throw new Error('This asset is not linked to a project.');

  const entity = kind === 'image'
    ? base44.entities.ProposalAsset
    : base44.entities.ProjectAssetExport;

  await entity.delete(id);
  notifyIssuedExportStored(projectId);
  return { id, projectId };
}

export default deleteProjectAsset;