/**
 * String and Data Transformation Utilities for AutoFlow
 * Provides robust string slicing, stripping, case conversion, pattern extraction,
 * and data-type normalization.
 */

export interface StringTransformOptions {
  // Slicing & Substring
  sliceExpr?: string;        // Python slice syntax like "4:7", ":-3", "2:", "::-1"
  start?: number;            // Start index (supports negative)
  end?: number;              // End index (supports negative)
  length?: number;           // Length for substring
  count?: number;            // Number of chars to remove/keep
  prefix?: string;           // Prefix to remove or wrap with
  suffix?: string;           // Suffix to remove or wrap with
  startDelimiter?: string;   // For substring_between
  endDelimiter?: string;     // For substring_between
  delimiter?: string;        // For split, join, substring_before/after
  inclusive?: boolean;       // For substring_between
  fromEnd?: boolean;         // For substring_before/after (search from last occurrence)

  // Strip & Trim
  chars?: string;            // Custom characters to strip (e.g. quotes, slashes)
  stripMode?: 'both' | 'start' | 'end';

  // Replace
  search?: string;
  replaceWith?: string;
  replaceAll?: boolean;
  caseSensitive?: boolean;
  useRegex?: boolean;

  // Formatting & Casing
  maxLength?: number;
  ellipsis?: string;
  wordBoundary?: boolean;
  padChar?: string;
  targetLength?: number;

  // Numbers & Currency
  decimals?: number;
  roundMode?: 'round' | 'floor' | 'ceil';
  currencySymbol?: string;
  priceMode?: 'number_only' | 'strip_symbols';

  // URLs & Dates
  basePrefix?: string;
  stripQueryParams?: boolean;
  dateMode?: 'iso_date' | 'iso_datetime' | 'timestamp';

  // JSON & Extraction
  field?: string;
  fallbackValue?: any;

  // Arrays & Lists
  key?: string;
  filterExpr?: string;
  condition?: string;
  operator?: string;
  filterValue?: any;
  value?: any;
  sortKey?: string;
  sortOrder?: 'asc' | 'desc';
  sortType?: 'auto' | 'numeric' | 'alphabetical';
  chunkSize?: number;
  takeMode?: 'first' | 'last';
  dropMode?: 'first' | 'last';
  deep?: boolean;

  // Dates & Timestamps
  dateMathExpr?: string;
  dateOffsetValue?: number;
  dateOffsetUnit?: string;
  compareDate?: string | number | Date;
  diffUnit?: string;
  formatMask?: string;
  targetTimezone?: string;

  // Booleans & Logic
  compareValue?: any;

  // URLs & Links
  paramName?: string;
  stripWww?: boolean;
  includeQuestionMark?: boolean;

  // Numbers & Math
  expression?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  aggregateType?: 'sum' | 'average' | 'avg' | 'min' | 'max';
}

/**
 * Parses Python-style slice notation on a string or array.
 * Examples:
 *   "4:7"   -> slice(4, 7)
 *   ":-3"   -> slice(0, -3)
 *   "2:"    -> slice(2)
 *   "-5:"   -> slice(-5)
 *   "-5:-2" -> slice(-5, -2)
 *   "::-1"  -> reverse string
 *   "4"     -> single character at index 4 (or string.slice(4, 5))
 */
export function parseSliceNotation(str: string, expr: string): string {
  if (!expr || typeof expr !== 'string') return str;

  // Remove surrounding brackets if user entered [4:7]
  const cleanExpr = expr.trim().replace(/^\[|\]$/g, '');
  if (!cleanExpr) return str;

  const parts = cleanExpr.split(':');

  if (parts.length === 1) {
    // Single index access: "4" or "-1"
    const idx = parseInt(parts[0], 10);
    if (isNaN(idx)) return str;
    if (idx < 0) {
      const positiveIdx = str.length + idx;
      return str.charAt(positiveIdx);
    }
    return str.charAt(idx);
  }

  const rawStart = parts[0]?.trim();
  const rawEnd = parts[1]?.trim();
  const rawStep = parts[2]?.trim();

  const start = rawStart !== '' ? parseInt(rawStart, 10) : 0;
  const end = rawEnd !== '' ? parseInt(rawEnd, 10) : undefined;
  const step = rawStep !== '' ? parseInt(rawStep, 10) : 1;

  if (isNaN(start) || (end !== undefined && isNaN(end))) {
    return str;
  }

  // Handle reverse step (e.g. ::-1)
  if (step === -1) {
    const sliced = str.slice(
      rawStart !== '' ? start : 0,
      rawEnd !== '' ? end : undefined
    );
    return sliced.split('').reverse().join('');
  }

  return str.slice(start, end);
}

/**
 * Strips whitespace or custom characters from a string.
 */
export function stripCharacters(
  str: string,
  mode: 'both' | 'start' | 'end' = 'both',
  chars?: string
): string {
  if (!str) return '';

  if (!chars) {
    // Default whitespace trimming
    if (mode === 'start') return str.trimStart();
    if (mode === 'end') return str.trimEnd();
    return str.trim();
  }

  // Escape special regex characters in the custom chars string
  const escaped = chars.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  if (mode === 'start') {
    return str.replace(new RegExp(`^[${escaped}]+`), '');
  }
  if (mode === 'end') {
    return str.replace(new RegExp(`[${escaped}]+$`), '');
  }
  return str.replace(new RegExp(`^[${escaped}]+|[${escaped}]+$`, 'g'), '');
}

