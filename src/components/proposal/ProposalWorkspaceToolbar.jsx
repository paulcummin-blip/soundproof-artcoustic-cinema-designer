/**
 * ProposalWorkspaceToolbar
 * ------------------------
 * The working proposal toolbar. Sits at the top of the Proposal Editor
 * workspace, directly beneath the Sound Proof / Artcoustic hero, so the
 * controls belong to the document being edited rather than floating over
 * the branding.
 *
 * Left:  proposal identity (title, project, proposal type)
 * Right: Client Brief, Show Properties (secondary), Export Proposal PDF (primary)
 */

import React from 'react';
import { FileText, SlidersHorizontal, Download, Loader2, AlertCircle } from 'lucide-react';

import { REPORT_FONT_BODY as FONT } from '@/components/report/typography/reportTypography';

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
  showProperties,
  onToggleProperties,
  exporting,
  onExport,
  blockedReason,
  error,
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
            onClick={onToggleProperties}
            aria-pressed={showProperties}
            className={showProperties ? SECONDARY_ACTIVE : SECONDARY_IDLE}
            style={{ fontFamily: FONT }}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Show Properties
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
          </div>
        </div>
      )}
    </div>
  );
}