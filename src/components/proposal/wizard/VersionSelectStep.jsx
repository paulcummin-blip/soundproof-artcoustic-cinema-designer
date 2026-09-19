import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Check } from 'lucide-react';
import { getProposalType } from '@/components/proposal/proposalTypes';

/**
 * Step 3 — Select Version(s).
 * For 'single' proposals: radio selection of exactly one version.
 * For 'comparison' proposals: checkbox selection of two or more versions.
 */
export default function VersionSelectStep({
  projectId,
  proposalType,
  selectedVersionIds,
  onSelect,
}) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const results = await base44.entities.ProjectVersion.filter({ project_id: projectId });
        if (cancelled) return;
        const sorted = (results || []).sort(
          (a, b) => (a.version_number || 0) - (b.version_number || 0)
        );
        setVersions(sorted);
      } catch (err) {
        console.error('Failed to load versions:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const typeDef = getProposalType(proposalType);
  const isComparison = proposalType === 'comparison';

  const toggleVersion = (versionId) => {
    if (isComparison) {
      if (selectedVersionIds.includes(versionId)) {
        onSelect(selectedVersionIds.filter((id) => id !== versionId));
      } else {
        onSelect([...selectedVersionIds, versionId]);
      }
    } else {
      onSelect([versionId]);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-[#625143] animate-spin" />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <p className="text-sm text-[#625143] py-8 text-center">
        This project has no saved versions yet. Save at least one version in the Room Designer first.
      </p>
    );
  }

  const minMet = isComparison
    ? selectedVersionIds.length >= (typeDef?.minVersions || 2)
    : selectedVersionIds.length === 1;

  return (
    <div>
      <div className="space-y-2">
        {versions.map((v) => {
          const isSelected = selectedVersionIds.includes(v.id);
          return (
            <button
              key={v.id}
              onClick={() => toggleVersion(v.id)}
              className={`w-full text-left p-4 rounded-lg border transition-colors ${
                isSelected
                  ? 'bg-[#213428] text-white border-[#213428]'
                  : 'bg-white text-[#1B1A1A] border-[#DCDBD6] hover:bg-[#F5F4F0]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div
                    className="font-semibold"
                    style={{ fontFamily: 'Didact Gothic, sans-serif' }}
                  >
                    Version {v.version_number}
                  </div>
                  <div
                    className={`text-sm ${isSelected ? 'text-white/70' : 'text-[#625143]'}`}
                  >
                    {v.version_name || 'Current Design'}
                  </div>
                </div>
                <div
                  className={`flex items-center justify-center w-5 h-5 rounded border-2 shrink-0 ${
                    isSelected
                      ? 'bg-white border-white'
                      : 'border-[#DCDBD6] bg-transparent'
                  }`}
                >
                  {isSelected && <Check className="w-4 h-4 text-[#213428]" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {isComparison && !minMet && (
        <p className="text-xs text-[#625143] mt-4">
          Select {typeDef?.minVersions || 2} or more versions to compare. Currently selected:{' '}
          {selectedVersionIds.length}.
        </p>
      )}
    </div>
  );
}