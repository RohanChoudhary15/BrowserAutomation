/**
 * Document Export Utility for AutoFlow
 * Supports generating and formatting PDF, CSV, JSON, and XLSX outputs from AI Agent results.
 */

export interface CsvExportOptions {
  delimiter?: string;
  includeBom?: boolean;
  headers?: string[];
  includeHeaders?: boolean;
}

export interface DatasetColumnDef {
  header: string;
  value: any;
}

export type ExportDataFormat = 'csv' | 'xlsx' | 'json' | 'tsv' | 'html_table' | 'html' | 'text';

export interface ExportDocumentOptions {
  filename?: string;
  delimiter?: string;
  includeBom?: boolean;
  includeHeaders?: boolean;
  sheetName?: string;
  customHeaders?: string[];
  prettyJson?: boolean;
  excludeEmpty?: boolean;
  filterEmptyMode?: 'any' | 'all';
}

export interface ExportDocumentResult {
  format: ExportDataFormat;
  content: string;
  dataUrl: string;
  mimeType: string;
  fileExtension: string;
  filename: string;
  rowCount: number;
  columnCount: number;
  headers: string[];
  rows: Record<string, any>[];
}

/**
 * Checks if a dataset row is considered empty.
 * In 'any' mode: returns true if ANY field in the row is empty (null, undefined, or whitespace string).
 * In 'all' mode: returns true only if ALL fields in the row are empty.
 */
export function isRowEmpty(
  row: Record<string, any>,
  mode: 'any' | 'all' = 'any',
  headers?: string[]
): boolean {
  if (!row || typeof row !== 'object') return true;
  const keys = headers && headers.length > 0 ? headers : Object.keys(row);
  if (keys.length === 0) return true;

  const isValEmpty = (val: any): boolean => {
    if (val === null || val === undefined) return true;
    if (typeof val === 'string') return val.trim() === '';
    if (Array.isArray(val)) return val.length === 0;
    return false;
  };

  if (mode === 'any') {
    return keys.some((k) => isValEmpty(row[k]));
  } else {
    return keys.every((k) => isValEmpty(row[k]));
  }
}

/**
 * Filters rows from a dataset based on whether fields are empty.
 */
export function filterDatasetRows(
  rows: Record<string, any>[],
  options?: {
    excludeEmpty?: boolean;
    filterEmptyMode?: 'any' | 'all';
    headers?: string[];
  }
): Record<string, any>[] {
  if (!Array.isArray(rows)) return [];
  if (!options?.excludeEmpty) return rows;
  const mode = options.filterEmptyMode || 'any';
  return rows.filter((row) => !isRowEmpty(row, mode, options.headers));
}

/**
 * Converts arbitrary data (array of objects, nested JSON, markdown tables, or primitives) into valid CSV/TSV.
 */
export function jsonToCsv(data: any, optionsOrDelimiter?: string | CsvExportOptions): string {
  if (!data) return '';

  const opts: CsvExportOptions = typeof optionsOrDelimiter === 'string'
    ? { delimiter: optionsOrDelimiter }
    : optionsOrDelimiter || {};

  const delimiter = opts.delimiter || ',';
  const includeHeaders = opts.includeHeaders !== false;

  let rows: Record<string, any>[] = [];

  if (Array.isArray(data)) {
    if (data.length === 0) return '';
    if (typeof data[0] === 'object' && data[0] !== null) {
      rows = data;
    } else {
      rows = data.map((item, idx) => ({ index: idx + 1, value: item }));
    }
  } else if (typeof data === 'object' && data !== null) {
    // If object with array property like { items: [...] } or { products: [...] }
    const arrayKey = Object.keys(data).find((k) => Array.isArray(data[k]));
    if (arrayKey && Array.isArray(data[arrayKey])) {
      return jsonToCsv(data[arrayKey], opts);
    }
    // Single object: one row
    rows = [data];
  } else if (typeof data === 'string') {
    // Check if data is already CSV-like
    if (data.includes(delimiter) && data.includes('\n')) {
      return data;
    }
    // Check if markdown table
    if (data.includes('|')) {
      const lines = data.split('\n').filter((l) => l.trim().startsWith('|') && !l.includes('---'));
      return lines
        .map((l) =>
          l
            .split('|')
            .slice(1, -1)
            .map((c) => `"${c.trim().replace(/"/g, '""')}"`)
            .join(delimiter)
        )
        .join('\n');
    }
    rows = [{ value: data }];
  }

  // Collect all unique headers or use custom headers
  const headers = opts.headers && opts.headers.length > 0
    ? opts.headers
    : Array.from(
        new Set(
          rows.reduce<string[]>((acc, row) => {
            return acc.concat(Object.keys(row));
          }, [])
        )
      );

  const escapeField = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvRows: string[] = [];
  // Header row
  if (includeHeaders && headers.length > 0) {
    csvRows.push(headers.map(escapeField).join(delimiter));
  }

  // Data rows
  for (const row of rows) {
    const values = headers.map((header) => escapeField(row[header]));
    csvRows.push(values.join(delimiter));
  }

  return csvRows.join('\r\n');
}

