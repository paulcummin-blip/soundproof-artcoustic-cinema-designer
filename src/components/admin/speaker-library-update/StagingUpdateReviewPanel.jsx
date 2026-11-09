// StagingUpdateReviewPanel.jsx
// ---------------------------------------------------------------------------
// The administrator review surface for a staging Speaker Library update.
// Shows the full diff (existing-unchanged, new, needs-review, manufacturer
// mappings, brands-without-models), lets the administrator approve individual
// items, and applies ONLY the approved new manufacturers and new products.
// Existing records, specifications, prices and the RP22 engine are never
// touched. Every approved creation is reversible via the SpeakerImportBatch.

import React, { useMemo, useState } from "react";
import { Check, ExternalLink, ArrowLeft, Loader2, Undo2, ShieldCheck, AlertTriangle, Plus } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useStagingUpdateClassification } from "./useStagingUpdateClassification";
import { applyStagingUpdate, undoStagingUpdate } from "./applyStagingUpdate";
import { STAGING_WORKBOOK_FILE } from "./stagingWorkbookData";

const BRAND = {
  text: "#1B1A1A", subtext: "#3E4349", hint: "#625143",
  border: "#DCDBD6", bg: "rgb(248 248 247)", panel: "#FFFFFF",
  green: "#213428", amber: "#9A6E00", red: "#7A1E19", blue: "#2C5AA0",
};

