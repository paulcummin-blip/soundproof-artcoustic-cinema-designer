/**
 * downloadProjectAssetsZip
 * ------------------------
 * Builds a ZIP of all stored project assets — issued PDFs and uploaded images
 * — grouped by design version, and triggers a browser download.
 *
 * Only files that actually exist (file_uri or file_url) are included. A file
 * that cannot be fetched is skipped and reported in the manifest; it never
 * blocks the rest of the ZIP. No document is regenerated on demand.
 *
 * Folder structure:
 *   ProjectName/
 *     Project-wide assets/
 *       <filename>
 *     VersionName/
 *       <filename>
 *
 * Private files (file_uri) are signed for a short window at fetch time using
 * the existing CreateFileSignedUrl integration. Public files (file_url) are
 * fetched directly.
 */
import JSZip from 'jszip';
import { base44 } from '@/api/base44Client';

const MANIFEST_FILENAME = 'MANIFEST.txt';

function sanitizeName(name) {
  return String(name || 'Project').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Project';
}

async function resolveFileUrl(record) {
  if (record?.file_uri) {
    try {
      const result = await base44.integrations.Core.CreateFileSignedUrl({
        file_uri: record.file_uri,
        expires_in: 300,
      });
      return result?.signed_url || null;
    } catch {
      return null;
    }
  }
  return record?.file_url || null;
}

async function fetchBlob(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.blob();
}

/**
 * Build and download a ZIP of all stored assets for a project.
 *
 * @param {Object} params
 * @param {string} params.projectName
 * @param {Array}  params.exports  — ProjectAssetExport records
 * @param {Array}  params.images   — ProposalAsset records
 * @param {Array}  params.versions — ProjectVersion records
 * @returns {Promise<{ok: boolean, skipped: Array, downloaded: number}>}
 */
export async function downloadProjectAssetsZip({ projectName, exports = [], images = [], versions = [] }) {
  const zip = new JSZip();
  const rootName = sanitizeName(projectName);
  const root = zip.folder(rootName);
  const skipped = [];
  let downloaded = 0;

  const versionNameById = new Map();
  for (const v of versions) {
    const name = String(v?.version_name || '').trim() || `Version ${v?.version_number || ''}`;
    versionNameById.set(v?.id, name);
  }

  const addFile = async (folder, filename, url) => {
    try {
      const blob = await fetchBlob(url);
      const safeName = sanitizeName(filename) || 'file';
      // Deduplicate filenames within the same folder
      let candidate = safeName;
      let n = 1;
      while (folder.files[`${folder.root.slice(0, -1)}/${candidate}`] || folder.child(candidate)) {
        const dot = safeName.lastIndexOf('.');
        candidate = dot > 0 ? `${safeName.slice(0, dot)} (${n})${safeName.slice(dot)}` : `${safeName} (${n})`;
        n++;
      }
      folder.file(candidate, blob);
      downloaded += 1;
    } catch (err) {
      skipped.push({ filename, reason: err?.message || 'fetch failed' });
    }
  };

  // Issued PDFs grouped by version
  for (const record of exports) {
    if (!record?.file_uri && !record?.file_url) {
      skipped.push({ filename: record?.filename || record?.title || 'unknown', reason: 'no stored file' });
      continue;
    }
    const url = await resolveFileUrl(record);
    if (!url) {
      skipped.push({ filename: record?.filename || record?.title || 'unknown', reason: 'could not sign file' });
      continue;
    }
    const versionId = record?.version_id
      || (Array.isArray(record?.selected_version_ids) && record.selected_version_ids[0])
      || null;
    const versionName = versionId ? (versionNameById.get(versionId) || `Version ${versionId.slice(0, 8)}`) : null;
    const folder = versionName
      ? root.folder(sanitizeName(versionName))
      : root.folder('Project-wide');
    await addFile(folder, record?.filename || `${record?.document_type || 'document'}.pdf`, url);
  }

  // Uploaded images grouped by scope (project or version)
  for (const record of images) {
    if (!record?.file_url) {
      skipped.push({ filename: record?.caption || 'image', reason: 'no stored file' });
      continue;
    }
    const scope = record?.scope || 'project';
    const folder = scope === 'version' && record?.version_id
      ? root.folder(sanitizeName(versionNameById.get(record.version_id) || `Version ${record.version_id.slice(0, 8)}`))
      : root.folder('Project-wide');
    const ext = (record?.file_url || '').match(/\.([a-zA-Z0-9]+)(\?|$)/);
    const extStr = ext ? `.${ext[1]}` : '.png';
    const name = sanitizeName(record?.caption || record?.slot || 'image') + extStr;
    await addFile(folder, name, record.file_url);
  }

  // Manifest of skipped files
  if (skipped.length > 0) {
    const manifest = skipped.map((s) => `${s.filename}: ${s.reason}`).join('\n');
    root.file(MANIFEST_FILENAME, `The following files could not be included:\n\n${manifest}\n`);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `${rootName} Assets.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);

  return { ok: true, skipped, downloaded };
}

export default downloadProjectAssetsZip;