// RecommendationNarration.jsx
// ---------------------------------------------------------------------------
// Stage 1: Engineering Narration — the presentation component.
//
// Renders the Recommendation Engine's output as a structured engineering
// explanation that reads like an experienced cinema designer explaining
// the next best engineering action.
//
// This component is READ-ONLY. It consumes the engine output via the
// persistence store and formats it into the 7-part narration sequence.
// It never recalculates engineering, never modifies the engine output,
// and never invents explanations.
//
// Placement: inside BassDesignAssistant, between the lifecycle summary
// and the Recommendation / Applied Calibration section.
// ---------------------------------------------------------------------------

import React from 'react';
import { useActiveProjectId } from '@/components/state/project-session';
import { useRecommendationEngineOutput } from './useRecommendationEngineOutput.js';
import { buildNarration } from './recommendationNarration.js';

// ── Small presentational helpers ──────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div className="text-[10px] font-semibold text-[#625143] uppercase tracking-wide mb-0.5">
      {children}
    </div>
  );
}

function NarrativeText({ children }) {
  return (
    <p className="text-[12px] text-[#1B1A1A] leading-relaxed">
      {children}
    </p>
  );
}

function ConfidenceBadge({ label }) {
  const color = label === 'Very High' ? '#16A34A'
    : label === 'High' ? '#16A34A'
    : label === 'Moderate' ? '#B45309'
    : '#DC2626';
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 999,
        background: `${color}15`,
        color,
        border: `1px solid ${color}40`,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function Rp22Pill({ parameter, from, to }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: '2px 7px',
        borderRadius: 4,
        background: '#F5F5F0',
        color: '#3E4349',
        border: '1px solid #D9D5CE',
        fontFamily: 'monospace',
      }}
    >
      {parameter} {from} → {to}
    </span>
  );
}

// ── No Recommendation view ─────────────────────────────────────────────────

function NoRecommendationView({ narration }) {
  return (
    <div className="space-y-2.5">
      {narration.assessment && (
        <div>
          <SectionLabel>Assessment</SectionLabel>
          <p className="text-[14px] font-bold text-[#213428] leading-snug">
            {narration.assessment.label}
          </p>
        </div>
      )}

      {narration.noRecommendation && (
        <div className="rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-2.5">
          <p className="text-[12px] text-[#1B1A1A] leading-relaxed">
            {narration.noRecommendation.summary}
          </p>
        </div>
      )}

      {narration.remainingLimitation && (
        <div>
          <SectionLabel>Remaining Limitation</SectionLabel>
          <NarrativeText>{narration.remainingLimitation.statement}</NarrativeText>
        </div>
      )}
    </div>
  );
}

// ── Recommendation view ────────────────────────────────────────────────────

function RecommendationView({ narration }) {
  return (
    <div className="space-y-2.5">
      {/* 1. Assessment + Confidence */}
      {narration.assessment && (
        <div className="flex items-center justify-between gap-2">
          <div>
            <SectionLabel>Assessment</SectionLabel>
            <p className="text-[14px] font-bold text-[#213428] leading-snug">
              {narration.assessment.label}
            </p>
          </div>
          {narration.confidence && (
            <ConfidenceBadge label={narration.confidence.label} />
          )}
        </div>
      )}

      {/* Confidence explanation (only Moderate / Low) */}
      {narration.confidence?.explanation && (
        <p className="text-[11px] text-[#8B7F76] italic leading-relaxed">
          {narration.confidence.explanation}
        </p>
      )}

      {/* 2. Problem */}
      {narration.problem && (
        <div>
          <SectionLabel>Problem</SectionLabel>
          <NarrativeText>{narration.problem.statement}</NarrativeText>
        </div>
      )}

      {/* 3. Likely Physical Cause */}
      {narration.physicalCause && (
        <div>
          <SectionLabel>Likely Physical Cause</SectionLabel>
          <NarrativeText>{narration.physicalCause.statement}</NarrativeText>
        </div>
      )}

      {/* 4. Recommended Action */}
      {narration.recommendedAction && (
        <div>
          <SectionLabel>
            Recommended Action
            {narration.recommendedAction.typeLabel && (
              <span className="ml-1.5 text-[#8B7F76] font-normal normal-case tracking-normal">
                · {narration.recommendedAction.typeLabel}
              </span>
            )}
          </SectionLabel>
          <NarrativeText>{narration.recommendedAction.statement}</NarrativeText>
        </div>
      )}

      {/* 5. Expected Engineering Effect */}
      {narration.expectedEffect && (
        <div>
          <SectionLabel>Expected Engineering Effect</SectionLabel>
          <NarrativeText>{narration.expectedEffect.statement}</NarrativeText>
        </div>
      )}

      {/* 6. RP22 Evidence — supporting only */}
      {narration.rp22Evidence && (
        <div>
          <SectionLabel>RP22 Evidence</SectionLabel>
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {narration.rp22Evidence.items.map((item) => (
              <Rp22Pill
                key={item.parameter}
                parameter={item.parameter}
                from={item.from}
                to={item.to}
              />
            ))}
          </div>
        </div>
      )}

      {/* 7. Remaining Limitation — always last */}
      {narration.remainingLimitation && (
        <div className="pt-1.5 border-t border-[#E7E4DF]">
          <SectionLabel>Remaining Limitation</SectionLabel>
          <NarrativeText>{narration.remainingLimitation.statement}</NarrativeText>
        </div>
      )}

      {/* Alternative considered — only when a different strategy was rejected */}
      {narration.alternatives && (
        <div className="rounded-md border border-[#E7E4DF] bg-[#F5F5F0] px-3 py-2">
          <div className="text-[10px] font-semibold text-[#625143] uppercase tracking-wide mb-0.5">
            Alternative Considered
          </div>
          <p className="text-[11px] text-[#3E4349] leading-relaxed">
            {narration.alternatives.statement}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function RecommendationNarration({ appState }) {
  const projectId = useActiveProjectId();
  const versionId = appState?.activeVersionId || null;

  const { recommendation: engineOutput } = useRecommendationEngineOutput(projectId, versionId);
  const narration = buildNarration(engineOutput);

  if (!narration) return null;

  return (
    <div
      className="rounded-lg border border-[#DCDBD6] bg-white px-4 py-3"
      data-recommendation-narration="true"
    >
      {narration.type === 'no_recommendation'
        ? <NoRecommendationView narration={narration} />
        : <RecommendationView narration={narration} />}
    </div>
  );
}