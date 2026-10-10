import { resolveDisplayType } from '@/components/models/screen/displayTypeAuthority';

/** Presentation inputs from the pinned publication only, never the current version. */
export default function frozenPublicationProject(publication, saved = null) {
  const p = publication?.report_snapshot?.report_project;
  if (!p) return null;
  const screen = p.report_screen;
  return {
    ...p,
    id: p.project_id || p.id,
    client_name: p.client_name ?? null,
    project_reference: p.project_reference ?? null,
    dealer_name: p.dealer_name ?? null,
    version_number: p.version_number ?? saved?.payload?.proposalSource?.version?.number ?? null,
    created_date: saved?.generated_at || p.created_date || publication.published_at,
    account_id: saved?.account_id ?? p.account_id ?? null,
    report_frozen: true,
    display_type: resolveDisplayType(screen || p),
    screen_manual_config: screen?.manualSize || p.screen_manual_config || null,
  };
}