/**
 * ProjectLibraryProposalsSection
 * -----------------------------
 * The active project's proposal assets.
 *
 * Only an EXPORTED proposal appears here, and what appears is the fixed PDF that
 * was issued — not the editable proposal. Drafts, editable revisions and
 * comparisons still being worked on stay in the Proposal Centre, so a working
 * document is never confused with an issued one.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Presentation } from 'lucide-react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import ExportedDocumentRow from './ExportedDocumentRow';
import { describeDocumentVersions } from './libraryVersionLabels';
import {
  exportedDocumentStatus,
  LIBRARY_SOURCE_STATE,
} from './librarySourceStatus';

export default function ProjectLibraryProposalsSection({
  proposalExports = [],
  versionById = new Map(),
  versionNameById = new Map(),
}) {
  const navigate = useNavigate();

  if (proposalExports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Presentation className="w-9 h-9 text-[#DCDBD6] mb-4" />
        <p className="text-sm text-[#8A8477] text-center max-w-md leading-relaxed" style={{ fontFamily: REPORT_FONT_BODY }}>
          No proposal assets yet. Export a proposal PDF from the Proposal Centre and the issued document appears here.
          Drafts and editable revisions stay in the Proposal Centre.
        </p>
        <button
          type="button"
          onClick={() => navigate('/ProposalCentre')}
          className="mt-6 px-6 py-3 text-xs uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#3E4349]"
          style={{ backgroundColor: '#213428', fontFamily: REPORT_FONT_BODY }}
        >
          Open Proposal Centre
        </button>
      </div>
    );
  }

  // Grouped by the proposal they were issued from, newest group first.
  const groups = [];
  proposalExports.forEach((entry) => {
    const key = entry.record.source_record_id || entry.record.title || entry.record.id;
    let group = groups.find((candidate) => candidate.key === key);
    if (!group) {
      group = { key, title: entry.record.title || 'Proposal', rows: [] };
      groups.push(group);
    }
    group.rows.push(entry);
  });

  return (
    <div className="space-y-12">
      {groups.map((group) => (
        <section key={group.key} data-proposal-group={group.key}>
          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#A79E8C] mb-2">Issued proposal</div>
            <h2 className="text-xl text-[#1B1A1A]" style={{ fontFamily: REPORT_FONT_BODY }}>
              {group.title}
            </h2>
          </div>

          <div className="border-t border-[#E5E1D8]">
            {group.rows.map(({ record, superseded }) => {
              const versions = record.selected_version_ids || [];
              const version = versions.length >= 1 ? versionById.get(versions[0]) : null;
              const current = superseded
                ? { state: LIBRARY_SOURCE_STATE.SUPERSEDED, label: undefined }
                : exportedDocumentStatus({ record, version });

              return (
                <ExportedDocumentRow
                  key={record.id}
                  record={record}
                  versionText={describeDocumentVersions(record, versionNameById)}
                  statusLabel={current.label}
                  superseded={superseded}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}