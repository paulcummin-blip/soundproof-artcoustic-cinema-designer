/**
 * ProjectAssetsSection
 * --------------------
 * A collapsible section listing all stored assets for one project, grouped by
 * design version. Shown on project cards (Projects page) and in the Room
 * Designer header (Documents & Assets control).
 *
 * Assets include every issued PDF type:
 *   - Technical Report (project / technical / visual)
 *   - Speaker Design
 *   - Client Proposal (proposal / comparison / system_design_summary)
 *   - Uploaded project images and design drawings
 *
 * Only assets that actually exist (with a file_uri or file_url) are listed.
 * Each asset has an individual download link. A "Download All" action builds a
 * ZIP from the stored files — nothing is regenerated on demand.
 *
 * Read-only: this section never creates, modifies or deletes any document.
 */
import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Download, FileText, Image as ImageIcon, Package, Loader2 } from 'lucide-react';
import { useProjectWorkflowAssets } from './useProjectWorkflowAssets';
import { downloadProjectAssetsZip } from './downloadProjectAssetsZip';
import { resolveIssuedDocumentUrl } from '@/components/library/issuedDocument/issuedDocumentActions';
import { ISSUED_DOCUMENT_LABEL, ISSUED_DOCUMENT_TYPE } from '@/components/library/issuedDocument/issuedDocumentTypes';
import { standardFilenameForExportRecord } from './standardAssetFilename';

/** Human-friendly label for a document type, falling back to the raw value. */
function documentTypeLabel(documentType) {
  return ISSUED_DOCUMENT_LABEL[documentType] || documentType || 'Document';
}

/** Short date string for a revision subtitle. */
function formatExportDate(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * Resolve the version id a document belongs to.
 * Returns null for multi-version documents (comparisons) — those are project-wide.
 */
function resolveVersionId(record) {
  if (record?.version_id) return record.version_id;
  const selected = Array.isArray(record?.selected_version_ids) ? record.selected_version_ids : [];
  if (selected.length === 1) return selected[0];
  // Multi-version comparison or no version → project-wide
  return null;
}

function downloadSingle(record, fallbackName, downloadName) {
  return async () => {
    try {
      const url = await resolveIssuedDocumentUrl(record);
      if (!url) { alert('This document is no longer available in storage.'); return; }
      const response = await fetch(url);
      if (!response.ok) { alert('This document is no longer available in storage.'); return; }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = downloadName || record?.filename || fallbackName || 'document.pdf';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    } catch {
      alert('This document could not be downloaded.');
    }
  };
}

function downloadImage(url, caption) {
  return async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) { alert('This image could not be downloaded.'); return; }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      const ext = (url || '').match(/\.([a-zA-Z0-9]+)(\?|$)/);
      anchor.download = (caption || 'image') + (ext ? `.${ext[1]}` : '.png');
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    } catch {
      alert('This image could not be downloaded.');
    }
  };
}

function AssetRow({ icon: Icon, name, sub, onDownload }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-[#F8F8F7] transition-colors">
      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: '#8B8378' }} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-[#1B1A1A] truncate">{name}</div>
        {sub && <div className="text-[10px] text-[#8B8378] truncate">{sub}</div>}
      </div>
      <button
        type="button"
        onClick={onDownload}
        className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-[#E2DED7] transition-colors shrink-0"
        title="Download"
      >
        <Download className="w-3 h-3" style={{ color: '#625143' }} />
      </button>
    </div>
  );
}

