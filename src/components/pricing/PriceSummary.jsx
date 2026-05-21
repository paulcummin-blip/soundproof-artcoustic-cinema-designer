// components/pricing/PriceSummary.jsx
import React from 'react';

/**
 * Price summary card for the sidebar.
 * Shows equipment total with multiplier applied (hidden when showPrices is false).
 */
export default function PriceSummary({ 
  showPrices = false, 
  baseTotal = 0, 
  finalTotal = 0, 
  difficultyMultiplier = 1.0,
  priceMode = "incVat"
}) {
  // Don't render anything when prices are hidden
  if (!showPrices) {
    return null;
  }
  
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
        Loudspeaker system price, {priceMode === "exVat" ? "ex VAT" : "inc VAT"}
      </div>
      
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#213428' }}>
          {formatPrice(finalTotal)}
        </div>
      </div>
    </div>
  );
}