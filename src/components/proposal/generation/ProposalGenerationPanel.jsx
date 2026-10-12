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
 * Regeneration is offered here only while the feature flag is on for this login
 * AND only to a master admin, as a secondary action rather than part of the
 * dealer's workflow: a proposal generated through Create Proposal has already
 * been written by the approved writer, and its validated copy is what the
 * document below shows. Everything the action needs — whether to exist at all —
 * is resolved by the server with the copy layer, so nothing in this panel can
 * switch it on.
 *
 * The generation's own diagnostics are NOT here. The model and provider, the
 * prompt version, the fingerprints, the record IDs and the report-snapshot counts
 * are internal evidence, and reading them is an administrative task: the server
 * sends that audit block to a master admin only, and the administrative
 * diagnostics view is the one surface that asks for it. This panel — the editor a
 * dealer uses — shows the copy, its status and its plain-language issues.
 *
 * Props:
 * - proposal: the saved proposal record
 * - readOnly: the proposal is archived
 * - onBlockedReasonChange(reason|null): reports whether issue/export is blocked,
 *   so the workspace's own export respects the same gate
 */

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, PenLine } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { isMasterAdmin } from '@/lib/accountAccess';
import {
  REPORT_FONT_BODY as FONT_BODY,
  REPORT_FONT_HEADING as FONT_HEADING,
} from '@/components/report/typography/reportTypography';
import useProposalEditLayer from './useProposalEditLayer';
import ProposalEditStatusBanner from './ProposalEditStatusBanner';
import ProposalEditFields from './ProposalEditFields';
import ProposalEditCopyPreview from './ProposalEditCopyPreview';
import ProposalWriteAction from './ProposalWriteAction';

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

export default function ProposalGenerationPanel({ proposal, readOnly = false, onBlockedReasonChange, onLayerChange, documentRevision = '' }) {
  const {
    layer,
    writer,
    loading,
    error,
    saving,
    lastSave,
    refresh,
    saveDrafts,
    revertToCopy,
  } = useProposalEditLayer({ proposalId: proposal?.id ?? null });

  // Normal proposal generation IS the approved writer, so a normally generated
  // proposal already carries its validated copy and a dealer has nothing to press
  // here. What remains is the controlled test tool and the diagnostic wording,
  // and both are for a master admin: a dealer's workflow is generate, review,
  // edit, export. The copy's own status is shown to everyone.
  const { user } = useAuth();
  const masterAdmin = isMasterAdmin(user);

  const [showCopy, setShowCopy] = useState(false);

  const blockReason = error || (loading || layer?.proposal_id !== proposal?.id ? 'Checking complete proposal…' : (layer?.export_blocked_reason || null));

  useEffect(() => {
    onLayerChange?.(layer?.proposal_id && layer.proposal_id !== proposal?.id ? null : layer);
  }, [layer, onLayerChange, proposal?.id]);

  // Saved section edits and visibility changes invalidate the previous gate.
  const previousRevision = React.useRef(documentRevision);
  useEffect(() => {
    if (previousRevision.current === documentRevision) return;
    previousRevision.current = documentRevision;
    refresh();
  }, [documentRevision, refresh]);

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
      <ProposalEditStatusBanner layer={layer} masterAdmin={masterAdmin}>
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
          </div>
        )}
      </ProposalEditStatusBanner>

      {/* Phase 6: the controlled GPT writer action, present only while the flag
          is on for this login. It writes a generation record; this panel then
          re-reads the layer, so the copy shown is always the stored one. */}
      <ProposalWriteAction
        proposalId={proposal.id}
        writer={writer}
        layer={layer}
        readOnly={readOnly}
        masterAdmin={masterAdmin}
        onGenerated={refresh}
      />

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
            proposalId={proposal.id}
            title={proposal.title || 'Proposal'}
            readOnly={readOnly}
          />
        </>
      )}

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