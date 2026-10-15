/**
 * ProposalEditorNotices
 * ---------------------
 * The strip above the document: what the workspace has to say about the proposal
 * and about the designer's own work in progress, stated there rather than mixed
 * into the document itself.
 *
 *   - a project this proposal points at that could not be read
 *   - an archived proposal, with the way to restore it
 *   - a manual edit in progress, or unsaved changes waiting to be written
 *
 * Presentation only: it holds no state and decides nothing, so the editor keeps
 * one place for its own condition.
 *
 * Props:
 * - contextNotice: a sentence about the linked project, or null
 * - archived / restoring / onRestore: archived read-only state, and the restore
 * - manualEditInProgress: a section is open for manual editing
 * - unsavedSectionCount: how many sections have unsaved changes
 */

import React from 'react';
import { Archive, RotateCcw } from 'lucide-react';

export default function ProposalEditorNotices({
  contextNotice = null,
  archived = false,
  restoring = false,
  onRestore,
  manualEditInProgress = false,
  unsavedSectionCount = 0,
}) {
  return (
    <>
      {contextNotice && (
        <div className="mb-4 text-xs text-[#7A6640] flex items-start gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#A79E8C] mt-1" />
          {contextNotice}
        </div>
      )}

      {archived && (
        <div className="mb-8 rounded-lg border border-[#A79E8C] bg-[#F5F4F0] px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#625143]" style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
              <Archive className="w-4 h-4" />
              Archived proposal — restore to edit.
            </div>
            <p className="text-xs text-[#8A8477] mt-1">This proposal is read-only. Restore it to make changes.</p>
          </div>
          <button
            onClick={onRestore}
            disabled={restoring}
            className="flex items-center gap-1.5 px-4 py-2 text-xs uppercase tracking-[0.14em] text-white disabled:opacity-40 transition-colors hover:bg-[#3E4349]"
            style={{ backgroundColor: '#213428', fontFamily: 'Didact Gothic, sans-serif' }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {restoring ? 'Restoring…' : 'Restore'}
          </button>
        </div>
      )}

      {manualEditInProgress && !archived ? (
        <div className="mb-4 text-xs text-[#213428] flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#213428]" />
          Manual edit in progress — Save commits this section, Cancel restores the previous text.
        </div>
      ) : unsavedSectionCount > 0 && !archived && (
        <div className="mb-4 text-xs text-amber-700 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Unsaved changes — {unsavedSectionCount} {unsavedSectionCount === 1 ? 'section' : 'sections'} pending. Do not close this tab until saved.
        </div>
      )}
    </>
  );
}