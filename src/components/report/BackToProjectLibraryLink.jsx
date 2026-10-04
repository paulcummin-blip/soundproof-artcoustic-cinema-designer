/**
 * BackToProjectLibraryLink
 * -------------------------
 * The route back from a report to the Project Library it was opened from.
 *
 * Renders only when the report URL carries the Library context
 * (source=library&returnTo=project-library), so a report opened from the Room
 * Designer or the proposal workflow shows its normal navigation alone.
 *
 * The destination is rebuilt from the report's own project and version — the
 * Generated Reports tab, at the section of the version being viewed — so the
 * designer returns to the exact place they left, and never to another version.
 *
 * App navigation only: the caller passes the print-hiding class its page uses
 * ('screen-only' on the Technical Report, 'client-report-screen-only' on the
 * Visual Report), so the link never reaches an exported PDF.
 */

import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  BACK_TO_PROJECT_LIBRARY_LABEL,
  readLibraryContext,
  resolveLibraryReturnUrl,
} from '@/components/report/reportLibraryContext';
import { readRequestedVersionId } from '@/components/report/reportVersionRequest';

const LINK_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 20px',
  fontFamily: "'Futura PT Light', 'Century Gothic', sans-serif",
  fontSize: 13,
  backgroundColor: '#213428',
  border: '1px solid #213428',
  borderRadius: 6,
  color: '#FFFFFF',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

export default function BackToProjectLibraryLink({
  className = '',
  style = null,
  projectId = null,
  versionId = null,
}) {
  const [searchParams] = useSearchParams();
  const context = readLibraryContext(searchParams);

  if (!context.active) return null;

  const to = resolveLibraryReturnUrl({
    projectId: projectId
      || searchParams.get('projectId')
      || searchParams.get('id')
      || null,
    // The version being viewed is the version the Library returns to.
    versionId: versionId || readRequestedVersionId(searchParams),
  });

  return (
    <Link
      to={to}
      className={className}
      style={style ? { ...LINK_STYLE, ...style } : LINK_STYLE}
      data-project-library-return="reports"
    >
      <ArrowLeft style={{ width: 16, height: 16, color: '#FFFFFF', flexShrink: 0 }} />
      {BACK_TO_PROJECT_LIBRARY_LABEL}
    </Link>
  );
}