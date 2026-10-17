/**
 * DesignIntentPreviewResult.jsx
 * -----------------------------
 * WHAT THE PRODUCTION WRITER PRODUCED, read back in full for an admin.
 *
 * It shows the generated Design Intent in the writer's own words, its word count,
 * the prompt version and the prompt fingerprint of the prompt that was actually
 * built, the project and version it was written for, the evidence the attempt used
 * and the evidence it was kept from. A refused attempt is shown as a refusal, with
 * the reason, the validation's own violations and the draft it refused.
 *
 * It is presentation only. It offers no Save, no Approve and no Publish, because the
 * preview wrote nothing to save, approve or publish.
 */

import React from 'react';
import { REPORT_FONT_BODY, REPORT_FONT_HEADING } from '@/components/report/typography/reportTypography';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

function Card({ title, children }) {
  return (
    <section style={{ background: '#FFFFFF', border: '1px solid #DCDBD6', borderRadius: 10, padding: 18, marginTop: 16 }}>
      <h3 style={{
        margin: '0 0 10px',
        fontFamily: REPORT_FONT_BODY,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#625143',
      }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value, mono = true }) {
  const shown = value === null || value === undefined || value === '' ? '—' : String(value);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 10, padding: '3px 0' }}>
      <div style={{ fontFamily: REPORT_FONT_BODY, fontSize: 12, color: '#625143' }}>{label}</div>
      <div style={{ fontFamily: mono ? MONO : REPORT_FONT_BODY, fontSize: 12, color: '#1B1A1A', wordBreak: 'break-word' }}>
        {shown}
      </div>
    </div>
  );
}

function SimpleList({ items, render, empty }) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) {
    return <p style={{ margin: 0, fontFamily: REPORT_FONT_BODY, fontSize: 12, color: '#8A8477' }}>{empty}</p>;
  }
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {list.map((item, index) => (
        <li key={index} style={{ fontFamily: REPORT_FONT_BODY, fontSize: 12, color: '#3E4349', marginBottom: 3 }}>
          {render(item)}
        </li>
      ))}
    </ul>
  );
}

