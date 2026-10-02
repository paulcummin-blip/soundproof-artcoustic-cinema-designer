// ForecastDashboard.jsx
// ---------------------
// The forecast dashboard: five visual analytics on one canvas, sharing one
// range, one date basis and one account scope so every chart is read on the
// same terms.
//
//   1. Forecast projects over time   — is the pipeline growing or shrinking
//   2. Forecast value over time      — retail or trade, same periods
//   3. Pipeline age distribution     — where the forecast sits by age
//   4. Pipeline composition          — Premium Partners, Richer Sounds, Trade
//   5. Catalogue trend               — units, retail or trade per period
//
// The figures come from the pure authorities — forecastTimelines,
// pipelineAge and pipelineComposition — and nothing on this canvas interprets
// them: no commentary and no recommended actions.
//
// The scope control narrows every chart at once. With no account chosen the age
// chart is exactly the summary the page's KPI cards use.

import React, { useMemo, useState } from 'react';
import { BRAND } from './IntelligenceUi';
import { formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import {
  DEFAULT_TIMELINE_BASIS,
  DEFAULT_TIMELINE_RANGE,
  TIMELINE_BASES,
  TIMELINE_RANGES,
  buildForecastTimeline,
} from '@/lib/commercial/projectReporting/forecastTimelines';
import { buildPipelineAgeSummary } from '@/lib/commercial/projectReporting/pipelineAge';
import { buildCompositionSummary } from '@/lib/commercial/projectReporting/pipelineComposition';
import PipelineTimelineChart from './charts/PipelineTimelineChart';
import PipelineAgeBars from './charts/PipelineAgeBars';
import PipelineCompositionChart from './charts/PipelineCompositionChart';

const PROJECT_METRICS = [{ key: 'projects', label: 'Projects', format: 'number' }];

const VALUE_METRICS = [
  { key: 'retail', label: 'Retail', format: 'money' },
  { key: 'trade', label: 'Trade', format: 'money' },
];

const CATALOGUE_METRICS = [
  { key: 'units', label: 'Units', format: 'number' },
  { key: 'retail', label: 'Retail value', format: 'money' },
  { key: 'trade', label: 'Trade value', format: 'money' },
];

const metricByKey = (options, key) => options.find((option) => option.key === key) || options[0];

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
  const [valueMetricKey, setValueMetricKey] = useState('retail');
  const [catalogueMetricKey, setCatalogueMetricKey] = useState('units');
  const [compositionMetricKey, setCompositionMetricKey] = useState('count');

  const scopedFamilies = useMemo(() => (
    accountId ? forecastProjects.filter((family) => family.accountId === accountId) : forecastProjects
  ), [forecastProjects, accountId]);

  const timeline = useMemo(() => buildForecastTimeline(scopedFamilies, {
    rangeKey,
    basis,
    unitsByProjectId,
    retailByProjectId,
    now,
  }), [scopedFamilies, rangeKey, basis, unitsByProjectId, retailByProjectId, now]);

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

  const totals = timeline.totals || {};
  const per = timeline.unitLabel;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 14,
        alignItems: 'flex-end',
        justifyContent: 'space-between',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: BRAND.text }}>Forecast dashboard</h2>
          <div style={{ marginTop: 4, fontSize: 12, color: BRAND.muted, lineHeight: 1.6 }}>
            {formatNumber(totals.scopeProjectCount || 0)} forecast projects in scope.
            {totals.outsideWindowCount > 0 && ` ${formatNumber(totals.outsideWindowCount)} fall outside this range.`}
            {totals.noDateCount > 0 && ` ${formatNumber(totals.noDateCount)} carry no ${timeline.basisLabel.toLowerCase()} date and are not placed.`}
            {' '}Every chart uses the range, date basis and account chosen here.
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <ControlLabel>Range</ControlLabel>
            {TIMELINE_RANGES.map((range) => (
              <PillButton
                key={range.key}
                active={range.key === rangeKey}
                onClick={() => setRangeKey(range.key)}
                title={`Measure by ${range.unitLabel} over ${range.label.toLowerCase()}`}
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
      </div>

      <div style={{
        display: 'grid',
        gap: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
      }}>
        <PipelineTimelineChart
          title="Forecast projects over time"
          subtitle={`Forecast projects by ${timeline.basisLabel.toLowerCase()} date, per ${per}.`}
          points={timeline.points}
          metric={metricByKey(PROJECT_METRICS, 'projects')}
          currency={currency}
          accent={BRAND.primary}
        />

        <PipelineTimelineChart
          title="Forecast value over time"
          subtitle={`Artcoustic value per ${per}. Retail is ex VAT, catalogue products only; trade is retail × 0.59.`}
          points={timeline.points}
          metric={metricByKey(VALUE_METRICS, valueMetricKey)}
          metricOptions={VALUE_METRICS}
          onMetricChange={setValueMetricKey}
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
          metric={metricByKey(
            [
              { key: 'count', label: 'Projects', format: 'number' },
              { key: 'retail', label: 'Artcoustic retail', format: 'money' },
              { key: 'trade', label: 'Trade value', format: 'money' },
            ],
            compositionMetricKey,
          )}
          onMetricChange={setCompositionMetricKey}
        />

        <div style={{ gridColumn: '1 / -1' }}>
          <PipelineTimelineChart
            title="Catalogue trend"
            subtitle={`Artcoustic catalogue units, retail ex VAT and trade value per ${per}, from each project's counted version.`}
            points={timeline.points}
            metric={metricByKey(CATALOGUE_METRICS, catalogueMetricKey)}
            metricOptions={CATALOGUE_METRICS}
            onMetricChange={setCatalogueMetricKey}
            currency={currency}
            accent={BRAND.info}
          />
        </div>
      </div>
    </div>
  );
}