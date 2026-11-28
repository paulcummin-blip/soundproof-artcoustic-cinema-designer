/**
 * useP17SavedVersionComparison.js
 * -------------------------------
 * READ-ONLY loader for the saved-version P17 diagnostic table.
 *
 * It reads, for the current project only, the saved ProjectVersion records and
 * their published engineering publication (ProjectAnalysisCache). Nothing is
 * written, regenerated or modified; a version with no saved publication is
 * reported as unavailable.
 *
 * The pair under comparison is the project's Level 1 and Level 4 versions — the
 * Marquee Home mismatch this diagnostic exists to explain.
 */

import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  applySavedSpeakerModels,
  buildP17SeatEvidenceRows,
  p17MetricsFromEngineeringSummary,
  speakersByRoleFromDesignState,
} from "@/components/utils/rp22/p17SeatEvidenceAuthority";

/** The version pair this diagnostic explains. Matched by saved version name. */
export const P17_COMPARISON_VERSION_NAMES = [
  { key: "level 1", fallbackLabel: "Level 1 version" },
  { key: "level 4", fallbackLabel: "Level 4 version" },
];

function latestPublication(publications) {
  const entries = Object.values(publications || {});
  if (!entries.length) return null;
  return entries
    .slice()
    .sort((a, b) => String(b?.published_at || "").localeCompare(String(a?.published_at || "")))[0] || null;
}

export default function useP17SavedVersionComparison({ projectId, enabled = true } = {}) {
  const [state, setState] = useState({ loading: false, versions: [] });

  useEffect(() => {
    if (!projectId || !enabled) {
      setState({ loading: false, versions: [] });
      return undefined;
    }

    let cancelled = false;

    (async () => {
      setState({ loading: true, versions: [] });

      const versionResponse = await base44.entities.ProjectVersion.filter(
        { project_id: projectId },
        { sort: "version_number", limit: 5 },
      );
      const savedVersions = versionResponse?.items || [];

      const cacheResponse = await base44.entities.ProjectAnalysisCache.filter(
        { project_id: projectId },
        { limit: 10 },
      );
      const cacheByVersionId = new Map((cacheResponse?.items || []).map((row) => [row.version_id, row]));

      const versions = P17_COMPARISON_VERSION_NAMES.map(({ key, fallbackLabel }) => {
        const version = savedVersions.find((item) => String(item.version_name || "").toLowerCase().includes(key)) || null;
        if (!version) return { label: fallbackLabel, status: "no_version", rows: [] };

        const publications = cacheByVersionId.get(version.id)?.engineering_publications || {};
        const fingerprint = version.published_fingerprint;
        const publication = (fingerprint && publications[fingerprint]) || latestPublication(publications);
        const summary = publication?.engineering_summary || null;

        if (!summary) {
          return { label: version.version_name || fallbackLabel, versionId: version.id, status: "no_evidence", rows: [] };
        }

        const seats = Array.isArray(version.design_state?.seating_positions)
          ? version.design_state.seating_positions
          : [];
        const rows = applySavedSpeakerModels(
          buildP17SeatEvidenceRows({ seats, p17BySeatId: p17MetricsFromEngineeringSummary(summary) }),
          speakersByRoleFromDesignState(version.design_state),
        );

        return {
          label: version.version_name || fallbackLabel,
          versionId: version.id,
          status: rows.some((row) => row.evidenceAvailable) ? "available" : "no_evidence",
          rows,
        };
      });

      if (!cancelled) setState({ loading: false, versions });
    })().catch(() => {
      // Read-only diagnostic fails closed: it reports unavailability and writes nothing.
      if (!cancelled) setState({ loading: false, versions: [], error: true });
    });

    return () => { cancelled = true; };
  }, [projectId, enabled]);

  return state;
}