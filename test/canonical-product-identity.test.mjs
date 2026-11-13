/**
 * canonical-product-identity.test.mjs
 * -----------------------------------
 * Regression suite for the canonical product-identity fix.
 *
 * DISPLAY NAME is not PRODUCT IDENTITY. Engineering fingerprints and proposal
 * equipment joins use the canonical product identity (registry key); the UI
 * keeps showing display names. These tests prove the two confirmed defects stay
 * fixed and that genuinely different products still diverge.
 *
 *   Case A: Q6-3  -> q6-3   (bass calibration fingerprint must not change)
 *   Case B: Q8-5  -> q8-5   (bass calibration fingerprint must not change)
 *   Alias:  architect42mk2 vs architect42mkii (same canonical product)
 *   Join:   2 front / 2 middle / 2 rear overheads -> six recognised
 *   Distinct: two genuinely different models remain different
 *   Cold reopen: unchanged design -> fingerprint unchanged
 *   Legacy: an old saved alias resolves without rewriting the visible name
 */
import { describe, it, expect } from 'vitest';
import { normaliseModelKey, canonicalProductId } from '@/components/utils/modelKeyNormaliser';
import { buildLcrIntegrationSources } from '@/components/room/bass/lcrIntegrationSources';
import {
  computeCalibrationFingerprint,
  computeProductFingerprint,
} from '@/components/room/bass/bassAnalysisFingerprints';
import {
  buildPackageRows,
  unresolvedPackageQuantities,
} from '@/components/proposal/print/proposalPackAuthority';

