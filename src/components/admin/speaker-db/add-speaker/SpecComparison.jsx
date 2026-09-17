// SpecComparison.jsx
// Side-by-side comparison of existing approved spec vs new draft.
// Highlights fields that changed. Shown on the Approve step when an
// existing approved specification exists for the same product.
//
// This becomes invaluable when manufacturers quietly revise specifications:
// the reviewer sees exactly what changed before approving the new version.

import React from "react";
import { GitCompare, ArrowRight } from "lucide-react";
import { SPEC_GROUPS } from "./specFieldDefinitions.js";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
  bg: "#F8F8F7",
  amber: "#9A6E00",
  danger: "#B23A3A",
};

function formatValue(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export default function SpecComparison({ existingSpec, newSpec }) {
  if (!existingSpec || !newSpec) return null;

  // Collect all changed fields across all groups
  const changedFields = [];
  for (const group of SPEC_GROUPS) {
    for (const field of group.fields) {
      const oldVal = existingSpec[field.key];
      const newVal = newSpec[field.key];
      const oldStr = formatValue(oldVal);
      const newStr = formatValue(newVal);
      if (oldStr !== newStr) {
        changedFields.push({ key: field.key, label: field.label, oldVal: oldStr, newVal: newStr, group: group.label });
      }
    }
  }

  if (changedFields.length === 0) {
    return (
      <div className="rounded-lg p-4" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
        <div className="flex items-center gap-2 mb-2">
          <GitCompare className="w-4 h-4" style={{ color: BRAND.green }} />
          <h3 className="text-sm font-bold" style={{ color: BRAND.text, margin: 0 }}>Specification Comparison</h3>
        </div>
        <p className="text-xs" style={{ color: BRAND.subtext }}>
          No fields differ from the existing approved specification.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
      <div className="px-4 py-3" style={{ background: BRAND.bg, borderBottom: `1px solid ${BRAND.border}` }}>
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4" style={{ color: BRAND.green }} />
          <h3 className="text-sm font-bold" style={{ color: BRAND.text, margin: 0 }}>Specification Comparison</h3>
        </div>
        <p className="text-xs mt-1" style={{ color: BRAND.subtext }}>
          {changedFields.length} field{changedFields.length !== 1 ? "s" : ""} differ from the existing approved specification. Review before approving.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${BRAND.border}` }}>
              <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.04em", width: "200px" }}>Field</th>
              <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.04em" }}>Existing (Current)</th>
              <th style={{ textAlign: "center", padding: "8px 4px", fontSize: 11, fontWeight: 600, color: BRAND.subtext, width: 30 }}></th>
              <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.04em" }}>New Draft</th>
            </tr>
          </thead>
          <tbody>
            {SPEC_GROUPS.map((group) => {
              const groupChanges = changedFields.filter((f) => f.group === group.label);
              if (groupChanges.length === 0) return null;
              return (
                <React.Fragment key={group.label}>
                  <tr style={{ background: BRAND.bg }}>
                    <td colSpan={4} style={{ padding: "6px 12px", fontSize: 10, fontWeight: 700, color: BRAND.green, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {group.label}
                    </td>
                  </tr>
                  {groupChanges.map((change) => (
                    <tr key={change.key} style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                      <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 500, color: BRAND.text }}>{change.label}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, color: BRAND.subtext }}>{change.oldVal}</td>
                      <td style={{ padding: "8px 4px", textAlign: "center" }}>
                        <ArrowRight className="w-3.5 h-3.5 inline" style={{ color: BRAND.amber }} />
                      </td>
                      <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 600, color: BRAND.green, background: BRAND.green + "08" }}>
                        {change.newVal}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}