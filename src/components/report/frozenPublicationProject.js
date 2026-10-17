import { resolveDisplayType } from '@/components/models/screen/displayTypeAuthority';

/** A pinned identity field is only stated when the publication actually pinned one. */
function statedIdentity(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text === '—' || text === '-') return null;
  return value;
}

/**
 * Presentation inputs from the pinned publication only, never the current version.
 *
 * PROJECT IDENTITY IS NOT ERASED BY AN UNSTATED ONE. Client name and project
 * reference are project metadata that the publication freezes alongside the
 * report facts so the report can print them. A publication pinned before that
 * identity travelled with it carries the fields as nothing at all — and a
 * nothing-at-all must never overwrite what the project itself states when these
 * frozen facts are merged over the live project, or the cover and the technical
 * overview lose the client and the reference the project holds.
 */
export default function frozenPublicationProject(publication, saved = null) {
  const p = publication?.report_snapshot?.report_project;
  if (!p) return null;
  const screen = p.report_screen;
  const frozen = { ...p };

  // Absent identity is left absent, so the merge keeps the project's own values.
  // The owning account follows the same rule: an account the publication did not
  // pin is never asserted as nothing, so a report can never lose the account its
  // project belongs to.
  for (const key of ['client_name', 'project_reference', 'account_id']) {
    if (statedIdentity(frozen[key]) === null) delete frozen[key];
  }

  return {
    ...frozen,
    id: p.project_id || p.id,
    version_number: p.version_number ?? saved?.payload?.proposalSource?.version?.number ?? null,
    created_date: saved?.generated_at || p.created_date || publication.published_at,
    // The REAL report update timestamp travels with the frozen identity. A frozen
    // report has no live project record behind it, so without this the identity's
    // own dates are the only dates it has — and a field the report knows must
    // never print as a dash.
    updated_date: saved?.generated_at || p.updated_date || p.created_date
      || publication.published_at || null,
    report_frozen: true,
    display_type: resolveDisplayType(screen || p),
    screen_manual_config: screen?.manualSize || p.screen_manual_config || null,
  };
}