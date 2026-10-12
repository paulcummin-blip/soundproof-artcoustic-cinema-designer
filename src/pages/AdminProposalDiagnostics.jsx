/**
 * AdminProposalDiagnostics
 * ------------------------
 * The administrative view of a proposal's generation history: the frozen
 * generation record it was written from, every edit filed against it, and the
 * identifiers each was filed under.
 *
 * It is deliberately NOT part of the Proposal Editor. The editor a dealer uses
 * shows the copy, its status and its plain-language issues; the model and provider
 * names, prompt versions, fingerprints, record IDs and report counts the
 * diagnostics state are internal evidence, and reading them is an administrative
 * task. The server returns that audit block to a master admin only, and this page
 * is the one surface that asks for it:
 *
 *   /admin/proposal-diagnostics?proposalId=<id>
 *
 * The page renders the model the server resolved and decides nothing of its own.
 * It reads: it never writes, regenerates, validates, issues or exports, and the
 * proposal's own records and copy are left exactly as they are.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  REPORT_FONT_BODY as FONT_BODY,
  REPORT_FONT_HEADING as FONT_HEADING,
} from '@/components/report/typography/reportTypography';
import useProposalEditLayer from '@/components/proposal/generation/useProposalEditLayer';
import ProposalEditAuditPanel from '@/components/proposal/generation/ProposalEditAuditPanel';

export default function AdminProposalDiagnostics() {
  const urlParams = new URLSearchParams(window.location.search);
  const proposalId = urlParams.get('proposalId') || urlParams.get('id') || null;

  const { layer, loading, error } = useProposalEditLayer({ proposalId });

  return (
    <div style={{ padding: '24px', maxWidth: 1100 }}>
      <h1 style={{ margin: 0, fontFamily: FONT_HEADING, fontSize: 22, fontWeight: 400, color: '#213428' }}>
        Proposal diagnostics
      </h1>
      <p style={{ margin: '6px 0 16px', fontFamily: FONT_BODY, fontSize: 13, color: '#625143', lineHeight: 1.6 }}>
        The generation and edit history behind one proposal. This view is administrative: it is kept out of the
        Proposal Editor, so the identifiers, fingerprints and counts below are never shown to a dealer or a client.
      </p>

      {!proposalId ? (
        <p style={{ fontFamily: FONT_BODY, fontSize: 13, color: '#8A8477' }}>
          Open this page with a proposal id: /admin/proposal-diagnostics?proposalId=…
        </p>
      ) : (
        <>
          <Link
            to="/ProposalCentre"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONT_BODY, fontSize: 13, color: '#213428' }}
          >
            <ArrowLeft style={{ width: 14, height: 14 }} />
            Proposal Centre
          </Link>

          {loading && (
            <p style={{ fontFamily: FONT_BODY, fontSize: 13, color: '#8A8477' }}>Reading the generation history…</p>
          )}

          {!loading && error && (
            <p style={{ fontFamily: FONT_BODY, fontSize: 13, color: '#8B4A2B' }}>{error}</p>
          )}

          {!loading && !error && (layer?.audit
            ? <ProposalEditAuditPanel audit={layer.audit} />
            : (
              <p style={{ fontFamily: FONT_BODY, fontSize: 13, color: '#8A8477' }}>
                No generation history is recorded for this proposal.
              </p>
            ))}
        </>
      )}
    </div>
  );
}