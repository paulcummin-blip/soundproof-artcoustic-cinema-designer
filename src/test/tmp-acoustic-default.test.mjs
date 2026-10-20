import { test } from 'vitest';
import assert from 'node:assert/strict';
import { serializeProject } from '@/components/utils/serializeProject';
import { resolveAbfuserQuantityFromProject, ABFUSER_QTY_SOURCE } from '@/components/utils/abfuserQuantityMigration';
import { resolveIncludedAbfuserQuantity } from '@/components/utils/abfuserInclusionAuthority';
import { describeAbfuserInclusion } from '@/components/utils/adiAbfuserRecommendation';

test('OFF persists the ON/OFF choice AND the dealer quantity, and prices nothing', () => {
  const payload = serializeProject({
    acousticTreatmentEnabled: false,
    selectedAbfuserQty: 4,
    abfuserQtySource: 'user',
  });
  assert.equal(payload.acoustic_treatment_enabled, false);
  assert.equal(payload.selected_abfuser_qty, 4);
  assert.equal(payload.abfuser_qty_source, 'user');

  // refresh / reopen -> hydration restores exactly what was saved
  const restored = resolveAbfuserQuantityFromProject(payload);
  assert.equal(restored.selectedQuantity, 4);
  assert.equal(restored.quantitySource, ABFUSER_QTY_SOURCE.USER);

  // OFF -> nothing included, nothing priced
  assert.equal(resolveIncludedAbfuserQuantity({
    enabled: payload.acoustic_treatment_enabled,
    quantitySource: restored.quantitySource,
    selectedQuantity: restored.selectedQuantity,
    recommendedQuantity: 6,
  }), 0);

  // switching back ON restores the dealer's own quantity
  assert.equal(resolveIncludedAbfuserQuantity({
    enabled: true,
    quantitySource: restored.quantitySource,
    selectedQuantity: restored.selectedQuantity,
    recommendedQuantity: 6,
  }), 4);

  // wording
  assert.equal(describeAbfuserInclusion({ recommendedQuantity: 6, selectedQuantity: 4, enabled: false }).message,
    'Optional — not included in proposal.');
  assert.equal(describeAbfuserInclusion({ recommendedQuantity: 6, selectedQuantity: 4, enabled: true }).message,
    'Designer selected quantity differs from the ADI recommendation.');
});

test('ON following the recommendation persists the included quantity', () => {
  const payload = serializeProject({
    acousticTreatmentEnabled: true,
    selectedAbfuserQty: 6,
    abfuserQtySource: 'recommended',
  });
  assert.equal(payload.acoustic_treatment_enabled, true);
  assert.equal(payload.selected_abfuser_qty, 6);
  assert.equal(payload.abfuser_qty_source, 'recommended');
  const restored = resolveAbfuserQuantityFromProject(payload);
  assert.equal(restored.selectedQuantity, 6);
  assert.equal(restored.quantitySource, ABFUSER_QTY_SOURCE.RECOMMENDED);
  assert.equal(resolveIncludedAbfuserQuantity({
    enabled: true,
    quantitySource: restored.quantitySource,
    selectedQuantity: restored.selectedQuantity,
    recommendedQuantity: 6,
  }), 6);
  assert.equal(describeAbfuserInclusion({ recommendedQuantity: 6, selectedQuantity: 6, enabled: true }).message,
    'Acoustic treatment included in proposal.');
});