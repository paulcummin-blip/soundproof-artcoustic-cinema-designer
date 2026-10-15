/**
 * ProposalWorkspaceToolbar
 * ------------------------
 * The working proposal toolbar. Sits at the top of the Proposal Editor
 * workspace, directly beneath the Sound Proof / Artcoustic hero, so the
 * controls belong to the document being edited rather than floating over
 * the branding.
 *
 * Left:  proposal identity (title, project, proposal type)
 * Right: Client Brief, Export Proposal PDF (primary)
 *
 * Export Proposal PDF is the ONLY document action. There is no preview: the PDF
 * is prepared from the same A4 pack, printed, and stored in the Project Library
 * as the issued document — and it may only be created once every generated
 * narrative section has been explicitly approved and the evidence check passes.
 */

import React from 'react';
import { FileText, Download, Loader2, AlertCircle, RotateCw } from 'lucide-react';

import { REPORT_FONT_BODY as FONT } from '@/components/report/typography/reportTypography';
import PaginationFailureDetails from '@/components/proposal/export/PaginationFailureDetails';
import ProposalCopyReviewSummary from '@/components/proposal/editor/ProposalCopyReviewSummary';

const SECONDARY_IDLE =
  'flex items-center gap-1.5 px-3 py-2 text-xs uppercase tracking-[0.12em] rounded-md border transition-colors border-[#DCDBD6] bg-white text-[#3E4349] hover:bg-[#F5F4F0]';
const SECONDARY_ACTIVE =
  'flex items-center gap-1.5 px-3 py-2 text-xs uppercase tracking-[0.12em] rounded-md border transition-colors border-[#213428] bg-[#213428] text-white';

export default function ProposalWorkspaceToolbar({
  title,
  projectName,
  typeLabel,
  showClientBrief,
  onToggleClientBrief,
  exporting,
  onExport,
  blockedReason,
  // The copy review state the server resolved with the copy layer: the document's
  // own evidence check, and how much generated copy still awaits approval. It is
  // shown as its own status so unapproved wording is never read as an engineering
  // fault, and it is what tells the designer why an export click was stopped.
  review = null,
  // The human approval state of the document's generated sections, resolved with
  // the copy layer. It is what the copy line reports — how many sections a person
  // has read and approved — and it is a different answer from the evidence check.
  approval = null,
  error,
  // A preparation failure the designer can simply retry: it restarts the whole
  // print preparation from the start, without reloading the app.
  retryable = false,
  // The technical record of a pagination stop, when that is why the export
  // failed. Rendered inside PaginationFailureDetails, which shows it to a
  // master-admin login only.
  errorDetail = null,
}) {
  const message = blockedReason || error;

  return (
    <div className="bg-white border-b border-[#DCDBD6] flex-shrink-0">
      <div className="px-6 py-3 flex items-center justify-between gap-6">
        {/* ── Left: proposal identity ── */}
        <div className="min-w-0">
          <div
            className="text-base font-bold text-[#1B1A1A] truncate"
            style={{ fontFamily: FONT }}
          >
            {title || 'Proposal'}
          </div>
          <div
            className="text-xs text-[#625143] truncate mt-0.5"
            style={{ fontFamily: FONT }}
          >
            {[projectName, typeLabel].filter(Boolean).join(' · ') || 'No project linked'}
          </div>
        </div>

        {/* ── Right: working controls ── */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onToggleClientBrief}
            aria-pressed={showClientBrief}
            className={showClientBrief ? SECONDARY_ACTIVE : SECONDARY_IDLE}
            style={{ fontFamily: FONT }}
          >
            <FileText className="w-3.5 h-3.5" />
            Client Brief
          </button>

          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-4 py-2 text-xs uppercase tracking-[0.12em] rounded-md text-white transition-colors hover:bg-[#3E4349] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#213428', fontFamily: FONT }}
          >
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            {exporting ? 'Preparing PDF…' : 'Export Proposal PDF'}
          </button>
        </div>
      </div>

      {review && (
        <div className="px-6 pb-3">
          <ProposalCopyReviewSummary review={review} approval={approval} />
        </div>
      )}

      {message && (
        <div className="px-6 pb-3">
          <div
            role="status"
            className="flex items-start gap-2 px-3 py-2 rounded-md text-xs leading-relaxed"
            style={{
              backgroundColor: '#FBF3E6',
              border: '1px solid #B99B70',
              color: '#4A230F',
              fontFamily: FONT,
            }}
          >
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{message}</span>
            {retryable && (
              <button
                type="button"
                onClick={onExport}
                disabled={exporting}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#B99B70] text-[11px] uppercase tracking-[0.12em] text-[#4A230F] transition-colors hover:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ fontFamily: FONT }}
              >
                {exporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RotateCw className="w-3.5 h-3.5" />
                )}
                {exporting ? 'Preparing…' : 'Retry Export'}
              </button>
            )}
          </div>

          {/* Why a composition refused to print: the block, its measured height
              and the printable height it exceeded. Master-admin only. */}
          <PaginationFailureDetails diagnostics={errorDetail} />
        </div>
      )}
    </div>
  );
}