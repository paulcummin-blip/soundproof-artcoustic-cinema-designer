// workbook-parser.test.mjs
// Validates the XLSX workbook parser against a worksheet shaped like the real
// RP22 comparison workbook: a header row, grouped M&K rows with blank
// manufacturer cells that continue the brand above, a separate KEF block in
// different columns, a note row, a pricing row and a brand-only row.

import * as XLSX from "xlsx";
import { parseWorkbookFile } from "../src/components/admin/speaker-library/workbookParser.js";

function buildWorkbook() {
  // Sheet1 — the main block (columns A–H) then a KEF block lower down in
  // different columns (D–K), exactly as the user described.
  const aoa = [
    ["Brand", "Product", "Sensitivity", "Impedance", "Power", "Max SPL", "Price", "URL"],
    ["M&K Sound", "S300", "90", "4", "300", "112", "4500", "https://mksound.com/s300"],
    ["", "S150", "92", "4", "200", "110", "", ""],
    ["", "MP7", "", "", "", "", "3200", "https://mksound.com/mp7"],
    ["Note: prices are per speaker including VAT."], // note row — must be skipped
    ["", "", "", "", "", "", "", ""], // blank separator
    ["KEF", "", "", "Model", "Sensitivity", "Impedance", "Power", "Max SPL", "Price", "URL", "Brand"],
    ["", "", "", "Ci5160REFM-THX", "93", "8", "200", "111", "5200", "https://kef.com/ci5160", "KEF"],
    ["", "", "", "Ci3160REF-THX", "91", "8", "200", "110", "4900", "https://kef.com/ci3160", "KEF"],
    ["", "", "", "Ci5160REFM-THX", "", "", "", "", "", "", "KEF"], // duplicate KEF model — merge price-less into the first
    ["Paradigm"], // brand-only row — no dummy product
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return out; // Uint8Array
}

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; }
  else { fail++; console.error(`✗ ${name} ${detail}`); }
};

// Node 20+ has a global File; build one from the workbook bytes.
const bytes = buildWorkbook();
const file = new File([bytes], "competitors.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
const { rows, brandOnly } = await parseWorkbookFile(file);

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

// 4. KEF block parsed from its different columns.
const kef = rows.filter((r) => r.manufacturer === "KEF");
ok("KEF rows parsed", kef.length === 2, `got ${kef.length}: ${JSON.stringify(kef.map((r) => r.model))}`);
ok("KEF Ci5160REFM-THX model", kef.find((r) => r.model === "Ci5160REFM-THX")?.model === "Ci5160REFM-THX");
ok("KEF Ci5160REFM-THX sensitivity", kef.find((r) => r.model === "Ci5160REFM-THX")?.sensitivity_db === "93");
ok("KEF Ci5160REFM-THX price", kef.find((r) => r.model === "Ci5160REFM-THX")?.price === "5200");
ok("KEF Ci5160REFM-THX source url", kef.find((r) => r.model === "Ci5160REFM-THX")?.source_url === "https://kef.com/ci5160");
ok("KEF Ci3160REF-THX parsed", kef.find((r) => r.model === "Ci3160REF-THX")?.model === "Ci3160REF-THX");

// 5. The duplicate KEF row (same model, no data) was deduped — only 2 KEF rows.
ok("duplicate KEF model deduped", rows.filter((r) => r.model === "Ci5160REFM-THX").length === 1, `got ${rows.filter((r) => r.model === "Ci5160REFM-THX").length}`);

// 6. Note row skipped (not turned into a product).
ok("note row skipped", !rows.some((r) => r.manufacturer === "Note: prices are per speaker including VAT."));

// 7. Brand-only row collected separately, no dummy product.
ok("brand-only collected", brandOnly.includes("Paradigm"));
ok("brand-only no dummy product", !rows.some((r) => r.model === "" && r.manufacturer === "Paradigm"));

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);