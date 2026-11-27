import React, { useCallback, useEffect, useRef, useState } from 'react';
import moment from 'moment';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Upload,
  Pencil,
  RefreshCw,
  Eye,
  Download,
  Trash2,
  Check,
  X,
  FileText,
} from 'lucide-react';

const BRAND_GREEN = '#213428';
const SUBTEXT = '#3E4349';
const MUTED = '#625143';

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isPdfFile(file) {
  if (!file) return false;
  const name = file.name || '';
  return /\.pdf$/i.test(name) || (file.type || '').toLowerCase() === 'application/pdf';
}

async function signedUrl(fileUri) {
  const res = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri });
  return res?.signed_url || null;
}

export default function EducationAdminManager() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  // Edit dialog
  const [editDoc, setEditDoc] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Replace dialog
  const [replaceDoc, setReplaceDoc] = useState(null);
  const [replaceFile, setReplaceFile] = useState(null);
  const [announceNew, setAnnounceNew] = useState(false);

  // Delete dialog
  const [deleteDoc, setDeleteDoc] = useState(null);

  const uploadInputRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const page = await base44.entities.EducationDocument.list(
        { sort: '-created_date', limit: 200 },
      );
      setDocs(page?.items || []);
      setError(null);
    } catch (e) {
      setError(e?.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const invoke = async (payload) => {
    const res = await base44.functions.invoke('manageEducationDocuments', payload);
    if (res?.data?.error) throw new Error(res.data.error);
    return res?.data;
  };

  const flash = (msg) => {
    setMessage(msg);
    setError(null);
    setTimeout(() => setMessage(null), 3500);
  };

  const handleUploadSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isPdfFile(file)) {
      setError('Only PDF files are allowed.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const up = await base44.integrations.Core.UploadPrivateFile({ file });
      const fileUri = up?.file_uri;
      if (!fileUri) throw new Error('Upload failed.');
      await invoke({
        action: 'create',
        file_uri: fileUri,
        file_name: file.name,
        file_size: file.size,
        title: file.name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim(),
        published: false,
      });
      flash('Document uploaded as a draft.');
      await refresh();
    } catch (err) {
      setError(err?.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (doc) => {
    setEditDoc(doc);
    setEditTitle(doc.title || '');
    setEditDescription(doc.description || '');
  };

  const submitEdit = async () => {
    if (!editDoc) return;
    setBusy(true);
    try {
      await invoke({
        action: 'update',
        id: editDoc.id,
        title: editTitle,
        description: editDescription,
      });
      setEditDoc(null);
      flash('Document updated.');
      await refresh();
    } catch (err) {
      setError(err?.message || 'Update failed.');
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async (doc) => {
    setBusy(true);
    try {
      await invoke({
        action: 'set_published',
        id: doc.id,
        published: !doc.published,
      });
      flash(doc.published ? 'Document unpublished.' : 'Document published.');
      await refresh();
    } catch (err) {
      setError(err?.message || 'Publish change failed.');
    } finally {
      setBusy(false);
    }
  };

  const openReplace = (doc) => {
    setReplaceDoc(doc);
    setReplaceFile(null);
    setAnnounceNew(false);
  };

  const submitReplace = async () => {
    if (!replaceDoc || !replaceFile) return;
    if (!isPdfFile(replaceFile)) {
      setError('Only PDF files are allowed.');
      return;
    }
    setBusy(true);
    try {
      const up = await base44.integrations.Core.UploadPrivateFile({ file: replaceFile });
      const fileUri = up?.file_uri;
      if (!fileUri) throw new Error('Upload failed.');
      await invoke({
        action: 'replace',
        id: replaceDoc.id,
        file_uri: fileUri,
        file_name: replaceFile.name,
        file_size: replaceFile.size,
        announce_as_new: announceNew,
      });
      setReplaceDoc(null);
      flash(announceNew && replaceDoc.published ? 'PDF replaced and announced as new content.' : 'PDF replaced.');
      await refresh();
    } catch (err) {
      setError(err?.message || 'Replace failed.');
    } finally {
      setBusy(false);
    }
  };

  const submitDelete = async () => {
    if (!deleteDoc) return;
    setBusy(true);
    try {
      await invoke({ action: 'delete', id: deleteDoc.id });
      setDeleteDoc(null);
      flash('Document removed.');
      await refresh();
    } catch (err) {
      setError(err?.message || 'Delete failed.');
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = async (doc) => {
    try {
      const url = await signedUrl(doc.file_uri);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err?.message || 'Preview failed.');
    }
  };

  const handleDownload = async (doc) => {
    try {
      const url = await signedUrl(doc.file_uri);
      if (!url) return;
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name || 'document.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(err?.message || 'Download failed.');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, color: '#1B1A1A', fontFamily: "'Didact Gothic', sans-serif" }}>
            Education Library
          </h1>
          <div style={{ fontSize: 13, color: SUBTEXT, marginTop: 4 }}>
            Upload, publish, replace and remove technical PDF guides shared with all Sound Proof users.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            ref={uploadInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleUploadSelect}
            style={{ display: 'none' }}
          />
          <Button onClick={() => uploadInputRef.current?.click()} disabled={busy}>
            <Upload size={16} style={{ marginRight: 6 }} />
            Upload PDF
          </Button>
        </div>
      </div>

      {message ? (
        <div style={{ padding: '10px 14px', background: '#EDF3EF', border: '1px solid #213428', borderRadius: 6, color: BRAND_GREEN, fontSize: 13, marginBottom: 14 }}>
          {message}
        </div>
      ) : null}
      {error ? (
        <div style={{ padding: '10px 14px', background: '#FBEAEA', border: '1px solid #D9534F', borderRadius: 6, color: '#9B2C2C', fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: SUBTEXT }}>Loading…</div>
      ) : docs.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: SUBTEXT, background: '#FFFFFF', border: '1px solid #DCDBD6', borderRadius: 8 }}>
          No documents yet. Click <strong>Upload PDF</strong> to add the first one.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {docs.map((doc) => (
            <div
              key={doc.id}
              style={{
                background: '#FFFFFF',
                border: '1px solid #DCDBD6',
                borderRadius: 8,
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 260px', minWidth: 260 }}>
                <FileText size={22} strokeWidth={1.6} style={{ color: BRAND_GREEN, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#1B1A1A', wordBreak: 'break-word' }}>
                    {doc.title}
                  </div>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                    {doc.file_name}{formatBytes(doc.file_size) ? ` · ${formatBytes(doc.file_size)}` : ''}
                    {' · '}{moment(doc.created_date).format('D MMM YYYY')}
                  </div>
                  {doc.description ? (
                    <div style={{ fontSize: 12, color: SUBTEXT, marginTop: 4 }}>{doc.description}</div>
                  ) : null}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                    padding: '3px 8px', borderRadius: 4,
                    background: doc.published ? '#EDF3EF' : '#F3EFEA',
                    color: doc.published ? BRAND_GREEN : '#8A6F5C',
                    border: `1px solid ${doc.published ? '#213428' : '#E2DDD6'}`,
                  }}
                >
                  {doc.published ? 'Published' : 'Draft'}
                </span>

                <IconAction title="Edit" onClick={() => openEdit(doc)} disabled={busy}>
                  <Pencil size={15} />
                </IconAction>
                <IconAction title="Preview" onClick={() => handlePreview(doc)} disabled={busy}>
                  <Eye size={15} />
                </IconAction>
                <IconAction title="Download" onClick={() => handleDownload(doc)} disabled={busy}>
                  <Download size={15} />
                </IconAction>
                <IconAction title="Replace PDF" onClick={() => openReplace(doc)} disabled={busy}>
                  <RefreshCw size={15} />
                </IconAction>
                <Button
                  variant={doc.published ? 'outline' : 'brand'}
                  size="sm"
                  onClick={() => togglePublish(doc)}
                  disabled={busy}
                >
                  {doc.published ? 'Unpublish' : 'Publish'}
                </Button>
                <IconAction title="Delete" onClick={() => setDeleteDoc(doc)} disabled={busy} danger>
                  <Trash2 size={15} />
                </IconAction>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editDoc} onOpenChange={(o) => !o && setEditDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit document</DialogTitle>
            <DialogDescription>Update the title and optional description. This does not change the PDF or notify users.</DialogDescription>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8 }}>
            <div>
              <Label style={{ fontSize: 12, color: SUBTEXT, marginBottom: 6, display: 'block' }}>Title</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div>
              <Label style={{ fontSize: 12, color: SUBTEXT, marginBottom: 6, display: 'block' }}>Description (optional)</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={4}
                maxLength={1000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDoc(null)} disabled={busy}>Cancel</Button>
            <Button onClick={submitEdit} disabled={busy || !editTitle.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Replace dialog */}
      <Dialog open={!!replaceDoc} onOpenChange={(o) => !o && setReplaceDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace PDF</DialogTitle>
            <DialogDescription>
              Upload a new PDF to replace the current file. The title and description are kept.
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8 }}>
            <div>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => {
                  setReplaceFile(e.target.files?.[0] || null);
                  e.target.value = '';
                }}
                style={{ fontSize: 13 }}
              />
              {replaceFile ? (
                <div style={{ fontSize: 12, color: SUBTEXT, marginTop: 6 }}>
                  Selected: {replaceFile.name}
                </div>
              ) : null}
            </div>
            {replaceDoc?.published ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: SUBTEXT, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={announceNew}
                  onChange={(e) => setAnnounceNew(e.target.checked)}
                />
                Announce as new content (shows the Education "New" badge for users again)
              </label>
            ) : (
              <div style={{ fontSize: 12, color: MUTED }}>
                This document is a draft. Publish it to make the replacement visible and notify users.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplaceDoc(null)} disabled={busy}>Cancel</Button>
            <Button onClick={submitReplace} disabled={busy || !replaceFile}>Replace PDF</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteDoc} onOpenChange={(o) => !o && setDeleteDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove document</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove "{deleteDoc?.title}"? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDoc(null)} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={submitDelete} disabled={busy}>
              <Trash2 size={15} style={{ marginRight: 6 }} />
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IconAction({ title, onClick, disabled, danger, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 6,
        border: '1px solid #DCDBD6', background: '#FFFFFF',
        color: danger ? '#9B2C2C' : BRAND_GREEN,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}