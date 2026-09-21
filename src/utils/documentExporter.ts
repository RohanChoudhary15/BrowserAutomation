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
      const xmlStr = dataToSpreadsheetXml(dataSource, 'AI Analysis');
      const dataUrl = `data:application/vnd.ms-excel;charset=utf-8,${encodeURIComponent(xmlStr)}`;
      return {
        format: 'xlsx',
        data: xmlStr,
        filename: `${baseFilename}.xlsx`,
        sizeBytes: xmlStr.length,
        parsedOutput: parsedJson !== null ? parsedJson : rawResponse,
        formattedContent: xmlStr,
        dataUrl,
        mimeType: 'application/vnd.ms-excel',
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

  const rowCount = normalizedRows.length;
  const columnCount = headers.length;

  switch (format) {
    case 'xlsx': {
      const xmlStr = dataToSpreadsheetXml(normalizedRows, sheetName);
      const filename = `${baseFilename}.xlsx`;
      const mimeType = 'application/vnd.ms-excel';
      const dataUrl = `data:${mimeType};charset=utf-8,${encodeURIComponent(xmlStr)}`;
      return {
        format: 'xlsx',
        content: xmlStr,
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
