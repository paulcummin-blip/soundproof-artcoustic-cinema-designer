import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Lightbulb, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';

/**
 * ADI narrative focus suggestions for the Client Brief step.
 *
 * Suggestions are generated from this project's calculated design results (the
 * frozen Engineering Snapshot) so the chips fit the actual project, version and
 * results. They guide the wording and emphasis of the client report only — they
 * never change an engineering result, RP22 value, Design Index, table value or
 * recommendation.
 *
 * When no calculated result is available, generic examples are shown instead.
 */
const GENERIC_EXAMPLES = [
  'Dynamic impact',
  'Dialogue clarity',
  'Family friendly',
  'Music performance',
  'Future upgrade path',
  'Architectural constraints',
  'Budget conscious',
  'Hidden loudspeakers',
  'Invisible installation',
  'Interior design',
  'Acoustic treatment benefits',
  'Windows limited surround placement',
  'Client prefers reference cinema',
  'Client dislikes visible equipment',
  'Explain compromises',
  'Explain why Level 4 is not achievable',
  'Highlight future expansion',
];

const FALLBACK_MESSAGE = 'Calculate the project to get ADI suggestions based on the design.';

export default function AdiSuggestionChips({
  projectId,
  selectedVersionIds = [],
  proposalType,
  engineeringSnapshot,
  snapshotLoading = false,
  onAdd,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestRef = useRef(0);
  const hasResults = engineeringSnapshot?.available === true;

  const load = useCallback(async () => {
    if (!hasResults) return;
    const token = requestRef.current + 1;
    requestRef.current = token;
    setLoading(true);
    setFailed(false);
    try {
      const response = await base44.functions.invoke('generateAdiNarrativeSuggestions', {
        project_id: projectId,
        proposal_type: proposalType,
        selected_version_ids: selectedVersionIds,
        engineering_snapshot: engineeringSnapshot,
      });
      if (requestRef.current !== token) return;
      const list = response?.data?.suggestions || [];
      setSuggestions(list);
      setFailed(list.length === 0);
    } catch (error) {
      if (requestRef.current !== token) return;
      console.error('[AdiSuggestionChips] Suggestion generation failed:', error);
      setSuggestions([]);
      setFailed(true);
    } finally {
      if (requestRef.current === token) setLoading(false);
    }
  }, [hasResults, projectId, proposalType, selectedVersionIds, engineeringSnapshot]);

  useEffect(() => {
    if (hasResults) {
      load();
    } else {
      setSuggestions([]);
      setFailed(false);
    }
  }, [hasResults, load]);

  const usingCalculatedResults = hasResults && !failed && suggestions.length > 0;
  const failedWithData = hasResults && failed;
  const chips = usingCalculatedResults
    ? suggestions.map((item) => ({ label: item.label, reason: item.reason }))
    : GENERIC_EXAMPLES.map((label) => ({ label, reason: null }));
  const busy = snapshotLoading || loading;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-3.5 h-3.5 text-[#A79E8C]" />
          <span className="text-[11px] uppercase tracking-[0.12em] text-[#A79E8C]">
            {'ADI Suggestions — Click to Add'}
          </span>
        </div>
        {hasResults && !busy && (
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1.5 text-[11px] text-[#625143] hover:text-[#213428] transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            {'Refresh suggestions'}
          </button>
        )}
      </div>

      {usingCalculatedResults && (
        <p className="text-[11px] text-[#8A8477] mb-3">
          {"Suggestions are based on this project's design results."}
        </p>
      )}

      {busy && (
        <p className="text-[11px] text-[#8A8477] mb-3">
          {snapshotLoading
            ? 'Reading the published engineering result…'
            : "Reading this design's results…"}
        </p>
      )}

      {!busy && !usingCalculatedResults && (
        <p className="text-[11px] text-[#8A8477] mb-3">
          {failedWithData
            ? 'ADI suggestions could not be generated from this design — general examples shown.'
            : FALLBACK_MESSAGE}
        </p>
      )}

      {!busy && (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              title={chip.reason || undefined}
              onClick={() => onAdd(chip.label)}
              className="px-3 py-1.5 text-xs text-[#3E4349] bg-[#F5F4F0] border border-[#E5E1D8] rounded-full hover:bg-[#213428] hover:text-white hover:border-[#213428] transition-colors"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}