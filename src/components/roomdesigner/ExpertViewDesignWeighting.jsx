/**
 * ExpertViewDesignWeighting.jsx
 * -----------------------------
 * EXPERT VIEW — DESIGN WEIGHTING & PERFORMANCE.
 *
 * The designer-facing view of the design intelligence ADI already calculates: for
 * every RP22 parameter, the ASDR importance weight, the achieved result, the ASDR
 * contribution those two produce, how relevant the subject is to this project's
 * brief, and the narrative class the combination earned.
 *
 * It reads the published engineering summary and the ONE narrative priority
 * authority (which itself reads the ONE ASDR weight table). It calculates no
 * weight, no level and no score of its own, and it is designer-facing only: nothing
 * here is ever included in a client proposal or a report.
 */

import React, { useMemo, useState } from "react";
import { isTvDisplay } from "@/components/models/screen/displayTypeAuthority";
import { hasExplicitDedicatedCinemaIntent } from "@/components/report/projectReport/projectIntentClassification";
import {
  BRIEF_INTENT,
  BRIEF_RELEVANCE,
  areasForBriefText,
} from "../../../../shared/briefRelevance.js";
import {
  NARRATIVE_PRIORITY,
  PRIORITY_RANK,
  buildNarrativePriorityRows,
  isNarrativeCandidate,
} from "../../../../shared/narrativePriorityAuthority.js";

const FILTERS = Object.freeze([
  { id: 'all', label: 'All' },
  { id: 'high_weight', label: 'High-weight' },
  { id: 'narrative', label: 'Narrative candidates' },
]);

const RELEVANCE_LABEL = Object.freeze({
  [BRIEF_RELEVANCE.HIGH]: 'High',
  [BRIEF_RELEVANCE.STANDARD]: 'Standard',
  [BRIEF_RELEVANCE.NONE]: 'None',
});

const PRIORITY_TONE = Object.freeze({
  [NARRATIVE_PRIORITY.LEAD_STORY]: '#213428',
  [NARRATIVE_PRIORITY.WORTH_MENTIONING]: '#3E4349',
  [NARRATIVE_PRIORITY.SUPPORTING_EVIDENCE]: '#625143',
  [NARRATIVE_PRIORITY.TECHNICAL_ONLY]: '#8B7F76',
  [NARRATIVE_PRIORITY.DO_NOT_DISCUSS]: '#8A5A2B',
});

/** What this design actually contains, read from its own published summary. */
function readContainment(summary) {
  const authority = summary?.parameterAuthority || {};
  const has = (keys) => keys.some((key) => authority[key] && authority[key].state === 'scored');
  const seats = summary?.viewing?.per_seat?.length
    || summary?.project?.reportCounts?.seatsEvaluated
    || 0;
  return {
    display: true,
    speakers: Object.keys(authority).length > 0,
    seats,
    bass: has(['p14', 'p18', 'p19', 'p20']),
    spatial: has(['p5', 'p6', 'p7', 'p9', 'p10', 'p11']),
    timbre: has(['p16', 'p17']),
    screenChannels: has(['p12', 'p13']),
  };
}

function Cell({ children, align = 'left', tone = null }) {
  return (
    <td
      className={`px-2 py-2 align-top text-[11px] ${align === 'right' ? 'text-right' : 'text-left'}`}
      style={{ color: tone || '#3E4349', fontFamily: 'Didact Gothic, sans-serif' }}
    >
      {children}
    </td>
  );
}

export default function ExpertViewDesignWeighting({
  engineeringSummary = null,
  screen = null,
  briefText = '',
}) {
  const [filter, setFilter] = useState('all');

  const { rows, brief } = useMemo(() => {
    if (!engineeringSummary) return { rows: [], brief: null };
    const intent = (isTvDisplay(screen) && !hasExplicitDedicatedCinemaIntent({ client_brief: briefText }))
      ? BRIEF_INTENT.MEDIA_LOUNGE
      : BRIEF_INTENT.DEDICATED_CINEMA;
    return buildNarrativePriorityRows({
      summary: engineeringSummary,
      intent,
      subjects: areasForBriefText(briefText),
      briefText,
      design: readContainment(engineeringSummary),
    });
  }, [engineeringSummary, screen, briefText]);

  if (!engineeringSummary || rows.length === 0) {
    return (
      <div className="mt-3 text-xs text-[#8B7F76]">
        Open a design with a published engineering result to see its weighting.
      </div>
    );
  }

  const visible = rows
    .filter((row) => (filter === 'high_weight'
      ? row.tier === 'high'
      : filter === 'narrative' ? isNarrativeCandidate(row.priority) : true))
    .sort((a, b) => (PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]) || (b.weight - a.weight));
  const intentLabel = brief?.intent === BRIEF_INTENT.MEDIA_LOUNGE ? 'Media lounge' : 'Dedicated cinema';

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[#213428]">
          Design weighting &amp; performance
        </div>
        <div className="text-[10px] text-[#8B7F76]">{intentLabel}</div>
      </div>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setFilter(entry.id)}
            className={`text-[10px] px-2 py-1 rounded border ${
              filter === entry.id
                ? 'border-[#213428] bg-[#213428] text-white'
                : 'border-[#DCDBD6] bg-white text-[#625143]'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto border border-[#EEEDEA] rounded-md">
        <table className="min-w-[660px] w-full border-collapse">
          <thead>
            <tr className="bg-[#F8F8F7]">
              {['Parameter', 'Performance area', 'ASDR weight', 'Achieved result', 'ASDR contribution', 'Brief relevance', 'Narrative priority'].map((heading) => (
                <th
                  key={heading}
                  className="px-2 py-2 text-left text-[9px] font-semibold tracking-[0.04em] uppercase text-[#625143] whitespace-nowrap"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.key} className="border-t border-[#EEEDEA]">
                <Cell>{row.parameter_label}</Cell>
                <Cell>{row.performance_area}</Cell>
                <Cell align="right">{row.weight} · {row.tier}</Cell>
                <Cell>{row.level ? `${row.level}${row.value ? ` · ${row.value}` : ''}` : '—'}</Cell>
                <Cell align="right">
                  {Math.round(row.contribution * 10) / 10} / {row.maximum} pts
                  <span className="block text-[9px] text-[#8B7F76]">{Math.round(row.contribution_share * 100)}% of maximum</span>
                </Cell>
                <Cell>{RELEVANCE_LABEL[row.brief_relevance] || '—'}</Cell>
                <Cell tone={PRIORITY_TONE[row.priority]}>
                  {row.priority_label}
                  <span className="block text-[9px] text-[#8B7F76]">{row.reason}</span>
                </Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] text-[#8B7F76]">
        Internal weighting and classification. Designer-facing only: it is never included in a client proposal or report.
      </div>
    </div>
  );
}