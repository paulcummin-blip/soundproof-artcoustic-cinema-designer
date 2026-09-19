import React, { useState } from 'react';
import { Eye, EyeOff, GripVertical } from 'lucide-react';
import { PROPOSAL_SECTIONS } from '@/components/proposal/proposalSections';

/**
 * Left navigation panel for the Proposal Editor.
 * Lists the 10 fixed sections with visibility toggles and drag-to-reorder.
 *
 * Props:
 * - sections: ProposalSection[] (with order_index and is_enabled)
 * - activeSectionKey: string
 * - onSelect: (section_key) => void
 * - onToggleVisibility: (section_id) => void
 * - onReorder: (reorderedSections) => void
 */
export default function ProposalSectionNav({ sections, activeSectionKey, onSelect, onToggleVisibility, onReorder }) {
  const sorted = [...sections].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const [dragIndex, setDragIndex] = useState(null);

  const handleDragStart = (index) => setDragIndex(index);
  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const reordered = [...sorted];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(index, 0, moved);
    onReorder(reordered.map((s, i) => ({ ...s, order_index: i })));
    setDragIndex(index);
  };
  const handleDragEnd = () => setDragIndex(null);

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-[#625143] uppercase tracking-wide px-2 py-2">
        Sections
      </div>
      {sorted.map((section, index) => {
        const def = PROPOSAL_SECTIONS.find((s) => s.type === section.section_type);
        const isActive = section.section_key === activeSectionKey;
        const isVisible = section.is_enabled !== false;
        if (!def) return null;

        return (
          <div
            key={section.id || section.section_key}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className={`group flex items-center gap-1 px-2 py-2 rounded-md cursor-pointer transition-colors ${
              isActive
                ? 'bg-[#213428] text-white'
                : 'text-[#3E4349] hover:bg-[#F5F4F0]'
            } ${!isVisible ? 'opacity-50' : ''}`}
            onClick={() => onSelect(section.section_key)}
          >
            <GripVertical className="w-3 h-3 opacity-30 group-hover:opacity-60" />
            <span className="flex-1 text-sm" style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
              {def.label}
            </span>
            {def.canHide && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisibility(section.id);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                title={isVisible ? 'Hide section' : 'Show section'}
              >
                {isVisible ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}