import React from 'react';
import { PenLine, Plus, Minus, Wrench, Home, Lock, Unlock, StickyNote } from 'lucide-react';
import { REGENERATION_ACTIONS } from '@/components/proposal/proposalSections';

const ICONS = { PenLine, Plus, Minus, Wrench, Home };

/**
 * Floating section toolbar — appears when a section is active.
 * Contains regeneration actions, lock toggle, and dealer notes toggle.
 *
 * Props:
 * - section: the active ProposalSection
 * - onRegenerate: (action) => void
 * - onToggleLock: () => void
 * - onToggleNotes: () => void
 * - onReorder: (direction) => void
 * - isRegenerating: boolean
 */
export default function SectionToolbar({ section, onRegenerate, onToggleLock, onToggleNotes, isRegenerating }) {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg shadow-md border border-[#DCDBD6] bg-white">
      {/* Regeneration actions */}
      {REGENERATION_ACTIONS.map((action) => {
        const Icon = ICONS[action.icon] || PenLine;
        return (
          <button
            key={action.value}
            type="button"
            onClick={() => onRegenerate(action.value)}
            disabled={isRegenerating}
            title={action.label}
            className="flex items-center gap-1 px-2 py-1 text-xs text-[#3E4349] hover:bg-[#F5F4F0] rounded transition-colors disabled:opacity-50"
          >
            <Icon className="w-3.5 h-3.5" />
            {action.label}
          </button>
        );
      })}

      <div className="w-px h-5 bg-[#DCDBD6]" />

      {/* Lock toggle */}
      <button
        type="button"
        onClick={onToggleLock}
        title={section?.locked ? 'Unlock section' : 'Lock section'}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
          section?.locked
            ? 'text-[#213428] font-semibold bg-[#F5F4F0]'
            : 'text-[#3E4349] hover:bg-[#F5F4F0]'
        }`}
      >
        {section?.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        {section?.locked ? 'Locked' : 'Lock'}
      </button>

      <div className="w-px h-5 bg-[#DCDBD6]" />

      {/* Dealer notes toggle */}
      <button
        type="button"
        onClick={onToggleNotes}
        title="Dealer Notes"
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
          section?.dealer_notes
            ? 'text-[#625143] font-semibold bg-[#F5F4F0]'
            : 'text-[#3E4349] hover:bg-[#F5F4F0]'
        }`}
      >
        <StickyNote className="w-3.5 h-3.5" />
        Notes
      </button>
    </div>
  );
}