/**
 * ProposalSectionSidebar
 * ----------------------
 * The Proposal Editor's left column: the way back to the Proposal Centre, the
 * client brief shortcut, and the section list the designer navigates the document
 * with.
 *
 * Extracted from the editor page unchanged, so the page keeps its size while the
 * navigation stays exactly as it was. It renders what it is given and decides
 * nothing: the section list, the active section and every handler belong to the
 * editor, which owns the document.
 *
 * Props:
 * - clientBrief: the proposal's client brief, shown as a shortcut label
 * - onShowClientBrief: open the client brief
 * - sections: the document's sections
 * - activeSectionKey: the section the designer is working in
 * - onSelect: select a section
 * - onToggleVisibility: hide or show a section
 * - onReorder: reorder the sections
 * - readOnly: the proposal is archived
 * - proposalType: the report type being edited
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import ProposalSectionNav from '@/components/proposal/ProposalSectionNav';

export default function ProposalSectionSidebar({
  clientBrief = '',
  onShowClientBrief,
  sections = [],
  activeSectionKey = null,
  onSelect,
  onToggleVisibility,
  onReorder,
  readOnly = false,
  proposalType = null,
  // section_type → approval status, for the sections that carry generated copy.
  // The section list shows it beside each one so what still needs reading is
  // obvious without opening anything.
  approvalByType = null,
}) {
  return (
    <div className="w-56 border-r border-[#DCDBD6] bg-white flex flex-col overflow-hidden">
      <div className="p-4 border-b border-[#DCDBD6]">
        <Link
          to="/ProposalCentre"
          className="flex items-center gap-1 text-xs text-[#625143] hover:text-[#213428] mb-2"
        >
          <ChevronLeft className="w-3 h-3" />
          Proposal Centre
        </Link>
        <div
          className="text-[10px] uppercase tracking-[0.16em] text-[#A79E8C] mt-2"
          style={{ fontFamily: 'Didact Gothic, sans-serif' }}
        >
          Sections
        </div>
        <button
          onClick={onShowClientBrief}
          className="text-xs text-[#625143] hover:text-[#213428] text-left mt-1"
        >
          {clientBrief ? `${clientBrief.slice(0, 28)}${clientBrief.length > 28 ? '…' : ''}` : 'No client brief'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <ProposalSectionNav
          sections={sections}
          activeSectionKey={activeSectionKey}
          onSelect={onSelect}
          onToggleVisibility={onToggleVisibility}
          onReorder={onReorder}
          readOnly={readOnly}
          proposalType={proposalType}
          approvalByType={approvalByType}
        />
      </div>
    </div>
  );
}