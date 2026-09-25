export type PdfThemeId =
  | 'modern_clean'
  | 'executive_dark'
  | 'minimalist_light'
  | 'corporate_blue'
  | 'academic_formal'
  | 'cyber_tech';

export type ImagePlacement = 'header_logo' | 'cover_page' | 'inline' | 'gallery_grid' | 'footer';

export interface InjectedImage {
  url: string; // Base64 data URL, remote HTTP url, or {{var}}
  placement?: ImagePlacement;
  caption?: string;
  alt?: string;
  width?: string; // e.g. '100%', '300px', 'auto'
}

export interface PdfThemeConfig {
  id: PdfThemeId;
  name: string;
  description: string;
  accentColor: string;
  bgColor: string;
  textColor: string;
  mutedColor: string;
  cardBg: string;
  borderColor: string;
  fontFamily: string;
  headingFont: string;
  headerBg?: string;
  badgeStyle: string;
  tableHeaderBg: string;
}

export const PDF_THEMES: Record<PdfThemeId, PdfThemeConfig> = {
  modern_clean: {
    id: 'modern_clean',
    name: 'Modern Clean',
    description: 'Crisp sans-serif, electric blue/indigo accents, and contemporary card styling',
    accentColor: '#4f46e5',
    bgColor: '#ffffff',
    textColor: '#1e293b',
    mutedColor: '#64748b',
    cardBg: '#f8fafc',
    borderColor: '#e2e8f0',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    headingFont: 'Inter, system-ui, -apple-system, sans-serif',
    tableHeaderBg: '#f1f5f9',
    badgeStyle: 'background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe;',
  },
  executive_dark: {
    id: 'executive_dark',
    name: 'Executive Dark',
    description: 'Deep charcoal background with refined gold/amber accents for executive memos',
    accentColor: '#f59e0b',
    bgColor: '#0f172a',
    textColor: '#f8fafc',
    mutedColor: '#94a3b8',
    cardBg: '#1e293b',
    borderColor: '#334155',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    headingFont: 'Inter, system-ui, -apple-system, sans-serif',
    tableHeaderBg: '#1e293b',
    badgeStyle: 'background: #78350f; color: #fde68a; border: 1px solid #b45309;',
  },
  minimalist_light: {
    id: 'minimalist_light',
    name: 'Minimalist Light',
    description: 'Generous whitespace, editorial typography, and subtle hairline dividers',
    accentColor: '#0f172a',
    bgColor: '#ffffff',
    textColor: '#0f172a',
    mutedColor: '#64748b',
    cardBg: '#fafafa',
    borderColor: '#e5e5e5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    tableHeaderBg: '#f5f5f5',
    badgeStyle: 'background: #f4f4f5; color: #18181b; border: 1px solid #e4e4e7;',
  },
  corporate_blue: {
    id: 'corporate_blue',
    name: 'Corporate Blue',
    description: 'Formal navy styling with structured data tables, headers, and footers',
    accentColor: '#1d4ed8',
    bgColor: '#ffffff',
    textColor: '#1e293b',
    mutedColor: '#64748b',
    cardBg: '#f0fdf4',
    borderColor: '#cbd5e1',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    headingFont: 'system-ui, -apple-system, sans-serif',
    tableHeaderBg: '#1e3a8a',
    badgeStyle: 'background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe;',
  },
  academic_formal: {
    id: 'academic_formal',
    name: 'Academic Formal',
    description: 'Classic serif typography, formal paper margins, and publication layout',
    accentColor: '#881337',
    bgColor: '#ffffff',
    textColor: '#1c1917',
    mutedColor: '#57534e',
    cardBg: '#fbfbfa',
    borderColor: '#d6d3d1',
    fontFamily: 'Georgia, Cambria, "Times New Roman", Times, serif',
    headingFont: 'Georgia, Cambria, "Times New Roman", Times, serif',
    tableHeaderBg: '#f5f5f4',
    badgeStyle: 'background: #fff1f2; color: #9f1239; border: 1px solid #fecdd3;',
  },
  cyber_tech: {
    id: 'cyber_tech',
    name: 'Cyber Tech',
    description: 'Terminal aesthetics, monospace typography, and vibrant neon accents',
    accentColor: '#10b981',
    bgColor: '#090d16',
    textColor: '#e2e8f0',
    mutedColor: '#64748b',
    cardBg: '#111827',
    borderColor: '#1f2937',
    fontFamily: '"Fira Code", "Courier New", monospace',
    headingFont: '"Fira Code", "Courier New", monospace',
    tableHeaderBg: '#111827',
    badgeStyle: 'background: #064e3b; color: #6ee7b7; border: 1px solid #059669;',
  },
};

