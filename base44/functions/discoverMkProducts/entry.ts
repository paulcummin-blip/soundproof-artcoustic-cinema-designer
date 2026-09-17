// discoverMkProducts/entry.ts
// ---------------------------------------------------------------------------
// Stage 4 — M&K Sound Manufacturer Connector (Discovery Only).
//
// Discovers current M&K loudspeakers and their official documents from the
// official M&K website (mksound.com). This is NOT a crawler, NOT an importer,
// and does NOT perform AI extraction. It feeds the existing Add Speaker
// workflow with discovered product URLs and PDF links.
//
// Pipeline:
//   1. Fetch the official M&K all-products index page (dynamic — no hard-coded
//      product URLs, so new models appear and discontinued ones disappear
//      automatically).
//   2. Parse every product link on the index.
//   3. Classify each product: include LCR / On-wall / In-wall / Surround;
//      exclude Subwoofers, In-ceiling, Outdoor, Accessories, Electronics,
//      Packages.
//   4. For each qualifying product, fetch the product page in parallel and
//      locate the official specification PDF.
//   5. Return the discovered products to the Add Speaker wizard.
//
// Admin-only. No database writes. No AI. No Speaker Database records created.
// ---------------------------------------------------------------------------

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const MK_ALL_PRODUCTS_URL = 'https://www.mksound.com/all-products/';
const MK_BASE_URL = 'https://www.mksound.com';
const FETCH_TIMEOUT_MS = 10000;
const CONCURRENCY = 5;

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    // ── 1. Fetch the all-products index page ────────────────────────────
    let indexHtml: string;
    try {
      const indexResponse = await fetch(MK_ALL_PRODUCTS_URL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SoundProofMkConnector/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'follow',
      });
      if (!indexResponse.ok) {
        return Response.json({
          error: `Could not reach the M&K product index (HTTP ${indexResponse.status})`,
          products: [],
        }, { status: 502 });
      }
      indexHtml = await indexResponse.text();
    } catch (fetchErr: any) {
      return Response.json({
        error: `Could not reach the M&K website: ${fetchErr.message || fetchErr}`,
        products: [],
      }, { status: 502 });
    }

    // ── 2. Parse product links from the index ────────────────────────────
    const allProducts = parseProductLinks(indexHtml);

    if (allProducts.length === 0) {
      return Response.json({
        error: 'No products found on the M&K product index page. The website structure may have changed.',
        products: [],
      }, { status: 502 });
    }

    // ── 3. Classify: include qualifying, exclude others ──────────────────
    const qualifying = allProducts.filter((p) => isQualifyingProduct(p.full_product_name));

    // ── 4. Discover spec PDFs for qualifying products ────────────────────
    const products = await discoverPdfsForProducts(qualifying);

    return Response.json({
      products,
      totalCount: allProducts.length,
      qualifyingCount: qualifying.length,
    });
  } catch (error: any) {
    return Response.json({ error: error.message, products: [] }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Product link parsing — extracts product entries from the all-products page
// ---------------------------------------------------------------------------

interface DiscoveredProduct {
  manufacturer: string;
  series: string;
  model: string;
  full_product_name: string;
  product_url: string;
  pdf_url: string | null;
  status: string;
}

function parseProductLinks(html: string): Array<Omit<DiscoveredProduct, 'pdf_url'>> {
  const products: Array<Omit<DiscoveredProduct, 'pdf_url'>> = [];
  const seen = new Set<string>();

  const linkRegex = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const innerHTML = match[2];

    // Only links to /products/ paths on mksound.com
    if (!href.includes('/products/')) continue;

    let url: string;
    try {
      url = new URL(href, MK_BASE_URL).href;
    } catch {
      continue;
    }
    if (!url.includes('mksound.com')) continue;

    // Skip series/category index pages — need at least 3 path segments
    // (products / series-slug / product-slug)
    const pathParts = new URL(url).pathname.split('/').filter(Boolean);
    if (pathParts.length < 3) continue;

    if (seen.has(url)) continue;
    seen.add(url);

    // Extract product name: strip all HTML tags, clean whitespace
    const rawText = innerHTML
      .replace(/<img[^>]*>/gi, ' ')   // remove images (and their alt text)
      .replace(/<[^>]*>/g, ' ')        // strip remaining tags
      .replace(/&amp;/g, '&')
      .replace(/&reg;/gi, '®')
      .replace(/&trade;/gi, '™')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!rawText) continue;

    // Detect status markers
    let status = 'Current';
    let name = rawText;

    if (/discontinued/i.test(name)) {
      status = 'Discontinued';
      name = name.replace(/\*{0,2}\s*discontinued\s*\*{0,2}/i, '').trim();
    }
    if (/new product/i.test(name)) {
      status = 'Current';
      name = name.replace(/\*{0,2}\s*new product\s*\*{0,2}/i, '').trim();
    }

    // Clean trailing punctuation/asterisks
    name = name.replace(/[*_]+$/g, '').trim();
    if (!name) continue;

    // Extract series from URL path (second segment, e.g. "300-series" → "300 Series")
    const seriesSlug = pathParts[1] || '';
    const series = seriesSlug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    // Extract model (first token of the name)
    const model = name.split(/\s+/)[0] || name;

    products.push({
      manufacturer: 'M&K Sound',
      series,
      model,
      full_product_name: name,
      product_url: url,
      status,
    });
  }

  return products;
}

