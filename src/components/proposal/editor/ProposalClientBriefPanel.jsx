/**
 * ProposalClientBriefPanel
 * ------------------------
 * The Proposal Editor's right column: the client brief and the narrative focus
 * notes for the document being edited.
 *
 * Extracted from the editor page unchanged, so the page keeps its size while the
 * panel behaves exactly as it did. The brief is narrative emphasis only — it is
 * never an engineering input — and the note it carries says so on the panel
 * itself.
 *
 * Props:
 * - clientBrief: the brief text
 * - readOnly: the proposal is archived
 * - onChange(text): a change to the text
 * - onSave(): save the brief
 * - saving: the brief is being saved
 * - onClose(): close the panel
 */

import React from 'react';

export default function ProposalClientBriefPanel({
  clientBrief = '',
  readOnly = false,
  onChange,
  onSave,
  saving = false,
  onClose,
}) {
  return (
    <div className="w-72 border-l border-[#DCDBD6] bg-white p-4 overflow-y-auto flex-shrink-0">
      <div className="flex items-center justify-between mb-3">
        <h3
          className="text-sm font-semibold text-[#1B1A1A]"
          style={{ fontFamily: 'Didact Gothic, sans-serif' }}
        >
          Client Brief &amp; Narrative Focus
        </h3>
        <button
          onClick={onClose}
          className="text-xs text-[#A79E8C] hover:text-[#625143]"
        >
          ✕
        </button>
      </div>
      <p className="text-[11px] text-[#625143] leading-relaxed mb-3">
        Describe anything you would like the report to emphasise. These notes guide the
        narrative only and never alter the engineering results.
      </p>
      <textarea
        value={clientBrief}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="Example: Large screen, compact room with four seats, strong timbre matching, explain why the front row is the priority."
        rows={10}
        className="w-full p-3 text-xs text-[#1B1A1A] bg-[#F5F4F0] border border-[#DCDBD6] rounded-lg resize-y focus:outline-none focus:border-[#213428] focus:ring-1 focus:ring-[#213428] transition-colors"
        style={{ fontFamily: 'Inter, sans-serif', lineHeight: 1.6 }}
      />
      {!readOnly && (
        <button
          onClick={onSave}
          disabled={saving}
          className="w-full mt-3 px-4 py-2 text-xs uppercase tracking-[0.14em] text-white disabled:opacity-40 transition-colors hover:bg-[#3E4349]"
          style={{ backgroundColor: '#213428', fontFamily: 'Didact Gothic, sans-serif' }}
        >
          {saving ? 'Saving…' : 'Save Brief'}
        </button>
      )}
      <div className="mt-4 p-2.5 bg-[#F5F4F0] border-l-2 border-[#213428] rounded-r">
        <p className="text-[10px] text-[#625143] leading-relaxed">
          <strong className="text-[#213428]">Note:</strong> Changing the Client Brief changes
          the wording and emphasis of the report. It must never change any engineering result,
          RP22 value, Design Rating, or recommendation. Use Refine to apply the brief to a
          section.
        </p>
      </div>
    </div>
  );
}