export interface GeneratePdfOptions {
  title?: string;
  subtitle?: string;
  author?: string;
  contentMarkdown?: string;
  theme?: PdfThemeId;
  pageSize?: 'A4' | 'Letter';
  orientation?: 'portrait' | 'landscape';
  headerText?: string;
  footerText?: string;
  includePageNumbers?: boolean;
  includeTimestamp?: boolean;
  coverPage?: boolean;
  images?: InjectedImage[];
  accentColor?: string; // Optional custom accent override
  customCss?: string;
}

export interface GeneratedPdfResult {
  html: string;
  dataUrl: string; // Primary data URL: data:application/pdf;base64,... (guarantees .pdf download)
  pdfDataUrl: string; // Explicit PDF data URL: data:application/pdf;base64,...
  htmlDataUrl: string; // HTML preview data URL: data:text/html;charset=utf-8;base64,...
  pdfBinary: string;
  filename: string;
  sizeBytes: number;
}

/**
 * Formats inline Markdown elements: bold, italic, code, strikethrough, highlights, and badges
 */
export function formatInlineMarkdown(text: string): string {
  if (!text) return '';
  let str = text;
  // Bold
  str = str.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  str = str.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  // Italic
  str = str.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  str = str.replace(/_([^_]+)_/g, '<em>$1</em>');
  // Strikethrough
  str = str.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // Highlight
  str = str.replace(/==([^=]+)==/g, '<mark class="doc-highlight">$1</mark>');
  // Inline code
  str = str.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  // Badges: [badge:info:text] or [badge:text]
  str = str.replace(/\[badge:(?:([a-zA-Z0-9_\-]+):)?([^\]]+)\]/g, (_, color, badgeText) => {
    return `<span class="doc-badge ${color ? `badge-${color}` : 'badge-default'}">${badgeText.trim()}</span>`;
  });
  // Links
  str = str.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return str;
}

/**
 * Parses markdown into clean, semantic HTML with tables, headings, callouts, and lists
 */
