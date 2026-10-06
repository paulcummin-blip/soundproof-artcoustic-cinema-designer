/**
 * ProposalWriteAction
 * -------------------
 * The controlled Phase 6 action: ask the GPT writer for this proposal's copy.
 *
 * It exists only while the feature flag is on for this login — the server
 * resolves that and the action renders nothing at all when it is off, so the
 * proposal's own editing flow is unchanged and uncluttered. It is labelled as a
 * test tool, and it says what the writer may write from.
 *
 * The browser submits a proposal id and, on a retry, the attempt being retried.
 * Nothing else: the evidence, the pack, the writer input, the provider call, the
 * validation and the record all happen on the server, and the editor then re-reads
 * the copy layer, so what is shown is always what was stored.
 *
 * Props:
 * - proposalId: the saved proposal
 * - writer: the resolved flag state from the copy layer read
 * - layer: the copy layer (which attempts exist, and which failed)
 * - readOnly: the proposal is archived
 * - onGenerated(): re-read the copy layer after an attempt
 */

import React, { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import {
  REPORT_FONT_BODY as FONT_BODY,
  REPORT_FONT_HEADING as FONT_HEADING,
} from '@/components/report/typography/reportTypography';
import {
  generationOutcomeSentence,
  proposalWriteActionModel,
} from './proposalWriteActionModel';

const BUTTON = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 10,
  marginRight: 8,
  padding: '7px 12px',
  fontFamily: FONT_BODY,
  fontSize: 12,
  color: '#FFFFFF',
  background: '#213428',
  border: '1px solid #213428',
  borderRadius: 6,
  cursor: 'pointer',
};

const QUIET_BUTTON = { ...BUTTON, color: '#213428', background: '#FFFFFF' };

export default function ProposalWriteAction({
  proposalId = null,
  writer = null,
  layer = null,
  readOnly = false,
  onGenerated,
}) {
  const model = proposalWriteActionModel({ writer, layer, readOnly });
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null);

  if (!model.visible || !proposalId) return null;

  const run = async (retryOfGenerationId = null) => {
    setBusy(true);
    setOutcome(null);
    try {
      const response = await base44.functions.invoke('generateProposalCopy', {
        proposal_id: proposalId,
        retry_of_generation_id: retryOfGenerationId,
      });
      const data = response?.data || {};
      if (data.error) {
        setOutcome({ ok: false, message: data.error });
        return;
      }
      setOutcome({ ok: true, message: generationOutcomeSentence(data.status), status: data.status });
      if (typeof onGenerated === 'function') await onGenerated();
    } catch (invokeError) {
      setOutcome({
        ok: false,
        message: invokeError?.response?.data?.error
          || invokeError?.message
          || 'The copy could not be generated.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '0 24px 10px', fontFamily: FONT_BODY, fontSize: 12, color: '#8A8477' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          style={busy ? { ...BUTTON, opacity: 0.6, cursor: 'default' } : BUTTON}
          disabled={busy}
          onClick={() => run(null)}
        >
          {busy ? <Loader2 style={{ width: 14, height: 14 }} /> : <Sparkles style={{ width: 14, height: 14 }} />}
          {busy ? 'Writing the copy…' : model.generate_label}
        </button>

        {model.retry_label && (
          <button
            type="button"
            style={busy ? { ...QUIET_BUTTON, opacity: 0.6, cursor: 'default' } : QUIET_BUTTON}
            disabled={busy}
            onClick={() => run(model.retry_generation_id)}
          >
            {model.retry_label}
          </button>
        )}

        <span style={{
          display: 'inline-flex', alignItems: 'center', padding: '3px 8px', borderRadius: 999,
          border: '1px solid #DCDBD6', background: '#FFFFFF', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.04em', textTransform: 'uppercase', color: '#625143',
        }}>
          {model.beta}
        </span>
      </div>

      {model.disclaimer && (
        <div style={{ marginTop: 6, maxWidth: 720, lineHeight: 1.5 }}>
          <span style={{ fontFamily: FONT_HEADING, color: '#213428' }}>{model.label}. </span>
          {model.disclaimer}
        </div>
      )}

      {outcome && (
        <div style={{ marginTop: 6, maxWidth: 720, lineHeight: 1.5, color: outcome.ok ? '#213428' : '#B23A3A' }}>
          {outcome.message}
        </div>
      )}
    </div>
  );
}