/**
 * highlights-curation.test.mjs
 * ----------------------------
 * ACCEPTANCE — the Key Performance Highlights table states what this design does
 * well, rather than everything that was assessed.
 *
 * The confirmed defect: the table carried every calculated result the section had
 * stored, including the rows the design only just met (P2 L1, P5 L1, P12 L1 and
 * P14 L1), so the summary read as a second technical report and the areas the
 * design genuinely delivers in were lost among them.
 *
 * The rows below are the real stored rows of the Marquee Home / Original Design
 * proposal. Nothing here recalculates a result: the selection reads the stored
 * rows and the one canonical ASDR importance table, and chooses one story row per
 * performance category. The design's own facts stay in the table and are never
 * counted as a highlight.
 *
 * Assertions are deliberately simple (toBe) so the focused-suite runner can run
 * this file with its own expect stub.
 */
import { describe, it, expect } from 'vitest';
import {
  curateSummaryHighlights,
  selectKeyHighlights,
  achievedLevel,
} from '../components/proposal/highlightsSelectionAuthority.js';

/** The stored calculated rows of the Marquee proposal, verbatim. */
const MARQUEE_ROWS = [
  { key: 'screen_size', area: 'Screen', result: '100" 16:9' },
  { key: 'rp23_viewing', area: 'RP23 viewing', result: 'Viewing angles calculated for 4 seats. Horizontal viewing angle ranges from 32° to 32°.' },
  { key: 'system_layout', area: 'System layout', result: '5.1 Dolby Atmos configuration (5 bed channels, 1 subwoofer, 0 overhead channels)' },
  { key: 'p2', area: 'Discrete channels', result: 'L1 · 5 speakers' },
  { key: 'p4', area: 'Screen consistency', result: 'L4 · 1 dB' },
  { key: 'p5', area: 'Horizontal spacing', result: 'L1 · 145°' },
  { key: 'p12', area: 'Screen Dynamic Range', result: 'L1 · 99 dBC' },
  { key: 'p13', area: 'Non-screen Dynamic Range', result: 'L2 · 101 dBC (SS)' },
  { key: 'p14', area: 'LFE and subwoofer Dynamic Range', result: 'L1 · 109 dBC' },
  { key: 'p18', area: 'Bass extension', result: 'L2 · 26 Hz' },
  { key: 'p19', area: 'Bass response', result: 'L4 · ±1 dB' },
  { key: 'p16', area: 'Screen timbre', result: 'L4 · ±0 dB' },
  { key: 'p17', area: 'Surround timbre', result: 'L4 · ≤1.5 dB window' },
  { key: 'p6', area: 'Surround level consistency', result: 'L2 · 5 dB' },
];

const keysOf = (rows) => rows.map((row) => String(row.key)).join(',');

describe('Key Performance Highlights curation', () => {
  it('selects the design’s own story: the front stage, the tonal character and the deep bass', () => {
    // One story row per performance category the design genuinely delivers in:
    // the front stage (p4, L4), the tonal character (p16, L4) and the bass
    // extension the project is built around (p18 — the heaviest weighted
    // parameter in the canonical table).
    expect(keysOf(selectKeyHighlights(MARQUEE_ROWS))).toBe('p4,p16,p18');
  });

  it('never presents a Level 1 result as a highlight', () => {
    const keys = keysOf(selectKeyHighlights(MARQUEE_ROWS));
    expect(keys.includes('p2')).toBe(false);
    expect(keys.includes('p5')).toBe(false);
    expect(keys.includes('p12')).toBe(false);
    expect(keys.includes('p14')).toBe(false);
    expect(selectKeyHighlights(MARQUEE_ROWS).every((row) => achievedLevel(row) >= 2)).toBe(true);
  });

  it('does not promote a quality reading over the story it qualifies', () => {
    // p19 (bass control) supports the bass story the bass extension tells; it
    // never becomes the row that carries the bass.
    expect(keysOf(selectKeyHighlights(MARQUEE_ROWS)).includes('p19')).toBe(false);
  });

  it('carries at most four highlights', () => {
    const many = ['p1', 'p2', 'p4', 'p6', 'p9', 'p12', 'p13', 'p16', 'p17', 'p18', 'p19']
      .map((key) => ({ key, area: key, result: 'L4 · 1 dB' }));
    expect(selectKeyHighlights(many).length <= 4).toBe(true);
  });

  it('keeps the design’s own facts in the table without counting them as highlights', () => {
    expect(keysOf(curateSummaryHighlights(MARQUEE_ROWS)))
      .toBe('screen_size,rp23_viewing,system_layout,p4,p16,p18');
    expect(keysOf(selectKeyHighlights(MARQUEE_ROWS)).includes('screen_size')).toBe(false);
  });

  it('withdraws rows from the page only: the stored rows are never modified', () => {
    const before = JSON.stringify(MARQUEE_ROWS);
    curateSummaryHighlights(MARQUEE_ROWS);
    selectKeyHighlights(MARQUEE_ROWS);
    expect(JSON.stringify(MARQUEE_ROWS)).toBe(before);
  });

  it('reads the brief when the designer’s own words name an area', () => {
    // The brief asks about impact and headroom, so Dynamic Range is read on its
    // own terms rather than being left out for sitting below a strength.
    const rows = [
      { key: 'p13', area: 'Non-screen Dynamic Range', result: 'L2 · 101 dBC' },
      { key: 'p6', area: 'Surround level consistency', result: 'L2 · 5 dB' },
    ];
    expect(keysOf(selectKeyHighlights(rows, { briefText: 'Impact and headroom matter most here' }))).toBe('p13');
    expect(keysOf(selectKeyHighlights(rows))).toBe('');
  });
});