/**
 * Removes first N characters, last N characters, or specific prefix/suffix.
 */
export function removePrefixSuffix(
  str: string,
  mode: 'prefix' | 'suffix' | 'first_n' | 'last_n',
  value: string | number
): string {
  if (!str) return '';

  switch (mode) {
    case 'first_n': {
      const n = Math.max(0, Number(value) || 0);
      return str.slice(n);
    }
    case 'last_n': {
      const n = Math.max(0, Number(value) || 0);
      return n >= str.length ? '' : str.slice(0, str.length - n);
    }
    case 'prefix': {
      const p = String(value ?? '');
      if (p && str.startsWith(p)) {
        return str.slice(p.length);
      }
      return str;
    }
    case 'suffix': {
      const s = String(value ?? '');
      if (s && str.endsWith(s)) {
        return str.slice(0, str.length - s.length);
      }
      return str;
    }
    default:
      return str;
  }
}

/**
 * Extracts text between two boundary delimiters.
 */
export function substringBetween(
  str: string,
  startDelim: string,
  endDelim: string,
  inclusive = false
): string {
  if (!str) return '';
  const startIdx = startDelim ? str.indexOf(startDelim) : 0;
  if (startIdx === -1) return '';

  const contentStart = startDelim ? startIdx + startDelim.length : 0;
  const endIdx = endDelim ? str.indexOf(endDelim, contentStart) : str.length;
  if (endIdx === -1) return '';

  if (inclusive) {
    return str.slice(startIdx, endIdx + (endDelim ? endDelim.length : 0));
  }
  return str.slice(contentStart, endIdx);
}

/**
 * Extracts text before a delimiter.
 */
export function substringBefore(str: string, delim: string, fromEnd = false): string {
  if (!str || !delim) return str;
  const idx = fromEnd ? str.lastIndexOf(delim) : str.indexOf(delim);
  return idx === -1 ? str : str.slice(0, idx);
}

/**
 * Extracts text after a delimiter.
 */
export function substringAfter(str: string, delim: string, fromEnd = false): string {
  if (!str || !delim) return str;
  const idx = fromEnd ? str.lastIndexOf(delim) : str.indexOf(delim);
  return idx === -1 ? '' : str.slice(idx + delim.length);
}

/**
 * Converts string to Title Case (Capitalizes first letter of each word).
 */
export function toTitleCase(str: string): string {
  return (str || '').replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase()
  );
}

/**
 * Converts string to camelCase.
 */
