/**
 * proposalEvidenceFacts.js (shared)
 * ---------------------------------
 * The FACTS half of the frozen proposal evidence pack.
 *
 * Every fact here is copied from one version's saved-report evidence — the
 * snapshot `readProposalReportEvidence` assembles from that version's own
 * Visual and Technical Report snapshots. It reads nothing else: no live project
 * record, no browser-session handoff, no recalculation, no fallback to another
 * module's idea of the design. If a report does not state something, the fact is
 * null, and the area it belongs to is then not comparable rather than filled in.
 *
 * Excluded parameters (P8, P15, P21) are filtered out here, by the existing
 * report rule, so they cannot enter the pack at all.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { isReportParameter, structureForParameter, plainLanguageName } from '../adiReportEvidenceRules.js';

const NONE = 'None specified';

function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** An evidence value as readable text. Never stringifies a wrapped object. */
function valueText(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    return asText(value.statement) || asText(value.display_value) || asText(value.formatted_value);
  }
  return String(value);
}

/** The screen as the Visual Report states it, in the comparison table's words. */
function screenText(screen) {
  if (screen?.manual_dimensions === true && screen?.manual_width_m) {
    return screen.manual_height_m
      ? `${screen.manual_width_m}m x ${screen.manual_height_m}m (manual)`
      : `${screen.manual_width_m}m (manual)`;
  }
  if (screen?.size_inches) {
    return screen.aspect_ratio ? `${screen.size_inches}" (${screen.aspect_ratio})` : `${screen.size_inches}"`;
  }
  return null;
}

/** The seating as the Visual Report states it, or its own seat and row counts. */
function seatingText(seating) {
  const interpretation = asText(seating?.interpretation);
  if (interpretation) return interpretation;
  const seats = Number(seating?.seat_count);
  const rows = Number(seating?.row_count);
  if (!Number.isFinite(seats) || seats <= 0) return null;
  const rowText = Number.isFinite(rows) && rows > 0 ? ` in ${rows} row${rows === 1 ? '' : 's'}` : '';
  return `${seats} seat${seats === 1 ? '' : 's'}${rowText}`;
}

/** The system format, with its discrete channel count when the report states it. */
function layoutText(system) {
  const text = asText(system?.configuration?.dolby_config) || asText(system?.configuration?.text);
  const total = Number(system?.channel_layout?.total_discrete);
  const channels = Number.isFinite(total) && total > 0 ? `${total} discrete channels` : null;
  if (!text) return channels;
  return channels ? `${text} (${channels})` : text;
}

/** The amplification this version specifies, or null when the report states none. */
function amplificationText(system) {
  const value = system?.amplification;
  if (!value) return null;
  if (value.specified === true && Number.isFinite(Number(value.power_w))) return `${Number(value.power_w)} W`;
  return null;
}

/** The loudspeaker each position is delivered with, from the report's own roles. */
function roleText(system) {
  const roles = Array.isArray(system?.product_roles) ? system.product_roles : [];
  const lines = [];
  for (const role of roles) {
    const model = asText(role?.model_label) || asText(role?.model_key) || asText(role?.model);
    if (!model) continue;
    const label = asText(role?.role_description) || asText(role?.role);
    const line = label ? `${label}: ${model}` : model;
    if (!lines.includes(line)) lines.push(line);
  }
  return lines.length > 0 ? lines.join(' · ') : null;
}

/** The printed Products Selected rows, exactly as the Technical Report states them. */
function productRows(snapshot) {
  const rows = snapshot?.system?.products_selected?.rows;
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    key: row?.key || null,
    area: asText(row?.area) || asText(row?.key) || null,
    value: asText(row?.value) || NONE,
  }));
}

/** The report's parameter rows, excluded parameters filtered out. */
function parameterRows(snapshot) {
  const rows = Array.isArray(snapshot?.report_parameters) ? snapshot.report_parameters : [];
  return rows
    .filter((row) => isReportParameter(row?.parameter_id))
    .map((row) => {
      const id = Number(row.parameter_id);
      const level = asText(row.level);
      const value = valueText(row.value);
      return {
        parameter_id: id,
        key: asText(row.key) || `P${id}`,
        label: plainLanguageName(id, row.title),
        structure: structureForParameter(id),
        level,
        value,
        text: asText(row.text) || [level, value].filter(Boolean).join(' · ') || null,
      };
    });
}

/**
 * The reading each major design area carries for this one version, or null where
 * the reports do not state it. This is what the classification compares.
 */
function areaReadings({ screen, seating, viewing, system, parameters, products }) {
  const byLayer = new Map(products.map((row) => [row.key, row.value]));
  const byParameter = new Map(parameters.map((row) => [`p${row.parameter_id}`, row]));

  const readings = {
    screen_size: screenText(screen),
    system_layout: layoutText(system),
    seating: seatingText(seating),
    speakers: roleText(system),
    amplification: amplificationText(system),
  };

  readings.rp23_viewing = viewing?.available === true && asText(viewing?.summary)
    ? { level: asText(viewing?.primary_floor), text: asText(viewing.summary) }
    : null;

  for (const key of ['lcr', 'surrounds', 'overheads', 'subwoofers', 'acoustic_treatment']) {
    readings[key] = byLayer.get(key) || null;
  }

  for (const [key, row] of byParameter) {
    readings[key] = { level: row.level, value: row.value, text: row.text };
  }

  return readings;
}

