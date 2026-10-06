/**
 * Dataset Importer Utility for AutoFlow
 * Supports parsing CSV, TSV, and JSON files and extracting headers and records.
 */

export interface ParsedDataset {
  headers: string[];
  rows: Record<string, any>[];
  filename?: string;
  format: 'csv' | 'json';
}

/**
 * Robust CSV parser that handles:
 * - CRLF, LF, and CR line endings
 * - Quoted fields with embedded commas and newlines
 * - Escaped double quotes ("")
 * - Delimiter detection (comma, tab, semicolon)
 * - UTF-8 BOM removal
 */
export function parseCsv(csvContent: string): { headers: string[]; rows: Record<string, any>[] } {
  if (!csvContent || typeof csvContent !== 'string') {
    return { headers: [], rows: [] };
  }

  // Strip BOM if present
  let cleanContent = csvContent.replace(/^\uFEFF/, '').trim();
  if (!cleanContent) {
    return { headers: [], rows: [] };
  }

  // Auto-detect delimiter from the first line (comma, tab, or semicolon)
  const firstLine = cleanContent.split(/\r\n|\n|\r/)[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;

  let delimiter = ',';
  if (tabCount > commaCount && tabCount > semiCount) {
    delimiter = '\t';
  } else if (semiCount > commaCount && semiCount > tabCount) {
    delimiter = ';';
  }

  // Parse CSV tokens while respecting quotes
  const parsedRows: string[][] = [];
  let currentRow: string[] = [];
  let currentToken = '';
  let insideQuotes = false;
  let i = 0;
  const len = cleanContent.length;

  while (i < len) {
    const char = cleanContent[i];
    const nextChar = cleanContent[i + 1];

    if (insideQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        currentToken += '"';
        i += 2;
        continue;
      } else if (char === '"') {
        // Closing quote
        insideQuotes = false;
        i++;
        continue;
      } else {
        currentToken += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        // Opening quote
        insideQuotes = true;
        i++;
        continue;
      } else if (char === delimiter) {
        // End of cell
        currentRow.push(currentToken.trim());
        currentToken = '';
        i++;
        continue;
      } else if (char === '\r' && nextChar === '\n') {
        // End of row (CRLF)
        currentRow.push(currentToken.trim());
        if (currentRow.some((c) => c !== '')) {
          parsedRows.push(currentRow);
        }
        currentRow = [];
        currentToken = '';
        i += 2;
        continue;
      } else if (char === '\n' || char === '\r') {
        // End of row (LF or CR)
        currentRow.push(currentToken.trim());
        if (currentRow.some((c) => c !== '')) {
          parsedRows.push(currentRow);
        }
        currentRow = [];
        currentToken = '';
        i++;
        continue;
      } else {
        currentToken += char;
        i++;
        continue;
      }
    }
  }

  // Add trailing token and row if present
  if (currentToken || currentRow.length > 0) {
    currentRow.push(currentToken.trim());
    if (currentRow.some((c) => c !== '')) {
      parsedRows.push(currentRow);
    }
  }

  if (parsedRows.length === 0) {
    return { headers: [], rows: [] };
  }

  // First row is headers
  const rawHeaders = parsedRows[0].map((h, idx) => {
    const cleanH = h.replace(/^["']|["']$/g, '').trim();
    return cleanH || `col_${idx + 1}`;
  });

  // Ensure unique headers
  const headers: string[] = [];
  const seenHeaders = new Map<string, number>();
  for (const h of rawHeaders) {
    let uniqueH = h;
    const count = seenHeaders.get(h) || 0;
    if (count > 0) {
      uniqueH = `${h}_${count + 1}`;
    }
    seenHeaders.set(h, count + 1);
    headers.push(uniqueH);
  }

  // Parse remaining rows into objects
  const rows: Record<string, any>[] = [];
  for (let r = 1; r < parsedRows.length; r++) {
    const rowCells = parsedRows[r];
    const rowObj: Record<string, any> = {};
    let hasValue = false;

    for (let c = 0; c < headers.length; c++) {
      const header = headers[c];
      const rawVal = rowCells[c] !== undefined ? rowCells[c] : '';
      if (rawVal !== '') hasValue = true;

      // Type coercion for numbers / booleans when appropriate
      if (rawVal === 'true') {
        rowObj[header] = true;
      } else if (rawVal === 'false') {
        rowObj[header] = false;
      } else if (rawVal !== '' && !isNaN(Number(rawVal)) && !rawVal.startsWith('0') && rawVal.length < 15) {
        rowObj[header] = Number(rawVal);
      } else {
        rowObj[header] = rawVal;
      }
    }

    if (hasValue) {
      rows.push(rowObj);
    }
  }

  return { headers, rows };
}

/**
 * Robust JSON dataset parser that handles:
 * - Array of objects: [{ title: '...', price: '...' }, ...]
 * - Object with array property: { items: [...] }, { data: [...] }, { rows: [...] }
 * - Array of primitives: ['val1', 'val2'] -> [{ value: 'val1' }, { value: 'val2' }]
 * - Single object: { title: '...', price: '...' } -> [{ title: '...', price: '...' }]
 */
export function parseJsonDataset(jsonContent: string): { headers: string[]; rows: Record<string, any>[] } {
  if (!jsonContent || typeof jsonContent !== 'string') {
    return { headers: [], rows: [] };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonContent.trim());
  } catch (err: any) {
    throw new Error(`Invalid JSON format: ${err.message}`);
  }

  let rawList: any[] = [];
  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (typeof parsed === 'object' && parsed !== null) {
    // Check known array property keys
    const arrayKeys = ['items', 'rows', 'data', 'records', 'results', 'elements', 'products', 'posts', 'entries'];
    const matchedKey = arrayKeys.find((k) => Array.isArray(parsed[k]));

    if (matchedKey) {
      rawList = parsed[matchedKey];
    } else {
      // Find any first array property
      const anyArr = Object.values(parsed).find((v) => Array.isArray(v));
      if (anyArr) {
        rawList = anyArr as any[];
      } else {
        // Single object wrap
        rawList = [parsed];
      }
    }
  }

  if (rawList.length === 0) {
    return { headers: [], rows: [] };
  }

  // Normalize list to array of objects
  const rows: Record<string, any>[] = rawList.map((item, idx) => {
    if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
      return item;
    }
    return { id: idx + 1, value: item };
  });

  // Extract unique headers across all rows in order of appearance
  const headerSet = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      headerSet.add(key);
    }
  }

  const headers = Array.from(headerSet);
  return { headers, rows };
}

/**
 * Parse an imported File object (either CSV, TSV, or JSON)
 */
export async function importDatasetFile(file: File): Promise<ParsedDataset> {
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });

  const filename = file.name || 'imported_dataset';
  const isJson = filename.toLowerCase().endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[');

  if (isJson) {
    const { headers, rows } = parseJsonDataset(text);
    return { headers, rows, filename, format: 'json' };
  } else {
    const { headers, rows } = parseCsv(text);
    return { headers, rows, filename, format: 'csv' };
  }
}

/**
 * Parse a raw string containing CSV, TSV, or JSON dataset.
 */
export function parseDatasetString(text: string, filename = 'pasted_dataset'): ParsedDataset {
  const trimmed = (text || '').trim();
  const isJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  if (isJson) {
    const { headers, rows } = parseJsonDataset(trimmed);
    return { headers, rows, filename, format: 'json' };
  } else {
    const { headers, rows } = parseCsv(trimmed);
    return { headers, rows, filename, format: 'csv' };
  }
}