export function toCamelCase(str: string): string {
  if (!str) return '';
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

/**
 * Converts string to snake_case.
 */
export function toSnakeCase(str: string): string {
  return (str || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

/**
 * Converts string to kebab-case.
 */
export function toKebabCase(str: string): string {
  return (str || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

/**
 * Converts string to URL-friendly slug.
 */
export function slugifyText(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Collapses multiple spaces, tabs, and newlines into single spaces.
 */
export function cleanWhitespace(str: string): string {
  return (str || '').replace(/\s+/g, ' ').trim();
}

/**
 * Truncates string to maximum length with optional word boundary protection.
 */
export function truncateText(
  str: string,
  maxLength = 100,
  ellipsis = '...',
  wordBoundary = true
): string {
  if (!str || str.length <= maxLength) return str;
  if (!wordBoundary) {
    return str.slice(0, maxLength) + ellipsis;
  }
  const sub = str.slice(0, maxLength);
  const lastSpace = sub.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.6) {
    return sub.slice(0, lastSpace) + ellipsis;
  }
  return sub + ellipsis;
}

/**
 * Decodes standard HTML entities into text.
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Rounds a number to a specified number of decimal places.
 */
export function roundNumber(
  num: number | string,
  decimals = 2,
  mode: 'round' | 'floor' | 'ceil' = 'round'
): number {
  const n = Number(num);
  if (isNaN(n)) return 0;
  const factor = Math.pow(10, decimals);
  if (mode === 'floor') return Math.floor(n * factor) / factor;
  if (mode === 'ceil') return Math.ceil(n * factor) / factor;
  return Math.round(n * factor) / factor;
}

/**
 * Formats a number into a currency string.
 */
export function formatCurrency(
  val: number | string,
  symbol = '$',
  decimals = 2
): string {
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const num = Number(cleaned) || 0;
  return `${symbol}${num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Cleans a price string to extract the numeric value.
 */
export function cleanPrice(
  str: string,
  mode: 'number_only' | 'strip_symbols' = 'number_only'
): string {
  if (!str) return '';
  if (mode === 'strip_symbols') {
    return str.replace(/[$€£¥₹\s]/g, '').trim();
  }
  const match = str.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? match[0] : '';
}

/**
 * Normalizes any input into an Array.
 * Handles arrays, JSON strings, comma-separated strings, and single values.
 */
export function parseAsArray(input: any): any[] {
  if (Array.isArray(input)) return [...input];
  if (input === null || input === undefined) return [];
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Not valid JSON, continue
      }
    }
    if (trimmed.includes('\n')) {
      return trimmed.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    }
    if (trimmed.includes(',')) {
      return trimmed.split(',').map((s) => s.trim());
    }
    if (trimmed === '') return [];
    return [trimmed];
  }
  return [input];
}

/**
 * Deduplicates items in an array.
 * If key is provided, deduplicates objects by that key; otherwise deduplicates primitives or JSON representation.
 */
export function arrayDeduplicate(arr: any[], key?: string): any[] {
  const list = parseAsArray(arr);
  if (!key) {
    const seen = new Set<string>();
    return list.filter((item) => {
      const identifier = item !== null && typeof item === 'object' ? JSON.stringify(item) : String(item);
      if (seen.has(identifier)) return false;
      seen.add(identifier);
      return true;
    });
  }

  const seenKeys = new Set<any>();
  return list.filter((item) => {
    if (item && typeof item === 'object') {
      const val = item[key];
      if (seenKeys.has(val)) return false;
      seenKeys.add(val);
      return true;
    }
    return true;
  });
}

/**
 * Filters array items based on condition string (e.g. "price < 50", "in_stock == true")
 * or explicit field, operator, and comparison value.
 */
export function arrayFilter(
  arr: any[],
  condition?: string,
  field?: string,
  operator?: string,
  filterValue?: any
): any[] {
  const list = parseAsArray(arr);

  let condField = field;
  let condOp = operator;
  let condVal = filterValue;

  if (condition && typeof condition === 'string' && !condOp) {
    const trimmed = condition.trim();
    const match = trimmed.match(
      /^([\w$.]+)\s*(<=|>=|===|!==|==|!=|<|>|contains|includes|startsWith|endsWith)\s*(.+)$/i
    );
    if (match) {
      condField = match[1].trim();
      condOp = match[2].trim().toLowerCase();
      const rawVal = match[3].trim();
      if (
        (rawVal.startsWith('"') && rawVal.endsWith('"')) ||
        (rawVal.startsWith("'") && rawVal.endsWith("'"))
      ) {
        condVal = rawVal.slice(1, -1);
      } else if (rawVal === 'true') {
        condVal = true;
      } else if (rawVal === 'false') {
        condVal = false;
      } else if (rawVal === 'null') {
        condVal = null;
      } else if (!isNaN(Number(rawVal))) {
        condVal = Number(rawVal);
      } else {
        condVal = rawVal;
      }
    } else {
      condField = trimmed;
      condOp = 'truthy';
    }
  }

  const op = (condOp || '==').toLowerCase();

  return list.filter((item) => {
    let targetVal: any;
    if (item && typeof item === 'object') {
      if (condField && condField !== 'item' && condField !== 'self') {
        const parts = condField.split('.');
        let curr = item;
        for (const p of parts) {
          if (curr === undefined || curr === null) break;
          curr = curr[p];
        }
        targetVal = curr;
      } else {
        targetVal = item;
      }
    } else {
      targetVal = item;
    }

    const compareTo = condVal;

    switch (op) {
      case '<':
        return Number(targetVal) < Number(compareTo);
      case '<=':
        return Number(targetVal) <= Number(compareTo);
      case '>':
        return Number(targetVal) > Number(compareTo);
      case '>=':
        return Number(targetVal) >= Number(compareTo);
      case '==':
      case '===':
        return String(targetVal).toLowerCase() === String(compareTo).toLowerCase();
      case '!=':
      case '!==':
        return String(targetVal).toLowerCase() !== String(compareTo).toLowerCase();
      case 'contains':
      case 'includes':
        return String(targetVal).toLowerCase().includes(String(compareTo).toLowerCase());
      case 'startswith':
        return String(targetVal).toLowerCase().startsWith(String(compareTo).toLowerCase());
      case 'endswith':
        return String(targetVal).toLowerCase().endsWith(String(compareTo).toLowerCase());
      case 'empty':
      case 'is_empty':
        return isEmpty(targetVal);
      case 'not_empty':
      case 'is_not_empty':
        return !isEmpty(targetVal);
      case 'truthy':
        return coerceBoolean(targetVal);
      case 'falsy':
        return !coerceBoolean(targetVal);
      default:
        return String(targetVal) === String(compareTo);
    }
  });
}

/**
 * Sorts array elements ascending or descending by property or primitive value.
 */
export function arraySort(
  arr: any[],
  key?: string,
  order: 'asc' | 'desc' = 'asc',
  sortType: 'auto' | 'numeric' | 'alphabetical' = 'auto'
): any[] {
  const list = parseAsArray(arr);
  const isDesc = (order || 'asc').toLowerCase() === 'desc';

  return [...list].sort((a, b) => {
    let valA = a;
    let valB = b;
    if (key && typeof a === 'object' && a !== null) valA = a[key];
    if (key && typeof b === 'object' && b !== null) valB = b[key];

    let result = 0;
    const isNumA = valA !== '' && valA !== null && !isNaN(Number(valA));
    const isNumB = valB !== '' && valB !== null && !isNaN(Number(valB));

    if (sortType === 'numeric' || (sortType === 'auto' && isNumA && isNumB)) {
      result = Number(valA) - Number(valB);
    } else {
      result = String(valA ?? '').localeCompare(String(valB ?? ''));
    }

    return isDesc ? -result : result;
  });
}

/**
 * Splits array into chunks of specified size.
 */
export function arrayChunk(arr: any[], size = 10): any[][] {
  const list = parseAsArray(arr);
  const chunkSize = Math.max(1, Math.floor(Number(size) || 10));
  const chunks: any[][] = [];
  for (let i = 0; i < list.length; i += chunkSize) {
    chunks.push(list.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Takes first N or last N array elements.
 */
export function arrayTake(arr: any[], count = 1, fromEnd = false): any[] {
  const list = parseAsArray(arr);
  const n = Math.max(0, Math.floor(Number(count) || 1));
  if (fromEnd) {
    return list.slice(Math.max(0, list.length - n));
  }
  return list.slice(0, n);
}

/**
 * Drops first N or last N array elements.
 */
export function arrayDrop(arr: any[], count = 1, fromEnd = false): any[] {
  const list = parseAsArray(arr);
  const n = Math.max(0, Math.floor(Number(count) || 1));
  if (fromEnd) {
    return list.slice(0, Math.max(0, list.length - n));
  }
  return list.slice(n);
}

/**
 * Flattens nested arrays.
 */
export function arrayFlatten(arr: any[], deep = false): any[] {
  const list = parseAsArray(arr);
  return deep ? list.flat(Infinity) : list.flat(1);
}

/**
 * Performs date math (add/subtract days, hours, minutes, etc.)
 */
export function dateMath(
  dateInput: any,
  offsetExpr?: string,
  offsetVal?: number,
  offsetUnit?: string
): string {
  let date: Date;
  if (!dateInput || dateInput === 'now' || dateInput === 'current') {
    date = new Date();
  } else {
    date = new Date(dateInput);
    if (isNaN(date.getTime())) date = new Date();
  }

  let amount = 0;
  let unit = 'days';

  if (offsetExpr && typeof offsetExpr === 'string') {
    const match = offsetExpr.trim().match(/^([+-]?\d+(?:\.\d+)?)\s*([a-zA-Z]+)?$/);
    if (match) {
      amount = parseFloat(match[1]);
      unit = (match[2] || 'days').toLowerCase();
    }
  } else if (offsetVal !== undefined) {
    amount = Number(offsetVal) || 0;
    unit = (offsetUnit || 'days').toLowerCase();
  }

  if (unit.startsWith('day')) {
    date.setDate(date.getDate() + amount);
  } else if (unit.startsWith('week')) {
    date.setDate(date.getDate() + amount * 7);
  } else if (unit.startsWith('hour')) {
    date.setTime(date.getTime() + amount * 3600 * 1000);
  } else if (unit.startsWith('min')) {
    date.setTime(date.getTime() + amount * 60 * 1000);
  } else if (unit.startsWith('sec')) {
    date.setTime(date.getTime() + amount * 1000);
  } else if (unit.startsWith('month')) {
    date.setMonth(date.getMonth() + Math.round(amount));
  } else if (unit.startsWith('year')) {
    date.setFullYear(date.getFullYear() + Math.round(amount));
  }

  return date.toISOString();
}

/**
 * Converts relative human time strings ("2 hours ago", "yesterday", "in 5 days") into ISO format.
 */
export function parseRelativeTime(text: string, baseDate?: Date): string {
  const now = baseDate || new Date();
  const str = String(text || '').trim().toLowerCase();

  if (!str || str === 'now' || str === 'just now') {
    return now.toISOString();
  }
  if (str === 'yesterday') {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d.toISOString();
  }
  if (str === 'tomorrow') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
  if (str === 'today') {
    return now.toISOString();
  }

  const agoMatch = str.match(
    /(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?)\s*ago/
  );
  if (agoMatch) {
    const amount = -parseFloat(agoMatch[1]);
    const unit = agoMatch[2];
    return dateMath(now, `${amount} ${unit}`);
  }

  const inMatch = str.match(
    /in\s*(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?)/
  );
  if (inMatch) {
    const amount = parseFloat(inMatch[1]);
    const unit = inMatch[2];
    return dateMath(now, `+${amount} ${unit}`);
  }

  const parsed = new Date(text);
  return !isNaN(parsed.getTime()) ? parsed.toISOString() : now.toISOString();
}

/**
 * Calculates difference between two dates in specified units (days, hours, minutes, seconds).
 */
export function dateDifference(date1: any, date2: any, unit: string = 'days'): number {
  const d1 = new Date(date1 || Date.now());
  const d2 = new Date(date2 || Date.now());
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;

  const diffMs = d1.getTime() - d2.getTime();
  const u = (unit || 'days').toLowerCase();

  let result = 0;
  if (u.startsWith('sec')) {
    result = diffMs / 1000;
  } else if (u.startsWith('min')) {
    result = diffMs / (60 * 1000);
  } else if (u.startsWith('hour')) {
    result = diffMs / (3600 * 1000);
  } else if (u.startsWith('week')) {
    result = diffMs / (7 * 86400 * 1000);
  } else if (u.startsWith('month')) {
    result = diffMs / (30.4375 * 86400 * 1000);
  } else if (u.startsWith('year')) {
    result = diffMs / (365.25 * 86400 * 1000);
  } else {
    result = diffMs / (86400 * 1000);
  }

  return Math.round(result * 100) / 100;
}

/**
 * Formats a date using pattern masks (YYYY-MM-DD, DD/MM/YYYY, hh:mm A, etc.)
 */
export function formatDateMask(dateInput: any, mask: string = 'YYYY-MM-DD'): string {
  const d = new Date(dateInput || Date.now());
  if (isNaN(d.getTime())) return String(dateInput || '');

  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const date = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = d.getSeconds();

  const pad = (n: number) => String(n).padStart(2, '0');

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const h12 = hours % 12 || 12;
  const ampm = hours >= 12 ? 'PM' : 'AM';

  return mask
    .replace(/\bYYYY\b/g, String(year))
    .replace(/\bYY\b/g, String(year).slice(-2))
    .replace(/\bMMMM\b/g, monthNames[month - 1])
    .replace(/\bMMM\b/g, shortMonthNames[month - 1])
    .replace(/\bMM\b/g, pad(month))
    .replace(/\bM\b/g, String(month))
    .replace(/\bDD\b/g, pad(date))
    .replace(/\bD\b/g, String(date))
    .replace(/\bHH\b/g, pad(hours))
    .replace(/\bH\b/g, String(hours))
    .replace(/\bhh\b/g, pad(h12))
    .replace(/\bh\b/g, String(h12))
    .replace(/\bmm\b/g, pad(minutes))
    .replace(/\bss\b/g, pad(seconds))
    .replace(/\bA\b/g, ampm)
    .replace(/\ba\b/g, ampm.toLowerCase());
}

/**
 * Converts date to target timezone.
 */
export function convertTimezone(dateInput: any, targetTz: string = 'UTC'): string {
  const d = new Date(dateInput || Date.now());
  if (isNaN(d.getTime())) return String(dateInput || '');

  const tz = targetTz === 'local' ? undefined : targetTz;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .format(d)
      .replace(', ', 'T');
  } catch {
    return d.toISOString();
  }
}

/**
 * Tests if string, array, or object is empty.
 */
export function isEmpty(val: any): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') return val.trim().length === 0;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === 'object') return Object.keys(val).length === 0;
  return false;
}

/**
 * Tests if string, array, or object has data.
 */
export function isNotEmpty(val: any): boolean {
  return !isEmpty(val);
}

/**
 * Inverts a boolean or truthy/falsy value.
 */
export function booleanInvert(val: any): boolean {
  if (typeof val === 'boolean') return !val;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (s === 'true' || s === '1') return false;
    if (s === 'false' || s === '0') return true;
  }
  return !coerceBoolean(val);
}

/**
 * Compares two values with standard operators.
 */
export function booleanCompare(a: any, b: any, operator = '=='): boolean {
  const op = (operator || '==').trim().toLowerCase();
  switch (op) {
    case '==':
    case '===':
      return String(a).toLowerCase() === String(b).toLowerCase();
    case '!=':
    case '!==':
      return String(a).toLowerCase() !== String(b).toLowerCase();
    case '>':
      return Number(a) > Number(b);
    case '>=':
      return Number(a) >= Number(b);
    case '<':
      return Number(a) < Number(b);
    case '<=':
      return Number(a) <= Number(b);
    case 'contains':
    case 'includes':
      return String(a).toLowerCase().includes(String(b).toLowerCase());
    case 'starts_with':
    case 'startswith':
      return String(a).toLowerCase().startsWith(String(b).toLowerCase());
    case 'ends_with':
    case 'endswith':
      return String(a).toLowerCase().endsWith(String(b).toLowerCase());
    default:
      return String(a) === String(b);
  }
}

/**
 * Coerces strings or values to true boolean.
 */
export function coerceBoolean(val: any): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0 && !isNaN(val);
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
    if (s === 'false' || s === '0' || s === 'no' || s === 'off' || s === 'null' || s === 'undefined' || s === '') {
      return false;
    }
    return s.length > 0;
  }
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === 'object' && val !== null) return Object.keys(val).length > 0;
  return Boolean(val);
}

/**
 * Extracts query parameter value from URL or query string.
 */
export function extractUrlQueryParam(urlStr: string, paramName: string): string {
  if (!urlStr || !paramName) return '';
  try {
    let searchStr = '';
    if (urlStr.includes('?')) {
      searchStr = urlStr.slice(urlStr.indexOf('?'));
    } else if (urlStr.includes('=')) {
      searchStr = `?${urlStr}`;
    } else {
      const u = new URL(urlStr, 'https://example.com');
      searchStr = u.search;
    }
    const params = new URLSearchParams(searchStr);
    return params.get(paramName) || '';
  } catch {
    return '';
  }
}

/**
 * Extracts domain or hostname from URL.
 */
export function extractUrlDomain(urlStr: string, stripWww = false): string {
  if (!urlStr) return '';
  try {
    let hostname = '';
    if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
      hostname = new URL(urlStr).hostname;
    } else {
      hostname = urlStr.split('/')[0].split('?')[0];
    }
    if (stripWww && hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }
    return hostname;
  } catch {
    return urlStr;
  }
}

/**
 * Extracts pathname from URL.
 */
export function extractUrlPath(urlStr: string): string {
  if (!urlStr) return '';
  try {
    if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
      return new URL(urlStr).pathname;
    }
    const withoutQuery = urlStr.split('?')[0].split('#')[0];
    const slashIdx = withoutQuery.indexOf('/');
    return slashIdx !== -1 ? withoutQuery.slice(slashIdx) : '/';
  } catch {
    return urlStr;
  }
}

/**
 * Builds query string from an object.
 */
export function buildUrlQueryString(params: any, includeQuestionMark = true): string {
  if (!params) return '';
  let obj = params;
  if (typeof params === 'string') {
    try {
      obj = JSON.parse(params);
    } catch {
      return params;
    }
  }
  if (typeof obj !== 'object' || obj === null) return '';

  const searchParams = new URLSearchParams();
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined && val !== null) {
      searchParams.append(key, String(val));
    }
  }
  const qs = searchParams.toString();
  if (!qs) return '';
  return includeQuestionMark ? `?${qs}` : qs;
}

/**
 * Safely evaluates math expressions like "(a * b) + c" or percentage change.
 */
export function evaluateMathExpression(expr: string, contextValue?: any): number {
  if (!expr) return Number(contextValue) || 0;
  let expression = String(expr).trim();

  if (contextValue !== undefined && contextValue !== null && contextValue !== '') {
    const num = Number(contextValue) || 0;
    expression = expression.replace(/\b(x|val|item|n|value)\b/gi, String(num));
  }

  const sanitized = expression
    .replace(/\^/g, '**')
    .replace(/\b(round|floor|ceil|abs|min|max|sqrt|pow|PI|E)\b/g, 'Math.$1');

  const isSafe = /^[\d\s+\-*/%(),.Mathabsceilfloorroundminmaxsqrtpow**]+$/.test(sanitized);
  if (!isSafe) {
    return 0;
  }

  try {
    const fn = new Function(`"use strict"; return (${sanitized});`);
    const res = fn();
    return typeof res === 'number' && !isNaN(res) ? Math.round(res * 1000000) / 1000000 : 0;
  } catch {
    return 0;
  }
}

/**
 * Clamps a number between min and max.
 */
export function clampNumber(val: number | string, min = 0, max = 100): number {
  const n = Number(val) || 0;
  const minVal = Number(min) || 0;
  const maxVal = Number(max) || 100;
  return Math.min(Math.max(n, minVal), maxVal);
}

/**
 * Generates random number in range [min, max].
 */
export function randomNumber(min = 0, max = 100, integer = true): number {
  const minVal = Number(min) || 0;
  const maxVal = Number(max) || 100;
  const r = Math.random() * (maxVal - minVal) + minVal;
  return integer ? Math.round(r) : Math.round(r * 100) / 100;
}

/**
 * Aggregates array of numbers by sum, average, min, or max.
 */
export function aggregateNumbers(
  items: any[],
  type: 'sum' | 'average' | 'avg' | 'min' | 'max' = 'sum',
  field?: string
): number {
  const list = parseAsArray(items);
  if (list.length === 0) return 0;

  const numbers: number[] = list
    .map((item) => {
      if (item && typeof item === 'object' && field) {
        return Number(item[field]);
      }
      return Number(item);
    })
    .filter((n) => !isNaN(n));

  if (numbers.length === 0) return 0;

  const op = (type || 'sum').toLowerCase();
  if (op === 'min') return Math.min(...numbers);
  if (op === 'max') return Math.max(...numbers);

  const sum = numbers.reduce((acc, curr) => acc + curr, 0);
  if (op === 'average' || op === 'avg') {
    return Math.round((sum / numbers.length) * 100) / 100;
  }
  return Math.round(sum * 10000) / 10000;
}

/**
 * Universal transform function supporting all string, number, and data operations.
 */
export function applyStringOperation(
  input: any,
  operation: string,
  options: StringTransformOptions = {}
): any {
  const str = input !== undefined && input !== null ? String(input) : '';

  switch (operation) {
    // --- 1. Slicing & Substrings ---
    case 'slice': {
      if (options.sliceExpr) {
        return parseSliceNotation(str, options.sliceExpr);
      }
      const start = options.start !== undefined ? Number(options.start) : 0;
      const end = options.end !== undefined ? Number(options.end) : undefined;
      return str.slice(start, end);
    }

    case 'substring': {
      const start = Number(options.start) || 0;
      const length = options.length !== undefined ? Number(options.length) : undefined;
      return length !== undefined ? str.substring(start, start + length) : str.substring(start);
    }

    case 'remove_start':
    case 'remove_first_n': {
      if (options.prefix) {
        return removePrefixSuffix(str, 'prefix', options.prefix);
      }
      return removePrefixSuffix(str, 'first_n', options.count ?? 1);
    }

    case 'remove_end':
    case 'remove_last_n': {
      if (options.suffix) {
        return removePrefixSuffix(str, 'suffix', options.suffix);
      }
      return removePrefixSuffix(str, 'last_n', options.count ?? 1);
    }

    case 'keep_first_n': {
      const n = Math.max(0, Number(options.count) || 0);
      return str.slice(0, n);
    }

    case 'keep_last_n': {
      const n = Math.max(0, Number(options.count) || 0);
      return n === 0 ? '' : str.slice(-n);
    }

    case 'substring_between': {
      return substringBetween(
        str,
        options.startDelimiter || '(',
        options.endDelimiter || ')',
        !!options.inclusive
      );
    }

    case 'substring_before': {
      return substringBefore(str, options.delimiter || ',', !!options.fromEnd);
    }

    case 'substring_after': {
      return substringAfter(str, options.delimiter || ',', !!options.fromEnd);
    }

    case 'char_at': {
      const idx = Number(options.start) || 0;
      return idx < 0 ? str.charAt(str.length + idx) : str.charAt(idx);
    }

    // --- 2. Strip & Trim ---
    case 'strip':
    case 'trim': {
      return stripCharacters(str, options.stripMode || 'both', options.chars);
    }

    case 'strip_start':
    case 'trim_start':
    case 'lstrip': {
      return stripCharacters(str, 'start', options.chars);
    }

    case 'strip_end':
    case 'trim_end':
    case 'rstrip': {
      return stripCharacters(str, 'end', options.chars);
    }

    case 'clean_whitespace':
    case 'normalize_spaces': {
      return cleanWhitespace(str);
    }

    // --- 3. Join, Split & Wrap ---
    case 'join': {
      const delim = options.delimiter !== undefined ? options.delimiter : ', ';
      if (Array.isArray(input)) return input.join(delim);
      return str;
    }

    case 'split': {
      const delim = options.delimiter !== undefined ? options.delimiter : ',';
      return str.split(delim).map((s) => s.trim());
    }

    case 'wrap': {
      const p = options.prefix || '';
      const s = options.suffix || '';
      return `${p}${str}${s}`;
    }

    // --- 4. Casing & Styling ---
    case 'lowercase':
      return str.toLowerCase();

    case 'uppercase':
      return str.toUpperCase();

    case 'capitalize':
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

    case 'title_case':
      return toTitleCase(str);

    case 'camel_case':
      return toCamelCase(str);

    case 'snake_case':
      return toSnakeCase(str);

    case 'kebab_case':
      return toKebabCase(str);

    // --- 5. Replace, Padding & Cleaning ---
    case 'replace': {
      const search = options.search || '';
      const replaceWith = options.replaceWith || '';
      if (options.useRegex) {
        try {
          const flags = options.caseSensitive ? 'g' : 'gi';
          return str.replace(new RegExp(search, flags), replaceWith);
        } catch {
          return str.replaceAll(search, replaceWith);
        }
      }
      return str.replaceAll(search, replaceWith);
    }

    case 'truncate': {
      return truncateText(
        str,
        options.maxLength || 50,
        options.ellipsis ?? '...',
        options.wordBoundary !== false
      );
    }

    case 'pad_start': {
      const targetLen = Number(options.targetLength) || 10;
      const padChar = options.padChar || '0';
      return str.padStart(targetLen, padChar);
    }

    case 'pad_end': {
      const targetLen = Number(options.targetLength) || 10;
      const padChar = options.padChar || ' ';
      return str.padEnd(targetLen, padChar);
    }

    case 'slugify':
      return slugifyText(str);

    case 'remove_accents':
      return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    case 'html_decode':
      return decodeHtmlEntities(str);

    case 'count': {
      const mode = options.chars || 'chars';
      if (mode === 'words') {
        const words = str.trim().split(/\s+/).filter(Boolean);
        return words.length;
      }
      if (mode === 'lines') {
        return str.split(/\r\n|\r|\n/).length;
      }
      if (mode === 'occurrences' && options.search) {
        return (str.match(new RegExp(options.search, 'gi')) || []).length;
      }
      return str.length;
    }

    // --- 6. Numbers, Currency & Math ---
    case 'parseNumber': {
      const cleaned = str.replace(/[^0-9.-]/g, '');
      const num = Number(cleaned);
      return isNaN(num) ? 0 : num;
    }

    case 'roundNumber': {
      const num = Number(str);
      if (isNaN(num)) return 0;
      const dec = options.decimals !== undefined ? Number(options.decimals) : 2;
      const factor = Math.pow(10, dec);
      if (options.roundMode === 'floor') return Math.floor(num * factor) / factor;
      if (options.roundMode === 'ceil') return Math.ceil(num * factor) / factor;
      return Math.round(num * factor) / factor;
    }

    case 'formatCurrency': {
      const cleaned = str.replace(/[^0-9.-]/g, '');
      const num = Number(cleaned) || 0;
      const symbol = options.currencySymbol || '$';
      const dec = options.decimals !== undefined ? Number(options.decimals) : 2;
      return `${symbol}${num.toLocaleString(undefined, {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      })}`;
    }

    case 'cleanPrice': {
      const mode = options.priceMode || 'number_only';
      if (mode === 'strip_symbols') {
        return str.replace(/[$€£¥₹\s]/g, '').trim();
      }
      const match = str.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
      return match ? match[0] : '';
    }

    // --- 7. JSON, Object & Fallback ---
    case 'parseJSON': {
      try {
        return JSON.parse(str);
      } catch {
        return input;
      }
    }

    case 'stringifyJSON': {
      try {
        return JSON.stringify(input, null, 2);
      } catch {
        return String(input);
      }
    }

    case 'defaultFallback': {
      if (input === null || input === undefined || str.trim() === '') {
        return options.fallbackValue ?? '';
      }
      return input;
    }

    case 'extractField':
    case 'getProperty': {
      const field = options.field || '';
      let targetObj = input;
      if (typeof targetObj === 'string') {
        try {
          targetObj = JSON.parse(targetObj);
        } catch {
          // not JSON
        }
      }
      if (targetObj && typeof targetObj === 'object') {
        const parts = field.split('.');
        let curr = targetObj;
        for (const p of parts) {
          if (curr === undefined || curr === null) return '';
          curr = curr[p];
        }
        return curr !== undefined ? curr : '';
      }
      return '';
    }

    // --- 8. Arrays & Lists ---
    case 'array_deduplicate':
    case 'deduplicate':
    case 'unique': {
      return arrayDeduplicate(input, options.key || options.field);
    }

    case 'array_filter':
    case 'filter': {
      return arrayFilter(
        input,
        options.filterExpr || options.condition,
        options.field,
        options.operator,
        options.filterValue !== undefined ? options.filterValue : options.value
      );
    }

    case 'array_sort':
    case 'sort': {
      return arraySort(
        input,
        options.sortKey || options.field || options.key,
        options.sortOrder || 'asc',
        options.sortType || 'auto'
      );
    }

    case 'array_chunk':
    case 'chunk': {
      return arrayChunk(input, options.chunkSize || options.count || 10);
    }

    case 'array_take':
    case 'take': {
      return arrayTake(
        input,
        options.count || 1,
        options.fromEnd || options.takeMode === 'last'
      );
    }

    case 'array_drop':
    case 'drop': {
      return arrayDrop(
        input,
        options.count || 1,
        options.fromEnd || options.dropMode === 'last'
      );
    }

    case 'array_flatten':
    case 'flatten': {
      return arrayFlatten(input, !!options.deep);
    }

    // --- 9. Dates & Timestamps ---
    case 'date_math':
    case 'add_subtract_date': {
      return dateMath(
        input,
        options.dateMathExpr || options.expression,
        options.dateOffsetValue,
        options.dateOffsetUnit
      );
    }

    case 'date_relative_parse':
    case 'parse_relative_time': {
      return parseRelativeTime(str);
    }

    case 'date_diff':
    case 'date_difference': {
      return dateDifference(input, options.compareDate, options.diffUnit);
    }

    case 'date_format_mask':
    case 'format_date_mask': {
      return formatDateMask(input, options.formatMask || 'YYYY-MM-DD');
    }

    case 'date_timezone':
    case 'convert_timezone': {
      return convertTimezone(input, options.targetTimezone || 'UTC');
    }

    // --- 10. Booleans & Logic ---
    case 'is_empty': {
      return isEmpty(input);
    }

    case 'is_not_empty': {
      return isNotEmpty(input);
    }

    case 'boolean_not':
    case 'invert': {
      return booleanInvert(input);
    }

    case 'boolean_compare':
    case 'compare': {
      return booleanCompare(
        input,
        options.compareValue !== undefined ? options.compareValue : options.value,
        options.operator || '=='
      );
    }

    case 'boolean_coerce':
    case 'to_boolean': {
      return coerceBoolean(input);
    }

    // --- 11. URLs & Links ---
    case 'url_extract_param':
    case 'get_query_param': {
      return extractUrlQueryParam(str, options.paramName || options.field || 'v');
    }

    case 'url_extract_domain':
    case 'extract_domain': {
      return extractUrlDomain(str, !!options.stripWww);
    }

    case 'url_extract_path':
    case 'extract_pathname': {
      return extractUrlPath(str);
    }

    case 'url_build_query':
    case 'build_query_string': {
      return buildUrlQueryString(input, options.includeQuestionMark !== false);
    }

    // --- 12. Numbers & Math ---
    case 'math_expression':
    case 'evaluate_math': {
      return evaluateMathExpression(options.expression || str, input);
    }

    case 'math_clamp':
    case 'clamp': {
      return clampNumber(input, options.min ?? 0, options.max ?? 100);
    }

    case 'math_random':
    case 'random_range': {
      return randomNumber(options.min ?? 0, options.max ?? 100, options.integer !== false);
    }

    case 'math_aggregate':
    case 'aggregate': {
      return aggregateNumbers(input, options.aggregateType || 'sum', options.field);
    }

    default:
      return str;
  }
}
