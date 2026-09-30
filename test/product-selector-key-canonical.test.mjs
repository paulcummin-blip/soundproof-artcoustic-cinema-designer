import { test, expect, describe } from "vitest";
import {
  productSelectorKey,
  productEngineeringKey,
  isLegacySurroundAlias,
  PRODUCT_ROLES,
} from "@/components/products/productMaster";

// Product identity must never encode role. A surround is expressed by the
// speaker's role, so the selector key is always the canonical base product.
describe("_s product identity residuals", () => {
  const baseSurround = { sku: "evolve-2-1", roles: ["lcr", "surround", "rear_surround", "front_wide"], label: "EVOLVE 2-1" };
  const legacyAlias = { sku: "evolve-2-1_s", roles: ["surround", "rear_surround", "front_wide"], label: "EVOLVE 2-1 (Surround)" };

  test("productSelectorKey returns the canonical base id for a surround role", () => {
    expect(productSelectorKey(baseSurround, PRODUCT_ROLES.SURROUND)).toBe("evolve-2-1");
    expect(productSelectorKey(baseSurround, PRODUCT_ROLES.REAR_SURROUND)).toBe("evolve-2-1");
    expect(productSelectorKey(baseSurround, PRODUCT_ROLES.FRONT_WIDE)).toBe("evolve-2-1");
  });

  test("productSelectorKey never returns an _s id, even from a legacy row", () => {
    const key = productSelectorKey(legacyAlias, PRODUCT_ROLES.SURROUND);
    expect(key).toBe("evolve-2-1");
    expect(key.endsWith("_s")).toBe(false);
  });

  test("productEngineeringKey strips a role-encoded suffix", () => {
    expect(productEngineeringKey(legacyAlias)).toBe("evolve-2-1");
    expect(productEngineeringKey(baseSurround)).toBe("evolve-2-1");
  });

  test("legacy _s rows are identifiable as read-only aliases", () => {
    expect(isLegacySurroundAlias(legacyAlias)).toBe(true);
    expect(isLegacySurroundAlias(baseSurround)).toBe(false);
    expect(isLegacySurroundAlias({ sku: "evolve-3-1_s" })).toBe(true);
    expect(isLegacySurroundAlias({ sku: "evolve-3-1" })).toBe(false);
  });

  test("no surround role can synthesise an _s selector key", () => {
    for (const role of Object.values(PRODUCT_ROLES)) {
      const key = productSelectorKey(baseSurround, role);
      expect(key.endsWith("_s")).toBe(false);
    }
  });
});