import { resolveDisplayType } from '@/components/models/screen/displayTypeAuthority';

/** Presentation inputs from the pinned publication only, never the current version. */
export default function frozenPublicationProject(publication, saved = null) {
  const p = publication?.report_snapshot?.report_project;
  if (!p) return null;
  const screen = p.report_screen;
  return {
    ...p,
    id: p.project_id || p.id,
    // Identity travels with the publication when it pinned it. An explicit null
    // here would erase the project's own client and reference wherever these
    // frozen facts are merged over live ones, so absent identity is left absent.
    version_number: p.version_number ?? saved?.payload?.proposalSource?.version?.number ?? null,
    created_date: saved?.generated_at || p.created_date || publication.published_at,
    account_id: saved?.account_id ?? p.account_id ?? null,
    report_frozen: true,
    display_type: resolveDisplayType(screen || p),
    screen_manual_config: screen?.manualSize || p.screen_manual_config || null,
  };
}