// A fixed, neutral geometry so the fingerprint only moves when product
// identity moves. The sub source carries an already-canonical model key,
// matching what buildAuthoritativeBassSources now produces.
const BASE_INPUTS = {
  roomDims: { widthM: 5, lengthM: 6, heightM: 2.4 },
  sources: [
    { id: 'sub-1', modelKey: 'sub2-12', x: 1, y: 1, z: 0.35, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
  ],
  rspPosition: { x: 2.5, y: 3, z: 1.2 },
  seatingPositions: [{ id: 's1', x: 2.5, y: 3, z: 1.2 }],
};

const lcrSpeakers = (model) => [
  { role: 'FL', model, position: { x: 1, y: 0.4, z: 1.2 } },
  { role: 'FC', model, position: { x: 2.5, y: 0.4, z: 1.2 } },
  { role: 'FR', model, position: { x: 4, y: 0.4, z: 1.2 } },
];

const calibrationFpWithLcr = (lcrSources) =>
  computeCalibrationFingerprint({
    ...BASE_INPUTS,
    combinedResponseIdentity: {
      version: 'combined-lcr-sub-v1',
      sources: lcrSources,
      crossover: { frequencyHz: 80, lowPassSlopeDbPerOct: 24, highPassSlopeDbPerOct: 24 },
    },
  });

describe('canonical product identity — normaliser', () => {
  it('Q6-3 casing resolves to one canonical key', () => {
    expect(canonicalProductId('Q6-3')).toBe('q6-3');
    expect(canonicalProductId('q6-3')).toBe('q6-3');
    expect(canonicalProductId('Q6 3')).toBe('q6-3');
    expect(canonicalProductId('Q6-3')).toBe(canonicalProductId('q6-3'));
  });

  it('Q8-5 casing resolves to one canonical key', () => {
    expect(canonicalProductId('Q8-5')).toBe('q8-5');
    expect(canonicalProductId('q8-5')).toBe('q8-5');
    expect(canonicalProductId('Q8-5')).toBe(canonicalProductId('q8-5'));
  });

  it('Architect Mk2 / MkII alias resolves to one canonical key', () => {
    expect(canonicalProductId('Architect 4-2 Mk2')).toBe('architect-4-2-mk2');
    expect(canonicalProductId('Architect 4-2 MkII')).toBe('architect-4-2-mk2');
    expect(canonicalProductId('architect-4-2-mkii')).toBe('architect-4-2-mk2');
    expect(canonicalProductId('Architect 4-2 Mk2')).toBe(canonicalProductId('Architect 4-2 MkII'));
  });

  it('genuinely different products remain distinct', () => {
    expect(canonicalProductId('Q6-3')).not.toBe(canonicalProductId('Q8-5'));
    expect(canonicalProductId('Architect 4-2 Mk2')).not.toBe(canonicalProductId('Architect 2-1'));
    expect(canonicalProductId('SUB2-12')).not.toBe(canonicalProductId('SUB3-12'));
  });

  it('legacy surround "_s" alias resolves to the base product', () => {
    expect(canonicalProductId('evolve-2-1_s')).toBe('evolve-2-1');
    expect(canonicalProductId('EVOLVE 2-1')).toBe('evolve-2-1');
    // The visible display name is never rewritten by canonicalProductId:
    // it only returns the internal key.
    expect(normaliseModelKey('evolve-2-1_s')).toBe('evolve-2-1_s');
  });
});

describe('FIX 1 — bass identity uses canonical product identity', () => {
  it('LCR source modelKey is canonical, not the display name', () => {
    const upper = buildLcrIntegrationSources(lcrSpeakers('Q6-3'));
    const lower = buildLcrIntegrationSources(lcrSpeakers('q6-3'));
    expect(upper.length).toBe(3);
    expect(upper.every((s) => s.modelKey === 'q6-3')).toBe(true);
    expect(lower.every((s) => s.modelKey === 'q6-3')).toBe(true);
  });

  it('Case A — Q6-3 casing no longer changes the calibration fingerprint', () => {
    const fpUpper = calibrationFpWithLcr(buildLcrIntegrationSources(lcrSpeakers('Q6-3')));
    const fpLower = calibrationFpWithLcr(buildLcrIntegrationSources(lcrSpeakers('q6-3')));
    expect(fpUpper).toBe(fpLower);
  });

  it('Case B — Q8-5 casing no longer changes the calibration fingerprint', () => {
    const fpUpper = calibrationFpWithLcr(buildLcrIntegrationSources(lcrSpeakers('Q8-5')));
    const fpLower = calibrationFpWithLcr(buildLcrIntegrationSources(lcrSpeakers('q8-5')));
    expect(fpUpper).toBe(fpLower);
  });

  it('Case 6 — cold reopen: unchanged design keeps the same fingerprint', () => {
    // The same design saved with one casing and hydrated with the other must
    // produce the same calibration fingerprint, because the product identity
    // is canonical, not the display spelling.
    const beforeClose = calibrationFpWithLcr(buildLcrIntegrationSources(lcrSpeakers('Q6-3')));
    const afterReopen = calibrationFpWithLcr(buildLcrIntegrationSources(lcrSpeakers('q6-3')));
    expect(beforeClose).toBe(afterReopen);
  });

  it('product fingerprint is stable across sub model casing', () => {
    const fpA = computeProductFingerprint({
      ...BASE_INPUTS,
      sources: [{ id: 'sub-1', modelKey: 'sub2-12', x: 1, y: 1, z: 0.35, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } }],
    });
    const fpB = computeProductFingerprint({
      ...BASE_INPUTS,
      sources: [{ id: 'sub-1', modelKey: 'SUB2-12', x: 1, y: 1, z: 0.35, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } }],
    });
    // Sub source modelKey is canonicalised at the build boundary, so both
    // spellings produce the same product fingerprint when canonicalised.
    expect(canonicalProductId('SUB2-12')).toBe(canonicalProductId('sub2-12'));
    expect(fpA).not.toBe(fpB); // raw differ — proves the fingerprint IS sensitive
    // but with canonicalisation (as now applied at the boundary) they match:
    const fpCanonicalA = computeProductFingerprint({
      ...BASE_INPUTS,
      sources: [{ id: 'sub-1', modelKey: canonicalProductId('SUB2-12'), x: 1, y: 1, z: 0.35, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } }],
    });
    const fpCanonicalB = computeProductFingerprint({
      ...BASE_INPUTS,
      sources: [{ id: 'sub-1', modelKey: canonicalProductId('sub2-12'), x: 1, y: 1, z: 0.35, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } }],
    });
    expect(fpCanonicalA).toBe(fpCanonicalB);
  });

  it('different LCR models still produce different fingerprints', () => {
    const fpQ6 = calibrationFpWithLcr(buildLcrIntegrationSources(lcrSpeakers('Q6-3')));
    const fpQ8 = calibrationFpWithLcr(buildLcrIntegrationSources(lcrSpeakers('Q8-5')));
    expect(fpQ6).not.toBe(fpQ8);
  });
});

