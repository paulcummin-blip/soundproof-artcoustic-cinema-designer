// absent-speaker-layers-omitted.test.mjs
// ---------------------------------------------------------------------------
// A system is described by the layers it HAS. A 5.1 / 5.2 system is not missing
// its overheads: it is a 5.1 system, so no report or proposal may state an
// absent layer as "None specified", as a dash, or as a missing category.
//
// Applicability and presentation only. No RP22 calculation, layout calculation,
// equipment count, format logic or report authority is changed by this rule.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildProductsSelected,
  statedProducts,
} from '../components/report/reportProductsSelected.js';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..', '..');
const read = (path) => readFileSync(join(app, path), 'utf8');

/** The reported 5.2 system: screen wall, side surrounds, two subwoofers. */
const FIVE_TWO_SPEAKERS = [
  { role: 'FL', model: 'C4-1' },
  { role: 'FC', model: 'C4-1' },
  { role: 'FR', model: 'C4-1' },
  { role: 'SL', model: 'Evolve 3-1' },
  { role: 'SR', model: 'Evolve 3-1' },
];

const fiveTwo = () => buildProductsSelected({
  placedSpeakers: FIVE_TWO_SPEAKERS,
  frontSubsCfg: { model: 'SUB2-12', count: 2 },
  rearSubsCfg: null,
  isVisible: () => true,
});

describe('the product statement states the system that exists', () => {
  it('states only the layers the design has', () => {
    const products = fiveTwo();
    expect(products.rows.map((row) => row.key)).toEqual(['lcr', 'surrounds', 'subwoofers']);
    expect(products.rows.some((row) => row.key === 'overheads')).toBe(false);
    expect(products.rows.some((row) => row.key === 'acoustic_treatment')).toBe(false);
  });

  it('states no "None specified" anywhere in the derivation', () => {
    const products = fiveTwo();
    expect(JSON.stringify(products).includes('None specified')).toBe(false);
    expect(products.overheads).toEqual([]);
    expect(products.acoustic_treatment).toEqual([]);
    // A real layer is stated exactly as before, in the registry's own casing.
    expect(products.surrounds).toEqual(['EVOLVE 3-1 × 2']);
    expect(products.subwoofers).toEqual(['SUB2-12 × 2 (front)']);
  });

  it('still states an installed overhead layer', () => {
    const products = buildProductsSelected({
      placedSpeakers: [
        ...FIVE_TWO_SPEAKERS,
        { role: 'TFL', model: 'Evolve 3-1' },
        { role: 'TFR', model: 'Evolve 3-1' },
      ],
      frontSubsCfg: { model: 'SUB2-12', count: 2 },
      isVisible: () => true,
    });
    expect(products.rows.some((row) => row.key === 'overheads')).toBe(true);
    expect(products.overheads).toEqual(['EVOLVE 3-1 × 2']);
  });

  it('reads a blank or placeholder entry as absent', () => {
    expect(statedProducts(['SUB2-12 × 2'])).toEqual(['SUB2-12 × 2']);
    expect(statedProducts(['None specified'])).toEqual([]);
    expect(statedProducts(['  '])).toEqual([]);
    expect(statedProducts([])).toEqual([]);
    expect(statedProducts(null)).toEqual([]);
  });
});

describe('every surface omits an absent layer', () => {
  it('omits the absent product fact from the Project Summary', () => {
    const page = read('src/components/report/projectReport/ProjectReportDesignSummary.jsx');
    expect(page).toMatch(/const PRODUCT_FACT_LABELS = new Set\(\['Key loudspeakers', 'Subwoofers', 'Acoustic treatment'\]\)/);
    expect(page).toMatch(/\.filter\(\(fact\) => !PRODUCT_FACT_LABELS\.has\(fact\.label\) \|\| Boolean\(fact\.value\)\)/);
    // The key loudspeaker line reads the design's own present layers.
    expect(page).toMatch(/const keyLoudspeakers = \['lcr', 'surrounds', 'overheads'\]/);
    expect(page).toMatch(/\.filter\(Boolean\)/);
  });

  it('states only rows with real speakers in the Technical Report', () => {
    const overview = read('src/components/report/technical/TechnicalProjectOverview.jsx');
    expect(overview).toMatch(/\.filter\(\(\{ models \}\) => statedProducts\(models\)\.length > 0\)/);
    expect(overview).toMatch(/\{statedProducts\(models\)\.join\(", "\)\}/);
    expect(overview.includes('"None specified"')).toBe(false);
  });

  it('never re-adds the placeholder in the evidence or the proposal rows', () => {
    const parity = read('src/components/report/reportEvidenceParity.js');
    expect(parity.includes("rendered[key] = ['None specified']")).toBe(false);
    expect(parity).toMatch(/text !== 'None specified'/);

    const reader = read('base44/shared/proposalReportEvidenceReader.js');
    expect(reader.includes('const NONE')).toBe(false);
    expect(reader).toMatch(/\.filter\(\(row\) => row\.value\.length > 0\)/);

    const facts = read('base44/shared/proposalEvidence/proposalEvidenceFacts.js');
    expect(facts).toMatch(/\.filter\(\(row\) => row\.value && row\.value !== NONE\)/);

    // The frozen evidence already read the placeholder as absent.
    const authority = read('src/components/report/reportEvidenceAuthority.js');
    expect(authority).toMatch(/if \(!text \|\| text === 'None specified'\) return null/);
  });

  it('never records a five-channel bed as a constraint or an absence', () => {
    const interpretation = read('base44/shared/adiProjectInterpretation.js');
    expect(interpretation.includes('no overhead layer')).toBe(false);
    // What the system IS is still stated.
    expect(interpretation).toMatch(/at listener level/);
  });
});

describe('no calculation, layout, count or format logic was touched', () => {
  it('keeps the derivation itself unchanged', () => {
    const products = read('src/components/report/reportProductsSelected.js');
    expect(products).toMatch(/const LCR_ROLES = Object\.freeze\(\['FL', 'FC', 'FR', 'L', 'C', 'R', 'FCL', 'FCR'\]\)/);
    expect(products).toMatch(/const SURROUND_ROLES = Object\.freeze\(\[/);
    expect(products).toMatch(/const countLabel = \(name, count\) => \(count > 1 \? `\$\{name\} × \$\{count\}` : name\)/);
    expect(products).toMatch(/export const PRODUCTS_SELECTED_ROWS = Object\.freeze\(\[/);
  });
});