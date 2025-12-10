// components/pricing/PriceSummary.jsx
import React from 'react';

/**
 * Price summary card for the sidebar.
 * Shows equipment total with difficulty multiplier applied.
 */
export default function PriceSummary({ 
  showPrices = false, 
  baseTotal = 0, 
  finalTotal = 0, 
  difficultyMultiplier = 1.0 
}) {
  // Format price with thousand separators
  const formatPrice = (value) => {
    const rounded = Math.round(value);
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(rounded);
  };
  
  return (
    <div
      style={{
        padding: '12px 16px',
        background: '#FFFFFF',
        border: '1px solid #DCDBD6',
        borderRadius: '8px',
        margin: '0 16px 12px 16px',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: '#3E4349', marginBottom: 8 }}>
        Room Price Summary
      </div>
      
      {!showPrices ? (
        <div>
          <div style={{ fontSize: 13, color: '#999', marginBottom: 4 }}>
            Prices hidden
          </div>
          <div style={{ fontSize: 10, color: '#999' }}>
            Enable "Show Prices" in Options to view totals
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#213428', marginBottom: 4 }}>
            {formatPrice(finalTotal)}
          </div>
          <div style={{ fontSize: 10, color: '#3E4349' }}>
            Base: {formatPrice(baseTotal)} × Difficulty {difficultyMultiplier.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}