/**
 * ProjectReportCover.jsx
 * ----------------------
 * The Project Report's cover body — project identity, the design version it
 * documents and what the report contains.
 *
 * The masthead above it (logo, title, project meta line) is the shared report
 * header, printed once on the first page. This block adds what a cover owes the
 * reader: whose design it is, which version, when it was produced, and the
 * document's own contents. It states the Project Report's name from the identity
 * authority, so no other name can appear on a Project Report cover.
 */

import React from 'react';
import { PROJECT_REPORT_TITLE } from '@/components/report/projectReport/projectReportIdentity';
import { PROJECT_REPORT_SECTIONS } from '@/components/report/projectReport/projectReportRegistry';
import {
  REPORT_FONT_HEADING,
  REPORT_FONT_BODY,
} from '@/components/report/typography/reportTypography';

function valueOrDash(value) {
  const text = String(value ?? '').trim();
  return text || '—';
}

function metaRow(label, value) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '3px 0' }}>
      <div style={{
        width: '38mm',
        fontSize: 8,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#625143',
      }}>
        {label}
      </div>
      <div style={{ fontSize: 10, color: '#1B1A1A' }}>{valueOrDash(value)}</div>
    </div>
  );
}

export default function ProjectReportCover({
  projectDetails = null,
  version = null,
  reference = null,
  generatedOn = null,
  print = false,
}) {
  const versionLabel = version
    ? [version.name, version.number ? `Version ${version.number}` : null].filter(Boolean).join(' · ')
    : null;

  return (
    <div style={{ fontFamily: REPORT_FONT_BODY, color: '#1B1A1A' }}>
      <div style={{
        fontFamily: REPORT_FONT_HEADING,
        fontSize: print ? 22 : 20,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: '#213428',
        marginBottom: print ? '10mm' : 16,
      }}>
        Consolidated engineering report
      </div>

      <div style={{
        display: 'flex',
        gap: print ? '16mm' : 32,
        alignItems: 'flex-start',
        marginBottom: print ? '10mm' : 24,
      }}>
        <div style={{ flex: 1 }}>
          {metaRow('Project', projectDetails?.name)}
          {metaRow('Client', projectDetails?.client_name)}
          {metaRow('Reference', reference || projectDetails?.project_reference)}
          {metaRow('Version', versionLabel)}
        </div>
        <div style={{ flex: 1 }}>
          {metaRow('Document', PROJECT_REPORT_TITLE)}
          {metaRow('Date', generatedOn)}
          {metaRow('Prepared by', projectDetails?.dealer_name)}
        </div>
      </div>

      <div style={{
        fontSize: 9,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: '#625143',
        marginBottom: print ? '5mm' : 12,
      }}>
        Contents
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: print ? '1fr 1fr' : '1fr',
        gap: print ? '2mm 10mm' : 6,
      }}>
        {PROJECT_REPORT_SECTIONS.map((section) => (
          <div key={section.id} style={{ display: 'flex', gap: 8, fontSize: 9, color: '#3E4349' }}>
            <span style={{ color: '#625143', width: 18 }}>{section.ordinal}</span>
            <span>{section.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}