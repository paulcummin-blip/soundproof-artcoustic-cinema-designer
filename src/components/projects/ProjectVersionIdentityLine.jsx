/**
 * ProjectVersionIdentityLine
 * --------------------------
 * The identity line that confirms which project and design version a page is
 * working on: Project · Client · Reference · Version.
 *
 * Identity comes from the canonical project hydration store — the same source
 * the sidebar and every global page read — so this line can never disagree with
 * the rest of the app. The version name is read from the ProjectVersion record
 * the project points at.
 *
 * Deliberately carries no dealer field.
 */

import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useCanonicalProject } from '@/components/state/projectHydrationStore';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';

function IdentityItem({ label, value }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.12em] text-[#A79E8C]">{label}</span>
      <span className="text-sm text-[#1B1A1A]" style={{ fontFamily: REPORT_FONT_BODY }}>{value}</span>
    </span>
  );
}

export default function ProjectVersionIdentityLine({ className = '' }) {
  const { projectId, identity } = useCanonicalProject();
  const activeVersionId = identity?.activeVersionId || null;
  const [versionName, setVersionName] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!activeVersionId) {
      setVersionName(null);
      return undefined;
    }
    (async () => {
      try {
        const versions = await base44.entities.ProjectVersion.filter({ id: activeVersionId });
        if (!cancelled) {
          setVersionName(Array.isArray(versions) && versions.length ? versions[0].version_name || null : null);
        }
      } catch {
        // Identity line only: an unreadable version leaves the field blank
        // rather than showing a wrong name.
        if (!cancelled) setVersionName(null);
      }
    })();
    return () => { cancelled = true; };
  }, [activeVersionId]);

  if (!projectId) return null;

  return (
    <div className={`flex flex-wrap items-baseline gap-x-5 gap-y-1 ${className}`}>
      <IdentityItem label="Project" value={identity?.name} />
      <IdentityItem label="Client" value={identity?.clientName} />
      <IdentityItem label="Reference" value={identity?.projectReference} />
      <IdentityItem label="Version" value={versionName} />
    </div>
  );
}