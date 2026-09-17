// discoverSpeakerDocuments/entry.ts
// ---------------------------------------------------------------------------
// Fetches a manufacturer product page and discovers official document links
// (PDFs, manuals, CAD drawings, spinoramas). No AI, no crawling — just
// "find the official documents" on a single page.
//
// Admin-only. Returns found documents with their types so the wizard can
// show ✅/❌ status per document type.
// ---------------------------------------------------------------------------

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const productUrl = body?.productUrl;
    if (!productUrl) return Response.json({ error: 'Product URL is required' }, { status: 400 });

    // Fetch the product page
    let response: Response;
    try {
      response = await fetch(productUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SoundProofDocumentDiscovery/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15000),
        redirect: 'follow',
      });
    } catch (fetchErr) {
      return Response.json({
        error: `Could not reach the product page: ${fetchErr.message || fetchErr}`,
        documents: [],
      }, { status: 502 });
    }

    if (!response.ok) {
      return Response.json({
        error: `Page returned HTTP ${response.status}`,
        documents: [],
      }, { status: 502 });
    }

    const html = await response.text();
    const documents = parseDocumentLinks(html, productUrl);

    return Response.json({ documents, pageUrl: productUrl });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Parse HTML for document links. Categorizes by URL extension and link text.
 * Returns deduplicated documents with types.
 */
function parseDocumentLinks(html: string, baseUrl: string) {
  const documents: Array<{ document_type: string; url: string; title: string }> = [];
  const seen = new Set<string>();

  // Match <a href="...">...</a> tags
  const linkRegex = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const rawText = match[2]?.replace(/<[^>]*>/g, '').trim() || '';

    // Resolve relative URLs
    let url: string;
    try {
      url = new URL(href, baseUrl).href;
    } catch {
      continue;
    }

    // Only http(s) links
    if (!url.startsWith('http://') && !url.startsWith('https://')) continue;

    const lowerUrl = url.toLowerCase();
    const lowerText = rawText.toLowerCase();

    let docType: string | null = null;

    // PDF detection
    if (lowerUrl.endsWith('.pdf') || lowerUrl.includes('.pdf?') || lowerUrl.includes('.pdf#')) {
      docType = 'PDF';
      // Further categorize by link text
      if (lowerText.includes('manual') || lowerText.includes('user guide') || lowerUrl.includes('manual')) {
        docType = 'Manual';
      } else if (lowerText.includes('cad') || lowerUrl.includes('cad') || lowerUrl.includes('.dwg') || lowerUrl.includes('.dxf')) {
        docType = 'CAD';
      } else if (lowerText.includes('spinorama') || lowerUrl.includes('spinorama') || lowerUrl.includes('directivity') || lowerUrl.includes('polar')) {
        docType = 'Spinorama';
      } else if (lowerText.includes('datasheet') || lowerText.includes('specification') || lowerText.includes('spec sheet')) {
        docType = 'PDF'; // Specification PDF
      }
    }

    // CAD file detection (non-PDF)
    if (!docType && (lowerUrl.endsWith('.dwg') || lowerUrl.endsWith('.dxf') || lowerUrl.endsWith('.step') || lowerUrl.endsWith('.stp'))) {
      docType = 'CAD';
    }

    // Spinorama / directivity data
    if (!docType && (lowerText.includes('spinorama') || lowerText.includes('directivity data') || lowerText.includes('polar measurements'))) {
      docType = 'Spinorama';
    }

    // Manual detection (non-PDF)
    if (!docType && (lowerText.includes('manual') || lowerText.includes('user guide') || lowerText.includes('installation guide'))) {
      // Only if it looks like a document link, not just a page link
      if (lowerUrl.endsWith('.pdf') || lowerUrl.endsWith('.zip') || lowerUrl.includes('download')) {
        docType = 'Manual';
      }
    }

    if (docType && !seen.has(url)) {
      seen.add(url);
      documents.push({
        document_type: docType,
        url,
        title: rawText || docType,
      });
    }
  }

  return documents;
}