import { createClientFromRequest } from 'npm:@base44/sdk@0.8.63';

// PDF validation: the uploaded filename must end in .pdf (case-insensitive).
// This runs on the backend so a non-admin client cannot bypass it.
const PDF_EXT = /\.pdf$/i;

function isPdfFileName(name) {
  return typeof name === 'string' && PDF_EXT.test(String(name).trim());
}

function titleFromFileName(name) {
  const base = String(name || '')
    .replace(PDF_EXT, '')
    .replace(/[_]+/g, ' ')
    .trim();
  return base || 'Untitled document';
}

function sanitizeTitle(t) {
  const s = String(t == null ? '' : t).trim();
  return s.slice(0, 200);
}

function sanitizeDescription(d) {
  if (d == null) return null;
  const s = String(d).trim();
  return s.length ? s.slice(0, 1000) : null;
}

function sanitizeFileName(name) {
  return String(name || '').trim().slice(0, 255);
}

function toFileSize(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function toPageCount(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Persisted thumbnail storage URI (private). Any non-empty string is accepted;
// it is a private file_uri minted by UploadPrivateFile, not a public URL.
function toThumbnailFileUri(value) {
  const s = String(value == null ? '' : value).trim();
  return s ? s.slice(0, 2048) : null;
}

/**
 * Admin-only management for the Sound Proof Education Library.
 *
 * Actions:
 *   create        — upload a new PDF (file_uri from UploadPrivateFile), create a draft or published document.
 *   update        — edit title and/or description, and/or refresh the persisted thumbnail + page count. Never touches new_content_at.
 *   replace       — replace the PDF file and its thumbnail/page count, optionally announcing it as new content.
 *   set_published — publish or unpublish a document. Publishing sets published_at and new_content_at to now.
 *   delete        — remove a document.
 *
 * All actions require an authenticated administrator (user.role === 'admin').
 * PDF validation (filename must end in .pdf) is enforced here, not only in the UI.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ error: 'Administrator access required.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    const validActions = ['create', 'update', 'replace', 'set_published', 'delete'];
    if (!validActions.includes(action)) {
      return Response.json({ error: 'action must be one of: create, update, replace, set_published, delete.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const actorName = user.full_name || user.email || 'admin';
    const svc = base44.asServiceRole.entities.EducationDocument;

    const getExisting = async (id) => svc.get(id).catch((e) => (e.status === 404 ? null : Promise.reject(e)));

    if (action === 'create') {
      const { file_uri, file_name, file_size, title, description, published, thumbnail_file_uri, page_count } = body;
      if (!file_uri || typeof file_uri !== 'string') {
        return Response.json({ error: 'file_uri is required.' }, { status: 400 });
      }
      if (!isPdfFileName(file_name)) {
        return Response.json({ error: 'Only PDF files are allowed.' }, { status: 400 });
      }
      const willPublish = published === true;
      const created = await svc.create({
        title: sanitizeTitle(title) || titleFromFileName(file_name),
        description: sanitizeDescription(description),
        file_uri,
        file_name: sanitizeFileName(file_name),
        file_size: toFileSize(file_size),
        file_content_type: 'application/pdf',
        thumbnail_file_uri: toThumbnailFileUri(thumbnail_file_uri),
        page_count: toPageCount(page_count),
        published: willPublish,
        published_at: willPublish ? now : null,
        new_content_at: willPublish ? now : null,
        created_by_name: actorName,
      });
      return Response.json({ ok: true, document: created });
    }

    if (action === 'update') {
      const { id, title, description, thumbnail_file_uri, page_count } = body;
      if (!id) return Response.json({ error: 'id is required.' }, { status: 400 });
      const existing = await getExisting(id);
      if (!existing) return Response.json({ error: 'Document not found.' }, { status: 404 });
      const patch = {};
      if (typeof title !== 'undefined') {
        const t = sanitizeTitle(title);
        if (!t) return Response.json({ error: 'title cannot be empty.' }, { status: 400 });
        patch.title = t;
      }
      if (typeof description !== 'undefined') {
        patch.description = sanitizeDescription(description);
      }
      if (typeof thumbnail_file_uri !== 'undefined') {
        patch.thumbnail_file_uri = toThumbnailFileUri(thumbnail_file_uri);
      }
      if (typeof page_count !== 'undefined') {
        patch.page_count = toPageCount(page_count);
      }
      const updated = await svc.update(id, patch);
      return Response.json({ ok: true, document: updated });
    }

    if (action === 'replace') {
      const { id, file_uri, file_name, file_size, announce_as_new, thumbnail_file_uri, page_count } = body;
      if (!id) return Response.json({ error: 'id is required.' }, { status: 400 });
      if (!file_uri || typeof file_uri !== 'string') {
        return Response.json({ error: 'file_uri is required.' }, { status: 400 });
      }
      if (!isPdfFileName(file_name)) {
        return Response.json({ error: 'Only PDF files are allowed.' }, { status: 400 });
      }
      const existing = await getExisting(id);
      if (!existing) return Response.json({ error: 'Document not found.' }, { status: 404 });
      const patch = {
        file_uri,
        file_name: sanitizeFileName(file_name),
        file_size: toFileSize(file_size),
        file_content_type: 'application/pdf',
        thumbnail_file_uri: toThumbnailFileUri(thumbnail_file_uri),
        page_count: toPageCount(page_count),
      };
      // Announce as new content: refresh the notification timestamp. Only
      // published documents drive the notification, so for a draft this is a
      // no-op until the document is published (which sets new_content_at then).
      if (announce_as_new === true && existing.published === true) {
        patch.new_content_at = now;
      }
      const updated = await svc.update(id, patch);
      return Response.json({ ok: true, document: updated });
    }

    if (action === 'set_published') {
      const { id, published } = body;
      if (!id) return Response.json({ error: 'id is required.' }, { status: 400 });
      if (typeof published !== 'boolean') {
        return Response.json({ error: 'published must be a boolean.' }, { status: 400 });
      }
      const existing = await getExisting(id);
      if (!existing) return Response.json({ error: 'Document not found.' }, { status: 404 });
      const patch = { published };
      // Each unpublished -> published transition stamps published_at and
      // new_content_at so the sidebar 'New' notification fires for users who
      // have not opened Education since.
      if (published === true && existing.published !== true) {
        patch.published_at = now;
        patch.new_content_at = now;
      }
      const updated = await svc.update(id, patch);
      return Response.json({ ok: true, document: updated });
    }

    // action === 'delete'
    const { id } = body;
    if (!id) return Response.json({ error: 'id is required.' }, { status: 400 });
    await getExisting(id); // 404 if missing
    await svc.delete(id);
    return Response.json({ ok: true });
  } catch (error) {
    console.error('[manageEducationDocuments] error:', error?.message || error, error?.stack || '');
    return Response.json({ error: error?.message || 'Operation failed.' }, { status: 500 });
  }
}