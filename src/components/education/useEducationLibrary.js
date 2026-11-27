import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * useEducationLibrary — loads published Education documents for authorised
 * users, newest published first. Also provides signed-URL helpers to preview
 * and download a document's private PDF.
 */
export function useEducationLibrary() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const page = await base44.entities.EducationDocument.filter(
        { published: true },
        { sort: '-published_at', limit: 100 },
      );
      setDocs(page?.items || []);
      setError(null);
    } catch (e) {
      setError(e?.message || 'Failed to load documents');
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { docs, loading, error, refresh };
}

export async function getEducationSignedUrl(fileUri) {
  const res = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri });
  return res?.signed_url || null;
}

export async function openEducationDocument(fileUri) {
  const signedUrl = await getEducationSignedUrl(fileUri);
  if (signedUrl) window.open(signedUrl, '_blank', 'noopener,noreferrer');
  return signedUrl;
}

export async function downloadEducationDocument(fileUri, fileName) {
  const signedUrl = await getEducationSignedUrl(fileUri);
  if (!signedUrl) return;
  const a = document.createElement('a');
  a.href = signedUrl;
  a.download = fileName || 'document.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
}