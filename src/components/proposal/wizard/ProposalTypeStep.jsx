import React from 'react';
import { FileText, GitCompare, Check } from 'lucide-react';
import { PROPOSAL_TYPES } from '@/components/proposal/proposalTypes';

const TYPE_ICONS = {
  single: FileText,
  comparison: GitCompare,
};

/**
 * Step 2 — Choose Proposal Type.
 * Single Design Proposal or Design Comparison.
 * Renders dynamically from PROPOSAL_TYPES so new types can be added
 * to the config without changing this component.
 */
export default function ProposalTypeStep({ selectedType, onSelect }) {
  return (
    <div className="space-y-3">
      {PROPOSAL_TYPES.map((type) => {
        const Icon = TYPE_ICONS[type.value] || FileText;
        const isSelected = selectedType === type.value;
        return (
          <button
            key={type.value}
            onClick={() => onSelect(type.value)}
            className={`w-full text-left p-5 rounded-lg border transition-colors ${
              isSelected
                ? 'bg-[#213428] text-white border-[#213428]'
                : 'bg-white text-[#1B1A1A] border-[#DCDBD6] hover:bg-[#F5F4F0]'
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${
                  isSelected ? 'bg-white/15' : 'bg-[#F5F4F0]'
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div
                  className="font-semibold"
                  style={{ fontFamily: 'Didact Gothic, sans-serif' }}
                >
                  {type.label}
                </div>
                <div
                  className={`text-sm mt-1 ${isSelected ? 'text-white/70' : 'text-[#625143]'}`}
                >
                  {type.description}
                </div>
                <div
                  className={`text-xs mt-2 ${isSelected ? 'text-white/50' : 'text-[#625143]'}`}
                >
                  {type.maxVersions === 1
                    ? 'Select 1 version'
                    : `Select ${type.minVersions} or more versions`}
                </div>
              </div>
              {isSelected && <Check className="w-5 h-5 shrink-0 mt-1" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}