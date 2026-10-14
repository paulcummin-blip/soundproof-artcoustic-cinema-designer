/**
 * TEMPORARY verification harness — Marquee Home / Original Design copy check.
 * Written to verify the report copy against the real saved design, then removed.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildProjectReportOpening } from '../components/report/projectReport/projectReportOpening.js';
import { buildProjectReportSummaryOpening } from '../components/report/projectReport/projectReportSummaryOpening.js';
import ProjectReportDesignSummary from '../components/report/projectReport/ProjectReportDesignSummary.jsx';
import ProjectReportProducts from '../components/report/projectReport/ProjectReportProducts.jsx';
import { selectClientNonScreenDynamicRange } from '../components/report/client/selectClientNonScreenDynamicRange.js';
import ClientTimbreConsistency from '../components/report/client/ClientTimbreConsistency.jsx';
import { buildProductsSelected } from '../components/report/reportProductsSelected.js';
import { buildCandidates } from '../../shared/strengthStories.js';

// ── Marquee Home / Original Design, read from the saved version ──────────────
const PROJECT = {
  dolby_config: '5.1',
  tv_preset_key: 'tv100',
  aspect_ratio: '16:9',
  screen_mount_mode: 'baffle',
  mlp_basis: 'middle',
  screen_size: 87.8,
};
const ROOM = { widthM: 5.42, lengthM: 5.25, heightM: 2.4 };
const SEATS = [
  { id: 'seat-r1-c1', x: 1.81, y: 3.96 },
  { id: 'seat-r1-c2', x: 2.41, y: 3.96 },
  { id: 'seat-r1-c3', x: 3.01, y: 3.96 },
  { id: 'seat-r1-c4', x: 3.61, y: 3.96 },
];
const PLACED = [
  { role: 'FL', model: 'evolve-3-1' },
  { role: 'FC', model: 'c4-1' },
  { role: 'FR', model: 'evolve-3-1' },
  { role: 'SL', model: 'evolve-2-1' },
  { role: 'SR', model: 'evolve-2-1' },
];

const products = buildProductsSelected({
  placedSpeakers: PLACED,
  rearSubsCfg: { model: 'sub2-12', count: 2 },
  acousticTreatmentEnabled: true,
  selectedAbfuserQty: 6,
});

describe('Marquee Home / Original Design copy', () => {
  it('front page headline and intent', () => {
    const opening = buildProjectReportOpening({
      projectDetails: PROJECT,
      roomDims: ROOM,
      productsSelected: products,
      seatingPositions: SEATS,
    });
    console.log('HEADLINE:', opening.headline);
    console.log('SUPPORTING:', opening.supportingLine);
    console.log('INTENT:\n' + opening.intent);

    expect(opening.headline).toBe('A compact 5.1 cinema designed around a 100" TV');
    expect(opening.supportingLine).toBe('100" TV · 5.42 × 5.25 × 2.40 m room · a single seating row');
    expect(opening.intent).toContain('designed as a compact dedicated cinema around a 100" TV and a single seating row');
    expect(opening.intent).toContain('The single seating row sits');
    expect(opening.intent).not.toMatch(/row sit /);
    expect(opening.intent).toContain('The 5.1 system concentrates on');
    expect(opening.intent).toContain('controlled low-frequency support from the rear subwoofers');
    expect(opening.intent).toContain('Six Artcoustic Abfuser panels are included');
    expect(opening.intent.toLowerCase()).not.toContain('overhead');
    expect(opening.intent.toLowerCase()).not.toContain('atmos');
  });

  it('nothing in the intent changes when the room is large', () => {
    const big = buildProjectReportSummaryOpening({
      projectDetails: PROJECT,
      roomDims: { widthM: 8, lengthM: 12, heightM: 3.2 },
      productsSelected: products,
      seatingPositions: SEATS,
    });
    expect(big).not.toContain('compact');
    expect(big).toContain('This room is designed as a dedicated cinema around');
  });

  it('key loudspeakers are readable by role', () => {
    const markup = renderToStaticMarkup(
      ProjectReportDesignSummary({
        projectDetails: PROJECT,
        roomDims: ROOM,
        seatingPositions: SEATS,
        screenWidthM: 2.23,
        productsSelected: products,
        summaryOpening: 'Design intent paragraph.',
        opening: { headline: 'A compact 5.1 cinema designed around a 100" TV', supportingLine: 'facts' },
      }),
    );
    const text = markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    console.log('FACT SHEET:', text);
    expect(markup).toContain('Screen channels: C4-1 and EVOLVE 3-1 × 2');
    expect(markup).toContain('Surrounds: EVOLVE 2-1 × 2');
    expect(markup).not.toContain('Overheads');
  });

  it('the schedule states the role where the front stage is mixed', () => {
    const markup = renderToStaticMarkup(ProjectReportProducts({ rows: products.rows, connections: {} }));
    console.log('SCHEDULE:', markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    expect(markup).toContain('SCREEN CHANNELS');
    expect(markup).not.toContain('>LCR<');
    // A single-model front stage keeps its LCR label.
    const single = renderToStaticMarkup(ProjectReportProducts({
      rows: [{ key: 'lcr', area: 'LCR', value: 'Q8-5 × 3' }],
      connections: {},
    }));
    expect(single).toContain('LCR');
  });

  it('the P13 page states the surround layer alone for 5.1', () => {
    const metrics = new Map([['mlp', { spl: { surrounds: { SL: { value: 99.4 }, SR: { value: 99.1 } } } }]]);
    const p13 = selectClientNonScreenDynamicRange({
      engineeringSummary: { roomResultsByParameter: { 13: { value: 99, formatted: '99 dB' } }, parameterSummaries: { project: { p13: { level: 'L3' } } } },
      allSeatSplMetrics: metrics,
      seatingPositions: SEATS,
      rsp: { x: 2.71, y: 3.96 },
      p13Mode: 'minimum',
    });
    console.log('P13 EXPLANATION:', p13.resultExplanation);
    expect(p13.resultExplanation).toBe('Minimum SPL capability of the surround speakers at the reference seating position.');
  });

  it('the P17 page never claims an overhead layer for 5.1', () => {
    const timbreSeats = SEATS.map((seat, index) => ({
      ...seat,
      id: `s${index + 1}`,
      p16Level: 'L3',
      p17Level: 'L2',
      categoryKey: 'consistent',
      isPrimary: index === 1,
    }));
    const markup = renderToStaticMarkup(ClientTimbreConsistency({
      roomDims: ROOM,
      seats: timbreSeats,
      rsp: { x: 2.71, y: 3.96 },
      screenFrontPlaneM: 0.4,
      screenWidthM: 2.23,
      counts: { assessed: 4 },
      hasOverheadLayer: false,
    }));
    const text = markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    console.log('P17 PAGE TEXT:', text);
    expect(text).toContain('P17 Surround');
    expect(text).not.toContain('Overhead');
    expect(text).toContain('Tonal balance consistency between the screen and surround channels at each seating position.');

    // The same page names the layer where the design has one.
    const atmos = renderToStaticMarkup(ClientTimbreConsistency({
      roomDims: ROOM,
      seats: timbreSeats,
      rsp: { x: 2.71, y: 3.96 },
      screenFrontPlaneM: 0.4,
      screenWidthM: 2.23,
      counts: { assessed: 4 },
      hasOverheadLayer: true,
    }));
    expect(atmos).toContain('P17 Surround &amp; Overhead');
  });

  it('highlight copy is overhead-aware and honest about moderate bass extension', () => {
    const seatResult = (seatId, level, value) => ({ seatId, level, value, valueFormatted: value, status: 'scored' });
    const engineeringSummary = {
      project: {
        reportCounts: {
          seatResultsByParameter: {
            p16: ['s1', 's2', 's3', 's4'].map((id) => seatResult(id, 'L3', '2.4 dB')),
            p17: ['s1', 's2', 's3', 's4'].map((id) => seatResult(id, 'L2', '4.1 dB')),
          },
        },
      },
    };
    const byKey = {
      p16: { key: 'p16', level: 'L3', eligible: true, value: '2.4 dB', assessed: 4, weight: 5 },
      p17: { key: 'p17', level: 'L2', eligible: true, value: '4.1 dB', assessed: 4, weight: 4 },
      p18: { key: 'p18', level: 'L2', eligible: true, value: '26 Hz', weight: 6 },
    };
    const { candidates } = buildCandidates(
      { engineeringSummary, productsSelected: products, seatingPositions: SEATS, dolbyConfig: '5.1' },
      { byKey, floor: 'L1', connections: { counts: { lcr: 3, surrounds: 2, overheads: 0, subwoofers: 2, acoustic_treatment: 6 } } },
    );
    const tonal = candidates.find((c) => c.id === 'tonal-consistency');
    const bass = candidates.find((c) => c.id === 'low-frequency-extension');
    console.log('TONAL:', tonal?.explanation);
    console.log('BASS:', bass?.explanation);
    expect(tonal.explanation).toContain('the model predicts strong tonal consistency across the assessed seats');
    expect(tonal.explanation).toContain('within the surround channels');
    expect(tonal.explanation).not.toContain('thinner');
    expect(tonal.explanation).not.toContain('overhead');
    expect(bass.explanation).toContain('26 Hz');
    expect(bass.explanation).toContain('without claiming the deepest infrasonic performance');
    expect(bass.explanation).not.toContain('felt in the room');
  });
});