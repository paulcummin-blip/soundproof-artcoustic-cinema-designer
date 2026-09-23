/**
 * usePublicationContent — canonical React hook for reading publication content.
 *
 * Every consumer (About page, Visual Report, Technical Report, Proposal Centre)
 * uses this hook to read the canonical published HTML for a given content_key.
 *
 * Behaviour:
 *  - Fetches the PublicationContent record for the key.
 *  - If published_html exists and is non-empty, returns it (canonical source).
 *  - Otherwise returns the application default from the registry (fallback).
 *  - The app never displays an empty section.
 *
 * Returns: { html, loading, isCustom, refresh }
 */
import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { getDefaultContentHtml } from "./defaultContent";

export function usePublicationContent(contentKey) {
  const [html, setHtml] = useState(null);
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