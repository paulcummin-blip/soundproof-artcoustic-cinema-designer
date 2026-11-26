import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readProjectRecord } from '@/components/state/projectReadCache';
import useDocumentWorkflowStatus from '@/components/documentWorkflow/useDocumentWorkflowStatus';
import { WORKFLOW_STATE_LABEL } from '@/components/documentWorkflow/documentWorkflowStatus';
import { downloadIssuedDocument, openIssuedDocument, resolveIssuedDocumentUrl } from '@/components/library/issuedDocument/issuedDocumentActions';
import { Button } from '@/components/ui/button';
import BackToProjectLibraryLink from '@/components/report/BackToProjectLibraryLink';
import BackToProposalLink from '@/components/report/BackToProposalLink';
import { useAuth } from '@/lib/AuthContext';
import DocumentDownloadButton from '@/components/documentWorkflow/DocumentDownloadButton';
import { useIssuedDocumentDownload } from '@/components/documentWorkflow/useIssuedDocumentDownload';

// A normal report visit is a stored-file read. It never mounts the composition,
// ADI, snapshot persistence or drawing/capture hooks.
export default function StoredTechnicalReport({ projectId, requestedVersionId, downloadOnOpen = false }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id || null;
  const { download: downloadIssued } = useIssuedDocumentDownload(userId);
  const [version, setVersion] = useState(requestedVersionId || null);
  const [identityError, setIdentityError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setVersion(requestedVersionId || null);
    setIdentityError(null);
    if (!requestedVersionId && projectId) readProjectRecord(projectId).then(project => {
      if (!cancelled) {
        setVersion(project?.active_version_id || null);
        if (!project?.active_version_id) setIdentityError('No active version is available. Return to the project.');
      }
    }).catch(() => { if (!cancelled) setIdentityError('The project could not be read. Reload to retry.'); });
    return () => { cancelled = true; };
  }, [projectId, requestedVersionId]);
  const status = useDocumentWorkflowStatus({ projectId: version ? projectId : null, versionId: version });
  const record = status.technicalReport?.record;
  const [url, setUrl] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFileError(null);
    if (record?.id) resolveIssuedDocumentUrl(record).then(value => {
      if (!cancelled) {
        setUrl(value);
        if (!value) setFileError('The saved PDF is unavailable. Retry retrieval or return to the project.');
      }
    }).catch(() => { if (!cancelled) setFileError('The saved PDF could not be retrieved. Check your connection and retry.'); });
    return () => { cancelled = true; };
  }, [record?.id, record?.file_uri, record?.file_url, retry]);
  const run = async action => {
    if (busy || !record) return;
    setBusy(true); setFileError(null);
    const started = performance.now();
    try {
      await action(record);
      console.info('[StoredReport] retrieval', { record_id: record.id, action: action === downloadIssuedDocument ? 'download' : 'open', elapsed_ms: Math.round(performance.now() - started) });
    } catch (error) { setFileError(error?.message || 'The saved PDF could not be retrieved. Retry retrieval.'); }
    finally { setBusy(false); }
  };
  const downloaded = useRef(false);
  useEffect(() => {
    if (!downloadOnOpen || downloaded.current || !record || status.loading) return;
    downloaded.current = true;
    (async () => {
      try { await downloadIssued(record); }
      catch (error) { setFileError(error?.message || 'The saved PDF could not be retrieved. Retry retrieval.'); }
    })();
  }, [downloadOnOpen, record?.id, status.loading, downloadIssued]);
  const pending = !identityError && (!version || status.loading);
  return <main style={{ padding: 24, fontFamily: 'Didact Gothic, sans-serif' }}>
    <h1>Technical Report</h1>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '16px 0' }}>
      <Button onClick={() => navigate('/RoomDesigner?project=' + encodeURIComponent(projectId || ''))}>Back to Project</Button>
      <BackToProjectLibraryLink projectId={projectId} versionId={version} />
      <BackToProposalLink />
      <Button disabled={!record || busy || status.loading} onClick={() => run(openIssuedDocument)}>Open saved PDF</Button>
      <DocumentDownloadButton
        userId={userId}
        recordId={record?.id || null}
        onDownload={() => downloadIssuedDocument(record)}
        onError={(e) => setFileError(e?.message || 'The saved PDF could not be retrieved. Retry retrieval.')}
        disabled={!record || status.loading}
        className="h-9 px-4 text-[12px] font-medium border-0"
      />
    </div>
    <p role="status">{pending ? 'Checking saved report…' : identityError || status.verificationError || (record ? WORKFLOW_STATE_LABEL[status.technicalReport.state] : 'No completed PDF is stored for this version. Return to Documents & Assets to create or recover the report.')}</p>
    {record && <p>{record.filename}</p>}
    {(fileError || status.verificationError) && <div role="alert"><p>{fileError || status.verificationError}</p><Button onClick={() => { status.retry(); setRetry(value => value + 1); }}>Retry retrieval</Button></div>}
    {url && <iframe title="Saved Technical Report PDF" src={url} style={{ width: '100%', height: '80vh', border: 0 }} />}
  </main>;
}