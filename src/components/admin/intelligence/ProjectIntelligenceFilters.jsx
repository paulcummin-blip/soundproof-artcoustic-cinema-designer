// ProjectIntelligenceFilters.jsx
// ------------------------------
// The filter bar. Every filter is applied in the derivation layer, not here.

import React from 'react';
import { BRAND, Button } from './IntelligenceUi';
import { STATUS_BUCKETS } from '@/lib/commercial/projectReporting/statusBuckets';

const labelStyle = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: BRAND.accent,
  marginBottom: 4,
};

const controlStyle = {
  width: '100%',
  padding: '7px 9px',
  fontSize: 13,
  color: BRAND.text,
  background: BRAND.card,
  border: `1px solid ${BRAND.border}`,
  borderRadius: 8,
};

function Field({ label, children }) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange, hint }) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13,
      color: BRAND.subtext,
      padding: '7px 0',
    }}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        {label}
        {hint && <span style={{ display: 'block', fontSize: 11, color: BRAND.muted }}>{hint}</span>}
      </span>
    </label>
  );
}

const VALUE_BASIS_OPTIONS = [
  { value: 'live', label: 'Live Design Value' },
  { value: 'quoted', label: 'Quoted Snapshot Value' },
  { value: 'both', label: 'Show Both' },
];

export default function ProjectIntelligenceFilters({ filters, onChange, onReset, accounts }) {
  return (
    <section style={{
      background: BRAND.card,
      border: `1px solid ${BRAND.border}`,
      borderRadius: 12,
      padding: 16,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
      gap: 14,
      alignItems: 'end',
    }}>
      <Field label="From">
        <input
          type="date"
          style={controlStyle}
          value={filters.dateFrom}
          onChange={(event) => onChange('dateFrom', event.target.value)}
        />
      </Field>

      <Field label="To">
        <input
          type="date"
          style={controlStyle}
          value={filters.dateTo}
          onChange={(event) => onChange('dateTo', event.target.value)}
        />
      </Field>

      <Field label="Dealer / account">
        <select
          style={controlStyle}
          value={filters.accountId}
          onChange={(event) => onChange('accountId', event.target.value)}
        >
          <option value="">All accounts</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>
      </Field>

      <Field label="Status bucket">
        <select
          style={controlStyle}
          value={filters.bucket}
          onChange={(event) => onChange('bucket', event.target.value)}
        >
          <option value="">All buckets</option>
          {STATUS_BUCKETS.map((bucket) => (
            <option key={bucket.key} value={bucket.key}>{bucket.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Value basis">
        <select
          style={controlStyle}
          value={filters.valueBasis}
          onChange={(event) => onChange('valueBasis', event.target.value)}
        >
          {VALUE_BASIS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Search">
        <input
          type="search"
          placeholder="Project, client, reference or dealer"
          style={controlStyle}
          value={filters.search}
          onChange={(event) => onChange('search', event.target.value)}
        />
      </Field>

      <div>
        <Toggle
          label="Include archived"
          hint="Lifecycle status = Archived"
          checked={filters.includeArchived}
          onChange={(value) => onChange('includeArchived', value)}
        />
        <Toggle
          label="Include unpriced projects"
          hint="Never zeroed — shown as unpriced"
          checked={filters.includeUnpriced}
          onChange={(value) => onChange('includeUnpriced', value)}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <Button variant="secondary" onClick={onReset}>Reset filters</Button>
      </div>
    </section>
  );
}