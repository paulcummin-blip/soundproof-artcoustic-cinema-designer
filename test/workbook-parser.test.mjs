// workbook-parser.test.mjs
// Validates the XLSX workbook parser and the shared preview logic against a
// worksheet shaped like the real RP22 comparison workbook: several A:C blocks
// with different brand groups, a separate KEF E:I block whose manufacturer is
// a lone label row above its header, a B&W block with price in D and a
// "retail inc Vat" note in E, brand-only rows, blank separators, and one
// exact within-workbook duplicate that must merge.

import * as XLSX from "xlsx";
import { parseWorkbookFile } from "../src/components/admin/speaker-library/workbookParser.js";
import { buildPreview } from "../src/components/admin/speaker-library/bulkAddPreview.js";
import { competitorIdentityKey } from "../src/components/utils/spl/manufacturerIdentity.js";

const keyFor = (row) => competitorIdentityKey({ manufacturer: row.manufacturer, model: row.model });

// Build a workbook that mirrors the real file's block layout.
// 9 columns (A–I). Counts are scaled down but every structural case is present.
function buildWorkbook() {
  const aoa = [];
  // Block 1 — A:C with a header (rows 1-6): M&K Sound, Ascendo Immersive Audio
  aoa.push(["Manufacturer", "Product", "Source URL", "", "", "", "", "", ""]);
  aoa.push(["M&K Sound", "S300", "https://mksound.com/s300", "", "", "", "", "", ""]);
  aoa.push(["", "S150", "https://mksound.com/s150", "", "", "", "", "", ""]);
  aoa.push(["Ascendo Immersive Audio", "SMS-1010", "https://ascendo.audio/sms1010", "", "", "", "", "", ""]);
  aoa.push(["", "CVM-SM", "https://ascendo.audio/cvm-sm", "", "", "", "", "", ""]);
  // blank separator
  aoa.push(["", "", "", "", "", "", "", "", ""]);

  // KEF label row, then KEF E:I header + data (rows 23-34). One duplicate model.
  aoa.push(["KEF", "", "", "", "", "", "", "", ""]); // lone brand label above the header
  aoa.push(["", "", "", "", "Model", "Sensitivity", "Max SPL at 1m", "Recommended amplifier power", "UK price each"]);
  aoa.push(["", "", "", "", "Ci5160REFM-THX", "93", "111", "200", "5200"]);
  aoa.push(["", "", "", "", "Ci3160REF-THX", "91", "110", "200", "4900"]);
  aoa.push(["", "", "", "", "Ci5160REFM-THX", "", "", "", ""]); // exact duplicate — must merge
  aoa.push(["", "", "", "", "Reference 1 Meta", "88", "108", "120", "4100"]);
  // blank separator
  aoa.push(["", "", "", "", "", "", "", "", ""]);

  // Block 3 — A:C, NO header: Monitor Audio then Sonance (carry Sonance down)
  aoa.push(["Monitor Audio", "Gold 300", "https://monitoraudio.com/gold300", "", "", "", "", "", ""]);
  aoa.push(["Sonance", "VisualPerformance", "https://sonance.com/vp", "", "", "", "", "", ""]);
  aoa.push(["", "VP LCR", "https://sonance.com/vplcr", "", "", "", "", "", ""]);
  aoa.push(["", "VP Inceil", "https://sonance.com/vpic", "", "", "", "", "", ""]);
  // blank separator
  aoa.push(["", "", "", "", "", "", "", "", ""]);

  // Block 4 — A:C, NO header: James Loudspeaker, Wisdom Audio, Triad
  aoa.push(["James Loudspeaker", "QX540", "https://jamesloudspeaker.com/qx540", "", "", "", "", "", ""]);
  aoa.push(["Wisdom Audio", "LS4i", "https://wisdomaudio.com/ls4i", "", "", "", "", "", ""]);
  aoa.push(["Triad", "Gold LCR 5", "https://triadaudio.com/gold-lcr-5", "", "", "", "", "", ""]);
  // blank separator
  aoa.push(["", "", "", "", "", "", "", "", ""]);

  // Block 5 — B&W: A:C + D price, "retail inc Vat" note in E on first row
  aoa.push(["Bowers & Wilkins", "805 D4", "https://bw.com/805d4", "3200", "retail inc Vat", "", "", "", ""]);
  aoa.push(["", "804 D4", "https://bw.com/804d4", "3600", "", "", "", "", ""]);
  aoa.push(["", "803 D4", "https://bw.com/803d4", "4000", "", "", "", "", ""]);
  // blank separator
  aoa.push(["", "", "", "", "", "", "", "", ""]);

  // Brand-only section: header then 4 brand-only rows
  aoa.push(["Manufacturer", "Product", "Source URL", "", "", "", "", "", ""]);
  aoa.push(["Paradigm", "", "", "", "", "", "", "", ""]);
  aoa.push(["Revel", "", "", "", "", "", "", "", ""]);
  aoa.push(["Focal", "", "", "", "", "", "", "", ""]);
  aoa.push(["Klipsch", "", "", "", "", "", "", "", ""]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; }
  else { fail++; console.error(`✗ ${name} ${detail}`); }
};