const chip = (label, count, tone) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${BRAND.border}`, borderRadius: 999, padding: "5px 12px", background: BRAND.panel, fontSize: 12, color: BRAND.subtext }}>
    <span style={{ width: 8, height: 8, borderRadius: 999, background: tone }} />
    <strong style={{ color: BRAND.text }}>{count}</strong> {label}
  </div>
);

function Section({ title, tone, hint, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 12, background: BRAND.panel, marginBottom: 14 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ width: "100%", border: 0, background: "transparent", padding: "13px 16px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: BRAND.text }}>{title}</span>
          <span style={{ fontSize: 12, color: BRAND.hint }}>{open ? "Hide" : "Show"}</span>
        </div>
        {hint && <div style={{ fontSize: 12, color: BRAND.hint, marginTop: 3 }}>{hint}</div>}
      </button>
      {open && <div style={{ padding: "0 16px 16px" }}>{children}</div>}
    </div>
  );
}

function RowCheck({ checked, onChange, label }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: BRAND.text }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ width: 16, height: 16 }} />
      {label}
    </label>
  );
}

export default function StagingUpdateReviewPanel() {
  const { user } = useAuth();
  const actorName = user?.full_name || user?.email || "Administrator";
  const { loading, error, classification } = useStagingUpdateClassification();

  const [approvedProducts, setApprovedProducts] = useState(new Set()); // indices
  const [approvedNeedsReview, setApprovedNeedsReview] = useState(new Set());
  const [approvedManufacturers, setApprovedManufacturers] = useState(new Set());
  const [resolutions, setResolutions] = useState({}); // manufNorm -> {existingId,existingName} | {createNew:true}
  const [brandResolutions, setBrandResolutions] = useState({}); // workbookName -> map|create
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);
  const [applyError, setApplyError] = useState("");
  const [undoing, setUndoing] = useState(false);
  const [undoMsg, setUndoMsg] = useState("");

  // default selections once classification loads
  React.useEffect(() => {
    if (!classification) return;
    setApprovedProducts(new Set(classification.newProducts.map((_, i) => i)));
    setApprovedManufacturers(new Set(classification.newManufacturers.map((m) => m.name)));
    // default manufacturer mappings to the first existing candidate
    const r = {};
    for (const [norm, map] of Object.entries(classification.manufacturerMappings || {})) {
      if (map.candidates?.[0]) r[norm] = { existingId: map.candidates[0].id, existingName: map.candidates[0].name };
    }
    setResolutions(r);
    // default brand-ambiguous to map-to-existing
    const br = {};
    for (const b of classification.brandAmbiguous || []) {
      if (b.candidates?.[0]) br[b.workbookName] = { existingId: b.candidates[0].id, existingName: b.candidates[0].name };
    }
    setBrandResolutions(br);
  }, [classification]);

  const toggle = (set, idx) => {
    const next = new Set(set);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    return next;
  };

  const buildApproved = () => {
    const newProducts = [];
    // clean new products
    classification.newProducts.forEach((p, i) => {
      if (!approvedProducts.has(i)) return;
      newProducts.push({
        manufacturerName: p.manufacturerName || p.manufacturer,
        manufacturerId: p.manufacturerId || null,
        model: p.model,
        url: p.url,
        urlKind: p.urlKind,
      });
    });
    // needs-review items the admin explicitly approved to create
    classification.needsReview.forEach((p, i) => {
      if (!approvedNeedsReview.has(i)) return;
      const manufNorm = normaliseManuf(p.manufacturer);
      const resolved = resolutions[manufNorm];
      const manufacturerName = resolved?.existingName || p.manufacturer;
      const manufacturerId = resolved?.existingId || null;
      newProducts.push({
        manufacturerName,
        manufacturerId,
        model: p.model,
        url: p.url,
        urlKind: p.urlKind,
      });
    });
    // new manufacturers (brand-only)
    const newManufacturers = [];
    classification.newManufacturers.forEach((m) => {
      if (approvedManufacturers.has(m.name)) newManufacturers.push({ name: m.name });
    });
    // brand-ambiguous resolved as create-new
    classification.brandAmbiguous.forEach((b) => {
      const r = brandResolutions[b.workbookName];
      if (r && r.createNew) newManufacturers.push({ name: b.workbookName });
    });
    return {
      newProducts,
      newManufacturers,
      manufacturerResolutions: resolutions,
    };
  };

  const onApply = async () => {
    setApplying(true); setApplyError("");
    try {
      const approved = buildApproved();
      const res = await applyStagingUpdate({ approved, actorName, fileName: STAGING_WORKBOOK_FILE });
      setResult(res);
    } catch (e) {
      setApplyError(e?.message || "The update could not be applied.");
    } finally {
      setApplying(false);
    }
  };

  const onUndo = async () => {
    if (!result?.batchId) return;
    setUndoing(true); setUndoMsg("");
    try {
      const res = await undoStagingUpdate({ batchId: result.batchId, actorName });
      setUndoMsg(`Undone. Removed ${res.productsDeleted} product(s) and ${res.manufacturersDeleted} manufacturer(s).`);
      setResult(null);
    } catch (e) {
      setUndoMsg(e?.message || "Could not undo.");
    } finally {
      setUndoing(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext }}><Loader2 className="animate-spin" style={{ display: "inline" }} /> Loading the speaker database and comparing the workbook…</div>;
  }
  if (error) {
    return <div style={{ padding: 24, color: BRAND.red }}>{error}</div>;
  }
  if (!classification) return null;

  const c = classification.counts;
  const totalToApply = (classification.newProducts.filter((_, i) => approvedProducts.has(i)).length)
    + (classification.needsReview.filter((_, i) => approvedNeedsReview.has(i)).length)
    + (classification.newManufacturers.filter((m) => approvedManufacturers.has(m.name)).length)
    + (classification.brandAmbiguous.filter((b) => brandResolutions[b.workbookName]?.createNew).length);

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: "100vh", color: BRAND.text }}>
      <div style={{ marginBottom: 16 }}>
        <a href="/admin/speaker-database" style={{ fontSize: 13, color: BRAND.subtext, textDecoration: "none" }}>← Back to Speaker Comparison Library</a>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ flex: "1 1 520px", minWidth: 280 }}>
          <h1 style={{ margin: 0, fontSize: 26 }}>Speaker Library Update</h1>
          <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4, maxWidth: 760 }}>
            Staging workbook <strong>{STAGING_WORKBOOK_FILE}</strong>: 67 models with manufacturer reference links and 21 brands without models.
            Existing speakers, specifications, prices and the RP22 calculation engine are never changed. Approved new speakers appear in the
            Comparison Library and the RP22 dropdown as INCOMPLETE until their specifications are entered.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, margin: "16px 0 20px" }}>
        {chip("Existing — unchanged", c.existingUnchanged, BRAND.green)}
        {chip("New products", c.newProducts, BRAND.blue)}
        {chip("Needs review", c.needsReview, BRAND.amber)}
        {chip("New manufacturers", c.newManufacturers, BRAND.green)}
        {chip("Brands already present", c.existingManufacturers, BRAND.hint)}
      </div>

      {result && (
        <div style={{ marginBottom: 16, padding: 16, border: `1px solid ${BRAND.green}`, borderRadius: 12, background: BRAND.panel }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <ShieldCheck size={18} color={BRAND.green} />
            <strong>Applied.</strong>
            <span style={{ fontSize: 13, color: BRAND.subtext }}>{result.manufacturersCreated} manufacturer(s) and {result.productsCreated} product(s) created. {result.skipped ? `${result.skipped} skipped (already existed).` : ""}</span>
          </div>
          <div style={{ fontSize: 12, color: BRAND.hint, marginBottom: 10 }}>Batch {result.batchId}. Existing records and the RP22 engine were not touched.</div>
          <button type="button" onClick={onUndo} disabled={undoing} style={{ display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${BRAND.border}`, borderRadius: 9, padding: "8px 14px", background: "#FFF", color: BRAND.text, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            <Undo2 size={15} /> {undoing ? "Undoing…" : "Undo this update"}
          </button>
          {undoMsg && <div style={{ fontSize: 12, color: BRAND.subtext, marginTop: 8 }}>{undoMsg}</div>}
        </div>
      )}
      {applyError && <div style={{ marginBottom: 16, padding: 12, border: `1px solid ${BRAND.red}`, borderRadius: 10, background: "#FDF2F2", color: BRAND.red, fontSize: 13 }}>{applyError}</div>}

      {/* Manufacturer mappings (Triad → Triad Speakers) */}
      {Object.keys(classification.manufacturerMappings || {}).length > 0 && (
        <Section title="Manufacturer identities to confirm" tone={BRAND.amber} hint="The workbook spells these manufacturers differently from the database. Choose how to map them before approving their products.">
          {Object.entries(classification.manufacturerMappings).map(([norm, map]) => (
            <div key={norm} style={{ padding: "10px 0", borderBottom: `1px solid ${BRAND.border}` }}>
              <div style={{ fontSize: 13, color: BRAND.text, marginBottom: 4 }}><strong>{map.workbookName}</strong> — {map.note}</div>
              <div style={{ fontSize: 12, color: BRAND.hint, marginBottom: 8 }}>{map.models.length} model(s) depend on this choice.</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                {map.candidates.map((cand) => (
                  <label key={cand.id} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: BRAND.text }}>
                    <input type="radio" name={`map-${norm}`} checked={resolutions[norm]?.existingId === cand.id} onChange={() => setResolutions((r) => ({ ...r, [norm]: { existingId: cand.id, existingName: cand.name } }))} />
                    Map to existing “{cand.name}”
                  </label>
                ))}
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: BRAND.text }}>
                  <input type="radio" name={`map-${norm}`} checked={resolutions[norm]?.createNew === true} onChange={() => setResolutions((r) => ({ ...r, [norm]: { createNew: true } }))} />
                  Create new “{map.workbookName}”
                </label>
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Needs review */}
      {classification.needsReview.length > 0 && (
        <Section title="Needs review — do not auto-create" tone={BRAND.amber} hint="Uncertain identity or likely duplicate. Approve only the ones you have confirmed are distinct new products.">
          {classification.needsReview.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "11px 0", borderBottom: `1px solid ${BRAND.border}`, alignItems: "flex-start" }}>
              <input type="checkbox" checked={approvedNeedsReview.has(i)} onChange={() => setApprovedNeedsReview((s) => toggle(s, i))} style={{ width: 16, height: 16, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: BRAND.text }}><strong>{p.manufacturer}</strong> · {p.model}</div>
                <div style={{ fontSize: 12, color: BRAND.amber, marginTop: 3 }}>{p.reason}</div>
                {p.attention && <div style={{ fontSize: 12, color: BRAND.subtext, marginTop: 3 }}>{p.attention}</div>}
                {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: BRAND.blue, display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4 }}>Reference link <ExternalLink size={11} /></a>}
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* New products */}
      {classification.newProducts.length > 0 && (
        <Section title="New products" tone={BRAND.blue} hint="No match in the database. Approved products are created INCOMPLETE — no specification, no price, no SPL result.">
          <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setApprovedProducts(new Set(classification.newProducts.map((_, i) => i)))} style={smallBtn}>Select all</button>
            <button type="button" onClick={() => setApprovedProducts(new Set())} style={smallBtn}>Clear</button>
          </div>
          {classification.newProducts.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "9px 0", borderBottom: `1px solid ${BRAND.border}`, alignItems: "center" }}>
              <input type="checkbox" checked={approvedProducts.has(i)} onChange={() => setApprovedProducts((s) => toggle(s, i))} style={{ width: 16, height: 16 }} />
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: BRAND.text }}>
                <strong>{p.manufacturerName || p.manufacturer}</strong> · {p.model}
                {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 10, fontSize: 12, color: BRAND.blue, display: "inline-flex", alignItems: "center", gap: 4 }}>link <ExternalLink size={11} /></a>}
              </div>
              <span style={{ fontSize: 11, color: BRAND.hint }}>{p.manufacturerId ? "existing mfr" : "new mfr"}</span>
            </div>
          ))}
        </Section>
      )}

      {/* Brands without models */}
      {(classification.newManufacturers.length > 0 || classification.existingManufacturers.length > 0 || classification.brandAmbiguous.length > 0) && (
        <Section title="Brands without models" hint="Used to populate manufacturer options only. No dummy speaker products are created.">
          {classification.newManufacturers.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: BRAND.hint, marginBottom: 8 }}>New manufacturers to add (no products):</div>
              {classification.newManufacturers.map((m) => (
                <div key={m.name} style={{ display: "flex", gap: 12, padding: "7px 0", alignItems: "center" }}>
                  <input type="checkbox" checked={approvedManufacturers.has(m.name)} onChange={() => setApprovedManufacturers((s) => toggle(s, m.name))} style={{ width: 16, height: 16 }} />
                  <span style={{ fontSize: 13, color: BRAND.text }}>{m.name}</span>
                </div>
              ))}
            </>
          )}
          {classification.brandAmbiguous.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: BRAND.hint, marginBottom: 8 }}>Brand names that probably match an existing manufacturer:</div>
              {classification.brandAmbiguous.map((b) => (
                <div key={b.workbookName} style={{ padding: "8px 0", borderBottom: `1px solid ${BRAND.border}` }}>
                  <div style={{ fontSize: 13, color: BRAND.text }}>{b.workbookName} — {b.note}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6 }}>
                    {b.candidates.map((cand) => (
                      <label key={cand.id} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: BRAND.text }}>
                        <input type="radio" name={`brand-${b.workbookName}`} checked={brandResolutions[b.workbookName]?.existingId === cand.id} onChange={() => setBrandResolutions((r) => ({ ...r, [b.workbookName]: { existingId: cand.id, existingName: cand.name } }))} />
                        Map to “{cand.name}”
                      </label>
                    ))}
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: BRAND.text }}>
                      <input type="radio" name={`brand-${b.workbookName}`} checked={brandResolutions[b.workbookName]?.createNew === true} onChange={() => setBrandResolutions((r) => ({ ...r, [b.workbookName]: { createNew: true } }))} />
                      Create new “{b.workbookName}”
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
          {classification.existingManufacturers.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: BRAND.hint }}>
              Already in the database (no action): {classification.existingManufacturers.map((m) => m.existingName).join(", ")}
            </div>
          )}
        </Section>
      )}

      {/* Existing unchanged */}
      <Section title="Existing — unchanged" tone={BRAND.green} hint="Already in the database. Left exactly as they are — nothing is overwritten." defaultOpen={false}>
        {classification.existingUnchanged.length === 0
          ? <div style={{ fontSize: 13, color: BRAND.hint }}>None.</div>
          : classification.existingUnchanged.map((p, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${BRAND.border}`, fontSize: 13, color: BRAND.text }}>
              <span><strong>{p.manufacturer}</strong> · {p.model}</span>
              <span style={{ fontSize: 11, color: BRAND.green }}>kept</span>
            </div>
          ))}
      </Section>

      <div style={{ position: "sticky", bottom: 0, background: BRAND.bg, padding: "14px 0", borderTop: `1px solid ${BRAND.border}`, marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: BRAND.subtext }}>
          <AlertTriangle size={14} style={{ display: "inline", color: BRAND.amber, marginRight: 6 }} />
          {totalToApply} item(s) approved to apply. Existing records and the RP22 engine are never changed.
        </div>
        <button type="button" onClick={onApply} disabled={applying || totalToApply === 0} style={{ display: "inline-flex", alignItems: "center", gap: 8, border: 0, borderRadius: 10, padding: "11px 20px", background: totalToApply === 0 ? "#9CA3A0" : BRAND.green, color: "#FFF", fontSize: 14, fontWeight: 600, cursor: totalToApply === 0 ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {applying ? <><Loader2 size={16} className="animate-spin" /> Applying…</> : <><Check size={16} /> Apply approved changes</>}
        </button>
      </div>
    </div>
  );
}

const smallBtn = { border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: "5px 12px", background: "#FFF", color: BRAND.text, fontSize: 12, cursor: "pointer", fontFamily: "inherit" };

// local normaliser mirror (kept inline to avoid an extra import in JSX)
function normaliseManuf(name) {
  return String(name || "").toLowerCase().replace(/&/g, " and ").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean).filter((t) => !["and", "the", "of"].includes(t)).join("");
}