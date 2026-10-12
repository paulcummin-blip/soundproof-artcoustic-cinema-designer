import React from 'react';
import { FileText, GitCompare, Check } from 'lucide-react';
import { availableProposalTypes } from '@/components/proposal/proposalTypes';

const TYPE_ICONS = {
  system_summary: FileText,
  comparison: GitCompare,
};

/**
 * Step 2 — Choose Report Type.
 *
 * Only the report types this project can actually build are offered, from the
 * shared availability rule: System Design Summary always, and System Design
 * Comparison only once the project is known to hold two or more genuine design
 * versions. A type that cannot be built is not rendered at all — it is never
 * shown greyed out. Both types use the same report structure and writing style.
 *
 * versionCount is the count of genuine design versions (null while unknown).
 */
export default function ProposalTypeStep({ selectedType, onSelect, versionCount = null }) {
  return (
    <div className="space-y-3">
      {availableProposalTypes(versionCount).map((type) => {
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