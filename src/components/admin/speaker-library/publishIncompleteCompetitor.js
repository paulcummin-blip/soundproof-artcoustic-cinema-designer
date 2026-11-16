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

  // Identity + source only. No technical acoustic fields, no approval, no
  // capability. A Draft specification is saved but NOT published for dealer
  // access: the row exists for library identity and price association, but
  // dealers see nothing until the specification is explicitly approved and
  // published through publishSpecificationToRp22. Admins inspect the saved
  // values through the unpublished-spec candidate path (built from the current
  // specification, not this identity row).
  const sharedRecord = {
    manufacturer: identity.manufacturer,
    model: identity.model,
    product_type: product?.category || "",
    source_url: sourceUrl || product?.official_product_url || "",
    datasheet_url: datasheetUrl || product?.official_pdf_url || "",
    date_checked: new Date().toISOString().split("T")[0],
    active: true,
    source_product_id: product?.id || null,
    source_specification_id: specification?.id || null,
    publish_source: "speaker_database",
    evidence_source: "official",
    secondary_evidence: null,
  };

  let competitorId;
  let created;
  if (existingDatabaseRow) {
    // Update identity + source only. Preserve the existing published and
    // approval state — this path never approves, unpublishes, or changes
    // the approval status of a row. An already-approved published row keeps
    // its dealer visibility; a Draft row remains admin-only.
    await base44.entities.CompetitorSpeaker.update(existingDatabaseRow.id, sharedRecord);
    competitorId = existingDatabaseRow.id;
    created = false;
  } else {
    const createdRow = await base44.entities.CompetitorSpeaker.create({
      ...sharedRecord,
      // A Draft specification is not dealer-visible. The row carries library
      // identity so the speaker is selectable for admins, but published=false
      // means selectComparisonLibraryRows excludes it from the dealer dropdown.
      published: false,
      published_at: new Date().toISOString(),
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