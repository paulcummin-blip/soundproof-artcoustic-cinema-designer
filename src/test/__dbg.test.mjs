import { test } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveSeatRowLayout } from './src/components/report/client/perSeatCardLayout.js';
import ClientPerSeatPerformance from './src/components/report/client/ClientPerSeatPerformance.jsx';

const rows = [
  { rowIndex: 1, label: 'Front row', y: 3.78, seats: [
    { id: 'a', label: 'Row 1 - Seat 1', priority: 'primary', isRsp: true, rp23: { level: 'L3', valueText: '51.0°' }, parameters: [{ key: 'p1', label: 'P1', level: 4, valueText: '1.5m' }], spl: [] },
    { id: 'b', label: 'Row 1 - Seat 2', priority: 'secondary', isRsp: true, rp23: { level: 'L3', valueText: '51.0°' }, parameters: [{ key: 'p1', label: 'P1', level: 4, valueText: '1.5m' }], spl: [] },
  ] },
];
const layout = resolveSeatRowLayout(rows);
const markup = renderToStaticMarkup(React.createElement(ClientPerSeatPerformance, { rows: layout.seatRows, rsp: { x: 2.5, y: 3.78 } }));

test('dbg', () => {
  const parts = markup.split('per-seat-performance-card').slice(1);
  parts.forEach((p, i) => console.log('SEG' + i, 'count=' + (p.match(/>RSP</g) || []).length, p.slice(0, 300)));
});