export default function ProjectAssetsSection({ projectId, projectName, compact = false, alwaysLoad = false, project = null }) {
  const [open, setOpen] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [requested, setRequested] = useState(false);
  const [downloadPending, setDownloadPending] = useState(false);
  // Cards must not fan out three requests for every project on page load.
  const { exports, images, versions, loading, loaded, error, refresh } = useProjectWorkflowAssets({ projectId, enabled: !compact || requested || alwaysLoad });

  const versionNameById = new Map();
  for (const v of versions) {
    const name = String(v?.version_name || '').trim() || `Version ${v?.version_number || ''}`;
    versionNameById.set(v?.id, name);
  }

  // Group exports by version. Multi-version documents (comparisons with more
  // than one selected_version_id) are project-wide — they don't belong to one
  // exact design version.
  const exportsByVersion = new Map();
  const projectWideExports = [];
  for (const record of exports) {
    if (!record?.file_uri && !record?.file_url) continue;
    const versionId = resolveVersionId(record);
    if (versionId) {
      if (!exportsByVersion.has(versionId)) exportsByVersion.set(versionId, []);
      exportsByVersion.get(versionId).push(record);
    } else {
      projectWideExports.push(record);
    }
  }

  // Group images by scope
  const imagesByVersion = new Map();
  const projectWideImages = [];
  for (const record of images) {
    if (!record?.file_url) continue;
    if (record?.scope === 'version' && record?.version_id) {
      if (!imagesByVersion.has(record.version_id)) imagesByVersion.set(record.version_id, []);
      imagesByVersion.get(record.version_id).push(record);
    } else {
      projectWideImages.push(record);
    }
  }

  const totalAssets = exports.filter((e) => e?.file_uri || e?.file_url).length
    + images.filter((i) => i?.file_url).length;

  const handleDownloadAll = async () => {
    if (!loaded || error) { setDownloadPending(true); setRequested(true); setOpen(true); if (error) refresh(); return; }
    if (zipping || totalAssets === 0) return;
    setZipping(true);
    try {
      await downloadProjectAssetsZip({ projectName, exports, images, versions, project });
    } catch (err) {
      console.error('[ProjectAssetsSection] ZIP failed:', err);
      alert('Could not build the asset ZIP. Please try again.');
    } finally {
      setZipping(false);
    }
  };

  useEffect(() => {
    if (!downloadPending || loading) return;
    if (error) { setDownloadPending(false); return; }
    if (loaded) { setDownloadPending(false); void handleDownloadAll(); }
  }, [downloadPending, loading, loaded, error]);

  const labelClass = compact
    ? 'text-[11px] font-semibold uppercase tracking-[0.08em] text-[#625143]'
    : 'text-xs font-semibold uppercase tracking-[0.1em] text-[#625143]';

  return (
    <div className="border border-[#E2DED7] rounded-lg bg-[#FBFAF8]">
      <button
        type="button"
        onClick={() => { setRequested(true); setOpen((v) => !v); if (error) refresh(); }}
        className="flex items-center justify-between w-full px-3 py-2 transition-colors hover:bg-[#F5F4F0]"
      >
        <span className="flex items-center gap-2">
          {open
            ? <ChevronDown className="w-3.5 h-3.5" style={{ color: '#625143' }} />
            : <ChevronRight className="w-3.5 h-3.5" style={{ color: '#625143' }} />}
          <Package className="w-3.5 h-3.5" style={{ color: '#213428' }} />
          <span className={labelClass}>Project Assets{loaded && !error ? ` (${totalAssets})` : loading && (requested || alwaysLoad) ? ' (…)': ''}</span>
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); handleDownloadAll(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handleDownloadAll(); } }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-[#DCDBD6] text-[#3E4349] bg-white hover:bg-[#F8F8F7] transition-colors cursor-pointer"
        >
          {zipping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          {zipping ? 'Zipping…' : 'Download All'}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-[#E2DED7] space-y-3 max-h-64 overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 py-3 text-xs text-[#8B8378]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading assets…
            </div>
          )}
          {!loading && error && (
            <div className="py-3 text-xs text-[#8B8378]" role="alert">
              {error} <button type="button" onClick={refresh} className="underline">Retry</button>
            </div>
          )}
          {!loading && !error && loaded && totalAssets === 0 && (
            <p className="py-3 text-xs text-[#8B8378]">No stored assets yet. Export documents and they will appear here.</p>
          )}

          {/* Project-wide assets (multi-version comparisons + project-wide images) */}
          {!loading && (projectWideExports.length > 0 || projectWideImages.length > 0) && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#A79E8C] mb-1">Project-wide</div>
              {projectWideExports.map((record) => {
                const dateStr = formatExportDate(record?.exported_at);
                return (
                  <AssetRow
                    key={record.id}
                    icon={FileText}
                    name={standardFilenameForExportRecord(record, project, versionNameById)}
                    sub={`${documentTypeLabel(record.document_type)}${record.rendering === 'text_vector' ? ' · Text-only fallback — regenerate for designed PDF' : ''}${dateStr ? ' · ' + dateStr : ''}`}
                    onDownload={downloadSingle(record, 'document.pdf', standardFilenameForExportRecord(record, project, versionNameById))}
                  />
                );
              })}
              {projectWideImages.map((record) => (
                <AssetRow
                  key={record.id}
                  icon={ImageIcon}
                  name={record.caption || record.slot || 'Image'}
                  sub="Project image"
                  onDownload={downloadImage(record.file_url, record.caption || 'image')}
                />
              ))}
            </div>
          )}

          {/* Version-specific assets */}
          {!loading && versions.map((version) => {
            const versionId = version.id;
            const versionExports = exportsByVersion.get(versionId) || [];
            const versionImages = imagesByVersion.get(versionId) || [];
            if (versionExports.length === 0 && versionImages.length === 0) return null;
            const versionName = String(version?.version_name || '').trim() || `Version ${version?.version_number || ''}`;
            return (
              <div key={versionId}>
                <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#A79E8C] mb-1">{versionName}</div>
                {versionExports.map((record) => {
                  const dateStr = formatExportDate(record?.exported_at);
                  return (
                    <AssetRow
                      key={record.id}
                      icon={FileText}
                      name={standardFilenameForExportRecord(record, project, versionNameById)}
                      sub={`${documentTypeLabel(record.document_type)}${record.rendering === 'text_vector' ? ' · Text-only fallback — regenerate for designed PDF' : ''}${dateStr ? ' · ' + dateStr : ''}`}
                      onDownload={downloadSingle(record, 'document.pdf', standardFilenameForExportRecord(record, project, versionNameById))}
                    />
                  );
                })}
                {versionImages.map((record) => (
                  <AssetRow
                    key={record.id}
                    icon={ImageIcon}
                    name={record.caption || record.slot || 'Image'}
                    sub="Version image"
                    onDownload={downloadImage(record.file_url, record.caption || 'image')}
                  />
                ))}
              </div>
            );
          })}

          {/* Assets for versions that no longer have a ProjectVersion record (deleted version) */}
          {!loading && (() => {
            const knownVersionIds = new Set(versions.map((v) => v.id));
            const orphanVersionIds = new Set();
            for (const versionId of exportsByVersion.keys()) {
              if (!knownVersionIds.has(versionId)) orphanVersionIds.add(versionId);
            }
            for (const versionId of imagesByVersion.keys()) {
              if (!knownVersionIds.has(versionId)) orphanVersionIds.add(versionId);
            }
            if (orphanVersionIds.size === 0) return null;
            return Array.from(orphanVersionIds).map((versionId) => {
              const versionExports = exportsByVersion.get(versionId) || [];
              const versionImages = imagesByVersion.get(versionId) || [];
              if (versionExports.length === 0 && versionImages.length === 0) return null;
              return (
                <div key={versionId}>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#A79E8C] mb-1">
                    Version (deleted)
                  </div>
                  {versionExports.map((record) => {
                    const dateStr = formatExportDate(record?.exported_at);
                    return (
                      <AssetRow
                        key={record.id}
                        icon={FileText}
                        name={standardFilenameForExportRecord(record, project, versionNameById)}
                        sub={`${documentTypeLabel(record.document_type)}${record.rendering === 'text_vector' ? ' · Text-only fallback — regenerate for designed PDF' : ''}${dateStr ? ' · ' + dateStr : ''}`}
                        onDownload={downloadSingle(record, 'document.pdf', standardFilenameForExportRecord(record, project, versionNameById))}
                      />
                    );
                  })}
                  {versionImages.map((record) => (
                    <AssetRow
                      key={record.id}
                      icon={ImageIcon}
                      name={record.caption || record.slot || 'Image'}
                      sub="Version image"
                      onDownload={downloadImage(record.file_url, record.caption || 'image')}
                    />
                  ))}
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}