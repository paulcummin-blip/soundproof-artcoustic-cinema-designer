// Mints short-lived signed URLs for persisted Education document thumbnails
// (private storage). Used by both the public bookshelf and the admin manager
// so a thumbnail is never exposed as a permanent public URL.
import { base44 } from '@/api/base44Client';

const THUMBNAIL_TTL_SECONDS = 3600;

/**
 * Attach a `thumbnailSignedUrl` field to each document by minting a signed
 * URL for its private `thumbnail_file_uri`. Documents without a thumbnail
 * (or whose signing fails) get `thumbnailSignedUrl: null`, which the shelf
 * renders as a branded placeholder.
 */
export async function attachSignedThumbnails(docs) {
  if (!Array.isArray(docs) || docs.length === 0) return docs;
  const results = await Promise.all(
    docs.map(async (d) => {
      if (!d.thumbnail_file_uri) return { ...d, thumbnailSignedUrl: null };
      try {
        const res = await base44.integrations.Core.CreateFileSignedUrl({
          file_uri: d.thumbnail_file_uri,
          expires_in: THUMBNAIL_TTL_SECONDS,
        });
        return { ...d, thumbnailSignedUrl: res?.signed_url || null };
      } catch {
        return { ...d, thumbnailSignedUrl: null };
      }
    }),
  );
  return results;
}

/** Mint a single signed URL for a private thumbnail file_uri. */
export async function signThumbnail(fileUri) {
  if (!fileUri) return null;
  try {
    const res = await base44.integrations.Core.CreateFileSignedUrl({
      file_uri: fileUri,
      expires_in: THUMBNAIL_TTL_SECONDS,
    });
    return res?.signed_url || null;
  } catch {
    return null;
  }
}