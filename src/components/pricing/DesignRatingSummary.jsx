// components/pricing/DesignRatingSummary.jsx
import React from 'react';
import { formatViewingRecommendationSummary } from '@/components/recommendations/viewingRecommendationPresentation';
import { formatP12P13Consequences, hasAdditionalCalibrationHeadroom } from '@/components/recommendations/p12RecommendationPresentation';

function formatPoints(value, signed = false) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const prefix = signed && number > 0 ? '+' : '';
  return `${prefix}${number.toFixed(1)} pts`;
}

function formatLevelChanges(levelChanges) {
  if (!Array.isArray(levelChanges) || levelChanges.length === 0) return '';
  return levelChanges
    .map((c) => `${c.display}: ${c.beforeLevel} → ${c.afterLevel}`)
    .join(' · ');
}

function RecommendationRow({ item, mode }) {
  const from = Math.round(Number(item?.currentPercentage) || 0);
  const to = Math.round(Number(item?.newPercentage) || 0);
  const isSaving = mode === 'saving';
  // P12/P13 are rendered as dual Minimum/Recommended consequences with raw dB;
  // exclude them from the generic level-change list to avoid duplication.
  const levelChanges = (Array.isArray(item?.parameterLevelChanges) ? item.parameterLevelChanges : [])
    .filter((c) => c?.display !== 'P12' && c?.display !== 'P13');
  const levelChangeText = formatLevelChanges(levelChanges);
  const p12P13Text = formatP12P13Consequences(item).join(' · ');
  const viewingText = formatViewingRecommendationSummary(item);
  const powerBeforeW = Number(item?.lcrPowerBeforeW);
  const powerAfterW = Number(item?.lcrPowerAfterW);
  const amplifierText =
    item?.amplifierUpgradeRequired === true &&
    Number.isFinite(powerBeforeW) &&
    Number.isFinite(powerAfterW)
      ? `Amplification: ${Math.round(powerBeforeW)} → ${Math.round(powerAfterW)} W/ch`
      : null;
  const headroomNote = hasAdditionalCalibrationHeadroom(item)
    ? 'Provides additional calibration/EQ headroom.'
    : null;

  const combinedChangeText = [p12P13Text, levelChangeText].filter(Boolean).join(' · ');
  const valueText = isSaving
    ? (combinedChangeText || 'Profile preserved')
    : (combinedChangeText || 'Profile improved');

  return (
    <div style={{ padding: '9px 0', borderTop: '1px solid #ECEAE6' }}>
      {item?.priorityLabel && (
        <div style={{ fontSize: 10, fontWeight: 800, color: '#9a3500', marginBottom: 3, letterSpacing: '0.04em' }}>
          {item.priorityLabel}
        </div>
      )}
      {item?.materialUpgradeLabel && (
        <div style={{ fontSize: 9, fontWeight: 800, color: '#625143', marginBottom: 3, letterSpacing: '0.05em' }}>
          {item.materialUpgradeLabel}
        </div>
      )}
      <div style={{ fontSize: 11, lineHeight: 1.35, fontWeight: 700, color: '#213428' }}>
        {item.title}
      </div>
      <div style={{ marginTop: 3, fontSize: 10, lineHeight: 1.35, color: '#3E4349' }}>
        {valueText}
      </div>
      {amplifierText && (
        <div style={{ marginTop: 2, fontSize: 9, lineHeight: 1.35, color: '#3E4349' }}>
          {amplifierText}
        </div>
      )}
      {headroomNote && (
        <div style={{ marginTop: 2, fontSize: 9, lineHeight: 1.35, color: '#625143', fontStyle: 'italic' }}>
          {headroomNote}
        </div>
      )}
      {viewingText && (
        <div style={{ marginTop: 2, fontSize: 9, lineHeight: 1.35, color: item?.viewingTradeoff ? '#9a6800' : '#625143' }}>
          {viewingText}
        </div>
      )}
      <div style={{ marginTop: 2, fontSize: 9, lineHeight: 1.35, color: '#77736B' }}>
        Rating {from}% → {to}% · {formatPoints(item.scoreDelta, true)}
      </div>
      <div style={{ marginTop: 2, fontSize: 9, lineHeight: 1.35, color: '#77736B' }}>
        {item.disruption} disruption · {item.confidence} confidence
      </div>
      {item.caveat && (
        <div style={{ marginTop: 2, fontSize: 9, lineHeight: 1.35, color: '#77736B', fontStyle: 'italic' }}>
          {item.caveat}
        </div>
      )}
    </div>
  );
}

