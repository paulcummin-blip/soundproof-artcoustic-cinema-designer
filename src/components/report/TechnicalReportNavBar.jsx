/**
 * TechnicalReportNavBar
 * ---------------------
 * The Technical Report's own navigation: the way back, and the pairing to the
 * Visual Report for the SAME design version.
 *
 * Every link carries the report's full context — project, version, and the
 * Project Library return when the report was opened from the Library — through
 * the shared reportLibraryContext builder. Nothing here reads the loaded Room
 * Designer version: the version being viewed is passed in and is the only
 * version any link can point at.
 *
 * Screen only, never printed: the caller passes the print-hiding class.
 */

import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eye } from 'lucide-react';
import BackToProjectLibraryLink from './BackToProjectLibraryLink';
import { readProposalContext } from './proposalReportContext';
import { buildReportPairingUrl, readLibraryContext, REPORT_ROUTE } from './reportLibraryContext';
import { readRequestedVersionId } from './reportVersionRequest';

const FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

const BTN_STYLE = {
  fontFamily: FONT,
  backgroundColor: '#F9F8F6',
  border: '1px solid #625143',
  borderRadius: 6,
  padding: '10px 20px',
  fontSize: 13,
  color: '#625143',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
};

export default function TechnicalReportNavBar({
  projectId,
  versionId,
  className = 'screen-only',
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const libraryContext = readLibraryContext(searchParams);
  const proposalContext = readProposalContext(searchParams);
  // The version being viewed — the URL's request, or the one the page resolved.
  const viewedVersionId = versionId || readRequestedVersionId(searchParams);

  const handleBackToProject = () => {
    if (!projectId) return;
    navigate(`/RoomDesigner?projectId=${encodeURIComponent(projectId)}`);
  };

  const handleVisualReport = () => {
    if (!projectId) return;
    navigate(buildReportPairingUrl({
      route: REPORT_ROUTE.VISUAL,
      projectId,
      versionId: viewedVersionId,
      libraryContext,
      proposalContext,
    }));
  };

  return (
    <div
      className={className}
      data-technical-report-nav="true"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 12,
        flexWrap: 'wrap',
        marginBottom: 16,
      }}
    >
      {/* Library context only — absent when the report was opened from the project flow */}
      <BackToProjectLibraryLink
        className={className}
        projectId={projectId}
        versionId={viewedVersionId}
      />
      <button type="button" onClick={handleBackToProject} disabled={!projectId} style={BTN_STYLE}>
        <ArrowLeft style={{ width: 16, height: 16, color: '#625143', flexShrink: 0 }} />
        Back to Project
      </button>
      <button
        type="button"
        onClick={handleVisualReport}
        disabled={!projectId}
        style={BTN_STYLE}
      >
        <Eye style={{ width: 16, height: 16, color: '#625143', flexShrink: 0 }} />
        Project Report
      </button>
    </div>
  );
}