import { test } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ClientP7FrontWides from '../components/report/client/ClientP7FrontWides.jsx';

const perSide = {
  LW: { targetAngle: 225, actualAngle: 231.1, deviation: 6.1 },
  RW: { targetAngle: 135, actualAngle: 131.5, deviation: 3.5 },
};
const base = {
  level: 'L2', maxDeviation: 6.1, perSide, ideal: perSide,
  lwPos: { x: 0.6, y: 3.2 }, rwPos: { x: 3.9, y: 3.2 },
  flPos: { x: 1.2, y: 0.4 }, frPos: { x: 3.3, y: 0.4 },
  slPos: { x: 0.1, y: 4.0 }, srPos: { x: 4.4, y: 4.0 },
  medianPoint: { x: 2.25, y: 3.2 }, rsp: { x: 2.5, y: 4.2 },
};
const props = { p7Data: base, roomDims: { widthM: 4.5, lengthM: 6.0 }, screenFrontPlaneM: 0.2, screenWidthM: 3 };
const textOf = (m) => m.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

test('dump', () => {
  const screen = renderToStaticMarkup(React.createElement(ClientP7FrontWides, props));
  console.log('TEXT >>>', textOf(screen));
  const svg = screen.slice(screen.indexOf('<svg'), screen.indexOf('</svg>'));
  console.log('DOTS >>>', [...svg.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="7"/g)].map((m) => [Number(m[1]).toFixed(1), Number(m[2]).toFixed(1)]));
  console.log('IDEAL >>>', [...svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="8"/g)].map((m) => [Number(m[1]).toFixed(1), Number(m[2]).toFixed(1)]));
  console.log('LABELS >>>', [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((m) => m[1]));
  const noIdeal = { ...base, ideal: null };
  const fallback = renderToStaticMarkup(React.createElement(ClientP7FrontWides, { ...props, p7Data: noIdeal }));
  console.log('FALLBACK TEXT >>>', textOf(fallback));
});