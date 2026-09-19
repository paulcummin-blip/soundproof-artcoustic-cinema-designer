import React, { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { StickyNote, X } from 'lucide-react';

/**
 * Dealer Notes panel — dealer-only notes for a proposal section.
 * Never rendered in the exported proposal.
 * Supplied to GPT as context during section regeneration.
 *
 * Props:
 * - section: the active ProposalSection
 * - onSave: (notes) => void
 * - onClose: () => void
 */
export default function DealerNotesPanel({ section, onSave, onClose }) {
  const [notes, setNotes] = useState(section?.dealer_notes || '');

  const handleSave = () => {
    onSave(notes);
  };

  return (
    <div className="bg-[#F5F4F0] border border-[#DCDBD6] rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-[#625143]" />
          <Label className="text-sm font-semibold text-[#3E4349]">Dealer Notes</Label>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[#625143] hover:text-[#1B1A1A]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-[#625143]">
        These notes are invisible to the client. Sound Proof reads them when refreshing this section.
      </p>
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={handleSave}
        placeholder="e.g. Client very interested in discreet speakers. Mention upgrade path. Avoid talking about cost."
        className="bg-white border-[#DCDBD6] text-[#1B1A1A] text-sm"
        rows={4}
      />
    </div>
  );
}