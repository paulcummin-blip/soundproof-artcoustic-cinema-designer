// StepModelEntry.jsx
// Step 1 of the model-first workflow: pick or add the manufacturer, type the
// exact model, and optionally paste an official URL.

import React, { useState } from "react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  bg: "rgb(248 248 247)",
  green: "#213428",
};

const INPUT = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 9,
  border: `1px solid ${BRAND.border}`,
  background: "#FFF",
  color: BRAND.text,
  fontSize: 13,
};

function Field({ label, hint, children }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.text, marginBottom: 4 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 11, color: BRAND.subtext, marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

export default function StepModelEntry({ form, update, manufacturers, onAddManufacturer, busy }) {
  const [adding, setAdding] = useState(false);
  const [newManufacturer, setNewManufacturer] = useState({ name: "", website: "" });

  const selected = manufacturers.find((m) => m.id === form.manufacturerId) || null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ fontSize: 13, color: BRAND.subtext }}>
        Choose the manufacturer, then type the exact model. Sound Proof works from that model name only —
        nothing else on the manufacturer's website is read.
      </div>

      <Field label="Manufacturer">
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={form.manufacturerId}
            onChange={(e) => update({ manufacturerId: e.target.value })}
            style={{ ...INPUT, flex: 1 }}
          >
            <option value="">Select a manufacturer…</option>
            {manufacturers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            style={{ padding: "9px 12px", borderRadius: 9, border: `1px solid ${BRAND.border}`, background: "#FFF", color: BRAND.text, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Add manufacturer
          </button>
        </div>
      </Field>

      {selected && !selected.website && (
        <div style={{ padding: 10, borderRadius: 9, border: "1px solid #F0D9A8", background: "#FDF6E7", color: "#7A5B12", fontSize: 12 }}>
          {selected.name} has no website recorded, so there is no official domain to search. Add the website
          under Manufacturers first, or paste the product URL below.
        </div>
      )}

      {adding && (
        <div style={{ padding: 12, borderRadius: 10, border: `1px solid ${BRAND.border}`, background: BRAND.bg, display: "grid", gap: 10 }}>
          <Field label="Manufacturer name">
            <input
              value={newManufacturer.name}
              onChange={(e) => setNewManufacturer({ ...newManufacturer, name: e.target.value })}
              style={INPUT}
              placeholder="e.g. M&K Sound"
            />
          </Field>
          <Field label="Manufacturer website" hint="Stored as the authority for what counts as an official source.">
            <input
              value={newManufacturer.website}
              onChange={(e) => setNewManufacturer({ ...newManufacturer, website: e.target.value })}
              style={INPUT}
              placeholder="https://mksound.com"
            />
          </Field>
          <button
            type="button"
            disabled={!newManufacturer.name.trim() || busy}
            onClick={async () => {
              const created = await onAddManufacturer(newManufacturer);
              if (created) {
                setNewManufacturer({ name: "", website: "" });
                setAdding(false);
              }
            }}
            style={{ justifySelf: "start", padding: "8px 14px", borderRadius: 9, border: "none", background: BRAND.green, color: "#FFF", fontSize: 13, fontWeight: 600, cursor: busy ? "wait" : "pointer", opacity: !newManufacturer.name.trim() || busy ? 0.5 : 1 }}
          >
            Save manufacturer
          </button>
        </div>
      )}

      <Field label="Exact model name" hint="Type it exactly as the manufacturer publishes it.">
        <input
          value={form.model}
          onChange={(e) => update({ model: e.target.value })}
          style={INPUT}
          placeholder="e.g. MP150"
        />
      </Field>

      <Field
        label="Official product or PDF URL (optional)"
        hint="Leave blank and Sound Proof will search only the manufacturer's own website for this model."
      >
        <input
          value={form.sourceUrl}
          onChange={(e) => update({ sourceUrl: e.target.value })}
          style={INPUT}
          placeholder="https://mksound.com/products/…"
        />
      </Field>

      <Field label="Notes (optional)">
        <input
          value={form.notes}
          onChange={(e) => update({ notes: e.target.value })}
          style={INPUT}
          placeholder="Anything the next reviewer should know"
        />
      </Field>
    </div>
  );
}