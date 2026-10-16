/**
 * TEMPORARY DIAGNOSTIC PROBE — ADI Design Highlights copy.
 * Prints the selected highlights (title, evidence, explanation) for the frozen
 * fixture projects so the before/after wording can be compared. No assertions.
 * Deleted once the editorial pass is verified.
 */
import { test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildAdiDesignHighlights } from '../components/report/projectReport/adiDesignHighlights.js';

const read = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'));

const GENESIS_PRODUCTS = {
  rows: [
    { key: 'lcr', area: 'LCR', value: 'Q6-3 × 2, C4-1 × 2' },
    { key: 'surrounds', area: 'Surrounds / wides', value: 'Evolve 2-1 × 6' },
    { key: 'overheads', area: 'Overheads', value: 'Architect 2-1 × 6' },
    { key: 'subwoofers', area: 'Subwoofers', value: 'SUB3-12 × 2 (front), SUB3-12 × 2 (rear)' },
    { key: 'acoustic_treatment', area: 'Acoustic treatment', value: 'Artcoustic Abfuser × 6' },
  ],
};
const MARQUEE_PRODUCTS = {
  rows: [
    { key: 'lcr', area: 'LCR', value: 'Q8-5 × 3' },
    { key: 'surrounds', area: 'Surrounds / wides', value: 'Q6-3 × 6' },
    { key: 'overheads', area: 'Overheads', value: 'Spitfire Cloud × 6' },
    { key: 'subwoofers', area: 'Subwoofers', value: 'SUB4-12 × 2 (front), SUB4-12 × 2 (rear)' },
    { key: 'acoustic_treatment', area: 'Acoustic treatment', value: 'Artcoustic Abfuser × 8' },
  ],
};

const genesis = read('genesisAdiEvidence.json');
const marquee = read('marqueeLiveAdiEvidence.json');

// The evidence fixture carries no room dimensions; the project record does, and the
// report page supplies them to the highlights builder, so the room is supplied here
// too and the seating card is composed by its real geometry-aware path.
const GENESIS_SOURCES = {
  engineeringSummary: genesis.engineeringSummary,
  productsSelected: GENESIS_PRODUCTS,
  seatingPositions: genesis.seatingPositions,
  roomDims: { widthM: 4.64, lengthM: 5.09, heightM: 2.4 },
  dolbyConfig: genesis.project?.dolby_config || '9.1.6',
  displayType: genesis.screen?.display_type,
};
const MARQUEE_SOURCES = {
  engineeringSummary: marquee.engineeringSummary,
  productsSelected: MARQUEE_PRODUCTS,
  seatingPositions: marquee.seatingPositions,
  roomDims: { widthM: 5.42, lengthM: 5.25, heightM: 2.4 },
  dolbyConfig: marquee.project?.dolby_config || '9.1.6',
  displayType: marquee.screen?.display_type,
};

for (const [name, sources] of [['GENESIS', GENESIS_SOURCES], ['MARQUEE', MARQUEE_SOURCES]]) {
  test(`PROBE ${name}`, () => {
    const highlights = buildAdiDesignHighlights(sources);
    console.log(`\n===== ${name} — ${highlights.length} highlights =====`);
    highlights.forEach((h, i) => {
      console.log(`--- ${i + 1}. ${h.title}  [${h.category}] level=${h.level}`);
      console.log(`    evidence: ${(h.evidence || []).map((e) => `${e.key}${e.level ? ` ${e.level}` : ''}${e.value ? ` — ${e.value}` : ''}`).join(' | ')}`);
      console.log(`    copy: ${h.explanation}`);
    });
  });
}