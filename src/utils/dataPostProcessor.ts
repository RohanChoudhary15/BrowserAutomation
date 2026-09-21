/**
 * Data Post-Processing Utility for Browser Automation Scrapers & Workflows
 * Handles URL normalization (base URL prepending, tracking query stripping),
 * price cleaning and numeric extraction, date/time parsing, and pattern-based row filtering.
 */

export interface PostProcessingConfig {
  /** Master switch */
  enabled?: boolean;

  /** Base URL to prepend to relative paths (e.g. "https://www.amazon.in") */
  urlBasePrefix?: string;

  /** Strip marketing/tracking parameters (ref, utm_*, qid, tag, etc.) */
  stripUrlQueryParams?: boolean;

  /** Strip all query parameters entirely (clean path only) */
  stripAllQueryParams?: boolean;

  /** Fields to treat as URLs. Defaults to ['link', 'url', 'href', 'image', 'src'] */
  urlFields?: string[];

  /** Clean price fields to numbers / strip currency symbols */
  cleanPrice?: boolean;

  /** Target fields to clean as price. Defaults to ['price', 'cost', 'amount', 'rate', 'discount_price'] */
  priceFields?: string[];

  /** Mode: 'number_only' (1299.99), 'strip_symbols' ($1,299.99 -> 1,299.99) */
  priceMode?: 'number_only' | 'strip_symbols';

  /** Parse & format dates/timestamps */
  formatDate?: boolean;

  /** Target fields to format as date. Defaults to ['date', 'time', 'timestamp', 'created_at', 'posted_at'] */
  dateFields?: string[];

  /** Date formatting mode: 'iso_date' (YYYY-MM-DD), 'iso_datetime', 'timestamp' */
  dateMode?: 'iso_date' | 'iso_datetime' | 'timestamp';

  /** Trim whitespace from all string fields (default true) */
  trimText?: boolean;

  /** Pattern condition filter ("if url/field in this pattern then only") */
  patternFilterEnabled?: boolean;

  /** Field to test pattern against (default: 'link') */
  patternFilterField?: string;

  /** Match condition mode: 'contains' | 'regex' | 'starts_with' | 'ends_with' */
  patternFilterMode?: 'contains' | 'regex' | 'starts_with' | 'ends_with';

  /** Pattern value to match (e.g. "/product/", "/dp/", "amazon.in") */
  patternFilterValue?: string;

  /** Action when condition matches: 'include_only' (keep only matching) | 'exclude_matching' (drop matching) */
  patternFilterAction?: 'include_only' | 'exclude_matching';
}

const DEFAULT_URL_FIELDS = ['link', 'url', 'href', 'image', 'src', 'product_url'];
const DEFAULT_PRICE_FIELDS = ['price', 'cost', 'amount', 'rate', 'discount_price', 'original_price', 'mrp'];
const DEFAULT_DATE_FIELDS = ['date', 'time', 'timestamp', 'created_at', 'posted_at', 'published_at', 'datetime'];

const TRACKING_QUERY_PARAMS = new Set([
  'ref',
  'ref_',
  'tag',
  'linkcode',
  'creative',
  'camp',
  'creativeasin',
  'qid',
  'sr',
  'sprefix',
  'crid',
  'keywords',
  'dib',
  'dib_tag',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  '_ga',
  '_gl',
  'pd_rd_w',
  'pd_rd_r',
  'pd_rd_wg',
  'pf_rd_p',
  'pf_rd_r',
  'pf_rd_m',
  'pf_rd_s',
  'pf_rd_t',
  'pf_rd_i',
]);

/**
 * Normalizes a URL: prepends base URL prefix if relative, and strips tracking parameters
 */
