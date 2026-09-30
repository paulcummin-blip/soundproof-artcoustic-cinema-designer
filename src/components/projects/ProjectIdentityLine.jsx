import React from "react";
import { resolveIdentityFields } from "@/components/projects/projectIdentityAuthority";

/**
 * One project identity, shown the same way everywhere.
 *
 * Used by the Projects card, the Active Project sidebar and the Room Designer
 * header. All three pass the same authoritative fields, so the project, client
 * and reference can never disagree between surfaces.
 *
 * Product rule: this block surfaces the project, the client and the project
 * reference only. Dealer identity is not shown here.
 *
 * Props:
 *   projectName, client, reference, versionName — source values
 *   showProject — add the project name as a row. Off by default, because the
 *                 Projects card and the sidebar already show the project name
 *                 as the heading directly above this block.
 *   orientation — "inline" (one compact line) or "stacked" (one row per field)
 *   showVersion — include the version name as a row (off by default; the Room
 *                 Designer header already shows an editable version field)
 *   color, fontSize, style, className — presentation only
 *
 * A project with no reference omits the Reference row entirely — the same
 * convention the report cover uses — rather than printing a dash.
 */
export default function ProjectIdentityLine({
  projectName = null,
  client = null,
  reference = null,
  versionName = null,
  showProject = false,
  orientation = "inline",
  showVersion = false,
  color = "#625143",
  fontSize = 13,
  style,
  className = "",
}) {
  const fields = resolveIdentityFields({
    projectName,
    client,
    reference,
    versionName,
  });

  const stacked = orientation === "stacked";

  const rows = [];

  if (showProject && fields.project) {
    rows.push({ key: "project", label: "Project", value: fields.project });
  }

  rows.push({ key: "client", label: "Client", value: fields.client });

  if (fields.hasReference) {
    rows.push({ key: "reference", label: "Reference", value: fields.reference });
  }

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