/**
 * Converts structured data into Microsoft Excel SpreadsheetML XML (.xlsx / .xls compatible).
 * Natively opens in Microsoft Excel, Google Sheets, and LibreOffice.
 */
export function dataToSpreadsheetXml(data: any, sheetName = 'Sheet1'): string {
  let rows: Record<string, any>[] = [];

  if (Array.isArray(data)) {
    if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
      rows = data;
    } else {
      rows = data.map((v, i) => ({ Index: i + 1, Value: v }));
    }
  } else if (typeof data === 'object' && data !== null) {
    const arrayKey = Object.keys(data).find((k) => Array.isArray(data[k]));
    if (arrayKey && Array.isArray(data[arrayKey])) {
      return dataToSpreadsheetXml(data[arrayKey], sheetName);
    }
    rows = [data];
  } else {
    rows = [{ Value: String(data) }];
  }

  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));

  const escapeXml = (val: any): string => {
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Bottom"/>
   <Borders/>
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="Header">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#4F46E5" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${escapeXml(sheetName)}">
  <Table>
`;

  // Header row
  xml += '   <Row ss:Height="22">\n';
  for (const h of headers) {
    xml += `    <Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>\n`;
  }
  xml += '   </Row>\n';

  // Data rows
  for (const row of rows) {
    xml += '   <Row ss:Height="18">\n';
    for (const h of headers) {
      const val = row[h];
      const isNum = typeof val === 'number' && !isNaN(val);
      const cellType = isNum ? 'Number' : 'String';
      const cellVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : val;
      xml += `    <Cell><Data ss:Type="${cellType}">${escapeXml(cellVal)}</Data></Cell>\n`;
    }
    xml += '   </Row>\n';
  }

  xml += `  </Table>
 </Worksheet>
</Workbook>`;

  return xml;
}

/**
 * Fast IEEE 802.3 CRC-32 implementation for PKZIP checksumming.
 */
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

function calculateCrc32(bytes: Uint8Array): number {
  let crc = 0 ^ (-1);
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

/**
 * Creates a standard PKZIP archive (ZIP 2.0 / Store mode) containing arbitrary files.
 * Works natively in both Browser (Uint8Array) and Node.js environments without dependencies.
 */
export function createPkZipArchive(files: Array<{ name: string; data: string | Uint8Array }>): Uint8Array {
  const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const toUint8 = (input: string | Uint8Array): Uint8Array => {
    if (input instanceof Uint8Array) return input;
    if (encoder) return encoder.encode(input);
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(input, 'utf8'));
    const arr = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) arr[i] = input.charCodeAt(i) & 0xff;
    return arr;
  };

  interface PreparedEntry {
    nameBytes: Uint8Array;
    dataBytes: Uint8Array;
    crc: number;
    size: number;
    offset: number;
  }

  const entries: PreparedEntry[] = [];
  let totalLocalSize = 0;

  for (const f of files) {
    const nameBytes = toUint8(f.name);
    const dataBytes = toUint8(f.data);
    const crc = calculateCrc32(dataBytes);
    const size = dataBytes.length;
    const entry: PreparedEntry = {
      nameBytes,
      dataBytes,
      crc,
      size,
      offset: totalLocalSize,
    };
    entries.push(entry);
    // 30 bytes fixed local header + name length + data length
    totalLocalSize += 30 + nameBytes.length + size;
  }

  let centralDirSize = 0;
  for (const entry of entries) {
    // 46 bytes fixed central dir header + name length
    centralDirSize += 46 + entry.nameBytes.length;
  }

  const totalZipSize = totalLocalSize + centralDirSize + 22;
  const zipBuffer = new Uint8Array(totalZipSize);
  const view = new DataView(zipBuffer.buffer);

  let currentPos = 0;

  // 1. Write Local File Headers and file data
  for (const entry of entries) {
    // Signature 0x04034b50 (PK\x03\x04)
    view.setUint32(currentPos, 0x04034b50, true);
    view.setUint16(currentPos + 4, 20, true); // Version needed (2.0)
    view.setUint16(currentPos + 6, 0x0800, true); // General purpose flag: UTF-8 (bit 11)
    view.setUint16(currentPos + 8, 0, true); // Compression: 0 (Store)
    view.setUint16(currentPos + 10, 0x4000, true); // Last mod time
    view.setUint16(currentPos + 12, 0x5800, true); // Last mod date
    view.setUint32(currentPos + 14, entry.crc, true); // CRC32
    view.setUint32(currentPos + 18, entry.size, true); // Compressed size
    view.setUint32(currentPos + 22, entry.size, true); // Uncompressed size
    view.setUint16(currentPos + 26, entry.nameBytes.length, true); // Filename length
    view.setUint16(currentPos + 28, 0, true); // Extra field length

    currentPos += 30;
    zipBuffer.set(entry.nameBytes, currentPos);
    currentPos += entry.nameBytes.length;
    zipBuffer.set(entry.dataBytes, currentPos);
    currentPos += entry.size;
  }

  const centralDirStartOffset = currentPos;

  // 2. Write Central Directory Headers
  for (const entry of entries) {
    // Signature 0x02014b50 (PK\x01\x02)
    view.setUint32(currentPos, 0x02014b50, true);
    view.setUint16(currentPos + 4, 20, true); // Version made by
    view.setUint16(currentPos + 6, 20, true); // Version needed
    view.setUint16(currentPos + 8, 0x0800, true); // Flag (UTF-8)
    view.setUint16(currentPos + 10, 0, true); // Compression: 0 (Store)
    view.setUint16(currentPos + 12, 0x4000, true); // Mod time
    view.setUint16(currentPos + 14, 0x5800, true); // Mod date
    view.setUint32(currentPos + 16, entry.crc, true); // CRC32
    view.setUint32(currentPos + 20, entry.size, true); // Compressed size
    view.setUint32(currentPos + 24, entry.size, true); // Uncompressed size
    view.setUint16(currentPos + 28, entry.nameBytes.length, true); // Name length
    view.setUint16(currentPos + 30, 0, true); // Extra length
    view.setUint16(currentPos + 32, 0, true); // Comment length
    view.setUint16(currentPos + 34, 0, true); // Disk start
    view.setUint16(currentPos + 36, 0, true); // Internal attr
    view.setUint32(currentPos + 38, 0, true); // External attr
    view.setUint32(currentPos + 42, entry.offset, true); // Local header offset

    currentPos += 46;
    zipBuffer.set(entry.nameBytes, currentPos);
    currentPos += entry.nameBytes.length;
  }

  // 3. Write End of Central Directory (EOCD)
  // Signature 0x06054b50 (PK\x05\x06)
  view.setUint32(currentPos, 0x06054b50, true);
  view.setUint16(currentPos + 4, 0, true); // Disk number
  view.setUint16(currentPos + 6, 0, true); // Start disk
  view.setUint16(currentPos + 8, entries.length, true); // Entries on disk
  view.setUint16(currentPos + 10, entries.length, true); // Total entries
  view.setUint32(currentPos + 12, centralDirSize, true); // Central dir size
  view.setUint32(currentPos + 16, centralDirStartOffset, true); // Central dir offset
  view.setUint16(currentPos + 20, 0, true); // Comment length

  return zipBuffer;
}

/**
 * Encodes Uint8Array binary bytes into a Base64 string in any environment (Browser or Node).
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as any);
  }
  return btoa(binary);
}

/**
 * Converts 0-based column index to Excel column letter (0 -> A, 25 -> Z, 26 -> AA, 27 -> AB).
 */
export function getExcelColumnLetter(colIndex: number): string {
  let letter = '';
  let temp = colIndex;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

/**
 * Generates a genuine Microsoft Excel OpenXML (.xlsx) binary package.
 * Produces a 100% valid ZIP archive with standard OpenXML parts:
 * - [Content_Types].xml
 * - _rels/.rels
 * - xl/workbook.xml
 * - xl/_rels/workbook.xml.rels
 * - xl/styles.xml
 * - xl/worksheets/sheet1.xml
 *
 * Natively recognized and opened by Microsoft Excel, Google Sheets, LibreOffice, and Numbers with 0 errors.
 */
export function generateOpenXmlXlsx(
  data: any,
  customHeaders?: string[],
  sheetName = 'Sheet1'
): Uint8Array {
  let rows: Record<string, any>[] = [];

  if (Array.isArray(data)) {
    if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
      rows = data;
    } else {
      rows = data.map((v, i) => ({ Index: i + 1, Value: v }));
    }
  } else if (typeof data === 'object' && data !== null) {
    const arrayKey = Object.keys(data).find((k) => Array.isArray(data[k]));
    if (arrayKey && Array.isArray(data[arrayKey])) {
      return generateOpenXmlXlsx(data[arrayKey], customHeaders, sheetName);
    }
    rows = [data];
  } else {
    rows = [{ Value: String(data || '') }];
  }

  const headers = customHeaders && customHeaders.length > 0
    ? customHeaders
    : Array.from(new Set(rows.flatMap((r) => Object.keys(r))));

  const cleanSheetName = (sheetName || 'Sheet1').replace(/[\\/*?:[\]]/g, '_').slice(0, 31);

  const escapeXml = (val: any): string => {
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  // 1. [Content_Types].xml
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  // 2. _rels/.rels
  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  // 3. xl/_rels/workbook.xml.rels
  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  // 4. xl/workbook.xml
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews>
    <workbookView xWindow="0" yWindow="0" windowWidth="20480" windowHeight="10240"/>
  </bookViews>
  <sheets>
    <sheet name="${escapeXml(cleanSheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  // 5. xl/styles.xml
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font>
      <sz val="11"/>
      <color theme="1"/>
      <name val="Calibri"/>
      <family val="2"/>
      <scheme val="minor"/>
    </font>
    <font>
      <b/>
      <sz val="11"/>
      <color rgb="FFFFFFFF"/>
      <name val="Calibri"/>
      <family val="2"/>
      <scheme val="minor"/>
    </font>
  </fonts>
  <fills count="3">
    <fill>
      <patternFill patternType="none"/>
    </fill>
    <fill>
      <patternFill patternType="gray125"/>
    </fill>
    <fill>
      <patternFill patternType="solid">
        <fgColor rgb="FF4F46E5"/>
        <bgColor indexed="64"/>
      </patternFill>
    </fill>
  </fills>
  <borders count="1">
    <border>
      <left/><right/><top/><bottom/><diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
</styleSheet>`;

  // 6. xl/worksheets/sheet1.xml
  let sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>`;

  // Header Row (Row 1, s="1" for bold white text on indigo fill)
  if (headers.length > 0) {
    sheetXml += `\n    <row r="1">`;
    for (let c = 0; c < headers.length; c++) {
      const colLetter = getExcelColumnLetter(c);
      sheetXml += `<c r="${colLetter}1" t="inlineStr" s="1"><is><t>${escapeXml(headers[c])}</t></is></c>`;
    }
    sheetXml += `</row>`;
  }

  // Data Rows (Starting at row 2)
  for (let r = 0; r < rows.length; r++) {
    const rowNum = headers.length > 0 ? r + 2 : r + 1;
    const rowData = rows[r];
    sheetXml += `\n    <row r="${rowNum}">`;

    for (let c = 0; c < headers.length; c++) {
      const colLetter = getExcelColumnLetter(c);
      const cellRef = `${colLetter}${rowNum}`;
      const val = rowData[headers[c]];

      if (val === null || val === undefined || val === '') {
        continue; // Empty cell
      } else if (typeof val === 'number' && !isNaN(val) && isFinite(val)) {
        sheetXml += `<c r="${cellRef}"><v>${val}</v></c>`;
      } else if (typeof val === 'boolean') {
        sheetXml += `<c r="${cellRef}" t="b"><v>${val ? 1 : 0}</v></c>`;
      } else {
        const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
        sheetXml += `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(strVal)}</t></is></c>`;
      }
    }
    sheetXml += `</row>`;
  }

  sheetXml += `\n  </sheetData>\n</worksheet>`;

  const files = [
    { name: '[Content_Types].xml', data: contentTypesXml },
    { name: '_rels/.rels', data: rootRelsXml },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml },
    { name: 'xl/workbook.xml', data: workbookXml },
    { name: 'xl/styles.xml', data: stylesXml },
    { name: 'xl/worksheets/sheet1.xml', data: sheetXml },
  ];

  return createPkZipArchive(files);
}

/**
 * Creates a valid PDF document with metadata and content stream.
 */
export function dataToPdfBinary(title: string, data: any): string {
  const contentText: string = typeof data === 'string'
    ? data
    : JSON.stringify(data, null, 2);

  // Split into lines for PDF stream
  const maxLines = 55;
  const lines = contentText.split('\n').slice(0, maxLines);

  let stream = 'BT\n/F1 16 Tf\n50 740 Td\n(' + escapePdf(title) + ') Tj\n';
  stream += '/F1 10 Tf\n0 -25 Td\n';

  for (const line of lines) {
    const cleanLine = line.replace(/[\r\t]/g, ' ').slice(0, 95);
    stream += '(' + escapePdf(cleanLine) + ') Tj\n0 -13 Td\n';
  }
  stream += 'ET';

  const streamLength = stream.length;

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page
   /Parent 2 0 R
   /MediaBox [0 0 612 792]
   /Resources << /Font << /F1 4 0 R >> >>
   /Contents 5 0 R
>>
endobj
4 0 obj
<< /Type /Font
   /Subtype /Type1
   /BaseFont /Helvetica
>>
endobj
5 0 obj
<< /Length ${streamLength} >>
stream
${stream}
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000262 00000 n 
0000000341 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${420 + streamLength}
%%EOF`;

  return pdf;
}