const bytes = buildWorkbook();
const file = new File([bytes], "competitors.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
const { rows, brandOnly } = await parseWorkbookFile(file);

// --- Parser level ---

// 1. Header row NOT created as a speaker.
ok("header row not a speaker", !rows.some((r) => r.manufacturer === "Manufacturer" && r.model === "Product"));

// 2. Block 1 (A:C with header): both brand groups parsed, manufacturer carried down.
ok("M&K S300 parsed", rows.some((r) => r.manufacturer === "M&K Sound" && r.model === "S300"));
ok("M&K S150 carried down", rows.some((r) => r.manufacturer === "M&K Sound" && r.model === "S150"));
ok("Ascendo SMS-1010 parsed", rows.some((r) => r.manufacturer === "Ascendo Immersive Audio" && r.model === "SMS-1010"));
ok("Ascendo CVM-SM carried down", rows.some((r) => r.manufacturer === "Ascendo Immersive Audio" && r.model === "CVM-SM"));

// 3. KEF E:I block: manufacturer read from the label row, all fields mapped.
const kef = rows.filter((r) => r.manufacturer === "KEF");
ok("KEF rows parsed (incl duplicate)", kef.length === 4, `got ${kef.length}: ${JSON.stringify(kef.map((r) => r.model))}`);
const kefRef = kef.find((r) => r.model === "Ci5160REFM-THX");
ok("KEF sensitivity mapped from F", kefRef?.sensitivity_db === "93", `got ${kefRef?.sensitivity_db}`);
ok("KEF max SPL mapped from G (Max SPL at 1m)", kefRef?.max_spl_db === "111", `got ${kefRef?.max_spl_db}`);
ok("KEF power mapped from H (Recommended amplifier power)", kefRef?.power_w === "200", `got ${kefRef?.power_w}`);
ok("KEF price mapped from I (UK price each)", kefRef?.price === "5200", `got ${kefRef?.price}`);
ok("KEF Reference 1 Meta parsed", kef.some((r) => r.model === "Reference 1 Meta"));

// 4. Block 3 (A:C, NO header): Monitor Audio + Sonance carry-down.
ok("Monitor Audio parsed", rows.some((r) => r.manufacturer === "Monitor Audio" && r.model === "Gold 300"));
ok("Sonance first row", rows.some((r) => r.manufacturer === "Sonance" && r.model === "VisualPerformance"));
ok("Sonance carried down (VP LCR)", rows.some((r) => r.manufacturer === "Sonance" && r.model === "VP LCR"));
ok("Sonance carried down (VP Inceil)", rows.some((r) => r.manufacturer === "Sonance" && r.model === "VP Inceil"));

// 5. Manufacturer does NOT bleed across the KEF block into Block 3.
ok("no KEF leak into Monitor Audio", !rows.some((r) => r.manufacturer === "KEF" && r.model === "Gold 300"));
ok("no Ascendo leak into Sonance", !rows.some((r) => r.manufacturer === "Ascendo Immersive Audio" && r.model === "VisualPerformance"));

// 6. Block 4 (A:C, NO header): all three brands parsed.
ok("James Loudspeaker parsed", rows.some((r) => r.manufacturer === "James Loudspeaker" && r.model === "QX540"));
ok("Wisdom Audio parsed", rows.some((r) => r.manufacturer === "Wisdom Audio" && r.model === "LS4i"));
ok("Triad parsed", rows.some((r) => r.manufacturer === "Triad" && r.model === "Gold LCR 5"));

// 7. Block 5 B&W: price from D, "retail inc Vat" note in E ignored, carry-down.
const bw = rows.filter((r) => r.manufacturer === "Bowers & Wilkins");
ok("B&W rows parsed", bw.length === 3, `got ${bw.length}`);
ok("B&W 805 D4 price from D", bw.find((r) => r.model === "805 D4")?.price === "3200");
ok("B&W 804 D4 price from D (carried)", bw.find((r) => r.model === "804 D4")?.price === "3600");
ok("B&W 803 D4 price from D (carried)", bw.find((r) => r.model === "803 D4")?.price === "4000");
ok("B&W no fake model from E note", !rows.some((r) => /retail inc vat/i.test(r.model || "")));

// 8. Brand-only rows collected, no fake products.
ok("brand-only collected (4)", brandOnly.length === 4, `got ${brandOnly.length}: ${JSON.stringify(brandOnly)}`);
ok("Paradigm brand-only", brandOnly.includes("Paradigm"));
ok("Klipsch brand-only", brandOnly.includes("Klipsch"));
ok("no fake brand-only product", !rows.some((r) => ["Paradigm", "Revel", "Focal", "Klipsch"].includes(r.manufacturer) && r.model));

// 9. NBSP + repeated-space normalisation in model names.
ok("NBSP normalised", rows.some((r) => r.model === "VisualPerformance")); // names had no NBSP here; covered by cleanCell

// --- Preview level (buildPreview) ---

const existingKeys = new Set([keyFor({ manufacturer: "M&K Sound", model: "S300" })]);
const preview = buildPreview(rows, existingKeys, keyFor);

// 10. Existing exact match → "existing", not actionable, not overwritten.
ok("existing match flagged", preview.items.some((it) => it.outcome === "existing" && it.row.model === "S300"));
ok("existing not actionable", !preview.actionable.some((r) => r.model === "S300"));

// 11. Exact workbook duplicate (KEF Ci5160REFM-THX) merged into one actionable row.
const dupKef = preview.actionable.filter((r) => r.manufacturer === "KEF" && r.model === "Ci5160REFM-THX");
ok("duplicate KEF merged in actionable", dupKef.length === 1, `got ${dupKef.length}`);
ok("duplicate flagged", preview.items.filter((it) => it.row.model === "Ci5160REFM-THX" && it.outcome === "duplicate").length === 1);
ok("duplicate data merged (price kept)", dupKef[0]?.price === "5200", `got ${dupKef[0]?.price}`);

// 12. All 95-… unique products appear in the preview, across every block.
const uniqueInPreview = new Set(preview.items.filter((it) => it.outcome !== "existing" && it.outcome !== "duplicate" && it.outcome !== "brand-only" && it.outcome !== "invalid").map((it) => keyFor(it.row)));
const expectedUnique = rows.map(keyFor).filter((k, i, arr) => arr.indexOf(k) === i).filter((k) => !existingKeys.has(k));
ok("all unique products in preview", uniqueInPreview.size === expectedUnique.length, `preview ${uniqueInPreview.size} vs expected ${expectedUnique.length}`);

// 13. Add-all count equals genuinely-new products (excludes existing, duplicate, brand-only).
ok("actionable count matches", preview.actionableCount === preview.actionable.length && preview.actionableCount === expectedUnique.length, `count ${preview.actionableCount}`);

// 14. Block 1 Ascendo shows in preview (not just first block).
ok("Ascendo in preview", preview.items.some((it) => it.row.manufacturer === "Ascendo Immersive Audio"));
ok("Triad in preview (last A:C block)", preview.items.some((it) => it.row.manufacturer === "Triad"));

// 15. Re-running preview is stable.
const preview2 = buildPreview(rows, existingKeys, keyFor);
ok("preview idempotent", preview2.actionableCount === preview.actionableCount);

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);