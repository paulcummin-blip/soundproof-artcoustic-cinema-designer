// CountedVersionSelect.jsx
// ------------------------
// The counted-version control for one project.
//
// A single-version project counts that version automatically and shows its name.
// A multi-version project offers the automatic bases (lowest value by default)
// and then each real version by name.

import React from 'react';
import { BRAND } from './IntelligenceUi';
import { buildVersionOptions, optionValueForSelection } from '@/lib/commercial/projectReporting/projectSelection';

const SELECT = {
  padding: '6px 8px',
  borderRadius: 8,
  border: `1px solid ${BRAND.border}`,
  background: BRAND.card,
  color: BRAND.text,
  fontSize: 12,
  maxWidth: 210,
};

export default function CountedVersionSelect({ family, onChange }) {
  const selection = family?.selection;

  if (!family || (family.variationCount || 0) <= 1) {
    return (
      <span style={{ fontSize: 12, color: BRAND.subtext }}>
        {selection?.countedVersionName || 'Only version'}
      </span>
    );
  }

  const options = buildVersionOptions(family);

  return (
    <select
      style={SELECT}
      value={optionValueForSelection(selection)}
      onChange={(event) => onChange?.(event.target.value)}
      aria-label={`Counted version for ${family.name}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}