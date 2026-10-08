import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Lightbulb, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import log from '@/components/utils/logger';
import { toggleChipSelection } from '@/components/proposal/wizard/clientBriefChips';

/**
 * ADI narrative focus suggestions for the Client Brief step.
 *
 * Suggestions are generated from this project's calculated design results (the
 * frozen Engineering Snapshot) so the chips fit the actual project, version and
 * results. They guide the wording and emphasis of the client report only — they
 * never change an engineering result, RP22 value, Design Index, table value or
 * recommendation.
 *
 * Every chip is validated against that same snapshot before it is shown: an
 * example whose number does not match this version — a screen size the project
 * does not have, a level a result did not achieve, an invented channel count,
 * subwoofer count, dB, Hz or angle — is rewritten without the number or dropped,
 * so a chip can never state a value the project does not contain. A chip
 * assembled by Sound Proof from the calculated screen size and results is shown
 * first, and the model only adds to those.
 *
 * In comparison mode (two or more selected versions) the examples follow the
 * proposal mode: each selected version contributes its own frozen snapshot, the
 * examples compare the selected versions, and a fact is only stated normally
 * when it holds in every one of them. A single-version fact is never offered as
 * though it applied to the whole comparison.
 *
 * When no calculated result is available, generic examples are shown instead.
 *
 * Chips are multi-select and purely local: clicking one only marks it selected —
 * nothing is written to the Client Brief until the user presses "Add selected to
 * brief", which returns the prompts that were added and those already present.
 * Selecting a chip never regenerates the examples; only Refresh examples, a
 * version change, a proposal type change or a readiness change does.
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
  'Explain the room constraints',
  'Highlight future expansion',
];

const FALLBACK_MESSAGE = 'Calculate the project to get examples powered by Artcoustic Design Intelligence.';
const COMPARISON_INCOMPLETE_MESSAGE = 'Examples for a comparison need a calculated engineering result for every selected version.';

export default function AdiSuggestionChips({
  projectId,
  selectedVersionIds = [],
  proposalType,
  engineeringSnapshot,
  versionSnapshots = [],
  snapshotLoading = false,
  versionsLoading = false,
  // The brief being written: it carries the designer's explicit requests, so an
  // assumed or administrative parameter (P8, P15, P21) is only ever offered as
  // an example when the designer has actually asked for it.
  clientBrief = '',
  onAddSelected,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // Local, unconfirmed chip selection: cleared when the examples themselves
  // change, and handed to the brief only when the user confirms.
  const [selected, setSelected] = useState([]);
  const [duplicateNotice, setDuplicateNotice] = useState(null);
  const requestRef = useRef(0);

  const toggleChip = (label) => {
    setDuplicateNotice(null);
    setSelected((current) => toggleChipSelection(current, label));
  };

  const clearSelection = () => {
    setSelected([]);
    setDuplicateNotice(null);
  };

  const confirmSelection = () => {
    if (selected.length === 0) return;
    const result = onAddSelected?.(selected) || {};
    const duplicates = result.duplicates || [];
    setDuplicateNotice(
      duplicates.length === 0
        ? null
        : duplicates.length === 1
          ? `Already in the brief: ${duplicates[0]}`
          : `Already in the brief: ${duplicates.slice(0, 2).join(', ')}${duplicates.length > 2 ? ` and ${duplicates.length - 2} more` : ''}`,
    );
    setSelected([]);
  };

  // In comparison mode the examples are built from EVERY selected version, so a
  // comparison is never described from one version's facts alone.
  const selectedVersionCount = (versionSnapshots || []).length;
  const comparisonSelected = selectedVersionCount > 1;
  const comparisonEntries = (versionSnapshots || [])
    .filter((entry) => entry?.snapshot?.available === true)
    .map((entry) => ({
      version_id: entry.version_id,
      version_name: entry.version_name || null,
      snapshot: entry.snapshot,
    }));
  const comparisonReady = comparisonSelected && comparisonEntries.length === selectedVersionCount;
  const comparisonKey = comparisonEntries.map((entry) => entry.version_id).join('|');
  const comparisonEntriesRef = useRef(comparisonEntries);
  comparisonEntriesRef.current = comparisonEntries;
  const comparisonIncomplete = comparisonSelected && !comparisonReady;
  const hasResults = comparisonSelected ? comparisonReady : engineeringSnapshot?.available === true;

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
        client_brief: clientBrief || '',
        // In comparison mode the function receives every selected version's own
        // frozen snapshot and builds its examples from all of them.
        version_snapshots: comparisonSelected ? comparisonEntriesRef.current : [],
      });
      if (requestRef.current !== token) return;
      const list = response?.data?.suggestions || [];
      // Per-chip diagnostics: the chip text, the source fields and values it came
      // from, and whether it passed, was rewritten or was rejected.
      log.debug('[AdiSuggestionChips] validated examples', response?.data?.diagnostics || []);
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
  }, [hasResults, projectId, proposalType, selectedVersionIds, engineeringSnapshot, clientBrief, comparisonSelected, comparisonKey]);

  useEffect(() => {
    if (hasResults) {
      load();
    } else {
      setSuggestions([]);
      setFailed(false);
    }
  }, [hasResults, load]);

  // New examples invalidate what was selected against the old ones.
  useEffect(() => {
    setSelected([]);
    setDuplicateNotice(null);
  }, [suggestions]);

  const usingCalculatedResults = hasResults && !failed && suggestions.length > 0;
  const failedWithData = hasResults && failed;
  const chips = usingCalculatedResults
    ? suggestions.map((item) => ({ label: item.label, reason: item.reason }))
    : GENERIC_EXAMPLES.map((label) => ({ label, reason: null }));
  const busy = snapshotLoading || versionsLoading || loading;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-3.5 h-3.5 text-[#A79E8C]" />
          <span className="text-[11px] uppercase tracking-[0.12em] text-[#A79E8C]">
            {'Examples, powered by Artcoustic Design Intelligence'}
          </span>
        </div>
        {hasResults && !busy && (
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1.5 text-[11px] text-[#625143] hover:text-[#213428] transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            {'Refresh examples'}
          </button>
        )}
      </div>

      {usingCalculatedResults && (
        <p className="text-[11px] text-[#8A8477] mb-3">
          {comparisonSelected
            ? `These examples compare the ${selectedVersionCount} selected versions. Any number they state is checked against every selected version before display.`
            : "These examples are based on this project's calculated design results. Any number they state is checked against this version before display."}
        </p>
      )}

      {busy && (
        <p className="text-[11px] text-[#8A8477] mb-3">
          {snapshotLoading || versionsLoading
            ? 'Reading the published engineering results for the selected versions…'
            : "Reading this design's results…"}
        </p>
      )}

      {!busy && !usingCalculatedResults && (
        <p className="text-[11px] text-[#8A8477] mb-3">
          {comparisonIncomplete
            ? COMPARISON_INCOMPLETE_MESSAGE
            : failedWithData
              ? 'Examples could not be generated from this design — general examples shown.'
              : FALLBACK_MESSAGE}
        </p>
      )}

      {!busy && (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => {
            const isSelected = selected.includes(chip.label);
            return (
              <button
                key={chip.label}
                type="button"
                title={chip.reason || undefined}
                aria-pressed={isSelected}
                onClick={() => toggleChip(chip.label)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#213428]/40 focus-visible:ring-offset-1 ${
                  isSelected
                    ? 'bg-[#213428] text-white border-[#213428] font-semibold'
                    : 'text-[#3E4349] bg-[#F5F4F0] border-[#E5E1D8] hover:bg-[#213428] hover:text-white hover:border-[#213428]'
                }`}
              >
                {isSelected && <Check className="w-3 h-3" />}
                {chip.label}
              </button>
            );
          })}
        </div>
      )}

      {!busy && selected.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-semibold text-[#625143]">
            {selected.length} selected
          </span>
          <button
            type="button"
            onClick={confirmSelection}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-[#213428] rounded-md hover:bg-[#2C4436] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#213428]/40 focus-visible:ring-offset-1"
          >
            Add selected to brief
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="text-[11px] text-[#625143] underline underline-offset-2 hover:text-[#213428] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#213428]/40 rounded"
          >
            Clear selection
          </button>
        </div>
      )}

      {!busy && duplicateNotice && (
        <p className="mt-2 text-[11px] text-[#8A5A2B]">{duplicateNotice}</p>
      )}
    </div>
  );
}