function RecommendationGroup({ title, items, emptyText, mode }) {
  return (
    <section style={{ marginTop: 12 }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.07em', color: '#625143' }}>
        {title}
      </div>
      {items.length
        ? items.map((item) => <RecommendationRow key={item.id} item={item} mode={mode} />)
        : <div style={{ padding: '8px 0 2px', fontSize: 10, lineHeight: 1.4, color: '#77736B' }}>{emptyText}</div>}
    </section>
  );
}

/**
 * Compact Artcoustic System Design Rating and evaluated decision support.
 * Recommendations are results from canonical RP22/SPL/ASDR scenario re-runs.
 */
export default function DesignRatingSummary({
  showAsdr = false,
  rating = null,
  recommendations = null,
}) {
  if (!showAsdr) return null;

  const status = rating?.status || 'NOT_ASSESSED';
  const pct = rating?.displayPercentage;
  const displayPct = pct != null ? Math.round(pct) : null;
  const isNotAssessed = status === 'NOT_ASSESSED';
  const improvements = Array.isArray(recommendations?.improvements) ? recommendations.improvements : [];
  const savings = Array.isArray(recommendations?.savings) ? recommendations.savings : [];
  const isEvaluating = recommendations?.isEvaluating === true;

  return (
    <div
      style={{
        padding: '12px 16px',
        background: '#FFFFFF',
        border: '1px solid #DCDBD6',
        borderRadius: '8px',
        margin: '0 16px 12px 16px',
        maxHeight: '48vh',
        overflowY: 'auto',
      }}
      title="Proprietary Sound Proof design metric. Not part of CEDIA RP22 or RP23."
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: '#3E4349', marginBottom: 8, letterSpacing: '0.04em' }}>
        ARTCOUSTIC SYSTEM
        <br />
        DESIGN RATING
      </div>

      {isNotAssessed ? (
        <div style={{ fontSize: 18, fontWeight: 700, color: '#9B9890' }}>
          NOT ASSESSED
        </div>
      ) : (
        <div style={{ fontSize: 22, fontWeight: 700, color: '#213428' }}>
          {displayPct != null ? `${displayPct}%` : '—'}
        </div>
      )}

      {!isNotAssessed && (
        <>
          {isEvaluating && (
            <div style={{ marginTop: 8, fontSize: 9, color: '#77736B' }}>
              Evaluating low-change alternatives…
            </div>
          )}

          {!isEvaluating && recommendations && (
            <>
              <div style={{ marginTop: 8, fontSize: 8.5, lineHeight: 1.4, color: '#8A867D' }}>
                Each option is evaluated independently. Combining changes may produce a different result and should be re-evaluated.
              </div>
              <RecommendationGroup
                title="IMPROVE THE DESIGN"
                items={improvements}
                mode="improvement"
                emptyText="No material improvement identified."
              />
              <RecommendationGroup
                title="SIMPLIFY THE DESIGN"
                items={savings}
                mode="saving"
                emptyText="No material simplification identified."
              />
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #ECEAE6', fontSize: 8.5, lineHeight: 1.4, color: '#8A867D' }}>
                Bass is held at the current verified result. Subwoofer alternatives will be added only when scenario re-runs are connected and trusted.
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}