export default function DesignIntentPreviewResult({ data }) {
  if (!data) return null;

  const boundary = data.boundary || null;
  const writer = data.writer || null;
  const result = data.result || null;
  const evidence = data.evidence || null;
  const accepted = data.ok === true && result?.status === 'accepted';

  // A project, a version or a report that cannot be used: stated plainly, with the
  // boundary it ran under proving nothing was written.
  if (data.ok !== true && !result) {
    return (
      <Card title="Preview not run">
        <p style={{ margin: '0 0 10px', fontFamily: REPORT_FONT_BODY, fontSize: 13, color: '#8B4A2B', lineHeight: 1.5 }}>
          {data.error || 'This project and version could not be previewed.'}
        </p>
        <Row label="Write attempts" value={boundary ? `${boundary.write_attempt_count} (nothing was written)` : '—'} />
      </Card>
    );
  }

  return (
    <>
      <Card title="Generated Design Intent">
        <div className="flex items-center gap-3" style={{ marginBottom: 10 }}>
          <span style={{
            fontFamily: REPORT_FONT_BODY,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            padding: '3px 10px',
            borderRadius: 999,
            border: '1px solid #DCDBD6',
            background: accepted ? '#EAF2EC' : '#F6EDE9',
            color: accepted ? '#213428' : '#8B4A2B',
          }}>
            {accepted ? 'ACCEPTED' : 'REFUSED'}
          </span>
          <span style={{ fontFamily: REPORT_FONT_BODY, fontSize: 12, color: '#625143' }}>
            Preview only. Nothing was saved, approved, published or regenerated.
          </span>
        </div>

        {accepted ? (
          <p style={{
            margin: 0,
            fontFamily: REPORT_FONT_BODY,
            fontSize: 15,
            lineHeight: 1.7,
            color: '#1B1A1A',
            whiteSpace: 'pre-wrap',
            maxWidth: 900,
          }}>
            {result.text}
          </p>
        ) : (
          <>
            <p style={{ margin: '0 0 6px', fontFamily: REPORT_FONT_BODY, fontSize: 13, color: '#8B4A2B' }}>
              The writer refused this attempt, so there is no narrative to read.
            </p>
            <Row label="Reason" value={result.reason} />
            <Row label="Detail" value={result.detail} mono={false} />
            {(result.validation_errors || []).map((entry, index) => (
              <Row
                key={index}
                label={`Violation ${index + 1}`}
                value={`${entry?.rejection || entry?.code || 'rejected'}${entry?.detail ? ` — ${entry.detail}` : ''}`}
                mono={false}
              />
            ))}
            {result.refused_draft !== null && result.refused_draft !== undefined && (
              <pre style={{
                marginTop: 10,
                padding: 10,
                border: '1px solid #DCDBD6',
                borderRadius: 6,
                background: '#FAFAF9',
                fontFamily: MONO,
                fontSize: 11,
                whiteSpace: 'pre-wrap',
                maxHeight: 320,
                overflow: 'auto',
              }}>
                {typeof result.refused_draft === 'string' ? result.refused_draft : JSON.stringify(result.refused_draft, null, 2)}
              </pre>
            )}
          </>
        )}

        <div style={{ marginTop: 12 }}>
          <Row label="Word count" value={accepted ? result.word_count : '—'} />
        </div>
      </Card>

      <Card title="Prompt and contract">
        <Row
          label="Prompt version"
          value={writer?.prompt_version ? `${writer.prompt_version}${writer.prompt_fingerprint_matches_current ? ' (current)' : ' (not current)'}` : null}
        />
        <Row label="Prompt fingerprint matches current" value={writer?.prompt_fingerprint_matches_current === true ? 'PASS' : 'FAIL'} />
        <Row label="Prompt fingerprint" value={writer?.prompt_fingerprint} />
        <Row label="Writer input fingerprint" value={writer?.input_fingerprint} />
        <Row label="Contract version" value={writer?.contract_version} />
        <Row label="Evidence pack fingerprint" value={writer?.evidence_pack_fingerprint} />
        <Row label="Geometry fingerprint" value={writer?.geometry_fingerprint} />
        <Row label="Visual context fingerprint" value={writer?.visual_fingerprint} />
        <Row label="Section written" value={writer?.design_scope} />
        <Row label="Validator word ceiling" value={writer?.word_limit} />
        <Row label="ADI interpretation supplied" value={writer?.adi_interpretation_supplied ? 'Yes' : 'No'} />
        <Row label="Provider" value={writer?.provider} />
        <Row label="Model" value={writer?.model} />
        <Row label="Duration" value={writer?.duration_ms != null ? `${writer.duration_ms} ms` : null} />
      </Card>

      <Card title="Project and version">
        <Row label="Project" value={data.project?.name} mono={false} />
        <Row label="Client" value={data.project?.client_name} mono={false} />
        <Row label="Project reference" value={data.project?.project_reference} />
        <Row label="Design version" value={data.version?.version_name} mono={false} />
        <Row label="Project Report snapshot" value={data.report?.snapshot_id} />
        <Row label="Report generated" value={data.report?.generated_at} />
        <Row label="Report status" value={data.report?.status} />
      </Card>

      <Card title="Evidence used">
        <Row label="Source" value={evidence?.source} mono={false} />
        <Row label="Pack mode" value={evidence?.mode} />
        <Row label="Pack schema version" value={evidence?.pack_schema_version} />
        <Row label="Sections in scope" value={(evidence?.sections_in_scope || []).join(', ')} />
        <Row label="Selected stories" value={evidence?.selected_story_count} />
        <Row label="Allowed claims" value={evidence?.allowed_claim_count} />
        <div style={{ marginTop: 10 }}>
          <Row label="Pillars the evidence tells" value={(evidence?.pillars || []).map((p) => p.label || p.pillar).join(', ') || null} />
        </div>
        <div style={{ marginTop: 10 }}>
          <div style={{ fontFamily: REPORT_FONT_BODY, fontSize: 12, color: '#625143', marginBottom: 4 }}>
            Strength stories carried into the writer input
          </div>
          <SimpleList
            items={evidence?.selected_stories}
            empty="No strength stories were carried."
            render={(story) => (
              <>
                <span style={{ color: '#1B1A1A', fontWeight: 600 }}>{story.title || story.story_id}</span>
                {story.level ? ` · ${story.level}` : ''}
                {story.scope ? ` · ${story.scope}` : ''}
              </>
            )}
          />
        </div>
        {evidence?.design_rationale && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontFamily: REPORT_FONT_BODY, fontSize: 12, color: '#625143', marginBottom: 4 }}>
              Seating design rationale
            </div>
            <p style={{ margin: 0, fontFamily: REPORT_FONT_BODY, fontSize: 12, color: '#3E4349', lineHeight: 1.6 }}>
              {evidence.design_rationale.statement || evidence.design_rationale.title || 'Recorded in the frozen evidence.'}
            </p>
          </div>
        )}
      </Card>

      <Card title="Excluded evidence">
        <Row label="Omitted stories" value={evidence?.excluded?.omitted_story_count} />
        <SimpleList
          items={evidence?.excluded?.omitted_stories}
          empty="No strength stories were omitted."
          render={(story) => (
            <>
              <span style={{ color: '#1B1A1A' }}>{story.title || story.story_id}</span>
              {story.reason ? ` — ${story.reason}` : ''}
            </>
          )}
        />
        <div style={{ marginTop: 12 }}>
          <Row label="Blocked claims" value={evidence?.excluded?.blocked_claim_count} />
          <SimpleList
            items={evidence?.excluded?.blocked_claims}
            empty="No claims were blocked."
            render={(block) => (
              <>
                <span style={{ color: '#1B1A1A' }}>{block.area || block.block_id}</span>
                {block.reason ? ` — ${block.reason}` : ''}
              </>
            )}
          />
        </div>
        {evidence?.excluded?.supporting_results && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontFamily: REPORT_FONT_BODY, fontSize: 12, color: '#625143', marginBottom: 4 }}>
              Supporting results requested by the brief
            </div>
            <pre style={{
              margin: 0,
              padding: 10,
              border: '1px solid #DCDBD6',
              borderRadius: 6,
              background: '#FAFAF9',
              fontFamily: MONO,
              fontSize: 11,
              whiteSpace: 'pre-wrap',
              maxHeight: 240,
              overflow: 'auto',
            }}>
              {JSON.stringify(evidence.excluded.supporting_results, null, 2)}
            </pre>
          </div>
        )}
        {evidence?.excluded?.truncated && (
          <p style={{ margin: '10px 0 0', fontFamily: REPORT_FONT_BODY, fontSize: 11, color: '#8A8477' }}>
            The lists above are capped for readability; the counts are complete.
          </p>
        )}
      </Card>

      <Card title="Boundary">
        <Row label="Report written" value="No" />
        <Row label="Project or version written" value="No" />
        <Row label="Approval or publication changed" value="No" />
        <Row label="Readiness changed" value="No" />
        <Row
          label="Write attempts by this preview"
          value={boundary ? `${boundary.write_attempt_count} — every write method on both clients is refused before it reaches the platform` : '—'}
          mono={false}
        />
        <Row label="Entity reads made" value={boundary?.reads} />
        <p style={{ margin: '10px 0 0', fontFamily: REPORT_FONT_BODY, fontSize: 11, color: '#8A8477', lineHeight: 1.6, maxWidth: 820 }}>
          {data.notice || 'READ-ONLY. Nothing was saved.'}
        </p>
      </Card>
    </>
  );
}