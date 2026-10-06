/**
 * ProposalGenerationPanel
 * -----------------------
 * The Proposal Editor's generated-copy surface: the status of the copy, the
 * wording an editor may change, the copy as the client would read it, and the
 * audit behind it.
 *
 * It is a composition and nothing more. Every rule it appears to apply — which
 * copy is shown, whether it may be issued, what is editable, how a block reads —
 * is resolved by the server from the shared Phase 3 and Phase 4 modules, so the
 * editor holds no second copy of a validation rule.
 *
 * A proposal with no generation history is a legacy/manual proposal: it is stated
 * as such, it is never blocked, and the editor carries on working exactly as it
 * did before.
 *
 * Props:
 * - proposal: the saved proposal record
 * - readOnly: the proposal is archived
 * - onBlockedReasonChange(reason|null): reports whether issue/export is blocked,
 *   so the workspace's own export respects the same gate
 */

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, History, PenLine } from 'lucide-react';
import {
  REPORT_FONT_BODY as FONT_BODY,
  REPORT_FONT_HEADING as FONT_HEADING,
} from '@/components/report/typography/reportTypography';
import useProposalEditLayer from './useProposalEditLayer';
import ProposalEditStatusBanner from './ProposalEditStatusBanner';
import ProposalEditFields from './ProposalEditFields';
import ProposalEditCopyPreview from './ProposalEditCopyPreview';
import ProposalEditAuditPanel from './ProposalEditAuditPanel';

const STRIP = {
  padding: '10px 24px',
  background: '#F5F4F0',
  borderBottom: '1px solid #DCDBD6',
  fontFamily: FONT_BODY,
  fontSize: 12,
  color: '#8A8477',
};

const TOGGLE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 10,
  marginRight: 8,
  padding: '7px 12px',
  fontFamily: FONT_BODY,
  fontSize: 12,
  color: '#213428',
  background: '#FFFFFF',
  border: '1px solid #213428',
  borderRadius: 6,
  cursor: 'pointer',
};

export default function ProposalGenerationPanel({ proposal, readOnly = false, onBlockedReasonChange }) {
  const {
    layer,
    loading,
    error,
    saving,
    lastSave,
    saveDrafts,
    revertToCopy,
  } = useProposalEditLayer({ proposalId: proposal?.id ?? null });

  const [showCopy, setShowCopy] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  const blockReason = layer?.export_blocked_reason ?? null;

  useEffect(() => {
    if (typeof onBlockedReasonChange === 'function') onBlockedReasonChange(blockReason);
  }, [blockReason, onBlockedReasonChange]);

  if (!proposal?.id) return null;
  if (loading && !layer) return <div style={STRIP}>Reading the generated copy…</div>;
  if (!layer) {
    return (
      <div style={STRIP}>
        {error
          ? `The generated copy could not be read: ${error}. The proposal’s own sections remain editable.`
          : 'No generated copy for this proposal.'}
      </div>
    );
  }

  return (
    <div>
      <ProposalEditStatusBanner layer={layer}>
        {layer.mode === 'edit_layer' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setShowCopy((open) => !open)}
              style={TOGGLE}
              aria-expanded={showCopy}
            >
              {showCopy ? <ChevronDown style={{ width: 14, height: 14 }} /> : <ChevronRight style={{ width: 14, height: 14 }} />}
              <PenLine style={{ width: 14, height: 14 }} />
              {showCopy ? 'Close copy editor' : 'Edit copy'}
            </button>

            {layer.audit && (
              <button
                type="button"
                onClick={() => setShowAudit((open) => !open)}
                style={TOGGLE}
                aria-expanded={showAudit}
              >
                <History style={{ width: 14, height: 14 }} />
                {showAudit ? 'Hide audit' : 'Audit'}
              </button>
            )}
          </div>
        )}
      </ProposalEditStatusBanner>

      {showCopy && layer.mode === 'edit_layer' && (
        <>
          <ProposalEditFields
            fields={layer.fields}
            busy={saving}
            readOnly={readOnly}
            lastSave={lastSave}
            revertTargets={layer.revert_targets}
            onSave={saveDrafts}
            onRevert={revertToCopy}
          />
          <ProposalEditCopyPreview
            layer={layer}
            title={proposal.title || 'Proposal'}
            readOnly={readOnly}
          />
        </>
      )}

      {showAudit && layer.audit && <ProposalEditAuditPanel audit={layer.audit} />}

      {layer.mode === 'no_valid_generation' && (
        <div style={{ ...STRIP, background: '#FFFFFF' }}>
          <span style={{ fontFamily: FONT_HEADING, color: '#213428' }}>Nothing to edit.</span>
          {' '}
          A validated copy has to exist before its wording can be edited.
        </div>
      )}
    </div>
  );
}