// components/pricing/DesignRatingSummary.jsx
import React from 'react';

function formatPoints(value, signed = false) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const prefix = signed && number > 0 ? '+' : '';
  return `${prefix}${number.toFixed(1)} pts`;
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(number);
}

function RecommendationRow({ item, mode }) {
  const from = Math.round(Number(item?.currentPercentage) || 0);
  const to = Math.round(Number(item?.newPercentage) || 0);
  const impact = Array.isArray(item?.affectedParameters) && item.affectedParameters.length
    ? item.affectedParameters.join(', ')
    : 'ASDR';
  const saving = formatMoney(item?.savingExVat);
  const cost = formatMoney(item?.costDeltaExVat);
  const isSaving = mode === 'saving';

  let valueText;
  if (isSaving) {
    valueText = saving
      ? `Save ${saving} ex VAT · ${item.scoreLoss <= 0.05 ? 'no rating loss' : formatPoints(-item.scoreLoss)}`
      : `${formatPoints(-item.scoreLoss)} rating impact`;
  } else if (item?.costDeltaExVat === 0) {
    valueText = `${formatPoints(item.scoreDelta, true)} · £0 equipment`;
  } else if (Number(item?.costDeltaExVat) < 0) {
    valueText = `${formatPoints(item.scoreDelta, true)} · saves ${formatMoney(Math.abs(item.costDeltaExVat))} ex VAT`;
  } else if (cost) {
    valueText = `${formatPoints(item.scoreDelta, true)} · ${cost} ex VAT`;
  } else {
    valueText = `${formatPoints(item.scoreDelta, true)} · price not connected`;
  }

  return (
    <div style={{ padding: '9px 0', borderTop: '1px solid #ECEAE6' }}>
      <div style={{ fontSize: 11, lineHeight: 1.35, fontWeight: 700, color: '#213428' }}>
        {item.title}
      </div>
      <div style={{ marginTop: 3, fontSize: 10, lineHeight: 1.35, color: '#3E4349' }}>
        {valueText}
      </div>
      <div style={{ marginTop: 2, fontSize: 9, lineHeight: 1.35, color: '#77736B' }}>
        Rating {from}% → {to}% · {impact}
      </div>
      <div style={{ marginTop: 2, fontSize: 9, lineHeight: 1.35, color: '#77736B' }}>
        {item.disruption} disruption · {item.confidence} confidence
      </div>
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
              <RecommendationGroup
                title="IMPROVE THE DESIGN"
                items={improvements}
                mode="improvement"
                emptyText="No score improvement was verified among the current low-change alternatives."
              />
              <RecommendationGroup
                title="REDUCE PROJECT COST"
                items={savings}
                mode="saving"
                emptyText="No priced saving below the five-point impact limit was verified."
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
