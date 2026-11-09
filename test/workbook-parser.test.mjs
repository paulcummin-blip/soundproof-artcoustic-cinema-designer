// workbook-parser.test.mjs
// Validates the XLSX workbook parser and the shared preview logic against a
// worksheet shaped like the real RP22 comparison workbook: a header row,
// grouped M&K rows with blank manufacturer cells that continue the brand above,
// a brand-only row, a separate KEF block in different columns, a note row and
// a duplicate KEF model that must merge.

import * as XLSX from "xlsx";
import { parseWorkbookFile } from "../src/components/admin/speaker-library/workbookParser.js";
import { buildPreview } from "../src/components/admin/speaker-library/bulkAddPreview.js";
import { competitorIdentityKey } from "../src/components/utils/spl/manufacturerIdentity.js";

const keyFor = (row) => competitorIdentityKey({ manufacturer: row.manufacturer, model: row.model });

function buildWorkbook() {
  const aoa = [
    ["Brand", "Product", "Sensitivity", "Impedance", "Power", "Max SPL", "Price", "URL"],
    ["M&K Sound", "S300", "90", "4", "300", "112", "4500", "https://mksound.com/s300"],
    ["", "S150", "92", "4", "200", "110", "", ""],
    ["", "MP7", "", "", "", "", "3200", "https://mksound.com/mp7"],
    ["Paradigm"], // brand-only row in the main block's manufacturer column
    ["Note: prices are per speaker including VAT."], // note row — skipped
    ["", "", "", "", "", "", "", ""], // blank separator
    ["KEF", "", "", "Model", "Sensitivity", "Impedance", "Power", "Max SPL", "Price", "URL", "Brand"],
    ["", "", "", "Ci5160REFM-THX", "93", "8", "200", "111", "5200", "https://kef.com/ci5160", "KEF"],
    ["", "", "", "Ci3160REF-THX", "91", "8", "200", "110", "4900", "https://kef.com/ci3160", "KEF"],
    ["", "", "", "Ci5160REFM-THX", "", "", "", "", "", "", "KEF"], // duplicate KEF model — merge into the first
  ];
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

// 1. Header row is NOT treated as a speaker — no "Brand"/"Product" product.
ok("header row not created as speaker", !rows.some((r) => r.manufacturer === "Brand" && r.model === "Product"));

// 2. Real M&K product rows are parsed.
const mk = rows.filter((r) => r.manufacturer === "M&K Sound");
ok("M&K rows parsed", mk.length === 3, `got ${mk.length}`);
ok("S300 sensitivity", mk.find((r) => r.model === "S300")?.sensitivity_db === "90");
ok("S300 price", mk.find((r) => r.model === "S300")?.price === "4500");
ok("S300 source url", mk.find((r) => r.model === "S300")?.source_url === "https://mksound.com/s300");

// 3. Blank manufacturer cells continue the manufacturer above (fill-down).
ok("S150 carried manufacturer", mk.find((r) => r.model === "S150")?.manufacturer === "M&K Sound");
ok("MP7 carried manufacturer", mk.find((r) => r.model === "MP7")?.manufacturer === "M&K Sound");
ok("MP7 price", mk.find((r) => r.model === "MP7")?.price === "3200");

// 4. KEF block parsed from its different columns (parser keeps both occurrences;
//    the duplicate is merged later in the preview).
const kef = rows.filter((r) => r.manufacturer === "KEF");
ok("KEF rows parsed", kef.length === 3, `got ${kef.length}: ${JSON.stringify(kef.map((r) => r.model))}`);
ok("KEF Ci5160REFM-THX sensitivity", kef.find((r) => r.model === "Ci5160REFM-THX")?.sensitivity_db === "93");
ok("KEF Ci5160REFM-THX price", kef.find((r) => r.model === "Ci5160REFM-THX")?.price === "5200");
ok("KEF Ci5160REFM-THX source url", kef.find((r) => r.model === "Ci5160REFM-THX")?.source_url === "https://kef.com/ci5160");
ok("KEF Ci3160REF-THX parsed", kef.find((r) => r.model === "Ci3160REF-THX")?.model === "Ci3160REF-THX");

// 5. Note row skipped.
ok("note row skipped", !rows.some((r) => /Note: prices/i.test(r.manufacturer || r.model || "")));

// 6. Brand-only row collected separately, no dummy product.
ok("brand-only collected", brandOnly.includes("Paradigm"), `got ${JSON.stringify(brandOnly)}`);
ok("brand-only no dummy product", !rows.some((r) => r.model === "" && r.manufacturer === "Paradigm"));

// --- Preview level (buildPreview) ---

const existingKeys = new Set([keyFor({ manufacturer: "M&K Sound", model: "S300" })]);
const preview = buildPreview(rows, existingKeys, keyFor);

// 7. Existing exact match → "existing", not created.
ok("existing match flagged", preview.items.some((it) => it.outcome === "existing" && it.row.model === "S300"));
ok("existing not in actionable", !preview.actionable.some((r) => r.model === "S300"));

// 8. Duplicate KEF model merged → only one actionable Ci5160REFM-THX.
const actionableKef = preview.actionable.filter((r) => r.model === "Ci5160REFM-THX");
ok("duplicate KEF merged in actionable", actionableKef.length === 1, `got ${actionableKef.length}`);
ok("duplicate KEF outcome flagged", preview.items.filter((it) => it.row.model === "Ci5160REFM-THX" && it.outcome === "duplicate").length === 1);

// 9. Incomplete product (MP7 has price + source but no acoustic data) still actionable.
ok("MP7 actionable", preview.actionable.some((r) => r.model === "MP7"));
const mp7Item = preview.items.find((it) => it.row.model === "MP7");
ok("MP7 outcome incomplete (no acoustic data)", mp7Item?.outcome === "incomplete", `got ${mp7Item?.outcome}`);

// 10. Add all count matches actionable product count (brand-only excluded).
ok("actionable count excludes brand-only", preview.actionableCount === preview.actionable.length);
ok("actionable count > 0", preview.actionableCount > 0, `got ${preview.actionableCount}`);

// 11. Re-running buildPreview on the same rows is stable (idempotent preview).
const preview2 = buildPreview(rows, existingKeys, keyFor);
ok("preview idempotent", preview2.actionableCount === preview.actionableCount && preview2.actionable.length === preview.actionable.length);

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);