// ---------------------------------------------------------------------------
// Product classification — include LCR/On-wall/In-wall/Surround, exclude others
// ---------------------------------------------------------------------------

function isQualifyingProduct(name: string): boolean {
  const lower = name.toLowerCase();

  // Exclude subwoofers
  if (/subwoofer/.test(lower)) return false;
  if (/\bsub\b/.test(lower)) return false;

  // Exclude in-ceiling (including dual-mount In-Wall/In-Ceiling)
  if (/in-ceiling/.test(lower)) return false;
  if (/in-wall\/in-ceiling/.test(lower)) return false;

  // Exclude packages / systems
  if (/\bsystem\b/.test(lower)) return false;
  if (/package/.test(lower)) return false;

  // Exclude outdoor
  if (/outdoor/.test(lower)) return false;

  // Exclude accessories
  if (/accessor/.test(lower)) return false;

  // Exclude electronics
  if (/amplifier|receiver|processor|electronic/.test(lower)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// PDF discovery — fetch each product page and find the specification PDF
// ---------------------------------------------------------------------------

async function discoverPdfsForProducts(
  products: Array<Omit<DiscoveredProduct, 'pdf_url'>>,
): Promise<DiscoveredProduct[]> {
  const results: DiscoveredProduct[] = [];

  // Process in batches to avoid overwhelming the server
  for (let i = 0; i < products.length; i += CONCURRENCY) {
    const batch = products.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (p): Promise<DiscoveredProduct> => {
        try {
          const response = await fetch(p.product_url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; SoundProofMkConnector/1.0)',
              'Accept': 'text/html,application/xhtml+xml',
            },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            redirect: 'follow',
          });
          if (!response.ok) {
            return { ...p, pdf_url: null };
          }
          const html = await response.text();
          const pdfUrl = findSpecPdf(html, p.product_url);
          return { ...p, pdf_url: pdfUrl };
        } catch {
          return { ...p, pdf_url: null };
        }
      }),
    );
    results.push(...batchResults);
  }

  return results;
}

function findSpecPdf(html: string, baseUrl: string): string | null {
  const pdfLinks: Array<{ url: string; text: string; score: number }> = [];

  const linkRegex = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const text = match[2]
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    let url: string;
    try {
      url = new URL(href, baseUrl).href;
    } catch {
      continue;
    }

    const lowerUrl = url.toLowerCase();
    if (!lowerUrl.endsWith('.pdf') && !lowerUrl.includes('.pdf?') && !lowerUrl.includes('.pdf#')) {
      continue;
    }

    const lowerText = text.toLowerCase();
    let score = 10; // base score for any PDF

    // Prefer specification / datasheet PDFs
    if (/specification|spec sheet|datasheet|spec\b/.test(lowerText)) score = 100;
    else if (/brochure/.test(lowerText)) score = 60;
    else if (/white\s*paper|whitepaper/.test(lowerText)) score = 50;
    else if (/manual|user guide|installation guide/.test(lowerText)) score = 30;

    // Bonus for keywords in the URL itself
    if (/spec|datasheet/.test(lowerUrl)) score += 20;
    if (/brochure/.test(lowerUrl)) score += 10;

    pdfLinks.push({ url, text, score });
  }

  if (pdfLinks.length === 0) return null;

  // Sort by score descending, return the best
  pdfLinks.sort((a, b) => b.score - a.score);
  return pdfLinks[0].url;
}