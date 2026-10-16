/**
 * VisualContextNotice
 * -------------------
 * A small, quiet note on the Project Report screen, shown BEFORE the report is
 * generated: the images the designer has already put in the Project Library are
 * what the ADI writing draws on, so adding them first is worth doing.
 *
 * It is information and nothing else:
 *   - it never blocks, gates or delays generating the report;
 *   - it never asks for an image to be uploaded, and never requires one;
 *   - it is not part of any report document, so it never reaches an exported PDF;
 *   - if the images cannot be read, it says nothing rather than guessing.
 *
 * It reads the same Project Library the rest of the app reads and the same shared
 * visual-context authority the writing path uses, so what it states about this
 * version's images is what the writing actually sees. When usable images are
 * already there it shows a simple confirmation instead of the invitation.
 *
 * HONEST WORDING. The visual-context writing is wired: the writer is shown these
 * images when a Design Intent is written for this report. So this notice states
 * plainly that ADI writing draws on them, and never that a picture is required —
 * the report, its engineering and its assessment are complete without one.
 */

import React, { useMemo } from 'react';
import { ArrowRight, CheckCircle2, Info } from 'lucide-react';
import { PROJECT_LIBRARY_ROUTE } from '@/components/report/reportLibraryContext';
import { useProjectLibraryImages } from '@/components/library/useProjectLibraryImages';
import { buildReportVisualContext } from '@/shared/reportVisualContext';

const BODY_FONT = 'Didact Gothic, sans-serif';

const CARD = {
  fontFamily: BODY_FONT,
  border: '1px solid #E4E2DD',
  borderRadius: 8,
  backgroundColor: '#FBFAF8',
  padding: '12px 14px',
};

const TITLE = {
  fontSize: 13,
  fontWeight: 700,
  color: '#1B1A1A',
  letterSpacing: '0.01em',
};

const BODY = {
  fontSize: 12.5,
  lineHeight: 1.55,
  color: '#3E4349',
  marginTop: 4,
};

const ACTION = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 10,
  fontSize: 12.5,
  fontWeight: 600,
  color: '#213428',
  textDecoration: 'none',
};

/** The invite, when this version has no images the writing could use yet. */
const INVITE = [
  'For a more personalised and engaging Project Report, add your cinema renders and other room images '
  + 'to the Project Library before generating the report.',
  'ADI writing draws on the visual character of the room, the way the seating is arranged and the design '
  + 'intentions, so it can explain your cinema in the terms you would use yourself.',
  'Your engineering results and RP22 assessments remain unchanged.',
];

/** The confirmation, when usable images are already there. */
const CONFIRMED = [
  'ADI writing will draw on the images this version holds — the visual character of the room, the way '
  + 'the seating is arranged and the design intentions.',
  'Your engineering results and RP22 assessments remain unchanged.',
];

function libraryHref(projectId) {
  return projectId
    ? `${PROJECT_LIBRARY_ROUTE}?projectId=${encodeURIComponent(projectId)}`
    : PROJECT_LIBRARY_ROUTE;
}

export default function VisualContextNotice({ projectId = null, versionId = null, className = '' }) {
  const { assets, loading } = useProjectLibraryImages({ projectId });

  // The same selection the writing path uses, so this notice can never disagree
  // with what the writing would actually be given for this version.
  const context = useMemo(
    () => buildReportVisualContext({ assets, versionId }),
    [assets, versionId],
  );

  // Nothing is claimed while the library is still being read.
  if (!projectId || loading) return null;

  const hasImages = context.available === true;
  const Icon = hasImages ? CheckCircle2 : Info;
  const paragraphs = hasImages ? CONFIRMED : INVITE;

  return (
    <div className={`flex items-start gap-3 ${className}`} style={CARD}>
      <Icon
        className="w-4 h-4"
        style={{ color: '#213428', flexShrink: 0, marginTop: 2 }}
        aria-hidden="true"
      />
      <div style={{ minWidth: 0 }}>
        <div style={TITLE}>Help ADI understand your design</div>
        {paragraphs.map((text) => (
          <p key={text} style={BODY}>{text}</p>
        ))}
        <a
          href={libraryHref(projectId)}
          style={ACTION}
          className="hover:underline underline-offset-2"
        >
          Open Project Library
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}