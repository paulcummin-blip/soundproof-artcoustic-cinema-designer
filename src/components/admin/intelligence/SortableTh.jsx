// SortableTh.jsx
// --------------
// A table heading that sorts on click, with the direction shown on the active
// heading. Presentation only: the caller owns the sort state and the ordering.
//
// Renders inside the shared Th so every Project Intelligence table keeps the
// same heading styling.

import React from 'react';
import { BRAND, Th } from './IntelligenceUi';

export default function SortableTh({
  label,
  columnKey,
  align = 'left',
  activeKey,
  direction,
  onSort,
  hint,
  indicator = '',
}) {
  const isActive = activeKey === columnKey;

  return (
    <Th align={align}>
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        title={hint || `Sort by ${label}`}
        aria-label={`${hint || `Sort by ${label}`}${isActive ? ` (currently ${direction === 'asc' ? 'ascending' : 'descending'})` : ''}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          font: 'inherit',
          letterSpacing: 'inherit',
          textTransform: 'inherit',
          color: isActive ? BRAND.primary : 'inherit',
          background: 'transparent',
          border: 'none',
          padding: 0,
          margin: 0,
          cursor: 'pointer',
        }}
      >
        <span>{label}</span>
        <span style={{ fontSize: 9, lineHeight: 1, opacity: isActive ? 1 : 0.3 }}>
          {isActive ? indicator : '↕'}
        </span>
      </button>
    </Th>
  );
}