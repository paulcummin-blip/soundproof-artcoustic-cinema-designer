import React from 'react';
import { Pencil, Check, X, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import AdiEditorialNotice from '@/components/adi/AdiEditorialNotice';
import SectionToolbarMore from '@/components/proposal/SectionToolbarMore';
import { MANUAL_EDIT_LABEL } from '@/components/proposal/proposalManualEdit';
import {
  APPROVAL_STATUS,
  approvalChipStyle,
  approvalLabel,
  approvalMarker,
} from '@/components/proposal/editor/sectionApprovalPresentation';

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
 * - approvalStatus: 'approved' | 'needs_review', or null when this section carries
 *   no generated copy and so has nothing to approve
 * - isApproving: the approval is being written
 * - onApprove: () => void — the one action that approves this section
 * - onImproveWording: () => void — the editorial pass over this section's wording.
 *   It improves how the copy reads and changes nothing else: the facts, the figures,
 *   the levels, the scope and the products stay exactly as they are, and the copy it
 *   replaces is kept. Null for a section with no generated copy. A whole section is
 *   improved from here; a sentence or a paragraph is improved from the editor's own
 *   toolbar, where the highlighted text is.
 * - onUndoWording: () => void — puts back the wording the editorial pass replaced.
 * - isImprovingWording: the editorial pass is running
 * - canUndoAdi: the copy on screen is an ADI improvement whose earlier wording is
 *   still held behind it
 *
 * Approval is the designer's own decision about this section's generated wording.
 * It is given by the Approve action and by nothing else — not by generating the
 * copy, not by opening the section, not by a passed evidence check — and it
 * applies to this section alone. Any later change to this section's wording is
 * what returns it to Needs review; nothing here has to reset it.
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
  approvalStatus = null,
  isApproving = false,
  onApprove,
  onImproveWording = null,
  onUndoWording = null,
  isImprovingWording = false,
  canUndoAdi = false,
  // The one line ADI stated about the last editorial action on THIS section, shown
  // directly beneath these controls, and how it is cleared.
  notice = null,
  onDismissNotice = null,
}) {
  const approved = approvalStatus === APPROVAL_STATUS.APPROVED;
  const approvalChip = approvalChipStyle(approvalStatus);
  return (
    <>
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

      {/* Approve this section — the only way its generated wording is approved */}
      {approvalStatus && (
        <>
          <button
            type="button"
            onClick={() => onApprove?.()}
            disabled={isApproving || approved}
            title={approved
              ? 'This section is approved. Changing its wording returns it to review.'
              : 'Read this section, then approve its wording'}
            data-approve-section="true"
            className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded transition-colors disabled:cursor-default"
            style={{
              backgroundColor: approved ? '#EAF0EC' : '#213428',
              color: approved ? '#213428' : '#FFFFFF',
              border: approved ? '1px solid #BFCFC4' : '1px solid #213428',
            }}
          >
            {isApproving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5" />
            )}
            {isApproving ? 'Approving…' : 'Approve section'}
          </button>
        </>
      )}

      {/* ── IMPROVE THE WORDING WITH ADI ──
          The editorial pass on the copy that is already here: the same facts said
          better. It is not writing this section again and it is not a regeneration —
          the engineering writer is not asked, and no figure, level, scope or product
          changes. The wording it replaces is kept, so Undo puts it back exactly. */}
      {onImproveWording && (
        <>
          <button
            type="button"
            onClick={() => onImproveWording()}
            disabled={isImprovingWording}
            title="Improve clarity and tone, and correct statements that disagree with the saved project data."
            data-adi-improve="section"
            className="flex items-center gap-1 px-2 py-1 text-xs font-semibold whitespace-nowrap text-[#213428] bg-[#EAF0EC] border border-[#BFCFC4] hover:bg-[#DDE8E0] rounded transition-colors disabled:opacity-50"
          >
            {isImprovingWording ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Improve with ADI
          </button>
        </>
      )}

      {/* Everything else lives in one compact menu */}
      <SectionToolbarMore
        section={section}
        onRegenerate={onRegenerate}
        isRegenerating={isRegenerating}
        onToggleLock={onToggleLock}
        onToggleNotes={onToggleNotes}
        onUndoWording={onImproveWording ? onUndoWording : null}
        canUndoAdi={canUndoAdi}
        isImprovingWording={isImprovingWording}
      />

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

      {/* The section's approval state, stated where the section is worked on */}
      {approvalStatus && (
        <>
          <div className="w-px h-5 bg-[#DCDBD6]" />
          <span
            className="px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] rounded"
            style={{ fontFamily: 'Didact Gothic, sans-serif', ...(approvalChip || {}) }}
            title={approved
              ? 'A person has read and approved this section’s wording'
              : 'This generated wording has not been approved yet'}
            data-approval-status={approvalStatus}
          >
            {approvalMarker(approvalStatus)} {approvalLabel(approvalStatus)}
          </span>
        </>
      )}
    </div>
    {/* What ADI said about the editorial action on this section, in one plain line
        directly beneath the controls it was taken from. */}
    <AdiEditorialNotice
      message={notice}
      busy={isImprovingWording}
      onDismiss={onDismissNotice}
    />
    </>
  );
}