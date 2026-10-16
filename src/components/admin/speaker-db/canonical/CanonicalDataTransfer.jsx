// CanonicalDataTransfer.jsx
// ---------------------------------------------------------------------------
// Export / Import for the canonical Speaker Database
// (SpeakerManufacturer → SpeakerProduct → SpeakerSpecification).
//
//   Export  → a versioned .xlsx workbook, editable by hand or by GPT, that can
//             be re-imported without loss.
//   Import  → read, dry run, preview every field-level change, then apply.
//
// Importing never publishes to the RP22 comparison and never approves a
// specification: new or changed data arrives as Awaiting Review, and the
// existing Approve and Publish actions remain the only route to the comparison.
// ---------------------------------------------------------------------------

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Upload } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { CANONICAL_SCHEMA_VERSION, CLEAR_TOKEN } from "./canonicalSchema.js";
import { downloadCanonicalWorkbook, loadCanonicalData } from "./canonicalExportWorkbook.js";
import { readCanonicalWorkbook } from "./readCanonicalWorkbook.js";
import { planCanonicalImport } from "./planCanonicalImport.js";
import { applyCanonicalImport } from "./applyCanonicalImport.js";
import { listImportBatches, rollbackImportBatch } from "./importBatchStore.js";
import CanonicalImportPreview from "./CanonicalImportPreview.jsx";
import CanonicalBatchHistory from "./CanonicalBatchHistory.jsx";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  hint: "#625143",
  border: "#DCDBD6",
  card: "#FFFFFF",
  soft: "#F8F8F7",
  green: "#213428",
  danger: "#B23A3A",
};

function Card({ title, description, children }) {
  return (
    <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 12, background: BRAND.card, padding: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.text }}>{title}</div>
      <div style={{ fontSize: 12, color: BRAND.hint, marginTop: 4, lineHeight: 1.5 }}>{description}</div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

