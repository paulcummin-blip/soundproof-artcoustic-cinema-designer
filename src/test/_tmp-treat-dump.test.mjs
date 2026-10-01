import { test } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AbfuserTreatmentPlan from '../components/report/client/AbfuserTreatmentPlan.jsx';
import { selectClientAcousticTreatment } from '../components/report/client/selectClientAcousticTreatment.js';

const roomDims = { widthM: 5.18, lengthM: 7.29, heightM: 2.8 };
const seatingPositions = [
  { id: 'seat-r1-c1', x: 1.69, y: 3.78 },
  { id: 'seat-r1-c2', x: 2.29, y: 3.78 },
  { id: 'seat-r1-c3', x: 2.89, y: 3.78 },
  { id: 'seat-r1-c4', x: 3.49, y: 3.78 },
  { id: 'seat-r2-c1', x: 1.39, y: 5.58 },
  { id: 'seat-r2-c2', x: 1.99, y: 5.58 },
  { id: 'seat-r2-c3', x: 2.59, y: 5.58 },
  { id: 'seat-r2-c4', x: 3.19, y: 5.58 },
  { id: 'seat-r2-c5', x: 3.79, y: 5.58 },
];
const placedSpeakers = [
  { role: 'FL', position: { x: 1.5, y: 0.6 } },
  { role: 'FC', position: { x: 2.59, y: 0.6 } },
  { role: 'FR', position: { x: 3.68, y: 0.6 } },
];

test('dump', () => {
  const sel = selectClientAcousticTreatment({
    roomDims, seatingPositions, placedSpeakers, rsp: { x: 2.5, y: 4.64 },
    acousticTreatmentEnabled: true, selectedAbfuserQty: 6, legacyAutoQuantity: 6,
  });
  console.log('ZONES', JSON.stringify(sel.zones.map((z) => ({ id: z.id, wall: z.wall, panels: z.panels, x: z.x, y: z.y, w: z.width, h: z.height })), null, 1));
  console.log('PANELS', JSON.stringify(sel.markers.map((m) => ({ k: m.key, wall: m.wall, x: m.x, y: m.y, w: m.width, h: m.height })), null, 1));
  console.log('PANEL', JSON.stringify(sel.panel));
  const svg = renderToStaticMarkup(React.createElement(AbfuserTreatmentPlan, {
    roomPlan: sel.roomPlan, zones: sel.zones, panels: sel.markers, panel: sel.panel,
    seatingPositions, rsp: { x: 2.5, y: 4.64 }, totalPanels: sel.recommendedQty,
  }));
  const start = svg.indexOf('<svg');
  console.log('PLAN_SVG_START');
  console.log(svg.slice(start, svg.indexOf('</svg>', start) + 6));
  console.log('PLAN_SVG_END');
});