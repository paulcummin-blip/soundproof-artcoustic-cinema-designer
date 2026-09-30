// ModelFirstWizard.jsx
// ---------------------------------------------------------------------------
// Controlled model-first competitor workflow.
//
//   1. Manufacturer (existing or newly added — its website is the authority)
//   2. Exact model typed by hand, optionally with its own URL
//   3. Official-domain search for that one model, or no source at all
//   4. Specification review → approve → publish to the RP22 comparison
//
// Nothing here crawls a catalogue, auto-approves, or infers a missing value.
// ---------------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { validateDraftSpec } from "../add-speaker/addSpeakerValidation.js";
import { approveSpecification, saveSpecEdits, submitForReview } from "../add-speaker/addSpeakerPersistence.js";
import StepModelEntry from "./StepModelEntry.jsx";
import StepSourceSearch from "./StepSourceSearch.jsx";
import StepSpecReview from "./StepSpecReview.jsx";
import {
  createModelFirstDraft,
  ensureManufacturer,
  mergeExtractionIntoSpec,
  persistModelFirstWarnings,
  rp22Readiness,
} from "./modelFirstPersistence.js";
import { publishSpecificationToRp22 } from "./rp22ComparisonPublish.js";

const STEPS = [
  { key: "entry", label: "Manufacturer & model" },
  { key: "source", label: "Official source" },
  { key: "review", label: "Review & publish" },
];

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  bg: "rgb(248 248 247)",
  green: "#213428",
};