/**
 * One option's facts, as the pack freezes them.
 *
 * @param {Object} entry — one readProposalReportEvidence result
 * @param {string} label — the option label this version is given ("Option A")
 * @returns {{ version_id, version_name, label, facts, areas }}
 */
export function buildOptionFacts(entry, label) {
  const snapshot = entry?.snapshot;
  const versionId = entry?.version_id || snapshot?.identity?.versionId || null;
  if (!versionId) throw new Error('A selected version could not be identified from its report evidence.');
  if (!snapshot) throw new Error(`No saved report evidence was supplied for version ${versionId}.`);

  const identity = snapshot.identity || {};
  const room = snapshot.room || {};
  const screen = room.screen || {};
  const seating = room.seating || {};
  const viewing = snapshot.viewing || {};
  const system = snapshot.system || {};
  const parameters = parameterRows(snapshot);
  const products = productRows(snapshot);
  const perSeat = Array.isArray(viewing.per_seat) ? viewing.per_seat : [];

  return {
    version_id: versionId,
    version_name: entry?.version_name || snapshot.version?.name || null,
    label: label || null,
    // Internal only: the raw readings the classification compares. The frozen
    // pack carries the classification and the facts, never this working copy.
    areas: areaReadings({ screen, seating, viewing, system, parameters, products }),
    facts: {
      version_id: versionId,
      version_name: entry?.version_name || snapshot.version?.name || null,
      label: label || null,
      // The report's own identity statement. It is never the live project record.
      report_identity: {
        project_name: asText(identity.project_name),
        client_name: asText(identity.client_name),
        project_reference: asText(identity.project_reference),
        dealer_name: asText(identity.dealer_name),
      },
      report_snapshot_ids: {
        visual: identity.visualReportId || null,
        technical: identity.technicalReportId || null,
      },
      fingerprints: {
        engineering: identity.engineeringFingerprint || null,
        visual_evidence: identity.visualEvidenceFingerprint || null,
        technical_evidence: identity.technicalEvidenceFingerprint || null,
        evidence_generated_at: identity.generatedAt || null,
      },
      room: {
        length_m: room.dimensions?.length_m ?? null,
        width_m: room.dimensions?.width_m ?? null,
        height_m: room.dimensions?.height_m ?? null,
        volume_m3: room.volume_m3 ?? null,
        dimensions_text: asText(room.dimensions_text),
        interpretation: asText(room.interpretation),
        acoustic_treatment: room.acoustic_treatment ?? null,
      },
      screen: {
        size_inches: screen.size_inches ?? null,
        aspect_ratio: asText(screen.aspect_ratio),
        screen_type: asText(screen.screen_type),
        viewable_width_cm: screen.viewable_width_cm ?? null,
        viewable_height_cm: screen.viewable_height_cm ?? null,
        manual_dimensions: screen.manual_dimensions === true,
        manual_width_m: screen.manual_width_m ?? null,
        manual_height_m: screen.manual_height_m ?? null,
        interpretation: asText(screen.interpretation),
      },
      seating: {
        interpretation: asText(seating.interpretation),
        seat_count: seating.seat_count ?? null,
        row_count: seating.row_count ?? null,
        per_seat: perSeat.map((seat) => ({
          seat_id: seat?.seatId || null,
          label: asText(seat?.label),
          row: seat?.row ?? null,
          distance_m: seat?.distance_m ?? null,
          horizontal_angle_deg: seat?.horizontal_angle_deg ?? null,
          vertical_angle_deg: seat?.vertical_angle_deg ?? null,
          rp23_level: asText(seat?.level),
        })),
      },
      viewing: {
        available: viewing.available === true,
        summary: asText(viewing.summary),
        primary_floor: asText(viewing.primary_floor),
      },
      system: {
        layout: layoutText(system),
        channel_layout: {
          bed_channels: system.channel_layout?.bed_channels ?? null,
          overhead_channels: system.channel_layout?.overhead_channels ?? null,
          dolby_subwoofer_channels: system.channel_layout?.dolby_subwoofer_channels ?? null,
          total_discrete: system.channel_layout?.total_discrete ?? null,
          subwoofer_count: system.channel_layout?.subwoofer_count ?? null,
        },
        products,
        products_by_layer: system.products_selected_by_layer || {},
        product_roles: roleText(system),
        subwoofer_strategy: system.subwoofer_strategy || null,
        amplification: amplificationText(system),
        acoustic_treatment: Array.isArray(system.acoustic_treatment) ? system.acoustic_treatment : [],
      },
      parameters,
      bass: {
        available: snapshot.bass?.available === true,
        subwoofer_strategy_summary: asText(snapshot.bass?.subwoofer_strategy_summary),
      },
    },
  };
}