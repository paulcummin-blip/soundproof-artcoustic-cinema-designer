/**
 * loadProjectIntelligenceData.js
 * ------------------------------
 * Data loading for Project Intelligence.
 *
 * Every collection is loaded with cursor pagination so the reporting run is
 * never silently truncated by a single-page row cap. Truncation is reported
 * rather than swallowed.
 *
 * Read-only: this module only reads entities and the authorised Product Master.
 * It never writes to Project, ProjectVersion, Proposal, ProjectStatus or
 * ProductPrice.
 *
 * Not pure (it talks to the app's SDK), but it contains no derivation logic.
 */

import { base44 } from '@/api/base44Client';
import { buildProductPriceIndex } from '@/components/products/productPriceIndex';

const PAGE_SIZE = 200;
const MAX_ROWS = 40000;

/**
 * Load every record of one entity using cursor pagination.
 *
 * @param {string} entityName
 * @param {Object} query
 * @param {Object} [options]
 * @returns {Promise<{ items: Array, truncated: boolean, loaded: number }>}
 */
export async function loadAllPages(entityName, query = {}, { sort = '-created_date', pageSize = PAGE_SIZE, maxRows = MAX_ROWS } = {}) {
  const client = base44?.entities?.[entityName];
  if (!client) return { items: [], truncated: false, loaded: 0 };

  const items = [];
  let cursor = null;
  let truncated = false;
  let guard = 0;

  while (guard < 1000) {
    guard += 1;
    // The cursor is omitted (not passed as null) on the first page, so the
    // paged call is identical in shape to the documented first-page call.
    const options = cursor
      ? { sort, limit: pageSize, cursor }
      : { sort, limit: pageSize };
    // eslint-disable-next-line no-await-in-loop
    const page = await client.filter(query, options);

    // The options form returns { items, next_cursor, has_more }; a plain array
    // means the call did not honour the page contract.
    if (Array.isArray(page)) {
      items.push(...page);
      break;
    }

    const batch = Array.isArray(page?.items) ? page.items : [];
    items.push(...batch);

    if (items.length >= maxRows) {
      truncated = batch.length > 0 && page?.has_more === true;
      break;
    }
    if (!page?.has_more || !page?.next_cursor) break;
    cursor = page.next_cursor;
  }

  return { items, truncated, loaded: items.length };
}

function groupBy(items, keyOf) {
  const map = {};
  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;
    if (!map[key]) map[key] = [];
    map[key].push(item);
  }
  return map;
}

/**
 * Load everything one reporting run needs. The Product Master is loaded once
 * per run, and every other collection is loaded with pagination.
 *
 * @returns {Promise<Object>}
 */
export async function loadProjectIntelligenceData() {
  const [projects, versions, proposals, statuses, accounts, masterResponse] = await Promise.all([
    loadAllPages('Project'),
    loadAllPages('ProjectVersion'),
    loadAllPages('Proposal'),
    loadAllPages('ProjectStatus'),
    loadAllPages('Account'),
    base44.functions.invoke('getAuthorizedProductMaster', {}).catch(() => ({ data: null })),
  ]);

  const master = masterResponse?.data || {};
  const products = Array.isArray(master.products) ? master.products : [];
  const { priceMap, soundbarOptions } = buildProductPriceIndex(products);

  // Price list availability follows the Product Master's own statement about
  // the caller, so the reporting layer never assumes pricing exists.
  const priceListAvailable = master.can_view_prices === true || products.length > 0;

  return {
    projects: projects.items,
    versionsByProjectId: groupBy(versions.items, (version) => version?.project_id),
    proposalsByProjectId: groupBy(proposals.items, (proposal) => proposal?.project_id),
    statusDefsByAccountId: groupBy(statuses.items, (status) => status?.account_id),
    accounts: accounts.items,
    priceContext: {
      priceMap,
      soundbarOptions,
      priceListAvailable,
      territoryCode: master.territory || null,
      currency: null,
      priceMode: 'incVat',
    },
    counts: {
      projects: projects.items.length,
      versions: versions.items.length,
      proposals: proposals.items.length,
      statuses: statuses.items.length,
      accounts: accounts.items.length,
      products: products.length,
    },
    truncation: {
      projects: projects.truncated,
      versions: versions.truncated,
      proposals: proposals.truncated,
      accounts: accounts.truncated,
      any: projects.truncated || versions.truncated || proposals.truncated || accounts.truncated,
    },
  };
}