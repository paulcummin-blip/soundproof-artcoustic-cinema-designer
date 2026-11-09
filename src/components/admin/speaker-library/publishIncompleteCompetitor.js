// publishIncompleteCompetitor.js
// ---------------------------------------------------------------------------
// The manual-INCOMPLETE shared competitor path.
//
// When an administrator adds a speaker by manufacturer + model only (or with
// partial data that is not yet P12/P13-defensible), the canonical manufacturer /
// product / specification exist but the speaker is not RP22-capable. This module
// persists a shared CompetitorSpeaker row for that identity so the speaker is
// selectable in the normal comparison dropdown while remaining non-gradeable.
//
// This is a LIBRARY-IDENTITY publication, NOT an RP22 capability publication:
//   - The specification is NOT approved (approval_status stays Draft).
//   - No technical acoustic fields are written, so normalizeCompetitor() yields
//     p12_p13_eligible === false → classifyDataAdequacy() === INCOMPLETE.
//   - No P12/P13 capability is produced or implied.
//   - rp22_published_competitor_id is NOT stamped on the specification, so the
//     canonical import / lifecycle paths do not treat the spec as published.
//
// Reuses the existing identity-match finder from rp22ComparisonPublish so a
// retry updates the same row rather than creating a duplicate, and a later
// eligible publish upgrades the same row in place.
// ---------------------------------------------------------------------------

import { base44 } from "@/api/base44Client";
import { findIdentityMatches } from "@/components/admin/speaker-db/model-first/rp22ComparisonPublish";

/**
 * Persist (or refresh) a shared INCOMPLETE CompetitorSpeaker row.
 *
 * @param {object} params { product, specification, manufacturerName, sourceUrl,
 *   datasheetUrl, actorName }
 * @returns {object} { competitorId, created, supersededIds }
 */
export async function publishIncompleteManualCompetitor({
  product,
  specification,
  manufacturerName,
  sourceUrl,
  datasheetUrl,
  actorName,
}) {
  const identity = {
    manufacturer: manufacturerName || product?.manufacturer_name || "",
    model: product?.model || "",
  };
  if (!identity.manufacturer || !identity.model) {
    throw new Error("Manufacturer and model are required for a shared competitor row.");
  }

  // Only reuse an existing SPEAKER DATABASE row. A spreadsheet-imported row is
  // left untouched (it carries its own technical evidence and provenance), so
  // this path never overwrites populated technical data or converts a
  // spreadsheet row into a database row.
  const identityMatches = await findIdentityMatches(identity);
  const existingDatabaseRow = identityMatches.find(
    (row) => row.publish_source === "speaker_database",
  ) || null;

  // Identity + source + visibility only. No technical acoustic fields, no
  // approval, no capability. On update this merges onto the existing row and
  // preserves its retail price and any populated technical evidence.
  const sharedRecord = {
    manufacturer: identity.manufacturer,
    model: identity.model,
    product_type: product?.category || "",
    source_url: sourceUrl || product?.official_product_url || "",
    datasheet_url: datasheetUrl || product?.official_pdf_url || "",
    date_checked: new Date().toISOString().split("T")[0],
    active: true,
    // Library visibility — the row is selectable in the comparison dropdown.
    // This does NOT mean RP22-capable; capability is decided by
    // normalizeCompetitor() from the (blank) technical fields.
    source_product_id: product?.id || null,
    source_specification_id: specification?.id || null,
    publish_source: "speaker_database",
    published: true,
    published_at: new Date().toISOString(),
    evidence_source: "official",
    secondary_evidence: null,
  };

  let competitorId;
  let created;
  if (existingDatabaseRow) {
    await base44.entities.CompetitorSpeaker.update(existingDatabaseRow.id, sharedRecord);
    competitorId = existingDatabaseRow.id;
    created = false;
  } else {
    const createdRow = await base44.entities.CompetitorSpeaker.create({
      ...sharedRecord,
      approval_status: specification?.approval_status || "Draft",
      source_confidence: specification?.confidence || "",
      source_evidence_quality: specification?.evidence_quality || "",
      spec_version_label: specification?.version_label || "",
    });
    competitorId = createdRow?.id || null;
    created = true;
  }

  // The INCOMPLETE path does NOT supersede other rows. A spreadsheet row for the
  // same identity keeps its own technical evidence and provenance; the eligible
  // publish path handles supersession when the specification becomes defensible.

  await base44.entities.SpeakerChangeHistory.create({
    product_id: product?.id || null,
    field_changed: "rp22_publish",
    old_value: existingDatabaseRow ? existingDatabaseRow.id : "",
    new_value: competitorId || "",
    source: actorName || "Manual Edit",
    change_type: created ? "Created" : "Updated",
    change_reason: "Administrative",
  });

  return { competitorId, created };
}