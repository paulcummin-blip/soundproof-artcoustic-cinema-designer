/**
 * usePublicationContent — canonical React hook for reading publication content.
 *
 * Every consumer (About page, Visual Report, Technical Report, Proposal Centre)
 * uses this hook to read the canonical published HTML for a given content_key.
 *
 * Behaviour:
 *  - Starts from the application default from the registry (fallback), which is
 *    bundled with the app and therefore available SYNCHRONOUSLY on the first
 *    render — a consumer that prints immediately still has complete copy.
 *  - Fetches the PublicationContent record for the key.
 *  - If published_html exists and is non-empty, returns it (canonical source).
 *  - Otherwise the built-in default stands, so the section is never empty.
 *  - The app never displays an empty section, and never waits to show copy.
 *
 * Returns: { html, loading, isCustom, refresh }
 */
import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { getDefaultContentHtml } from "./defaultContent";

export function usePublicationContent(contentKey) {
  // The bundled default is in place from the first render: consumers (reports,
  // the About page) always have complete copy, with no waiting state.
  const [html, setHtml] = useState(() => getDefaultContentHtml(contentKey) || null);
  const [loading, setLoading] = useState(true);
  const [isCustom, setIsCustom] = useState(false);

  const refresh = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const records = await base44.entities.PublicationContent.filter(
          { content_key: contentKey },
          "-updated_date",
          1
        );
        const record = Array.isArray(records) && records.length > 0 ? records[0] : null;
        if (cancelled) return;
        const published = record?.published_html;
        if (published && published.trim().length > 0) {
          setHtml(published);
          setIsCustom(true);
        } else {
          setHtml(getDefaultContentHtml(contentKey));
          setIsCustom(false);
        }
      } catch (err) {
        if (cancelled) return;
        // On any error, fall back to default so the section is never empty.
        setHtml(getDefaultContentHtml(contentKey));
        setIsCustom(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [contentKey]);

  useEffect(() => {
    return refresh();
  }, [refresh]);

  return { html, loading, isCustom, refresh };
}