import React from "react";
import { resolveIdentityFields } from "@/components/projects/projectIdentityAuthority";

/**
 * One project identity, shown the same way everywhere.
 *
 * Used by the Projects card, the Active Project sidebar and the Room Designer
 * header. All three pass the same authoritative fields, so the client, project
 * reference and dealer can never disagree between surfaces.
 *
 * Props:
 *   client, reference, dealerName, account, versionName — source values
 *   orientation — "inline" (one compact line) or "stacked" (one row per field)
 *   showVersion — include the version name as a row (off by default; the Room
 *                 Designer header already shows an editable version field)
 *   color, fontSize, style, className — presentation only
 */
export default function ProjectIdentityLine({
  client = null,
  reference = null,
  dealerName = null,
  account = null,
  versionName = null,
  orientation = "inline",
  showVersion = false,
  color = "#625143",
  fontSize = 13,
  style,
  className = "",
}) {
  const fields = resolveIdentityFields({
    client,
    reference,
    dealerName,
    account,
    versionName,
  });

  const stacked = orientation === "stacked";

  const rows = [
    { key: "client", label: "Client", value: fields.client },
    // The full word is used only where the row has room for it; the compact
    // single-line form uses the abbreviated label.
    { key: "reference", label: stacked ? "Reference" : "Ref", value: fields.reference },
    { key: "dealer", label: "Dealer", value: fields.dealer },
  ];

  if (showVersion && fields.version) {
    rows.push({ key: "version", label: "Version", value: fields.version });
  }

  if (stacked) {
    return (
      <div
        className={className}
        style={{ display: "flex", flexDirection: "column", gap: 3, ...style }}
      >
        {rows.map((row) => (
          <div key={row.key} style={{ fontSize, color, lineHeight: 1.35 }}>
            <span style={{ fontWeight: 600 }}>{row.label}:</span> {row.value}
          </div>
        ))}
      </div>
    );
  }

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        gap: "4px 10px",
        fontSize,
        color,
        ...style,
      }}
    >
      {rows.map((row) => (
        <span key={row.key} style={{ whiteSpace: "nowrap" }}>
          <span style={{ fontWeight: 600 }}>{row.label}:</span> {row.value}
        </span>
      ))}
    </span>
  );
}