export default function ModelFirstWizard() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [manufacturers, setManufacturers] = useState([]);
  const [form, setForm] = useState({ manufacturerId: "", model: "", sourceUrl: "", notes: "" });
  const [product, setProduct] = useState(null);
  const [specification, setSpecification] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [rejected, setRejected] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searched, setSearched] = useState(false);
  const [ambiguousFields, setAmbiguousFields] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  // Last persisted specification, so change history logs only real edits.
  const lastSavedSpec = useRef(null);

  const selectedManufacturer = useMemo(
    () => manufacturers.find((m) => m.id === form.manufacturerId) || null,
    [manufacturers, form.manufacturerId],
  );

  const update = useCallback((patch) => setForm((prev) => ({ ...prev, ...patch })), []);

  const loadManufacturers = useCallback(async () => {
    const page = await base44.entities.SpeakerManufacturer.list("name", 500);
    setManufacturers(Array.isArray(page) ? page : page?.items || []);
  }, []);

  useEffect(() => { loadManufacturers(); }, [loadManufacturers]);

  const handleAddManufacturer = async ({ name, website }) => {
    setBusy(true);
    try {
      const created = await ensureManufacturer({ name, website });
      await loadManufacturers();
      if (created?.id) update({ manufacturerId: created.id });
      setMessage(`${created.name} added. Its website is now the authority for official sources.`);
      return created;
    } catch (error) {
      setMessage(error.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  // ── Step 1 → 2: create the draft product and specification ────────────
  const handleCreateDraft = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (!selectedManufacturer) throw new Error("Select a manufacturer first.");
      if (!form.model.trim()) throw new Error("Type the exact model name.");
      const draft = await createModelFirstDraft({
        manufacturer: selectedManufacturer,
        model: form.model,
        notes: form.notes,
        accountId: user?.data?.account_id || null,
        actorName: user?.full_name || "Admin",
      });
      setProduct(draft.product);
      setSpecification(draft.specification);
      await persistModelFirstWarnings(draft.product.id, draft.specification);
      setStep(1);
      setMessage(`Draft created for ${draft.product.manufacturer_name} ${draft.product.model}. Nothing has been published yet.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Step 2: official-source search and extraction ─────────────────────
  const handleSearch = async () => {
    setSearching(true);
    setSearchError("");
    setSearched(true);
    try {
      const response = await base44.functions.invoke("findOfficialModelSources", {
        manufacturerName: selectedManufacturer?.name || "",
        manufacturerDomain: selectedManufacturer?.website || "",
        model: product?.model || form.model,
      });
      const data = response?.data || {};
      if (data.error) {
        setCandidates([]);
        setRejected([]);
        setSearchError(data.error);
      } else {
        setCandidates(data.candidates || []);
        setRejected(data.rejected || []);
      }
    } catch (error) {
      setCandidates([]);
      setRejected([]);
      setSearchError(error?.message || "Source search failed");
    } finally {
      setSearching(false);
    }
  };

  const extractFrom = async (sourceUrl, sourceType) => {
    setBusy(true);
    setMessage("");
    try {
      const response = await base44.functions.invoke("extractModelSpecification", {
        manufacturerName: selectedManufacturer?.name || "",
        model: product?.model || form.model,
        sourceUrl,
        sourceType,
      });
      const data = response?.data || {};
      if (data.error) throw new Error(data.error);

      const merged = mergeExtractionIntoSpec(specification, data);
      const nextSpec = {
        ...specification,
        ...merged.patch,
        field_authority: { ...(specification?.field_authority || {}), ...merged.authority },
      };

      await saveSpecEdits({
        productId: product.id,
        specId: specification.id,
        oldSpec: specification,
        newSpec: { ...specification, ...merged.patch, field_authority: nextSpec.field_authority },
        changeReason: "Manufacturer Specification Update",
      });
      lastSavedSpec.current = nextSpec;
      if (data.source_url) {
        await base44.entities.SpeakerProduct.update(product.id, { official_product_url: data.source_url });
      }
      const warnings = await persistModelFirstWarnings(product.id, nextSpec);

      setSpecification(nextSpec);
      setAmbiguousFields(merged.ambiguousFields);
      setStep(2);
      setMessage(
        `${data.reported?.length || 0} value${(data.reported?.length || 0) === 1 ? "" : "s"} extracted from the official source. `
        + `${warnings.gaps.critical.length} RP22 gap${warnings.gaps.critical.length === 1 ? "" : "s"} still open.`,
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Step 3: edit, approve, publish ────────────────────────────────────
  const handleFieldChange = (key, value) => {
    setSpecification((prev) => ({ ...prev, [key]: value }));
  };

  const persist = async (action) => {
    setBusy(true);
    setMessage("");
    try {
      await saveSpecEdits({
        productId: product.id,
        specId: specification.id,
        oldSpec: lastSavedSpec.current,
        newSpec: specification,
        changeReason: "Manual Correction",
      });
      lastSavedSpec.current = specification;
      if (action === "approve") {
        await approveSpecification({
          productId: product.id,
          specId: specification.id,
          reviewerName: user?.full_name || "Admin",
        });
        setSpecification((prev) => ({ ...prev, approval_status: "Approved", approved_by: user?.full_name || "Admin" }));
        setMessage("Specification approved. It can now be published to the RP22 comparison.");
      } else if (action === "review") {
        await submitForReview({
          productId: product.id,
          specId: specification.id,
          reviewerName: user?.full_name || "Admin",
        });
        setSpecification((prev) => ({ ...prev, approval_status: "Awaiting Review" }));
        setMessage("Submitted for review.");
      } else {
        setMessage("Draft saved with its data-quality warnings.");
      }
      await persistModelFirstWarnings(product.id, specification);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await publishSpecificationToRp22({
        product,
        specification,
        manufacturerName: selectedManufacturer?.name || product?.manufacturer_name,
        actorName: user?.full_name || "Admin",
      });
      setPublishResult(result);
      setMessage(
        result.created
          ? "Published — this model now appears as a selectable comparison speaker on RP22 Speaker Capability."
          : "Updated the existing RP22 comparison row for this model.",
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const readiness = rp22Readiness(specification);
  const issues = useMemo(() => validateDraftSpec(specification).issues, [specification]);

  return (
    <div style={{ background: "#FFF", border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 18, display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {STEPS.map((s, index) => (
          <div
            key={s.key}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              border: `1px solid ${index === step ? BRAND.green : BRAND.border}`,
              background: index === step ? BRAND.green : BRAND.bg,
              color: index === step ? "#FFF" : BRAND.subtext,
            }}
          >
            {index + 1}. {s.label}
          </div>
        ))}
      </div>

      {step === 0 && (
        <>
          <StepModelEntry
            form={form}
            update={update}
            manufacturers={manufacturers}
            onAddManufacturer={handleAddManufacturer}
            busy={busy}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={handleCreateDraft}
              disabled={busy || !form.manufacturerId || !form.model.trim()}
              style={{ padding: "9px 14px", borderRadius: 9, border: "none", background: BRAND.green, color: "#FFF", fontSize: 13, fontWeight: 600, cursor: busy ? "wait" : "pointer", opacity: busy || !form.manufacturerId || !form.model.trim() ? 0.5 : 1 }}
            >
              Create draft product
            </button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <StepSourceSearch
            manufacturerName={selectedManufacturer?.name}
            manufacturerDomain={selectedManufacturer?.website}
            model={product?.model || form.model}
            candidates={candidates}
            rejected={rejected}
            searching={searching}
            searchError={searchError}
            searched={searched}
            onSearch={handleSearch}
            onChoose={(candidate) => extractFrom(candidate.url, candidate.source_type)}
            onUsePastedUrl={() => extractFrom(form.sourceUrl, "Official Product Page")}
            pastedUrl={form.sourceUrl.trim()}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => { setStep(2); setMessage("No source selected. Enter the specification by hand — warnings will record what is missing."); }}
              style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${BRAND.border}`, background: "#FFF", color: BRAND.text, fontSize: 13, cursor: "pointer" }}
            >
              Continue without a source
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <StepSpecReview
          product={product}
          specification={specification}
          onFieldChange={handleFieldChange}
          gaps={readiness.gaps}
          issues={issues}
          ambiguousFields={ambiguousFields}
          saving={busy}
          message={message}
          onSaveDraft={() => persist("draft")}
          onSubmitForReview={() => persist("review")}
          onApprove={() => persist("approve")}
          onPublish={handlePublish}
          publishResult={publishResult}
        />
      )}

      {step !== 2 && message && (
        <div style={{ padding: 10, borderRadius: 9, border: `1px solid ${BRAND.border}`, background: BRAND.bg, fontSize: 12, color: BRAND.text }}>
          {message}
        </div>
      )}

      {step === 2 && (
        <div style={{ fontSize: 12, color: BRAND.subtext }}>
          Draft records stay in the review database. They reach the RP22 page only after approval and publish.
        </div>
      )}
    </div>
  );
}