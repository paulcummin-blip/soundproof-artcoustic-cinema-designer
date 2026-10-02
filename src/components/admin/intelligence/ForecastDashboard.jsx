// ForecastDashboard.jsx
// ---------------------
// The forecast dashboard: four visual analytics on one canvas, sharing one
// period, one date basis and one account scope so every chart is read on the
// same terms.
//
//   1. Forecast projects over time    — is the pipeline growing or shrinking
//   2. Forecast trade value over time — the commercial pipeline by month
//   3. Pipeline age distribution      — where the forecast sits by age
//   4. Pipeline composition           — Premium Partners, Richer Sounds, Trade
//
// The figures come from the pure authorities — forecastTimelines, pipelineAge
// and pipelineComposition — and nothing on this canvas interprets them: no
// commentary, no helper copy and no recommended actions.
//
// Every point is one month. A month with no valued project leaves a gap rather
// than a false zero, so the month in progress never reads as a collapse.
//
// The period control only offers periods the loaded data can fill, and the
// scope control narrows every chart at once. With no account chosen the age
// chart is exactly the summary the page's KPI cards use.

import React, { useMemo, useState } from 'react';
import { BRAND } from './IntelligenceUi';
import {
  DEFAULT_TIMELINE_BASIS,
  DEFAULT_TIMELINE_RANGE,
  TIMELINE_BASES,
  TIMELINE_RANGES,
  availableTimelineRanges,
  buildForecastTimeline,
} from '@/lib/commercial/projectReporting/forecastTimelines';
import { buildPipelineAgeSummary } from '@/lib/commercial/projectReporting/pipelineAge';
import { buildCompositionSummary } from '@/lib/commercial/projectReporting/pipelineComposition';
import PipelineTimelineChart from './charts/PipelineTimelineChart';
import PipelineAgeBars from './charts/PipelineAgeBars';
import PipelineCompositionChart from './charts/PipelineCompositionChart';

const PROJECT_METRIC = { key: 'projects', label: 'Projects', format: 'number' };
const TRADE_METRIC = { key: 'trade', label: 'Trade value', format: 'money' };

const COMPOSITION_METRICS = [
  { key: 'count', label: 'Projects', format: 'number' },
  { key: 'trade', label: 'Trade value', format: 'money' },
];

function PillButton({ active, children, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        padding: '5px 11px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
        border: `1px solid ${active ? BRAND.primary : BRAND.border}`,
        background: active ? BRAND.primary : BRAND.card,
        color: active ? '#FFFFFF' : BRAND.subtext,
      }}
    >
      {children}
    </button>
  );
}

function ControlLabel({ children }) {
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color: BRAND.accent,
    }}>
      {children}
    </span>
  );
}

export default function ForecastDashboard({
  forecastProjects = [],
  pipelineAge = null,
  unitsByProjectId = null,
  retailByProjectId = null,
  currency = 'GBP',
  accountOptions = [],
  now = null,
  activeBucket = null,
  onBucketClick,
}) {
  const [rangeKey, setRangeKey] = useState(DEFAULT_TIMELINE_RANGE);
  const [basis, setBasis] = useState(DEFAULT_TIMELINE_BASIS);
  const [accountId, setAccountId] = useState('');
  const [compositionMetricKey, setCompositionMetricKey] = useState('count');

  const scopedFamilies = useMemo(() => (
    accountId ? forecastProjects.filter((family) => family.accountId === accountId) : forecastProjects
  ), [forecastProjects, accountId]);

  // Only the periods this scope can fill are offered, and a period that is not
  // available falls back to the widest one that is.
  const availableRanges = useMemo(
    () => availableTimelineRanges(scopedFamilies, { basis, now }),
    [scopedFamilies, basis, now],
  );
  const effectiveRangeKey = availableRanges.includes(rangeKey)
    ? rangeKey
    : (availableRanges[availableRanges.length - 1] || DEFAULT_TIMELINE_RANGE);

  const timeline = useMemo(() => buildForecastTimeline(scopedFamilies, {
    rangeKey: effectiveRangeKey,
    basis,
    unitsByProjectId,
    retailByProjectId,
    now,
  }), [scopedFamilies, effectiveRangeKey, basis, unitsByProjectId, retailByProjectId, now]);

  // With no account chosen this is the same age authority the KPI cards read.
  const scopedAge = useMemo(() => (
    accountId
      ? buildPipelineAgeSummary(scopedFamilies, { unitsByProjectId, retailByProjectId, now })
      : pipelineAge
  ), [accountId, scopedFamilies, unitsByProjectId, retailByProjectId, now, pipelineAge]);

  const composition = useMemo(() => buildCompositionSummary(scopedFamilies, {
    unitsByProjectId,
    retailByProjectId,
  }), [scopedFamilies, unitsByProjectId, retailByProjectId]);

  const compositionMetric = COMPOSITION_METRICS.find((metric) => metric.key === compositionMetricKey)
    || COMPOSITION_METRICS[0];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <ControlLabel>Period</ControlLabel>
            {TIMELINE_RANGES
              .filter((range) => availableRanges.includes(range.key))
              .map((range) => (
                <PillButton
                  key={range.key}
                  active={range.key === effectiveRangeKey}
                  onClick={() => setRangeKey(range.key)}
                  title={`Measure ${range.label.toLowerCase()}`}
                >
                  {range.label}
                </PillButton>
              ))}
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <ControlLabel>By</ControlLabel>
            {TIMELINE_BASES.map((option) => (
              <PillButton
                key={option.key}
                active={option.key === basis}
                onClick={() => setBasis(option.key)}
                title={`Place each project by its ${option.label.toLowerCase()} date`}
              >
                {option.label}
              </PillButton>
            ))}
          </div>
        </div>

        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <ControlLabel>Account</ControlLabel>
          <select
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            style={{
              padding: '6px 8px',
              borderRadius: 8,
              border: `1px solid ${BRAND.border}`,
              background: BRAND.card,
              color: BRAND.text,
              fontSize: 12,
              maxWidth: 240,
            }}
          >
            <option value="">All accounts</option>
            {accountOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div style={{
        display: 'grid',
        gap: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
      }}>
        <PipelineTimelineChart
          title="Forecast projects over time"
          points={timeline.points}
          metric={PROJECT_METRIC}
          currency={currency}
          accent={BRAND.primary}
        />

        <PipelineTimelineChart
          title="Forecast trade value over time"
          points={timeline.points}
          metric={TRADE_METRIC}
          currency={currency}
          accent={BRAND.accent}
        />

        <PipelineAgeBars
          pipelineAge={scopedAge}
          currency={currency}
          activeBucket={activeBucket}
          onBucketClick={onBucketClick}
        />

        <PipelineCompositionChart
          composition={composition}
          currency={currency}
          metric={compositionMetric}
          onMetricChange={setCompositionMetricKey}
        />
      </div>
    </div>
  );
}