function escapePdf(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

export type AiAgentOutputFormat = 'normal' | 'text' | 'txt' | 'json' | 'csv' | 'xlsx' | 'pdf';

export interface FormattedDocumentResult {
  format?: AiAgentOutputFormat;
  data?: any;
  filename?: string;
  sizeBytes?: number;
  parsedOutput: any;
  formattedContent: string;
  dataUrl: string;
  mimeType: string;
  fileExtension: string;
  defaultFilename: string;
}

/**
 * Processes AI Agent raw output and transforms it into the requested format (Normal, PDF, CSV, JSON, XLSX, Text).
 */
export function formatAiAgentDocument(
  rawResponse: string,
  format: AiAgentOutputFormat = 'text',
  customFilename?: string
): FormattedDocumentResult {
  // If 'normal' is selected, return raw text directly without file wrapping
  if (format === 'normal') {
    return {
      format: 'normal',
      data: rawResponse,
      filename: '',
      sizeBytes: rawResponse.length,
      parsedOutput: rawResponse,
      formattedContent: rawResponse,
      dataUrl: '',
      mimeType: 'text/plain',
      fileExtension: '',
      defaultFilename: '',
    };
  }

  const baseFilename = (customFilename || 'ai_output').replace(/\.[a-zA-Z0-9]+$/, '');
  let parsedJson: any = null;

  // Attempt JSON parsing if applicable
  try {
    const clean = rawResponse.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
    parsedJson = JSON.parse(clean);
  } catch {
    parsedJson = null;
  }

  const dataSource = parsedJson !== null ? parsedJson : rawResponse;

  switch (format) {
    case 'json': {
      const jsonStr = parsedJson !== null ? JSON.stringify(parsedJson, null, 2) : JSON.stringify({ result: rawResponse }, null, 2);
      const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(jsonStr)}`;
      return {
        format: 'json',
        data: jsonStr,
        filename: `${baseFilename}.json`,
        sizeBytes: jsonStr.length,
        parsedOutput: parsedJson !== null ? parsedJson : { result: rawResponse },
        formattedContent: jsonStr,
        dataUrl,
        mimeType: 'application/json',
        fileExtension: 'json',
        defaultFilename: `${baseFilename}.json`,
      };
    }

    case 'csv': {
      const csvStr = jsonToCsv(dataSource);
      // Include UTF-8 BOM so Excel opens it with correct encoding
      const dataUrl = `data:text/csv;charset=utf-8,%EF%BB%BF${encodeURIComponent(csvStr)}`;
      return {
        format: 'csv',
        data: csvStr,
        filename: `${baseFilename}.csv`,
        sizeBytes: csvStr.length,
        parsedOutput: parsedJson !== null ? parsedJson : csvStr,
        formattedContent: csvStr,
        dataUrl,
        mimeType: 'text/csv',
        fileExtension: 'csv',
        defaultFilename: `${baseFilename}.csv`,
      };
    }

    case 'xlsx': {
      const xlsxBytes = generateOpenXmlXlsx(dataSource, undefined, 'AI Analysis');
      const base64Xlsx = uint8ArrayToBase64(xlsxBytes);
      const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const dataUrl = `data:${mimeType};base64,${base64Xlsx}`;
      return {
        format: 'xlsx',
        data: base64Xlsx,
        filename: `${baseFilename}.xlsx`,
        sizeBytes: xlsxBytes.length,
        parsedOutput: parsedJson !== null ? parsedJson : rawResponse,
        formattedContent: base64Xlsx,
        dataUrl,
        mimeType,
        fileExtension: 'xlsx',
        defaultFilename: `${baseFilename}.xlsx`,
      };
    }

    case 'pdf': {
      const pdfBinary = dataToPdfBinary('AutoFlow AI Agent Report', dataSource);
      const base64Pdf = typeof btoa === 'function' ? btoa(pdfBinary) : Buffer.from(pdfBinary).toString('base64');
      const dataUrl = `data:application/pdf;base64,${base64Pdf}`;
      return {
        format: 'pdf',
        data: pdfBinary,
        filename: `${baseFilename}.pdf`,
        sizeBytes: pdfBinary.length,
        parsedOutput: parsedJson !== null ? parsedJson : rawResponse,
        formattedContent: pdfBinary,
        dataUrl,
        mimeType: 'application/pdf',
        fileExtension: 'pdf',
        defaultFilename: `${baseFilename}.pdf`,
      };
    }

    case 'txt':
    case 'text':
    default: {
      const dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(rawResponse)}`;
      return {
        format,
        data: rawResponse,
        filename: `${baseFilename}.txt`,
        sizeBytes: rawResponse.length,
        parsedOutput: rawResponse,
        formattedContent: rawResponse,
        dataUrl,
        mimeType: 'text/plain',
        fileExtension: 'txt',
        defaultFilename: `${baseFilename}.txt`,
      };
    }
  }
}

