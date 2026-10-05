const REQUIRED_PARAMETERS = [12, 13, 14, 18, 19, 20];

/**
 * One version's report evidence, or the exact reason it cannot be used.
 *
 * The four blocked conditions are stated separately, because they need four
 * different actions from the designer:
 *   no saved report at all        → missing
 *   the saved report is not current → stale
 *   the saved report is current but was written before the proposal evidence
 *     capture, so it carries no proposalSource → LEGACY, needs refreshing.
 *     It exists: it is never reported as missing.
 *   the captured evidence is incomplete → incomplete
 */
function requireReport(row, version, type) {
  const name = version.version_name || version.id;

  // No matching ReportSnapshot for this project version and report type.
  if (!row) throw new Error(`${name}: missing ${type} Report. Generate it before creating a proposal.`);

  const source = row.payload?.proposalSource;

  // The saved report's own status is the first authority.
  if (row.status !== 'current') {
    throw new Error(`${name}: stale ${type} Report. Regenerate it before creating a proposal.`);
  }

  // The report exists and is current, but predates the proposal evidence
  // capture. It needs a ONE-TIME refresh — it is never "missing", and it is
  // never described as recurring maintenance.
  if (!source) {
    throw new Error(
      `${name}: ${type} Report exists, but needs a one-time evidence refresh for comparison evidence. `
      + `Open the ${type} Report for this version once to save its proposal evidence, then try again.`,
    );
  }

  // The design the report was generated from is compared with the design the
  // version holds NOW, by the one engineering fingerprint. The version record's
  // own modified time is never consulted: opening the project, exporting a PDF
  // or storing a library asset all touch that record without changing the
  // design, so it cannot say whether the report's source moved on. When either
  // side is unreadable, no staleness is manufactured.
  const savedFingerprint = row.source_fingerprints?.engineeringFingerprint || null;
  const publishedFingerprint = version.published_fingerprint || null;
  if (savedFingerprint && publishedFingerprint && savedFingerprint !== publishedFingerprint) {
    throw new Error(`${name}: stale ${type} Report. The design changed after it was generated. Regenerate it before creating a proposal.`);
  }

  if (source.report_source_version !== 1 || source.identity?.versionId !== version.id) {
    throw new Error(`${name}: incomplete ${type} Report evidence (P13 and other report evidence). Regenerate it before creating a proposal.`);
  }
  return source;
}

// The only proposal source reader. No project state, handoffs, summary builders,
// caller-supplied snapshots, or older reports may supply a missing value.
export async function readProposalReportEvidence(entities, projectId, versions) {
  return Promise.all(versions.map(async (version) => {
    const reports = await entities.ReportSnapshot.filter({ project_id: projectId, version_id: version.id }, { sort: '-generated_at', limit: 50 });
    const rows = reports.items;
    const technicalRow = rows.find((row) => row.report_type === 'technical');
    const visualRow = rows.find((row) => row.report_type === 'visual');
    const technical = requireReport(technicalRow, version, 'Technical');
    const visual = requireReport(visualRow, version, 'Visual');
    for (const id of REQUIRED_PARAMETERS) {
      const parameter = technical.report_parameters?.find((row) => row.parameter_id === id);
      if (!parameter?.level || !parameter?.value || /NOT CALCULATED|Seat results|^—$|N\/A/i.test(String(parameter.value)) || !/^L[1-4]$/.test(parameter.level)) {
        throw new Error(`${version.version_name}: missing Technical Report parameter P${id}. Regenerate the report.`);
      }
    }
    if (!technical.system?.products_selected?.rows?.length) throw new Error(`${version.version_name}: missing Technical Report Products Selected.`);
    if (!visual.viewing?.available) throw new Error(`${version.version_name}: missing Visual Report RP23 values.`);
    return {
      version_id: version.id, version_name: version.version_name, source: 'saved-reports', engineeringState: 'current',
      snapshot: {
        ...technical,
        room: visual.room, seats: visual.seats, viewing: visual.viewing,
        version: { ...technical.version, id: version.id, name: version.version_name },
        identity: { ...technical.identity, projectId, versionId: version.id, technicalReportId: technicalRow.id, visualReportId: visualRow.id },
      },
    };
  }));
}