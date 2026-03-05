"use client";

export function getDolbyZoneSpecs(dolbyLayoutStr) {
  const s = String(dolbyLayoutStr || "5.1").trim();
  const parts = s.split('.');
  const base = Math.max(2, Number(parts[0]) || 5);
  const hasWides = base >= 9;

  const C_WIDE = '#3b82f6';
  const C_SIDE = '#f59e0b';
  const C_REAR = '#10b981';
  const DASH   = '6,6';

  const specs = [];

  if (base === 5) {
    specs.push({
      label: 'Dolby Side (5.1: 110–120°)',
      stroke: C_SIDE,
      dash: DASH,
      ranges: [[110,120], [-120,-110]],
    });
  } else if (base === 7) {
    specs.push({
      label: 'Dolby Side (90–110°)',
      stroke: C_SIDE,
      dash: DASH,
      ranges: [[90,110], [-110,-90]],
    });
    specs.push({
      label: 'Dolby Rear (135–150°)',
      stroke: C_REAR,
      dash: DASH,
      ranges: [[135,150], [-150,-135]],
    });
  } else if (base >= 9) {
    if (hasWides) {
      specs.push({
        label: 'Dolby Wide (50–70°)',
        stroke: C_WIDE,
        dash: DASH,
        ranges: [[50,70], [-70,-50]],
      });
    }
    specs.push({
      label: 'Dolby Side (90–110°)',
      stroke: C_SIDE,
      dash: DASH,
      ranges: [[90,110], [-110,-90]],
    });
    specs.push({
      label: 'Dolby Rear (135–150°)',
      stroke: C_REAR,
      dash: DASH,
      ranges: [[135,150], [-150,-135]],
    });
  }

  return specs;
}