import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Canonical seed dataset — mirrors the current runtime price constants exactly:
//   FIXED_RETAIL_PRICES_EX_VAT  (usePriceCalculation.jsx:10-38)
//   SOUNDBAR_PRICE_OPTIONS     (usePriceCalculation.jsx:40-73)
//   CPH_1000D_PRICE_EX_VAT     (usePriceCalculation.jsx:8)
// Plus 4 selectable products that have no runtime price (price_ex_vat = null).
//
// MIGRATION-ONLY BEHAVIOUR:
//   This seed creates missing ProductPrice records only. It NEVER updates
//   existing records. Once a record exists (by SKU), the seed skips it
//   entirely — so Admin-entered prices, labels, categories, and active flags
//   are never overwritten by re-running this function.
//   The code constants below are SEED DEFAULTS, not permanent authority.
//   Running multiple times is idempotent: first run creates, later runs no-op.
const SEED_DATA = [
  // ── Fixed retail prices (LCR + surrounds + architect + center + subs + amp + abfuser) ──
  { sku: "q4-3",             label: "Q4-3",                     category: "Loudspeaker",        price_ex_vat: 1516.67 },
  { sku: "q4-3_s",           label: "Q4-3 (Surround)",         category: "Loudspeaker",        price_ex_vat: 1516.67 },
  { sku: "q6-3",             label: "Q6-3",                     category: "Loudspeaker",        price_ex_vat: 1741.67 },
  { sku: "q6-3_s",           label: "Q6-3 (Surround)",         category: "Loudspeaker",        price_ex_vat: 1741.67 },
  { sku: "q4-5",             label: "Q4-5",                     category: "Loudspeaker",        price_ex_vat: 3258.33 },
  { sku: "q4-5_s",           label: "Q4-5 (Surround)",         category: "Loudspeaker",        price_ex_vat: 3258.33 },
  { sku: "q8-5",             label: "Q8-5",                     category: "Loudspeaker",        price_ex_vat: 4775 },
  { sku: "q8-5_s",           label: "Q8-5 (Surround)",         category: "Loudspeaker",        price_ex_vat: 4775 },
  { sku: "evolve-2-1",       label: "EVOLVE 2-1",               category: "Loudspeaker",        price_ex_vat: 650 },
  { sku: "evolve-2-1_s",     label: "EVOLVE 2-1 (Surround)",   category: "Loudspeaker",        price_ex_vat: 650 },
  { sku: "evolve-3-1",       label: "EVOLVE 3-1",               category: "Loudspeaker",        price_ex_vat: 975 },
  { sku: "evolve-3-1_s",     label: "EVOLVE 3-1 (Surround)",   category: "Loudspeaker",        price_ex_vat: 975 },
  { sku: "evolve-4-2",       label: "EVOLVE 4-2",               category: "Loudspeaker",        price_ex_vat: 1483.33 },
  { sku: "evolve-4-2_s",     label: "EVOLVE 4-2 (Surround)",   category: "Loudspeaker",        price_ex_vat: 1483.33 },
  { sku: "evolve-6-3",       label: "EVOLVE 6-3",               category: "Loudspeaker",        price_ex_vat: 1875 },
  { sku: "evolve-6-3_s",     label: "EVOLVE 6-3 (Surround)",   category: "Loudspeaker",        price_ex_vat: 1875 },
  { sku: "evolve-8-4",       label: "EVOLVE 8-4",               category: "Loudspeaker",        price_ex_vat: 2266.67 },
  { sku: "evolve-8-4_s",     label: "EVOLVE 8-4 (Surround)",   category: "Loudspeaker",        price_ex_vat: 2266.67 },
  { sku: "architect-2-1",    label: "ARCHITECT 2-1",           category: "Loudspeaker",        price_ex_vat: 616.67 },
  { sku: "architect-4-2",    label: "ARCHITECT 4-2",           category: "Loudspeaker",        price_ex_vat: 1025 },
  { sku: "architect-pas2-2", label: "ARCHITECT PAS2-2",       category: "Loudspeaker",        price_ex_vat: 1000 },
  { sku: "c-1",              label: "C-1",                      category: "Loudspeaker",        price_ex_vat: 766.67 },
  { sku: "sub2-12",          label: "SUB2-12",                  category: "Subwoofer",          price_ex_vat: 1825 },
  { sku: "sub3-12",          label: "SUB3-12",                  category: "Subwoofer",          price_ex_vat: 3116.67 },
  { sku: "sub4-12",          label: "SUB4-12",                  category: "Subwoofer",          price_ex_vat: 5500 },
  { sku: "cph-1000d",        label: "CPH-1000D",                category: "Amplifier",          price_ex_vat: 675 },
  { sku: "500027",           label: "Artcoustic Abfuser, Black", category: "Acoustic Treatment", price_ex_vat: 466.67 },

  // ── Soundbar size variants (composite key model:value, matching getCommercialPrice lineKey) ──
  { sku: "c4-1:1222",           label: "C4-1 — 1222mm",            category: "Loudspeaker", price_ex_vat: 1616.67 },
  { sku: "c4-1:1449",           label: "C4-1 — 1449mm",            category: "Loudspeaker", price_ex_vat: 1733.33 },
  { sku: "c4-1:1672",           label: "C4-1 — 1672mm",            category: "Loudspeaker", price_ex_vat: 1825 },
  { sku: "c4-1:1904",           label: "C4-1 — 1904mm",            category: "Loudspeaker", price_ex_vat: 1991.67 },
  { sku: "multi-lcr:1222-m",    label: "Multi (LCR) — 1222 M",     category: "Loudspeaker", price_ex_vat: 2383.33 },
  { sku: "multi-lcr:1441-l",    label: "Multi (LCR) — 1441 L",     category: "Loudspeaker", price_ex_vat: 2650 },
  { sku: "multi-lcr:1711-xl",   label: "Multi (LCR) — 1711 XL",   category: "Loudspeaker", price_ex_vat: 2866.67 },
  { sku: "multi-lcr:1842-xxl",  label: "Multi (LCR) — 1842 XXL",   category: "Loudspeaker", price_ex_vat: 3366.67 },
  { sku: "multi-lcr:2230-xxxl", label: "Multi (LCR) — 2230 XXXL",  category: "Loudspeaker", price_ex_vat: 4641.67 },
  { sku: "multi-mono:1222-m",   label: "Multi (Mono) — 1222 M",   category: "Loudspeaker", price_ex_vat: 2383.33 },
  { sku: "multi-mono:1441-l",   label: "Multi (Mono) — 1441 L",   category: "Loudspeaker", price_ex_vat: 2650 },
  { sku: "multi-mono:1711-xl",  label: "Multi (Mono) — 1711 XL",   category: "Loudspeaker", price_ex_vat: 2866.67 },
  { sku: "multi-mono:1842-xxl", label: "Multi (Mono) — 1842 XXL",  category: "Loudspeaker", price_ex_vat: 3366.67 },
  { sku: "multi-mono:2230-xxxl", label: "Multi (Mono) — 2230 XXXL", category: "Loudspeaker", price_ex_vat: 4641.67 },
  { sku: "hspl-lcr:1669-1800",  label: "HSPL (LCR) — 1669–1800mm",  category: "Loudspeaker", price_ex_vat: 4141.67 },
  { sku: "hspl-lcr:1801-2000",  label: "HSPL (LCR) — 1801–2000mm",  category: "Loudspeaker", price_ex_vat: 4400 },
  { sku: "hspl-lcr:2001-2200",  label: "HSPL (LCR) — 2001–2200mm",  category: "Loudspeaker", price_ex_vat: 6150 },
  { sku: "hspl-lcr:2201-2600",  label: "HSPL (LCR) — 2201–2600mm",  category: "Loudspeaker", price_ex_vat: 6808.33 },
  { sku: "hspl-mono:1669-1800", label: "HSPL (Mono) — 1669–1800mm", category: "Loudspeaker", price_ex_vat: 4141.67 },
  { sku: "hspl-mono:1801-2000", label: "HSPL (Mono) — 1801–2000mm", category: "Loudspeaker", price_ex_vat: 4400 },
  { sku: "hspl-mono:2001-2200", label: "HSPL (Mono) — 2001–2200mm", category: "Loudspeaker", price_ex_vat: 6150 },
  { sku: "hspl-mono:2201-2600", label: "HSPL (Mono) — 2201–2600mm", category: "Loudspeaker", price_ex_vat: 6808.33 },

  // ── Selectable products with no current runtime price (price_ex_vat = null) ──
  { sku: "architect-mikro",   label: "MIKRO Ci",            category: "Loudspeaker", price_ex_vat: null },
  { sku: "spitfire-cloud",    label: "SPITFIRE CLOUD",      category: "Loudspeaker", price_ex_vat: null },
  { sku: "architect-4-2-mk2", label: "ARCHITECT 4-2 mk II", category: "Loudspeaker", price_ex_vat: null },
  { sku: "evolve-1-1_s",      label: "EVOLVE 1-1 (Surround)", category: "Loudspeaker", price_ex_vat: null },
];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    // Service-role: seed is an admin migration op, must bypass per-user RLS.
    const existing = await base44.asServiceRole.entities.ProductPrice.list('-created_date', 500);
    const existingBySku = new Set();
    for (const rec of existing) {
      if (rec.sku) existingBySku.add(rec.sku);
    }

    let created = 0;
    let unchanged = 0;
    const details = [];

    for (const seed of SEED_DATA) {
      if (existingBySku.has(seed.sku)) {
        // MIGRATION-ONLY: never touch existing records — Admin edits are authoritative.
        unchanged++;
        details.push({ sku: seed.sku, action: 'unchanged' });
      } else {
        await base44.asServiceRole.entities.ProductPrice.create({
          sku: seed.sku,
          label: seed.label,
          category: seed.category,
          price_ex_vat: seed.price_ex_vat,
          active: true,
        });
        created++;
        details.push({ sku: seed.sku, action: 'created' });
      }
    }

    return Response.json({
      status: 'ok',
      seed_count: SEED_DATA.length,
      created,
      updated: 0,
      unchanged,
      total_in_db: existing.length,
      details,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}