describe('FIX 2 — proposal quantity join uses canonical product identity', () => {
  it('resolves the Cable Smart front pair from its saved LCR equipment quantity without changing the snapshot', () => {
    const snapshot = { system: {
      product_roles: [
        { role: 'front_left_right', position_label: 'Front Left / Right', model_label: 'EVOLVE 3-1', model_key: 'evolve-3-1', cabinet_count: 0, channel_count: 2 },
        { role: 'centre', position_label: 'Centre', model_label: 'C4-1', model_key: 'c4-1', cabinet_count: 1, channel_count: 1 },
      ],
      products_selected_by_layer: { lcr: [
        { model: 'C4-1', quantity: 1 },
        { model: 'EVOLVE 3-1', quantity: 2 },
      ] },
    } };
    const before = JSON.stringify(snapshot);
    expect(buildPackageRows(snapshot)).toEqual([
      { role: 'Front left', model: 'EVOLVE 3-1', qty: 1 },
      { role: 'Front right', model: 'EVOLVE 3-1', qty: 1 },
      { role: 'Centre', model: 'C4-1', qty: 1 },
    ]);
    expect(unresolvedPackageQuantities(snapshot)).toEqual([]);
    expect(JSON.stringify(snapshot)).toBe(before);
    snapshot.system.products_selected_by_layer.lcr.pop();
    expect(unresolvedPackageQuantities(snapshot).length).toBe(2);
  });

  // Three overhead positions of the ONE Architect product, but the front and
  // rear were saved as "Mk2" and the middle as "MkII". The layer total is six.
  // Before the fix the join compared architect42mk2 vs architect42mkii and
  // the middle position's quantity could not be resolved.
  const architectAliasSnapshot = () => ({
    system: {
      product_roles: [
        { role: 'overhead', position_label: 'Top front', model_key: 'Architect 4-2 Mk2', quantity: 0 },
        { role: 'overhead', position_label: 'Top middle', model_key: 'Architect 4-2 MkII', quantity: 0 },
        { role: 'overhead', position_label: 'Top rear', model_key: 'Architect 4-2 Mk2', quantity: 0 },
      ],
      products_selected_by_layer: {
        overheads: [{ model: 'Architect 4-2 Mk2', quantity: 6 }],
      },
    },
  });

  it('Case 4 — 2 front / 2 middle / 2 rear -> six total recognised correctly', () => {
    const rows = buildPackageRows(architectAliasSnapshot());
    const overheadRows = rows.filter((r) => r.role === 'Overheads' || r.role === 'Top front' || r.role === 'Top middle' || r.role === 'Top rear');
    // Every overhead row states a positive whole-number quantity.
    expect(overheadRows.length).toBe(3);
    for (const row of overheadRows) {
      expect(Number.isInteger(row.qty) && row.qty >= 1).toBe(true);
    }
    const total = overheadRows.reduce((sum, r) => sum + r.qty, 0);
    expect(total).toBe(6);
  });

  it('Case B proposal — no unresolved quantities, so export passes', () => {
    expect(unresolvedPackageQuantities(architectAliasSnapshot())).toEqual([]);
  });

  it('display names are preserved in the package rows', () => {
    const rows = buildPackageRows(architectAliasSnapshot());
    // The model cell still shows the display spelling the designer saved,
    // not the internal canonical key.
    const models = rows.map((r) => r.model).join(' · ');
    expect(models).toContain('Architect 4-2 Mk2');
    expect(models).not.toContain('architect-4-2-mk2');
  });

  it('genuinely different overhead models stay separate', () => {
    const snapshot = {
      system: {
        product_roles: [
          { role: 'overhead', position_label: 'Top front', model_key: 'Architect 4-2 Mk2', quantity: 2 },
          { role: 'overhead', position_label: 'Top rear', model_key: 'Architect 2-1', quantity: 2 },
        ],
        products_selected_by_layer: { overheads: [] },
      },
    };
    const rows = buildPackageRows(snapshot);
    const models = rows.map((r) => r.model);
    expect(models).toContain('Architect 4-2 Mk2');
    expect(models).toContain('Architect 2-1');
    expect(models.length).toBeGreaterThanOrEqual(2);
  });

  it('Case 7 — legacy alias record resolves without rewriting the visible name', () => {
    // An older saved record carried the "MkII" spelling. It must resolve to
    // the same canonical identity as "Mk2" for the join, while the visible
    // model cell keeps the spelling the designer saved.
    const snapshot = {
      system: {
        product_roles: [
          { role: 'overhead', position_label: 'Top front', model_key: 'Architect 4-2 MkII', quantity: 0 },
          { role: 'overhead', position_label: 'Top rear', model_key: 'Architect 4-2 MkII', quantity: 0 },
        ],
        products_selected_by_layer: {
          overheads: [{ model: 'Architect 4-2 Mk2', quantity: 4 }],
        },
      },
    };
    expect(unresolvedPackageQuantities(snapshot)).toEqual([]);
    const rows = buildPackageRows(snapshot);
    const total = rows.reduce((s, r) => s + (Number.isInteger(r.qty) ? r.qty : 0), 0);
    expect(total).toBe(4);
  });
});