/**
 * Zips multiple variable arrays/values into an aligned array of row objects.
 * Useful when multiple columns were extracted separately (e.g. titles[], prices[], links[]).
 */
export function zipVariablesToDataset(
  columns: Array<{ header: string; value: any }>
): Record<string, any>[] {
  if (!columns || columns.length === 0) return [];

  const parsedColumns = columns.map((col) => {
    let val = col.value;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (
        (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
        (trimmed.startsWith('{') && trimmed.endsWith('}'))
      ) {
        try {
          val = JSON.parse(trimmed);
        } catch {}
      }
    }
    return {
      header: col.header || 'Column',
      value: val,
    };
  });

  let maxRows = 1;
  let hasAnyArray = false;
  for (const col of parsedColumns) {
    if (Array.isArray(col.value)) {
      hasAnyArray = true;
      if (col.value.length > maxRows) {
        maxRows = col.value.length;
      }
    }
  }

  if (hasAnyArray && maxRows === 0) return [];

  const rows: Record<string, any>[] = [];
  for (let i = 0; i < maxRows; i++) {
    const row: Record<string, any> = {};
    for (const col of parsedColumns) {
      if (Array.isArray(col.value)) {
        row[col.header] = i < col.value.length ? col.value[i] : '';
      } else {
        row[col.header] = col.value !== undefined && col.value !== null ? col.value : '';
      }
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Creates a clean, styled HTML table page from structured data.
 */
export function dataToHtmlTable(data: any, title = 'Exported Data'): string {
  let rows: Record<string, any>[] = [];
  if (Array.isArray(data)) {
    if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
      rows = data;
    } else {
      rows = data.map((v, i) => ({ Index: i + 1, Value: v }));
    }
  } else if (typeof data === 'object' && data !== null) {
    rows = [data];
  } else {
    rows = [{ Value: String(data) }];
  }

  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const escapeHtml = (val: any) => {
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 24px; background: #0f172a; color: #e2e8f0; margin: 0; }
    h1 { font-size: 20px; font-weight: 600; margin-bottom: 8px; color: #f8fafc; }
    .meta { font-size: 13px; color: #94a3b8; margin-bottom: 20px; }
    .table-container { overflow-x: auto; background: #1e293b; border-radius: 10px; border: 1px solid #334155; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
    th { background: #312e81; color: #e0e7ff; font-weight: 600; padding: 12px 16px; border-bottom: 2px solid #4338ca; position: sticky; top: 0; }
    td { padding: 10px 16px; border-bottom: 1px solid #334155; }
    tr:nth-child(even) { background: #1e293b; }
    tr:nth-child(odd) { background: #172033; }
    tr:hover { background: #283548; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Exported ${rows.length} rows &bull; Generated by AutoFlow Automation</div>
  <div class="table-container">
    <table>
      <thead>
        <tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) =>
              `<tr>${headers
                .map((h) => {
                  const val = r[h];
                  const str = typeof val === 'object' && val !== null ? JSON.stringify(val) : val;
                  return `<td>${escapeHtml(str)}</td>`;
                })
                .join('')}</tr>`
          )
          .join('\n        ')}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

/**
 * Creates formatted export document (CSV, XLSX, JSON, TSV, HTML) ready for download or variable storage.
 */
export function createExportDocument(
  data: any,
  format: ExportDataFormat = 'csv',
  options: ExportDocumentOptions = {}
): ExportDocumentResult {
  const baseFilename = (options.filename || 'dataset').replace(/\.[a-zA-Z0-9]+$/, '');
  const delimiter = options.delimiter || (format === 'tsv' ? '\t' : ',');
  const sheetName = options.sheetName || 'Data';
  const includeBom = options.includeBom !== false;
  const includeHeaders = options.includeHeaders !== false;

  let normalizedRows: Record<string, any>[] = [];
  if (Array.isArray(data)) {
    if (data.length === 0) {
      normalizedRows = [];
    } else if (typeof data[0] === 'object' && data[0] !== null) {
      normalizedRows = data;
    } else {
      normalizedRows = data.map((item, idx) => ({ Index: idx + 1, Value: item }));
    }
  } else if (typeof data === 'object' && data !== null) {
    const arrayKey = Object.keys(data).find((k) => Array.isArray(data[k]));
    if (arrayKey && Array.isArray(data[arrayKey])) {
      normalizedRows = data[arrayKey];
    } else {
      normalizedRows = [data];
    }
  } else if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) normalizedRows = parsed;
      else if (typeof parsed === 'object' && parsed !== null) normalizedRows = [parsed];
      else normalizedRows = [{ Value: data }];
    } catch {
      normalizedRows = [{ Value: data }];
    }
  } else {
    normalizedRows = [{ Value: String(data || '') }];
  }

  const headers = options.customHeaders && options.customHeaders.length > 0
    ? options.customHeaders
    : Array.from(new Set(normalizedRows.flatMap((r) => Object.keys(r))));

  // Filter empty rows if excludeEmpty is requested
  if (options.excludeEmpty) {
    normalizedRows = filterDatasetRows(normalizedRows, {
      excludeEmpty: true,
      filterEmptyMode: options.filterEmptyMode || 'any',
      headers,
    });
  }

  const rowCount = normalizedRows.length;
  const columnCount = headers.length;

  switch (format) {
    case 'xlsx': {
      const xlsxBytes = generateOpenXmlXlsx(normalizedRows, headers, sheetName);
      const base64Xlsx = uint8ArrayToBase64(xlsxBytes);
      const filename = `${baseFilename}.xlsx`;
      const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const dataUrl = `data:${mimeType};base64,${base64Xlsx}`;
      return {
        format: 'xlsx',
        content: base64Xlsx,
        dataUrl,
        mimeType,
        fileExtension: 'xlsx',
        filename,
        rowCount,
        columnCount,
        headers,
        rows: normalizedRows,
      };
    }

    case 'json': {
      const jsonStr = JSON.stringify(normalizedRows, null, options.prettyJson !== false ? 2 : 0);
      const filename = `${baseFilename}.json`;
      const mimeType = 'application/json';
      const dataUrl = `data:${mimeType};charset=utf-8,${encodeURIComponent(jsonStr)}`;
      return {
        format: 'json',
        content: jsonStr,
        dataUrl,
        mimeType,
        fileExtension: 'json',
        filename,
        rowCount,
        columnCount,
        headers,
        rows: normalizedRows,
      };
    }

    case 'tsv': {
      const tsvStr = jsonToCsv(normalizedRows, { delimiter: '\t', includeBom, includeHeaders, headers });
      const filename = `${baseFilename}.tsv`;
      const mimeType = 'text/tab-separated-values';
      const bomPrefix = includeBom ? '%EF%BB%BF' : '';
      const dataUrl = `data:${mimeType};charset=utf-8,${bomPrefix}${encodeURIComponent(tsvStr)}`;
      return {
        format: 'tsv',
        content: tsvStr,
        dataUrl,
        mimeType,
        fileExtension: 'tsv',
        filename,
        rowCount,
        columnCount,
        headers,
        rows: normalizedRows,
      };
    }

    case 'html_table':
    case 'html': {
      const htmlStr = dataToHtmlTable(normalizedRows, baseFilename);
      const filename = `${baseFilename}.html`;
      const mimeType = 'text/html';
      const dataUrl = `data:${mimeType};charset=utf-8,${encodeURIComponent(htmlStr)}`;
      return {
        format: 'html_table',
        content: htmlStr,
        dataUrl,
        mimeType,
        fileExtension: 'html',
        filename,
        rowCount,
        columnCount,
        headers,
        rows: normalizedRows,
      };
    }

    case 'csv':
    default: {
      const csvStr = jsonToCsv(normalizedRows, { delimiter, includeBom, includeHeaders, headers });
      const filename = `${baseFilename}.csv`;
      const mimeType = 'text/csv';
      const bomPrefix = includeBom ? '%EF%BB%BF' : '';
      const dataUrl = `data:${mimeType};charset=utf-8,${bomPrefix}${encodeURIComponent(csvStr)}`;
      return {
        format: 'csv',
        content: csvStr,
        dataUrl,
        mimeType,
        fileExtension: 'csv',
        filename,
        rowCount,
        columnCount,
        headers,
        rows: normalizedRows,
      };
    }
  }
}

/**
 * Universal file download trigger (Chrome downloads API with DOM anchor fallback)
 */
export async function triggerFileDownload(dataUrl: string, filename: string, saveAs = false): Promise<any> {
  let resolvedFilename = filename;
  if (dataUrl.startsWith('data:application/pdf') && !resolvedFilename.toLowerCase().endsWith('.pdf')) {
    resolvedFilename += '.pdf';
  }

  if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
    try {
      return await chrome.downloads.download({
        url: dataUrl,
        filename: resolvedFilename,
        saveAs,
      });
    } catch (e) {
      console.warn('[AutoFlow] Chrome download API failed, falling back to DOM anchor:', e);
    }
  }

  if (typeof document !== 'undefined') {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = resolvedFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  }
}

/**
 * Formats dataset and triggers immediate client file download (CSV, XLSX, JSON, TSV, HTML)
 */
export async function exportAndDownloadDataset(
  items: any[],
  format: ExportDataFormat = 'csv',
  filename = 'scraped_table'
): Promise<ExportDocumentResult> {
  const doc = createExportDocument(items, format, { filename });
  await triggerFileDownload(doc.dataUrl, doc.filename);
  return doc;
}

