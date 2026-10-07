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

    default:
      return str;
  }
}