export default function CanonicalDataTransfer() {
  const { user } = useAuth();
  const actorName = user?.full_name || user?.email || "Admin";
  const fileInputRef = useRef(null);

  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const [reading, setReading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [plan, setPlan] = useState(null);
  const [readErrors, setReadErrors] = useState([]);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState(null);
  const [batches, setBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [rollingBackId, setRollingBackId] = useState(null);
  const [rollbackResults, setRollbackResults] = useState({});

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true);
    try {
      setBatches(await listImportBatches());
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  const handleExport = async () => {
    setExporting(true);
    setExportStatus("Building workbook…");
    try {
      const result = await downloadCanonicalWorkbook();
      setExportStatus(`${result.fileName} · ${result.manufacturers} manufacturers · ${result.products} products · ${result.specifications} specifications`);
    } catch (error) {
      setExportStatus(error?.message || "Could not build the workbook.");
    } finally {
      setExporting(false);
    }
  };

  const resetUpload = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFile = async (file) => {
    if (!file) return;
    setReading(true);
    setPlan(null);
    setReadErrors([]);
    setApplyResult(null);
    setFileName(file.name);
    try {
      const read = await readCanonicalWorkbook(file);
      if (read.errors.length) {
        setReadErrors(read.errors);
        return;
      }
      const data = await loadCanonicalData();
      setPlan(planCanonicalImport({ rows: read.rows, data, changeLog: read.changeLog }));
    } catch (error) {
      setReadErrors([error?.message || "Could not read that workbook."]);
    } finally {
      setReading(false);
      resetUpload();
    }
  };

  const handleApply = async () => {
    if (!plan) return;
    setApplying(true);
    setReadErrors([]);
    try {
      const result = await applyCanonicalImport({
        plan,
        actorName,
        fileName,
        schemaVersion: CANONICAL_SCHEMA_VERSION,
      });
      setApplyResult(result);
      setPlan(null);
      await loadBatches();
    } catch (error) {
      setReadErrors([`The import stopped: ${error?.message || "unknown error"}. Applied rows are recorded in the import history and can be rolled back.`]);
      await loadBatches();
    } finally {
      setApplying(false);
    }
  };

  const handleRollback = async (batch) => {
    setRollingBackId(batch.id);
    try {
      const result = await rollbackImportBatch({ batch, actorName });
      setRollbackResults((previous) => ({ ...previous, [batch.batch_id]: result }));
      await loadBatches();
    } finally {
      setRollingBackId(null);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, color: BRAND.text }}>Export / Import</h2>
        <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4, lineHeight: 1.5, maxWidth: 900 }}>
          The maintenance workflow for the canonical speaker database. Export the whole database as a versioned workbook, edit or
          research it externally, upload it back, preview every change, and apply it. Importing never publishes to the RP22 Speaker
          Comparison and never approves a specification.
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <Card
          title="Export speaker data"
          description={`Excel workbook (${CANONICAL_SCHEMA_VERSION}) with the Speaker Data sheet plus Instructions, Field Definitions, Change Log and a read-only Reference sheet. Stable IDs, provenance and approval / publication state are included.`}
        >
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, border: "none", borderRadius: 9,
              padding: "11px 16px", background: BRAND.green, color: "#FFF", fontSize: 13, fontWeight: 600,
              cursor: exporting ? "wait" : "pointer",
            }}
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Export speaker data
          </button>
          {exportStatus && (
            <div style={{ marginTop: 10, fontSize: 12, color: BRAND.hint, lineHeight: 1.5, overflowWrap: "anywhere" }}>{exportStatus}</div>
          )}
        </Card>

        <Card
          title="Import updated speaker data"
          description={`Upload the edited workbook (.xlsx). A blank cell leaves the existing value unchanged; ${CLEAR_TOKEN} deliberately removes a value. Nothing is written until you confirm Apply import.`}
        >
          <label
            style={{
              display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${BRAND.border}`, borderRadius: 9,
              padding: "10px 14px", cursor: reading ? "wait" : "pointer", background: BRAND.card, fontSize: 13, color: BRAND.text,
            }}
          >
            {reading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {reading ? "Reading and checking…" : "Upload workbook"}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              disabled={reading}
              onChange={(event) => handleFile(event.target.files?.[0])}
              style={{ display: "none" }}
            />
          </label>
          <div style={{ marginTop: 10, fontSize: 11, color: BRAND.hint, lineHeight: 1.5 }}>
            Rows are read from the {`“Speaker Data”`} sheet. The workbook has to come from this export — it carries the schema
            version marker.
          </div>
        </Card>
      </div>

      {readErrors.length > 0 && (
        <div style={{ marginTop: 14, border: `1px solid ${BRAND.danger}55`, background: `${BRAND.danger}0F`, borderRadius: 10, padding: "11px 13px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.danger, marginBottom: 5 }}>This workbook was not imported</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: BRAND.subtext, lineHeight: 1.5 }}>
            {readErrors.map((message, index) => <li key={`read-error-${index}`}>{message}</li>)}
          </ul>
        </div>
      )}

      <CanonicalImportPreview
        plan={plan}
        fileName={fileName}
        applying={applying}
        onApply={handleApply}
        onCancel={() => { setPlan(null); setFileName(""); }}
      />

      {applyResult && (
        <div style={{ marginTop: 14, border: `1px solid ${BRAND.green}44`, background: `${BRAND.green}0F`, borderRadius: 10, padding: "11px 13px", fontSize: 13, color: BRAND.text, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Import applied — batch {applyResult.batchId}</div>
          {applyResult.manufacturersCreated} new manufacturer(s), {applyResult.productsCreated} new product(s), {applyResult.productsUpdated} updated
          product(s), {applyResult.specificationsCreated} new specification version(s), {applyResult.specificationsUpdated} specification(s) updated in place,
          {" "}{applyResult.historyEntries} change-history entr{applyResult.historyEntries === 1 ? "y" : "ies"} written.
          <div style={{ marginTop: 6, color: BRAND.subtext }}>
            Nothing was published to the RP22 comparison. New and changed specifications now show Awaiting Review — review them on each
            product, then use Approve and Publish to push the ones you want into the comparison.
          </div>
        </div>
      )}

      <CanonicalBatchHistory
        batches={batches}
        loading={loadingBatches}
        rollingBackId={rollingBackId}
        onRollback={handleRollback}
        resultByBatchId={rollbackResults}
      />
    </div>
  );
}