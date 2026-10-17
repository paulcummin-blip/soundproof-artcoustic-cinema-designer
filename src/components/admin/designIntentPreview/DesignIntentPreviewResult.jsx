/**
 * DesignIntentPreviewResult.jsx
 * -----------------------------
 * WHAT THE PRODUCTION WRITER PRODUCED, read back in full for an admin.
 *
 * It reads the pure generation core's own result — the generated Design Intent in the
 * writer's own words and its word count, the prompt version and the fingerprint of the
 * prompt the writer was actually given, the contract and evidence identities, the
 * validation result, and the evidence the attempt used and the evidence it was kept
 * from. A refused attempt is shown as a refusal, with the reason, the validation's own
 * violations and the draft it refused.
 *
 * It is presentation only. It offers no Save, no Approve and no Publish, because the
 * preview wrote nothing to save, approve or publish.
 */

import React from 'react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';

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
    <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: 10, padding: '3px 0' }}>
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

function Block({ label, value }) {
  if (value === null || value === undefined) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontFamily: REPORT_FONT_BODY, fontSize: 12, color: '#625143', marginBottom: 4 }}>{label}</div>
      <pre style={{
        margin: 0,
        padding: 10,
        border: '1px solid #DCDBD6',
        borderRadius: 6,
        background: '#FAFAF9',
        fontFamily: MONO,
        fontSize: 11,
        whiteSpace: 'pre-wrap',
        maxHeight: 260,
        overflow: 'auto',
      }}>
        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export default function DesignIntentPreviewResult({ data }) {
  if (!data) return null;

  const boundary = data.boundary || null;
  const generation = data.generation || null;
  const used = generation?.evidence_used || null;
  const excluded = generation?.evidence_excluded || null;

  // A project, a version or a report that cannot be used: stated plainly, with the
  // boundary it ran under proving nothing was written.
  if (!generation) {
    return (
      <Card title="Preview not run">
        <p style={{ margin: '0 0 10px', fontFamily: REPORT_FONT_BODY, fontSize: 13, color: '#8B4A2B', lineHeight: 1.5 }}>
          {data.error || 'This project and version could not be previewed.'}
        </p>
        <Row
          label="Write attempts"
          value={boundary ? `${boundary.write_attempt_count} (nothing was written)` : '—'}
        />
      </Card>
    );
  }

  const accepted = generation.status === 'accepted';
  const prompt = generation.prompt || {};

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
            {generation.text}
          </p>
        ) : (
          <>
            <p style={{ margin: '0 0 6px', fontFamily: REPORT_FONT_BODY, fontSize: 13, color: '#8B4A2B' }}>
              The writer refused this attempt, so there is no narrative to read.
            </p>
            <Row label="Reason" value={generation.reason} />
            <Row label="Detail" value={generation.detail} mono={false} />
            {(generation.validation_errors || []).map((entry, index) => (
              <Row
                key={index}
                label={`Violation ${index + 1}`}
                value={`${entry?.rejection || entry?.code || 'rejected'}${entry?.detail ? ` — ${entry.detail}` : ''}`}
                mono={false}
              />
            ))}
            <Block label="Refused draft" value={generation.refused_draft} />
          </>
        )}

        <div style={{ marginTop: 12 }}>
          <Row label="Word count" value={generation.word_count} />
        </div>
      </Card>

      <Card title="Prompt and contract">
        <Row
          label="Prompt version"
          value={prompt.version ? `${prompt.version}${prompt.matches_current ? ' (current)' : ' (not current)'}` : null}
        />
        <Row label="Prompt fingerprint matches current" value={prompt.matches_current === true ? 'PASS' : 'FAIL'} />
        <Row label="Prompt version this build defines" value={prompt.current} />
        <Row label="Prompt fingerprint" value={prompt.fingerprint} />
        <Row label="Writer input fingerprint" value={generation.input_fingerprint} />
        <Row label="Contract version" value={generation.contract_version} />
        <Row label="Evidence pack fingerprint" value={generation.evidence_pack_fingerprint} />
        <Row label="Geometry fingerprint" value={generation.geometry_fingerprint} />
        <Row label="Visual context fingerprint" value={generation.visual_fingerprint} />
        <Row label="Section written" value={used?.design_scope} />
        <Row label="Validator word ceiling" value={used?.word_limit} />
        <Row label="ADI interpretation supplied" value={used?.adi_interpretation_supplied ? 'Yes' : 'No'} />
        <Row label="Provider" value={generation.provider} />
        <Row label="Model" value={generation.model} />
        <Row label="Duration" value={generation.duration_ms != null ? `${generation.duration_ms} ms` : null} />
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
        <Row label="Source" value={used?.source} mono={false} />
        <Row label="Pack mode" value={used?.mode} />
        <Row label="Pack schema version" value={used?.pack_schema_version} />
        <Row label="Sections in scope" value={(used?.sections_in_scope || []).join(', ')} />
        <Row label="Selected stories" value={used?.selected_story_count} />
        <Row label="Allowed claims" value={used?.allowed_claim_count} />
        <Row
          label="Pillars the evidence tells"
          value={(used?.pillars || []).map((pillar) => pillar.label || pillar.pillar).join(', ') || null}
        />
        <div style={{ marginTop: 10 }}>
          <div style={{ fontFamily: REPORT_FONT_BODY, fontSize: 12, color: '#625143', marginBottom: 4 }}>
            Strength stories carried into the writer input
          </div>
          <SimpleList
            items={used?.selected_stories}
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
        {used?.design_rationale && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontFamily: REPORT_FONT_BODY, fontSize: 12, color: '#625143', marginBottom: 4 }}>
              Seating design rationale
            </div>
            <p style={{ margin: 0, fontFamily: REPORT_FONT_BODY, fontSize: 12, color: '#3E4349', lineHeight: 1.6 }}>
              {used.design_rationale.statement || used.design_rationale.title || 'Recorded in the frozen evidence.'}
            </p>
          </div>
        )}
      </Card>

      <Card title="Excluded evidence">
        <Row label="Omitted stories" value={excluded?.omitted_story_count} />
        <SimpleList
          items={excluded?.omitted_stories}
          empty="No strength stories were omitted."
          render={(story) => (
            <>
              <span style={{ color: '#1B1A1A' }}>{story.title || story.story_id}</span>
              {story.reason ? ` — ${story.reason}` : ''}
            </>
          )}
        />
        <div style={{ marginTop: 12 }}>
          <Row label="Blocked claims" value={excluded?.blocked_claim_count} />
          <SimpleList
            items={excluded?.blocked_claims}
            empty="No claims were blocked."
            render={(block) => (
              <>
                <span style={{ color: '#1B1A1A' }}>{block.area || block.block_id}</span>
                {block.reason ? ` — ${block.reason}` : ''}
              </>
            )}
          />
        </div>
        <Block label="Supporting results requested by the brief" value={excluded?.supporting_results} />
        {excluded?.truncated && (
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
          value={boundary
            ? `${boundary.write_attempt_count} — every write method on both clients is refused before it reaches the platform`
            : '—'}
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