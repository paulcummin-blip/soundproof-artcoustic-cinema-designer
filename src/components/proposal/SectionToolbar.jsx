import React from 'react';
import { PenLine, Plus, Minus, Wrench, Home, RefreshCw, Lock, Unlock, StickyNote, Pencil, Check, X, Loader2 } from 'lucide-react';
import { REGENERATION_ACTIONS } from '@/components/proposal/proposalSections';
import { MANUAL_EDIT_LABEL } from '@/components/proposal/proposalManualEdit';

const ICONS = { PenLine, Plus, Minus, Wrench, Home, RefreshCw };

/**
 * Floating section toolbar — appears when a section is active.
 * Contains the manual Edit control, regeneration actions, lock toggle and
 * dealer notes toggle.
 *
 * Manual edit is not AI: Edit makes this block editable, Save commits this
 * block only, Cancel restores the text that was there when editing began.
 *
 * Props:
 * - section: the active ProposalSection
 * - onRegenerate: (action) => void
 * - onToggleLock: () => void
 * - onToggleNotes: () => void
 * - isRegenerating: boolean
 * - isEditing: manual edit mode is active for this section
 * - isManuallyEdited: the stored text carries a manual edit
 * - isSavingEdit: the manual Save is in flight
 * - onStartEdit / onSaveEdit / onCancelEdit: () => void
 */
export default function SectionToolbar({
  section,
  onRegenerate,
  onToggleLock,
  onToggleNotes,
  isRegenerating,
  isEditing = false,
  isManuallyEdited = false,
  isSavingEdit = false,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
}) {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg shadow-md border border-[#DCDBD6] bg-white">
      {/* Manual edit — wording changes by hand, no AI */}
      {isEditing ? (
        <>
          <span className="px-1 text-xs text-[#625143]">Editing manually</span>
          <button
            type="button"
            onClick={onSaveEdit}
            disabled={isSavingEdit}
            title="Save this section"
            className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-white rounded transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#213428' }}
          >
            {isSavingEdit ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Save
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            disabled={isSavingEdit}
            title="Discard changes and restore the previous text"
            className="flex items-center gap-1 px-2 py-1 text-xs text-[#3E4349] hover:bg-[#F5F4F0] rounded transition-colors disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
          <div className="w-px h-5 bg-[#DCDBD6]" />
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onStartEdit}
            title={section?.locked ? 'This section is locked — Edit asks to unlock first' : 'Edit the wording of this section by hand'}
            className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-[#213428] hover:bg-[#F5F4F0] rounded transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
          <div className="w-px h-5 bg-[#DCDBD6]" />
        </>
      )}

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

      {isManuallyEdited && !isEditing && (
        <>
          <div className="w-px h-5 bg-[#DCDBD6]" />
          <span
            className="px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[#625143] bg-[#F5F4F0] rounded"
            style={{ fontFamily: 'Didact Gothic, sans-serif' }}
            title="The text of this section was edited by hand"
          >
            {MANUAL_EDIT_LABEL}
          </span>
        </>
      )}
    </div>
  );
}