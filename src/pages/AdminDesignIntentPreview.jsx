/**
 * AdminDesignIntentPreview
 * ------------------------
 * /admin/design-intent-preview
 *
 * THE ADMIN-ONLY, READ-ONLY TEST BED for the Project Report's Design Intent writer.
 * It runs the real production writer — the same shared path generateReportDesignIntent
 * saves from — against any existing project and design version, and shows what it
 * produced: the narrative, its word count, the prompt version and prompt fingerprint,
 * the project and version it was written for, and the evidence it used and was kept
 * from.
 *
 * IT SAVES NOTHING. There is no Save, no Approve and no Publish, because there is
 * nothing to save: the backend runs the production attempt with entity clients that
 * refuse every write, and reports the count of write attempts, which is always zero.
 * The report, the version, the approval state, the readiness state and the published
 * engineering are left exactly as they were, so the writer can be exercised across
 * as many projects as needed — a projector cinema, a TV media room, one row or two,
 * 5.1.4 or 9.1.6, a strong result or a compromised one — without touching any of them.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useActiveProjectId } from '@/components/state/project-session';
import {
  REPORT_FONT_BODY as FONT_BODY,
  REPORT_FONT_HEADING as FONT_HEADING,
} from '@/components/report/typography/reportTypography';
import useDesignIntentPreview from '@/components/admin/designIntentPreview/useDesignIntentPreview';
import PreviewTargetPicker from '@/components/admin/designIntentPreview/PreviewTargetPicker';
import DesignIntentPreviewResult from '@/components/admin/designIntentPreview/DesignIntentPreviewResult';

export default function AdminDesignIntentPreview() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === 'admin';
  const activeProjectId = useActiveProjectId();

  const preview = useDesignIntentPreview(activeProjectId || null);
  const hasResult = Boolean(preview.preview);

  if (isLoadingAuth) {
    return <div style={{ padding: 48, textAlign: 'center', fontFamily: FONT_BODY, color: '#3E4349' }}>Checking access…</div>;
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 48, textAlign: 'center', fontFamily: FONT_BODY, color: '#3E4349' }}>
        <div style={{ fontSize: 32 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1B1A1A', marginTop: 8 }}>Access Denied</div>
        <div style={{ fontSize: 14, marginTop: 4 }}>This tool is restricted to admin users.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, background: 'rgb(248 248 247)', minHeight: '100vh', color: '#1B1A1A' }}>
      <div style={{ marginBottom: 16 }}>
        <Link to="/admin" style={{ fontFamily: FONT_BODY, fontSize: 13, color: '#3E4349', textDecoration: 'none' }}>
          <ArrowLeft style={{ display: 'inline', width: 13, height: 13, marginRight: 4 }} />
          Back to Admin Dashboard
        </Link>
      </div>

      <h1 style={{ margin: 0, fontFamily: FONT_HEADING, fontSize: 24, fontWeight: 400, color: '#213428' }}>
        Design Intent preview
      </h1>
      <p style={{ margin: '6px 0 20px', fontFamily: FONT_BODY, fontSize: 13, color: '#625143', lineHeight: 1.6, maxWidth: 900 }}>
        Runs the production Design Intent writer against a real project and design version, using the current
        authoritative evidence, the current writing contract, the current Design Intent prompt and the current prompt
        fingerprint. It is read-only: nothing is saved, approved, published or regenerated, and the project you pick is
        left completely untouched. Choose another project or version to test a different cinema.
      </p>

      <div style={{
        background: '#FFFFFF',
        border: '1px solid #DCDBD6',
        borderRadius: 10,
        padding: 18,
      }}>
        <PreviewTargetPicker
          projects={preview.projects}
          versions={preview.versions}
          projectId={preview.projectId}
          versionId={preview.versionId}
          onProjectChange={preview.chooseProject}
          onVersionChange={preview.chooseVersion}
          disabled={preview.busy}
        />

        <div className="flex items-center gap-3" style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={preview.runPreview}
            disabled={preview.busy || !preview.projectId || !preview.versionId}
            style={{
              fontFamily: FONT_BODY,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '0.03em',
              color: '#FFFFFF',
              background: '#213428',
              border: '1px solid #213428',
              borderRadius: 8,
              padding: '9px 18px',
              cursor: preview.busy ? 'default' : 'pointer',
              opacity: preview.busy || !preview.projectId || !preview.versionId ? 0.55 : 1,
            }}
          >
            {preview.busy
              ? 'Writing the Design Intent…'
              : hasResult ? 'Regenerate Preview' : 'Preview Design Intent'}
          </button>

          {preview.busy && (
            <span style={{ fontFamily: FONT_BODY, fontSize: 12, color: '#625143' }}>
              Running the production writer…
            </span>
          )}

          {preview.targetError && (
            <span style={{ fontFamily: FONT_BODY, fontSize: 12, color: '#8B4A2B' }}>{preview.targetError}</span>
          )}
        </div>
      </div>

      {preview.error && (
        <p style={{ marginTop: 16, fontFamily: FONT_BODY, fontSize: 13, color: '#8B4A2B' }}>{preview.error}</p>
      )}

      <DesignIntentPreviewResult data={preview.preview} />
    </div>
  );
}