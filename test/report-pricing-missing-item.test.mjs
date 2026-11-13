import { test, expect } from 'vitest';
import { buildPricingMissingItem } from '@/components/report/reportReadinessAuthority';

test('names the unpriced products when a genuine incomplete line exists', () => {
  const item = buildPricingMissingItem({
    breakdown: [
      { description: 'EVOLVE 1', unitPriceExVat: 400 },
      { description: 'SUB2-12', unitPriceExVat: null },
      { description: 'CPH-1000D', unitPriceExVat: null },
    ],
  });
  expect(item).not.toBeNull();
  expect(item.key).toBe('pricing');
  expect(item.label).toBe('Pricing incomplete: SUB2-12, CPH-1000D');
  expect(item.action).toContain('Product Master');
});

test('returns null when every active line is priced', () => {
  const item = buildPricingMissingItem({
    breakdown: [
      { description: 'EVOLVE 1', unitPriceExVat: 400 },
      { description: 'SUB2-12', unitPriceExVat: 1825 },
      { description: 'CPH-1000D', unitPriceExVat: 675 },
    ],
  });
  expect(item).toBeNull();
});

test('ignores manual extras (0 unit price, not null)', () => {
  const item = buildPricingMissingItem({
    breakdown: [
      { description: 'EVOLVE 1', unitPriceExVat: 400 },
      { description: 'Manual item', unitPriceExVat: 0 },
    ],
  });
  expect(item).toBeNull();
});

test('falls back to the generic label when no description is present', () => {
  const item = buildPricingMissingItem({
    breakdown: [{ model: '', unitPriceExVat: null }],
  });
  expect(item).not.toBeNull();
  expect(item.label).toBe('Pricing/products incomplete');
});