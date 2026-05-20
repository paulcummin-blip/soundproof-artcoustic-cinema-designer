import React from 'react';

const NAV_ITEMS = [
  { label: 'REW Benchmark', id: 'diagnostic-rew-benchmark' },
  { label: 'Energy Distribution', id: 'diagnostic-energy-distribution' },
  { label: 'Orthogonal', id: 'diagnostic-orthogonal' },
  { label: 'Phase', id: 'diagnostic-phase' },
  { label: 'Persistence', id: 'diagnostic-persistence' },
  { label: 'Whole Curve', id: 'diagnostic-whole-curve' },
  { label: 'Contributors', id: 'diagnostic-contributors' },
];

export default function DiagnosticsStickyNav() {
  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 20,
      marginBottom: 10,
      padding: '6px 8px',
      borderRadius: 6,
      background: '#ffffffee',
      border: '1px solid #cbd5e1',
      boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)',
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap',
      alignItems: 'center',
    }}>
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => scrollToSection(item.id)}
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: 999,
            background: '#f8fafc',
            color: '#334155',
            fontSize: 10,
            fontFamily: 'monospace',
            fontWeight: 700,
            padding: '3px 8px',
            cursor: 'pointer',
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}