export function markdownToHtml(md: string): string {
  if (!md) return '';

  let html = md;

  // 1. Page breaks
  html = html.replace(/(?:---|===)(?:pagebreak|break)(?:---|===)/gi, '<div class="page-break"></div>');

  // 2. Fenced Code Blocks (must be parsed before inline code/tables)
  html = html.replace(/```([a-zA-Z0-9_\-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const escaped = escapeHtml(code.trim());
    return `<pre class="code-block ${lang ? `lang-${lang}` : ''}"><code>${escaped}</code></pre>`;
  });

  // 3. Multi-line GFM Callouts / Alerts (> [!NOTE] ... > continuation)
  // Supports NOTE, TIP, IMPORTANT, WARNING, CAUTION, INFO, SUCCESS, DANGER, SUMMARY
  html = html.replace(
    /(?:^|\n)(>[ \t]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|SUCCESS|DANGER|SUMMARY)\][^\n]*(?:\r?\n>[^\n]*)*)/gi,
    (match, block) => {
      const lines = block.split(/\r?\n/);
      const firstLine = lines[0].replace(/^>[ \t]*/, '');
      const typeMatch = firstLine.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|SUCCESS|DANGER|SUMMARY)\]\s*(.*)$/i);
      const type = typeMatch ? typeMatch[1].toUpperCase() : 'NOTE';
      const initialMsg = typeMatch && typeMatch[2] ? typeMatch[2].trim() : '';

      const restLines = lines.slice(1).map((l) => l.replace(/^>[ \t]?/, '').trim());
      const allLines = [initialMsg, ...restLines].filter(Boolean);
      const formattedContent = allLines.map((l) => formatInlineMarkdown(l)).join('<br />');
      const t = type.toLowerCase();
      return `\n<div class="callout callout-${t}"><span class="callout-badge">${type}</span> <span class="callout-content">${formattedContent}</span></div>\n`;
    }
  );

  // Standard multi-line blockquotes
  html = html.replace(/(?:^|\n)((?:>[ \t]*[^\n]*(?:\r?\n|$))+)/g, (match, block) => {
    if (block.includes('class="callout')) return match;
    const lines = block
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => formatInlineMarkdown(l.replace(/^>[ \t]?/, '').trim()));
    if (lines.length === 0) return '';
    return `\n<blockquote>${lines.join('<br />')}</blockquote>\n`;
  });

  // 4. Tables with alignment (:---, :---:, ---:) and formatted cells
  html = html.replace(
    /((?:\|[^\n]+\|\r?\n)(?:\|[\s\-:|]+\|\r?\n)(?:\|[^\n]+\|\r?\n?)+)/g,
    (tableBlock) => {
      const lines = tableBlock.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return tableBlock;

      // Parse alignment from delimiter row (line 1)
      const delimiterCells = lines[1].split('|').slice(1, -1);
      const alignments = delimiterCells.map((c) => {
        const trimmed = c.trim();
        const leftColon = trimmed.startsWith(':');
        const rightColon = trimmed.endsWith(':');
        if (leftColon && rightColon) return 'center';
        if (rightColon) return 'right';
        if (leftColon) return 'left';
        return 'left';
      });

      const headerCells = lines[0]
        .split('|')
        .slice(1, -1)
        .map((c, i) => {
          const align = alignments[i] || 'left';
          return `<th style="text-align: ${align};">${formatInlineMarkdown(c.trim())}</th>`;
        })
        .join('');

      const bodyRows = lines
        .slice(2)
        .map((rowLine) => {
          const cells = rowLine
            .split('|')
            .slice(1, -1)
            .map((c, i) => {
              const align = alignments[i] || 'left';
              return `<td style="text-align: ${align};">${formatInlineMarkdown(c.trim())}</td>`;
            })
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('\n');

      return `<div class="table-container"><table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
    }
  );

  // 5. Headings
  html = html.replace(/^#### (.*$)/gim, (_, text) => `<h4>${formatInlineMarkdown(text)}</h4>`);
  html = html.replace(/^### (.*$)/gim, (_, text) => `<h3>${formatInlineMarkdown(text)}</h3>`);
  html = html.replace(/^## (.*$)/gim, (_, text) => `<h2>${formatInlineMarkdown(text)}</h2>`);
  html = html.replace(/^# (.*$)/gim, (_, text) => `<h1>${formatInlineMarkdown(text)}</h1>`);

  // 6. Horizontal Rules
  html = html.replace(/^(?:---|\*\*\*|___)$/gim, '<hr />');

  // 7. Task lists (- [ ] Incomplete, - [x] Complete)
  html = html.replace(/^\s*[-*+]\s+\[([ xX])\]\s+(.*$)/gim, (_, checked, label) => {
    const isChecked = checked.toLowerCase() === 'x';
    return `<li class="task-list-item ${isChecked ? 'task-done' : ''}"><span class="task-box ${isChecked ? 'checked' : 'unchecked'}">${isChecked ? '&#10003;' : '&#9633;'}</span> <span class="task-label ${isChecked ? 'line-through' : ''}">${formatInlineMarkdown(label)}</span></li>`;
  });

  // 8. Ordered Lists (1. item)
  html = html.replace(/^\s*(\d+)\.\s+(.*$)/gim, (_, num, text) => `<li class="ordered-item" value="${num}">${formatInlineMarkdown(text)}</li>`);
  html = html.replace(/((?:<li class="ordered-item"[^>]*>.*<\/li>\s*)+)/gim, '<ol>$1</ol>');

  // 9. Unordered Lists (- item, * item, + item)
  html = html.replace(/^\s*[-*+]\s+(?!<li)(.*$)/gim, (_, text) => `<li>${formatInlineMarkdown(text)}</li>`);
  html = html.replace(/((?:<li(?: class="(?:task-list-item|bullet-item)[^"]*")?>.*<\/li>\s*)+)/gim, (match) => {
    if (match.includes('task-list-item')) {
      return `<ul class="task-list">${match}</ul>`;
    }
    return `<ul>${match}</ul>`;
  });

  // 10. General Inline formatting (runs across remaining paragraphs)
  html = formatInlineMarkdown(html);

  // 11. Links & Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="doc-img inline-img" />');

  // 12. Paragraphs: convert loose non-tagged lines to <p>
  const blocks = html.split(/\n{2,}/);
  const formattedBlocks = blocks.map((b) => {
    const trimmed = b.trim();
    if (!trimmed) return '';
    if (/^<(h[1-6]|ul|ol|table|div|blockquote|pre|hr)/i.test(trimmed)) {
      return trimmed;
    }
    return `<p>${trimmed.replace(/\n/g, '<br />')}</p>`;
  });

  return formattedBlocks.filter(Boolean).join('\n\n');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapes characters for PDF-1.4 raw streams
 */
function escapePdf(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Wraps text to maximum character width per line for PDF stream
 */
function wrapPdfLine(text: string, maxChars = 85): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if ((current + ' ' + word).trim().length <= maxChars) {
      current = (current + ' ' + word).trim();
    } else {
      if (current) lines.push(current);
      current = word;
      while (current.length > maxChars) {
        lines.push(current.slice(0, maxChars));
        current = current.slice(maxChars);
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Builds a vector-stream multi-page PDF-1.4 binary matching document content
 */
export function buildPdf14Binary(title: string, textContent: string, maxLines = 600): string {
  const rawLines = textContent.split(/\r?\n/).slice(0, maxLines);
  const pages: string[] = [];
  let currentStream = '';
  let currentY = 730; // Starts below header (750)
  const bottomMargin = 65;

  const pushPage = () => {
    pages.push(currentStream);
    currentStream = '';
    currentY = 730;
  };

  for (const rawLine of rawLines) {
    const line = rawLine.trimEnd();

    // Check heading 1
    if (line.startsWith('# ')) {
      const heading = line.slice(2).trim();
      if (currentY - 30 < bottomMargin) pushPage();
      currentStream += `BT\n/F2 16 Tf\n50 ${currentY} Td\n(${escapePdf(heading.slice(0, 70))}) Tj\nET\n`;
      currentY -= 26;
      continue;
    }

    // Heading 2
    if (line.startsWith('## ')) {
      const heading = line.slice(3).trim();
      if (currentY - 26 < bottomMargin) pushPage();
      currentStream += `BT\n/F2 13 Tf\n50 ${currentY} Td\n(${escapePdf(heading.slice(0, 80))}) Tj\nET\n`;
      currentStream += `0.8 0.8 0.8 RG 0.5 w 50 ${currentY - 3} m 562 ${currentY - 3} l S\n`;
      currentY -= 22;
      continue;
    }

    // Heading 3
    if (line.startsWith('### ')) {
      const heading = line.slice(4).trim();
      if (currentY - 20 < bottomMargin) pushPage();
      currentStream += `BT\n/F2 11 Tf\n50 ${currentY} Td\n(${escapePdf(heading.slice(0, 85))}) Tj\nET\n`;
      currentY -= 18;
      continue;
    }

    // Horizontal Rule
    if (/^(?:---|\*\*\*|___)$/.test(line)) {
      if (currentY - 14 < bottomMargin) pushPage();
      currentStream += `0.85 0.85 0.85 RG 0.5 w 50 ${currentY} m 562 ${currentY} l S\n`;
      currentY -= 14;
      continue;
    }

    // Callout alert: > [!NOTE] or > line
    if (line.startsWith('>')) {
      const calloutContent = line.replace(/^>[ \t]*/, '').trim();
      const wrapped = wrapPdfLine(calloutContent, 80);
      for (const wLine of wrapped) {
        if (currentY - 15 < bottomMargin) pushPage();
        // Left accent bar
        currentStream += `0.3 0.45 0.9 rg 50 ${currentY - 2} 3 13 re f\n`;
        currentStream += `BT\n/F1 9.5 Tf\n58 ${currentY} Td\n(${escapePdf(wLine)}) Tj\nET\n`;
        currentY -= 14;
      }
      continue;
    }

    // Table row
    if (line.startsWith('|') && line.endsWith('|')) {
      // Delimiter row
      if (/^\|[\s\-:|]+\|$/.test(line)) {
        currentStream += `0.8 0.8 0.8 RG 0.5 w 50 ${currentY} m 562 ${currentY} l S\n`;
        currentY -= 8;
        continue;
      }
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      const colWidth = Math.floor(512 / Math.max(cells.length, 1));
      if (currentY - 15 < bottomMargin) pushPage();
      cells.forEach((cell, idx) => {
        const xPos = 50 + idx * colWidth + 4;
        const cellText = cell.slice(0, Math.floor(colWidth / 6));
        currentStream += `BT\n/F1 9 Tf\n${xPos} ${currentY} Td\n(${escapePdf(cellText)}) Tj\nET\n`;
      });
      currentY -= 14;
      continue;
    }

    // Task list items
    if (/^[-*+]\s+\[([ xX])\]/.test(line)) {
      const isDone = /^[-*+]\s+\[[xX]\]/.test(line);
      const text = line.replace(/^[-*+]\s+\[[ xX]\]\s*/, '');
      const wrapped = wrapPdfLine(text, 80);
      for (let i = 0; i < wrapped.length; i++) {
        if (currentY - 14 < bottomMargin) pushPage();
        const prefix = i === 0 ? (isDone ? '[X] ' : '[ ] ') : '    ';
        currentStream += `BT\n/F1 9.5 Tf\n54 ${currentY} Td\n(${escapePdf(prefix + wrapped[i])}) Tj\nET\n`;
        currentY -= 13;
      }
      continue;
    }

    // Bullet items
    if (/^[-*+]\s+/.test(line)) {
      const text = line.replace(/^[-*+]\s+/, '');
      const wrapped = wrapPdfLine(text, 80);
      for (let i = 0; i < wrapped.length; i++) {
        if (currentY - 14 < bottomMargin) pushPage();
        const prefix = i === 0 ? '- ' : '  ';
        currentStream += `BT\n/F1 9.5 Tf\n54 ${currentY} Td\n(${escapePdf(prefix + wrapped[i])}) Tj\nET\n`;
        currentY -= 13;
      }
      continue;
    }

    // Empty line
    if (!line.trim()) {
      currentY -= 8;
      if (currentY < bottomMargin) pushPage();
      continue;
    }

    // Normal paragraph text
    const wrapped = wrapPdfLine(line, 85);
    for (const wLine of wrapped) {
      if (currentY - 14 < bottomMargin) pushPage();
      currentStream += `BT\n/F1 9.5 Tf\n50 ${currentY} Td\n(${escapePdf(wLine)}) Tj\nET\n`;
      currentY -= 13;
    }
  }

  // Push last page if has content or if empty
  if (currentStream.trim().length > 0 || pages.length === 0) {
    pages.push(currentStream);
  }

  const totalPages = pages.length;

  // Add header & footer to each page stream
  const finalizedPages = pages.map((pageBody, idx) => {
    const pageNum = idx + 1;
    let fullPage = '';
    // Header
    fullPage += `BT\n/F1 8 Tf\n50 755 Td\n0.4 0.4 0.4 rg\n(${escapePdf(title.slice(0, 60))}) Tj\nET\n`;
    fullPage += `0.85 0.85 0.85 RG 0.5 w 50 748 m 562 748 l S\n`;
    // Body
    fullPage += pageBody;
    // Footer
    fullPage += `0.85 0.85 0.85 RG 0.5 w 50 48 m 562 48 l S\n`;
    fullPage += `BT\n/F1 8 Tf\n50 36 Td\n0.4 0.4 0.4 rg\n(AutoFlow Intelligence Document) Tj\nET\n`;
    fullPage += `BT\n/F1 8 Tf\n480 36 Td\n0.4 0.4 0.4 rg\n(Page ${pageNum} of ${totalPages}) Tj\nET\n`;
    return fullPage;
  });

  // Assemble PDF document objects
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  // Obj 1: Catalog
  offsets.push(pdf.length);
  pdf += `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;

  // Page IDs: 3, 5, 7, ...
  const pageObjIds = finalizedPages.map((_, i) => 3 + i * 2);
  const streamObjIds = finalizedPages.map((_, i) => 4 + i * 2);
  const kidsStr = pageObjIds.map((id) => `${id} 0 R`).join(' ');

  // Obj 2: Pages tree
  offsets.push(pdf.length);
  pdf += `2 0 obj\n<< /Type /Pages /Kids [${kidsStr}] /Count ${totalPages}\n   /Resources <<\n     /Font <<\n       /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n       /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\n       /F3 << /Type /Font /Subtype /Type1 /BaseFont /Courier >>\n     >>\n   >>\n>>\nendobj\n`;

  // Each page and its content stream
  for (let i = 0; i < totalPages; i++) {
    const pageId = pageObjIds[i];
    const streamId = streamObjIds[i];
    const streamContent = finalizedPages[i];
    const streamLen = typeof Buffer !== 'undefined'
      ? Buffer.byteLength(streamContent, 'utf-8')
      : streamContent.length;

    offsets.push(pdf.length);
    pdf += `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${streamId} 0 R >>\nendobj\n`;

    offsets.push(pdf.length);
    pdf += `${streamId} 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamContent}\nendstream\nendobj\n`;
  }

  const startXref = pdf.length;
  pdf += `xref\n0 ${offsets.length}\n`;
  pdf += `0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`;

  return pdf;
}

/**
 * Safely encodes a binary string to base64 across Node.js and Browser
 */
export function encodePdfToBase64(binaryStr: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(binaryStr, 'utf-8').toString('base64');
  }
  if (typeof btoa === 'function') {
    try {
      return btoa(unescape(encodeURIComponent(binaryStr)));
    } catch (_) {
      let bin = '';
      for (let i = 0; i < binaryStr.length; i++) {
        bin += String.fromCharCode(binaryStr.charCodeAt(i) & 0xff);
      }
      return btoa(bin);
    }
  }
  return '';
}

/**
 * Generates print-ready HTML and PDF binary representation with themes, Markdown, and images
 */
export function generateThemedPdfDocument(options: GeneratePdfOptions): GeneratedPdfResult {
  const {
    title = 'AutoFlow Intelligence Report',
    subtitle = '',
    author = 'AutoFlow Automation',
    contentMarkdown = '',
    theme = 'modern_clean',
    pageSize = 'A4',
    orientation = 'portrait',
    headerText = '',
    footerText = 'Generated by AutoFlow Browser Automation',
    includePageNumbers = true,
    includeTimestamp = true,
    coverPage = false,
    images = [],
    accentColor,
    customCss = '',
  } = options;

  const currentTheme = PDF_THEMES[theme] || PDF_THEMES.modern_clean;
  const effectiveAccent = accentColor || currentTheme.accentColor;

  // Process Injected Images by placement
  const headerLogo = images.find((img) => img.placement === 'header_logo');
  const coverImage = images.find((img) => img.placement === 'cover_page');
  const inlineImages = images.filter((img) => !img.placement || img.placement === 'inline');
  const galleryImages = images.filter((img) => img.placement === 'gallery_grid');
  const footerImage = images.find((img) => img.placement === 'footer');

  // Convert markdown to HTML
  let bodyHtml = markdownToHtml(contentMarkdown);

  // Inject inline images into body if present
  if (inlineImages.length > 0) {
    const inlineHtml = inlineImages
      .map(
        (img) => `
        <figure class="injected-figure inline-figure" style="text-align: center; margin: 20px 0;">
          <img src="${img.url}" alt="${img.alt || 'Document Image'}" style="max-width: ${img.width || '100%'}; height: auto; border-radius: 8px; border: 1px solid ${currentTheme.borderColor};" />
          ${img.caption ? `<figcaption style="font-size: 11px; color: ${currentTheme.mutedColor}; margin-top: 6px;">${img.caption}</figcaption>` : ''}
        </figure>`
      )
      .join('\n');
    bodyHtml += `\n${inlineHtml}`;
  }

  // Inject gallery grid if present
  if (galleryImages.length > 0) {
    const galleryHtml = `
      <div class="page-break"></div>
      <h2 style="border-bottom: 2px solid ${effectiveAccent}; padding-bottom: 6px;">Visual Gallery</h2>
      <div class="image-gallery-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; margin: 20px 0;">
        ${galleryImages
          .map(
            (img) => `
          <div class="gallery-card" style="background: ${currentTheme.cardBg}; border: 1px solid ${currentTheme.borderColor}; border-radius: 8px; overflow: hidden; padding: 8px;">
            <img src="${img.url}" alt="${img.alt || 'Gallery image'}" style="width: 100%; height: 160px; object-fit: cover; border-radius: 6px;" />
            ${img.caption ? `<div style="font-size: 11px; color: ${currentTheme.mutedColor}; margin-top: 6px; padding: 0 4px;">${img.caption}</div>` : ''}
          </div>`
          )
          .join('\n')}
      </div>`;
    bodyHtml += `\n${galleryHtml}`;
  }

  const timestampStr = includeTimestamp
    ? new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  // Cover Page HTML
  const coverHtml = coverPage
    ? `
    <section class="cover-page">
      ${headerLogo ? `<div class="cover-logo"><img src="${headerLogo.url}" alt="Logo" style="max-height: 50px; margin-bottom: 24px;" /></div>` : ''}
      ${coverImage ? `<div class="cover-hero"><img src="${coverImage.url}" alt="Cover" style="width: 100%; max-height: 280px; object-fit: cover; border-radius: 12px; margin-bottom: 30px;" /></div>` : ''}
      <h1 class="cover-title">${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="cover-subtitle">${escapeHtml(subtitle)}</p>` : ''}
      <div class="cover-meta">
        ${author ? `<span class="meta-item"><strong>Prepared by:</strong> ${escapeHtml(author)}</span>` : ''}
        ${timestampStr ? `<span class="meta-item"><strong>Date:</strong> ${timestampStr}</span>` : ''}
      </div>
    </section>
    <div class="page-break"></div>
  `
    : '';

  // Full Printable Document HTML
  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: ${pageSize} ${orientation};
      margin: 18mm 16mm 20mm 16mm;
      @bottom-right {
        content: counter(page);
      }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: ${currentTheme.fontFamily};
      background-color: ${currentTheme.bgColor};
      color: ${currentTheme.textColor};
      line-height: 1.6;
      font-size: 13px;
      padding: 24px 32px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      margin-bottom: 24px;
      border-bottom: 2px solid ${effectiveAccent};
    }

    .doc-header .header-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .doc-header .header-brand img {
      max-height: 36px;
      object-fit: contain;
    }

    .doc-header .header-title {
      font-size: 18px;
      font-weight: 700;
      color: ${effectiveAccent};
      font-family: ${currentTheme.headingFont};
    }

    .doc-header .header-meta {
      text-align: right;
      font-size: 11px;
      color: ${currentTheme.mutedColor};
    }

    /* Cover Page */
    .cover-page {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 80vh;
      padding: 40px 20px;
    }

    .cover-title {
      font-size: 32px;
      font-weight: 800;
      line-height: 1.2;
      color: ${effectiveAccent};
      font-family: ${currentTheme.headingFont};
      margin-bottom: 12px;
    }

    .cover-subtitle {
      font-size: 16px;
      color: ${currentTheme.mutedColor};
      margin-bottom: 32px;
      line-height: 1.4;
    }

    .cover-meta {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 24px;
      border-top: 1px solid ${currentTheme.borderColor};
      font-size: 12px;
      color: ${currentTheme.mutedColor};
    }

    /* Typography */
    h1, h2, h3, h4 {
      font-family: ${currentTheme.headingFont};
      color: ${theme === 'executive_dark' ? '#f8fafc' : currentTheme.textColor};
      font-weight: 700;
      margin-top: 20px;
      margin-bottom: 10px;
      page-break-after: avoid;
    }

    h1 { font-size: 22px; border-bottom: 1px solid ${currentTheme.borderColor}; padding-bottom: 6px; }
    h2 { font-size: 18px; }
    h3 { font-size: 15px; }
    h4 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }

    p { margin-bottom: 12px; }

    /* Tables */
    .table-container {
      margin: 16px 0;
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-bottom: 16px;
      page-break-inside: avoid;
      background: ${currentTheme.cardBg};
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid ${currentTheme.borderColor};
    }

    th {
      background-color: ${currentTheme.tableHeaderBg};
      color: ${theme === 'corporate_blue' || theme === 'executive_dark' ? '#ffffff' : currentTheme.textColor};
      font-weight: 600;
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid ${currentTheme.borderColor};
    }

    td {
      padding: 8px 12px;
      border-bottom: 1px solid ${currentTheme.borderColor};
      color: ${currentTheme.textColor};
    }

    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) { background-color: ${theme === 'executive_dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)'}; }

    /* Callouts */
    .callout {
      padding: 12px 16px;
      border-radius: 8px;
      margin: 16px 0;
      font-size: 12px;
      border-left: 4px solid ${effectiveAccent};
      background: ${currentTheme.cardBg};
      line-height: 1.5;
    }

    .callout-badge {
      font-weight: 700;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      margin-right: 6px;
      text-transform: uppercase;
      ${currentTheme.badgeStyle}
    }

    .callout-note { border-left-color: #3b82f6; }
    .callout-tip { border-left-color: #10b981; }
    .callout-important { border-left-color: #f43f5e; }
    .callout-warning { border-left-color: #f59e0b; }
    .callout-caution { border-left-color: #ef4444; }
    .callout-info { border-left-color: #0284c7; }
    .callout-success { border-left-color: #16a34a; }
    .callout-danger { border-left-color: #dc2626; }
    .callout-summary { border-left-color: #8b5cf6; }

    /* Task Lists */
    .task-list {
      list-style: none;
      padding-left: 0;
      margin: 12px 0;
    }

    .task-list-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 6px;
      font-size: 12.5px;
    }

    .task-box {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      border: 1.5px solid ${currentTheme.borderColor};
      border-radius: 3px;
      font-size: 10px;
      font-weight: bold;
      flex-shrink: 0;
      margin-top: 2px;
      line-height: 1;
    }

    .task-box.checked {
      background: ${effectiveAccent};
      color: #ffffff;
      border-color: ${effectiveAccent};
    }

    .task-done .task-label {
      text-decoration: line-through;
      opacity: 0.65;
    }

    /* Highlights & Badges */
    .doc-highlight {
      background: rgba(253, 224, 71, 0.25);
      color: inherit;
      padding: 1px 4px;
      border-radius: 3px;
      border: 1px solid rgba(234, 179, 8, 0.4);
    }

    .doc-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .badge-default { background: ${currentTheme.cardBg}; border: 1px solid ${currentTheme.borderColor}; }
    .badge-success { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
    .badge-warning { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
    .badge-danger { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
    .badge-info { background: #e0f2fe; color: #075985; border: 1px solid #7dd3fc; }

    blockquote {
      border-left: 3px solid ${currentTheme.borderColor};
      padding-left: 14px;
      margin: 14px 0;
      font-style: italic;
      color: ${currentTheme.mutedColor};
    }

    ul, ol {
      margin-left: 20px;
      margin-bottom: 14px;
    }

    li { margin-bottom: 4px; }

    /* Code */
    .inline-code {
      font-family: "Fira Code", monospace;
      font-size: 11px;
      padding: 2px 5px;
      border-radius: 4px;
      background: ${theme === 'executive_dark' ? '#1e293b' : '#f1f5f9'};
      border: 1px solid ${currentTheme.borderColor};
      color: ${effectiveAccent};
    }

    .code-block {
      background: ${theme === 'executive_dark' ? '#0b0f19' : '#f8fafc'};
      border: 1px solid ${currentTheme.borderColor};
      border-radius: 6px;
      padding: 12px 14px;
      margin: 16px 0;
      font-size: 11px;
      overflow-x: auto;
      font-family: "Fira Code", monospace;
      line-height: 1.4;
    }

    /* Page Breaks */
    .page-break {
      page-break-before: always;
      break-before: page;
      height: 0;
      margin: 0;
      padding: 0;
    }

    /* Footer */
    .doc-footer {
      margin-top: 36px;
      padding-top: 12px;
      border-top: 1px solid ${currentTheme.borderColor};
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      color: ${currentTheme.mutedColor};
    }

    ${customCss}
  </style>
</head>
<body>
  ${coverHtml}

  ${!coverPage ? `
    <header class="doc-header">
      <div class="header-brand">
        ${headerLogo ? `<img src="${headerLogo.url}" alt="Logo" />` : ''}
        <div>
          <div class="header-title">${escapeHtml(title)}</div>
          ${subtitle ? `<div style="font-size: 11px; color: ${currentTheme.mutedColor};">${escapeHtml(subtitle)}</div>` : ''}
        </div>
      </div>
      <div class="header-meta">
        ${author ? `<div>${escapeHtml(author)}</div>` : ''}
        ${timestampStr ? `<div>${timestampStr}</div>` : ''}
        ${headerText ? `<div>${escapeHtml(headerText)}</div>` : ''}
      </div>
    </header>
  ` : ''}

  <main class="doc-body">
    ${bodyHtml}
  </main>

  <footer class="doc-footer">
    <div>${escapeHtml(footerText)}</div>
    ${footerImage ? `<img src="${footerImage.url}" alt="Footer" style="max-height: 24px;" />` : ''}
    ${includePageNumbers ? '<div class="page-number-display">AutoFlow Document</div>' : ''}
  </footer>
</body>
</html>`;

  // Generate vector PDF-1.4 binary
  const cleanSummaryText = `${title}\n${subtitle ? subtitle + '\n' : ''}\n${contentMarkdown}`.replace(/<[^>]*>/g, '');
  const pdfBinary = buildPdf14Binary(title, cleanSummaryText);
  const base64Pdf = encodePdfToBase64(pdfBinary);
  const pdfDataUrl = `data:application/pdf;base64,${base64Pdf}`;

  // Encode HTML document as printable Data URL
  const htmlBase64 = typeof btoa === 'function'
    ? btoa(unescape(encodeURIComponent(fullHtml)))
    : Buffer.from(fullHtml).toString('base64');
  const htmlDataUrl = `data:text/html;charset=utf-8;base64,${htmlBase64}`;

  const cleanFilename = (title || 'report')
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, '_')
    .replace(/_+/g, '_');

  return {
    html: fullHtml,
    dataUrl: pdfDataUrl,
    pdfDataUrl,
    htmlDataUrl,
    pdfBinary,
    filename: `${cleanFilename}.pdf`,
    sizeBytes: pdfBinary.length,
  };
}
