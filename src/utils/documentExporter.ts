/**
 * Document Export Utility for AutoFlow
 * Supports generating and formatting PDF, CSV, JSON, and XLSX outputs from AI Agent results.
 */

/**
 * Converts arbitrary data (array of objects, nested JSON, markdown tables, or primitives) into valid CSV.
 */
export function jsonToCsv(data: any): string {
  if (!data) return '';

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
      return jsonToCsv(data[arrayKey]);
    }
    // Single object: one row
    rows = [data];
  } else if (typeof data === 'string') {
    // Check if data is already CSV-like
    if (data.includes(',') && data.includes('\n')) {
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
            .join(',')
        )
        .join('\n');
    }
    rows = [{ value: data }];
  }

  // Collect all unique headers
  const headers = Array.from(
    new Set(
      rows.reduce<string[]>((acc, row) => {
        return acc.concat(Object.keys(row));
      }, [])
    )
  );

  const escapeField = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvRows: string[] = [];
  // Header row
  csvRows.push(headers.map(escapeField).join(','));

  // Data rows
  for (const row of rows) {
    const values = headers.map((header) => escapeField(row[header]));
    csvRows.push(values.join(','));
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