export function normalizeUrl(
  raw: any,
  options: {
    basePrefix?: string;
    stripQueryParams?: boolean;
    stripAllQueryParams?: boolean;
  } = {}
): string {
  if (raw === null || raw === undefined) return '';
  let str = String(raw).trim();
  if (!str) return '';

  // Preserve non-HTTP URIs as-is
  if (str.startsWith('data:') || str.startsWith('blob:') || str.startsWith('javascript:') || str.startsWith('mailto:')) {
    return str;
  }

  // 1. Remove '.' from './' occurrences (e.g. './product/123' -> '/product/123', '/a/./b' -> '/a/b')
  // Isolate path from query string & hash fragment so query values are preserved
  let pathAndQuery = str;
  let hashPart = '';
  const hashIdx = pathAndQuery.indexOf('#');
  if (hashIdx !== -1) {
    hashPart = pathAndQuery.slice(hashIdx);
    pathAndQuery = pathAndQuery.slice(0, hashIdx);
  }

  const qIdx = pathAndQuery.indexOf('?');
  let pathPart = qIdx !== -1 ? pathAndQuery.slice(0, qIdx) : pathAndQuery;
  const queryPart = qIdx !== -1 ? pathAndQuery.slice(qIdx) : '';

  // Remove leading './' -> '/'
  if (pathPart.startsWith('./')) {
    pathPart = pathPart.replace(/^\.\/+/, '/');
  }
  // Remove any '/./' inside path -> '/'
  while (pathPart.includes('/./')) {
    pathPart = pathPart.replace(/\/\.\//g, '/');
  }
  // Remove trailing '/.' -> '/'
  if (pathPart.endsWith('/.')) {
    pathPart = pathPart.slice(0, -1);
  }

  str = pathPart + queryPart + hashPart;

  // 2. Prepend Base URL prefix if provided and URL is relative
  if (options.basePrefix && options.basePrefix.trim() !== '') {
    const rawBase = options.basePrefix.trim();
    // Ensure base has protocol
    const baseWithProtocol = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
    const cleanBase = baseWithProtocol.replace(/\/+$/, '');

    if (str.startsWith('//')) {
      const protocol = cleanBase.startsWith('http://') ? 'http:' : 'https:';
      str = `${protocol}${str}`;
    } else if (str.startsWith('/')) {
      str = `${cleanBase}${str}`;
    } else if (!/^https?:\/\//i.test(str)) {
      str = `${cleanBase}/${str.replace(/^\/+/, '')}`;
    }
  }

  // Clean any remaining '/./' in final combined URL
  while (str.includes('/./')) {
    str = str.replace(/\/\.\//g, '/');
  }

  // Strip query parameters
  if (options.stripAllQueryParams || options.stripQueryParams) {
    try {
      const parsed = new URL(str, 'http://localhost');
      if (options.stripAllQueryParams) {
        parsed.search = '';
      } else if (options.stripQueryParams) {
        const keysToDelete: string[] = [];
        parsed.searchParams.forEach((_, key) => {
          const lower = key.toLowerCase();
          if (
            TRACKING_QUERY_PARAMS.has(lower) ||
            lower.startsWith('utm_') ||
            lower.startsWith('pd_rd_') ||
            lower.startsWith('pf_rd_')
          ) {
            keysToDelete.push(key);
          }
        });
        keysToDelete.forEach((k) => parsed.searchParams.delete(k));
      }

      // If original had no scheme and parsed scheme was fallback http://localhost, restore relative path
      if (!/^https?:\/\//i.test(str) && parsed.origin === 'http://localhost') {
        str = parsed.pathname + (parsed.search || '');
      } else {
        str = parsed.href;
      }
    } catch {
      // Fallback regex query stripper if URL constructor threw
      if (options.stripAllQueryParams) {
        str = str.split('?')[0];
      }
    }
  }

  return str;
}

/**
 * Cleans price strings and extracts numeric values
 * e.g. "$1,299.99" -> "1299.99" or "1,299.99"
 * e.g. "₹1,299.00" -> "1299.00"
 */
export function cleanPrice(
  raw: any,
  options: {
    mode?: 'number_only' | 'strip_symbols';
  } = {}
): string {
  if (raw === null || raw === undefined) return '';
  const str = String(raw).trim();
  if (!str) return '';

  const mode = options.mode || 'number_only';

  if (mode === 'strip_symbols') {
    // Strips currency symbols while preserving formatted numbers
    return str
      .replace(/[₹$€£¥₩₽¢฿₪₫₱₴₸¢]/g, '')
      .replace(/\b(USD|INR|EUR|GBP|AUD|CAD|JPY|CNY|BRL|RUB|CHF)\b/gi, '')
      .trim();
  }

  // mode === 'number_only'
  // Check for negative numbers or accounting parentheses (e.g. -$15, ($15), -15)
  const isNegative = str.includes('-') || (str.startsWith('(') && str.endsWith(')'));

  // Extract number with optional decimals and thousand separators
  const match = str.match(/[0-9][0-9.,\s]*/);
  if (!match) return str;

  let candidate = match[0].trim().replace(/\s+/g, '');

  // Determine decimal vs thousand separator
  const hasComma = candidate.includes(',');
  const hasDot = candidate.includes('.');

  if (hasComma && hasDot) {
    const lastComma = candidate.lastIndexOf(',');
    const lastDot = candidate.lastIndexOf('.');
    if (lastComma > lastDot) {
      // European format: 1.299,99 -> 1299.99
      candidate = candidate.replace(/\./g, '').replace(',', '.');
    } else {
      // US/UK format: 1,299.99 -> 1299.99
      candidate = candidate.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    // Check if comma is decimal (e.g. 45,99) or thousand (e.g. 1,000)
    const commaParts = candidate.split(',');
    if (commaParts.length === 2 && commaParts[1].length <= 2) {
      candidate = `${commaParts[0]}.${commaParts[1]}`;
    } else {
      candidate = candidate.replace(/,/g, '');
    }
  }

  let num = parseFloat(candidate);
  if (isNaN(num)) return str;
  if (isNegative && num > 0) {
    num = -num;
  }

  // Format as clean numeric string (retaining decimals if fractional)
  return num.toString();
}

/**
 * Formats date and relative time strings into ISO format
 * e.g. "2 hours ago" -> ISO string
 * e.g. "September 22, 2026" -> "2026-09-22"
 */
export function formatDateString(
  raw: any,
  options: {
    mode?: 'iso_date' | 'iso_datetime' | 'timestamp';
  } = {}
): string {
  if (raw === null || raw === undefined) return '';
  const str = String(raw).trim();
  if (!str) return '';

  const mode = options.mode || 'iso_date';
  const lower = str.toLowerCase();

  let targetDate: Date | null = null;
  const now = Date.now();

  // Relative time parsing
  if (lower.includes('just now') || lower === 'now') {
    targetDate = new Date(now);
  } else if (lower.includes('yesterday')) {
    targetDate = new Date(now - 86400000);
  } else if (lower.includes('today')) {
    targetDate = new Date(now);
  } else {
    const minMatch = lower.match(/(\d+)\s*(?:m|min|minute|minutes)\s*ago/);
    const hourMatch = lower.match(/(\d+)\s*(?:h|hr|hour|hours)\s*ago/);
    const dayMatch = lower.match(/(\d+)\s*(?:d|day|days)\s*ago/);
    const weekMatch = lower.match(/(\d+)\s*(?:w|wk|week|weeks)\s*ago/);
    const monthMatch = lower.match(/(\d+)\s*(?:mo|month|months)\s*ago/);

    if (minMatch) {
      targetDate = new Date(now - parseInt(minMatch[1], 10) * 60000);
    } else if (hourMatch) {
      targetDate = new Date(now - parseInt(hourMatch[1], 10) * 3600000);
    } else if (dayMatch) {
      targetDate = new Date(now - parseInt(dayMatch[1], 10) * 86400000);
    } else if (weekMatch) {
      targetDate = new Date(now - parseInt(weekMatch[1], 10) * 7 * 86400000);
    } else if (monthMatch) {
      targetDate = new Date(now - parseInt(monthMatch[1], 10) * 30 * 86400000);
    }
  }

  if (!targetDate) {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      targetDate = parsed;
    }
  }

  if (!targetDate) return str;

  if (mode === 'timestamp') {
    return targetDate.getTime().toString();
  }
  if (mode === 'iso_datetime') {
    return targetDate.toISOString();
  }

  // mode === 'iso_date' (YYYY-MM-DD)
  const yyyy = targetDate.getUTCFullYear();
  const mm = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Checks if a string value matches a pattern with support for wildcard (*), regex, starts_with, ends_with
 */
export function matchesPattern(
  value: any,
  pattern: string,
  mode: 'contains' | 'regex' | 'starts_with' | 'ends_with' = 'contains',
  caseSensitive = false
): boolean {
  if (!pattern || pattern.trim() === '') return true;
  const valStr = value !== null && value !== undefined ? String(value) : '';
  const patStr = pattern.trim();

  const v = caseSensitive ? valStr : valStr.toLowerCase();
  const p = caseSensitive ? patStr : patStr.toLowerCase();

  switch (mode) {
    case 'starts_with':
      return v.startsWith(p);
    case 'ends_with':
      return v.endsWith(p);
    case 'regex':
      try {
        const rx = new RegExp(patStr, caseSensitive ? '' : 'i');
        return rx.test(valStr);
      } catch {
        return v.includes(p);
      }
    case 'contains':
    default:
      if (p.includes('*')) {
        const regexStr = '^' + p.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$';
        return new RegExp(regexStr, caseSensitive ? '' : 'i').test(valStr);
      }
      return v.includes(p);
  }
}

/**
 * Processes an entire scraped dataset applying all configured post-processing transformations
 * and row-level condition filtering.
 */
export function processDataset(
  items: Record<string, any>[],
  config: PostProcessingConfig
): {
  items: Record<string, any>[];
  filteredCount: number;
  modifiedCount: number;
} {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { items: [], filteredCount: 0, modifiedCount: 0 };
  }

  let filteredCount = 0;
  let modifiedCount = 0;

  const urlFields = config.urlFields && config.urlFields.length > 0 ? config.urlFields : DEFAULT_URL_FIELDS;
  const priceFields = config.priceFields && config.priceFields.length > 0 ? config.priceFields : DEFAULT_PRICE_FIELDS;
  const dateFields = config.dateFields && config.dateFields.length > 0 ? config.dateFields : DEFAULT_DATE_FIELDS;

  const processedRows: Record<string, any>[] = [];

  for (const row of items) {
    if (!row || typeof row !== 'object') continue;

    // 1. Pattern Condition Filter
    if (config.patternFilterEnabled && config.patternFilterValue && config.patternFilterValue.trim() !== '') {
      const fieldName = config.patternFilterField || 'link';
      const testVal = row[fieldName] ?? '';
      const isMatch = matchesPattern(testVal, config.patternFilterValue, config.patternFilterMode || 'contains', false);
      const action = config.patternFilterAction || 'include_only';

      if (action === 'include_only' && !isMatch) {
        filteredCount++;
        continue;
      }
      if (action === 'exclude_matching' && isMatch) {
        filteredCount++;
        continue;
      }
    }

    // 2. Field-level Transforms
    const processedRow: Record<string, any> = {};
    let rowWasModified = false;

    for (const [key, val] of Object.entries(row)) {
      let currentVal = val;

      if (typeof currentVal === 'string') {
        const originalVal = currentVal;

        // URL normalization
        const isTargetUrlField = config.urlFields && config.urlFields.length > 0
          ? config.urlFields.some((f) => f.toLowerCase().trim() === key.toLowerCase().trim())
          : urlFields.some((f) => f.toLowerCase() === key.toLowerCase() || key.toLowerCase().includes('url') || key.toLowerCase().includes('link') || key.toLowerCase().includes('href'));

        if (isTargetUrlField) {
          currentVal = normalizeUrl(currentVal, {
            basePrefix: config.urlBasePrefix,
            stripQueryParams: config.stripUrlQueryParams,
            stripAllQueryParams: config.stripAllQueryParams,
          });
        }

        // Price cleaning
        if (
          config.cleanPrice &&
          priceFields.some((f) => f.toLowerCase() === key.toLowerCase() || key.toLowerCase().includes('price') || key.toLowerCase().includes('cost'))
        ) {
          currentVal = cleanPrice(currentVal, { mode: config.priceMode || 'number_only' });
        }

        // Date formatting
        if (
          config.formatDate &&
          dateFields.some((f) => f.toLowerCase() === key.toLowerCase() || key.toLowerCase().includes('date') || key.toLowerCase().includes('time'))
        ) {
          currentVal = formatDateString(currentVal, { mode: config.dateMode || 'iso_date' });
        }

        // Trim text
        if (config.trimText !== false && typeof currentVal === 'string') {
          currentVal = currentVal.trim();
        }

        if (currentVal !== originalVal) {
          rowWasModified = true;
        }
      }

      processedRow[key] = currentVal;
    }

    if (rowWasModified) {
      modifiedCount++;
    }

    processedRows.push(processedRow);
  }

  return {
    items: processedRows,
    filteredCount,
    modifiedCount,
  };
}
